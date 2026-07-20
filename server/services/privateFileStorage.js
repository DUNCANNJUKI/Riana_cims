const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const base64UrlEncode = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const base64UrlDecode = (value) => JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
const fileAccessSecret = () => String(process.env.FILE_ACCESS_TOKEN_SECRET || process.env.JWT_SECRET || 'riana-cims-local-file-access-secret');

const createFileAccessToken = (payload = {}, { expiresInSeconds = 15 * 60 } = {}) => {
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + Math.max(60, Number(expiresInSeconds) || 900),
    nonce: crypto.randomUUID(),
  };
  const encoded = base64UrlEncode(body);
  const signature = crypto.createHmac('sha256', fileAccessSecret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
};

const readFileAccessToken = (token) => {
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature) throw Object.assign(new Error('Invalid file access token.'), { status: 400, code: 'FILE_ACCESS_DENIED' });
  const expected = crypto.createHmac('sha256', fileAccessSecret()).update(encoded).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw Object.assign(new Error('Invalid file access token.'), { status: 403, code: 'FILE_ACCESS_DENIED' });
  }
  const payload = base64UrlDecode(encoded);
  if (payload.exp && Number(payload.exp) < Math.floor(Date.now() / 1000)) {
    throw Object.assign(new Error('Expired file access token.'), { status: 403, code: 'FILE_ACCESS_DENIED' });
  }
  return payload;
};
const DEFAULT_IMAGE_MB = 8;
const DEFAULT_DOCUMENT_MB = 20;
const DEFAULT_MESSAGE_MB = 10;
const DEFAULT_RETENTION_DAYS = 30;

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const getPrivateFileConfig = (env = process.env) => {
  const uploadRoot = String(env.PRIVATE_UPLOAD_ROOT || '').trim();
  if (!uploadRoot && env.NODE_ENV === 'production') {
    throw new Error('PRIVATE_UPLOAD_ROOT is required in production.');
  }

  return {
    uploadRoot: uploadRoot || path.resolve(__dirname, '../private_uploads'),
    maxImageBytes: toPositiveInt(env.MAX_IMAGE_UPLOAD_MB, DEFAULT_IMAGE_MB) * 1024 * 1024,
    maxDocumentBytes: toPositiveInt(env.MAX_DOCUMENT_UPLOAD_MB, DEFAULT_DOCUMENT_MB) * 1024 * 1024,
    maxMessageAttachmentBytes: toPositiveInt(env.MAX_MESSAGE_ATTACHMENT_MB, DEFAULT_MESSAGE_MB) * 1024 * 1024,
    retentionDays: toPositiveInt(env.FILE_RETENTION_DAYS, DEFAULT_RETENTION_DAYS),
  };
};

const isSubPath = (parent, child) => {
  const parentResolved = path.resolve(parent);
  const childResolved = path.resolve(child);
  return childResolved === parentResolved || childResolved.startsWith(`${parentResolved}${path.sep}`);
};

const assertUploadRootIsPrivate = (root) => {
  const resolvedRoot = path.resolve(root);
  const projectRoot = path.resolve(__dirname, '../..');
  const forbidden = [
    path.join(projectRoot, 'public'),
    path.join(projectRoot, 'public_html'),
    path.join(projectRoot, 'dist'),
    path.join(projectRoot, 'build'),
    path.join(projectRoot, 'frontend/public'),
    path.join(projectRoot, 'backend/public'),
    path.join(projectRoot, 'server/public'),
  ].map((entry) => path.resolve(entry));

  if (forbidden.some((entry) => isSubPath(entry, resolvedRoot))) {
    throw new Error('PRIVATE_UPLOAD_ROOT must not be inside a public or build directory.');
  }
};

const ensurePrivateUploadRoot = async (config = getPrivateFileConfig()) => {
  const root = path.resolve(config.uploadRoot);
  assertUploadRootIsPrivate(root);
  await fsp.mkdir(root, { recursive: true, mode: 0o750 });
  for (const directory of [
    'organizations',
    'tenants',
    'temporary',
    'quarantine',
    'deleted',
  ]) {
    await fsp.mkdir(path.join(root, directory), { recursive: true, mode: 0o750 });
  }
  await fsp.access(root, fs.constants.R_OK | fs.constants.W_OK);
  return root;
};

const normalizeRelativePath = (relativePath) => {
  const raw = String(relativePath || '').replace(/\\/g, '/').trim();
  if (!raw || raw.startsWith('/') || /^[a-zA-Z]:/.test(raw) || raw.includes('\0')) {
    throw Object.assign(new Error('Invalid storage path.'), { code: 'FILE_INVALID_PATH', status: 400 });
  }
  const normalized = path.posix.normalize(raw);
  if (!normalized || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw Object.assign(new Error('Invalid storage path.'), { code: 'FILE_INVALID_PATH', status: 400 });
  }
  return normalized;
};

const resolvePrivatePath = (relativePath, config = getPrivateFileConfig()) => {
  const root = path.resolve(config.uploadRoot);
  const normalized = normalizeRelativePath(relativePath);
  const resolved = path.resolve(root, normalized);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw Object.assign(new Error('Invalid storage path.'), { code: 'FILE_INVALID_PATH', status: 400 });
  }
  return resolved;
};

const safeMkdirForRelativePath = async (relativePath, config = getPrivateFileConfig()) => {
  const absolutePath = resolvePrivatePath(relativePath, config);
  await fsp.mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o750 });
  return absolutePath;
};

const createTempRelativePath = (extension = '.bin') => {
  const cleanExtension = /^\.[a-z0-9]{1,12}$/i.test(extension) ? extension.toLowerCase() : '.bin';
  return path.posix.join('temporary', `${crypto.randomUUID()}${cleanExtension}`);
};

const checksumFile = async (absolutePath) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(absolutePath);
  stream.on('data', (chunk) => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});

const safeUnlink = async (absolutePath) => {
  try { await fsp.unlink(absolutePath); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};

const cleanupTemporaryUploads = async ({ maxAgeHours = 24, config = getPrivateFileConfig(), dryRun = false } = {}) => {
  const root = path.resolve(config.uploadRoot);
  const temporaryRoot = resolvePrivatePath('temporary', config);
  if (!isSubPath(root, temporaryRoot)) throw new Error('Temporary cleanup path is outside the private upload root.');
  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  const deleted = [];
  const scan = async (directory) => {
    const entries = await fsp.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (!isSubPath(temporaryRoot, absolute)) continue;
      if (entry.isDirectory()) {
        await scan(absolute);
        continue;
      }
      const stats = await fsp.stat(absolute).catch(() => null);
      if (!stats || stats.mtimeMs >= cutoff) continue;
      deleted.push(absolute);
      if (!dryRun) await safeUnlink(absolute);
    }
  };
  await scan(temporaryRoot);
  return { deletedCount: deleted.length, deleted };
};

const getDiskUsage = async (config = getPrivateFileConfig()) => {
  const root = path.resolve(config.uploadRoot);
  const usage = { root, totalBytes: null, freeBytes: null, usedPercent: null };
  if (typeof fs.statfsSync !== 'function') return usage;
  try {
    const stats = fs.statfsSync(root);
    usage.totalBytes = stats.blocks * stats.bsize;
    usage.freeBytes = stats.bavail * stats.bsize;
    usage.usedPercent = usage.totalBytes ? Math.round(((usage.totalBytes - usage.freeBytes) / usage.totalBytes) * 100) : null;
  } catch {
    return usage;
  }
  return usage;
};

const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
};

module.exports = {
  createFileAccessToken,
  readFileAccessToken,
  cleanupTemporaryUploads,
  checksumFile,
  createTempRelativePath,
  ensurePrivateUploadRoot,
  formatBytes,
  getDiskUsage,
  getPrivateFileConfig,
  normalizeRelativePath,
  resolvePrivatePath,
  safeMkdirForRelativePath,
  safeUnlink,
};
