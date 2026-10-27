const path = require('path');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.docx', '.xlsx', '.csv', '.txt']);
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.php', '.phtml', '.phar', '.js', '.mjs', '.cjs', '.html', '.htm', '.svg',
  '.bat', '.cmd', '.com', '.sh', '.jar', '.dll', '.scr', '.msi', '.apk', '.iso',
]);

const MIME_BY_EXTENSION = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
};

const FILE_CATEGORIES = new Set([
  'profile_image',
  'client_image',
  'client_document',
  'case_document',
  'report_attachment',
  'message_attachment',
  'handover_attachment',
  'company_logo',
  'branch_logo',
  'signature',
  'general_attachment',
]);

const IMAGE_CATEGORIES = new Set(['profile_image', 'client_image', 'company_logo', 'branch_logo', 'signature']);
const MESSAGE_CATEGORIES = new Set(['message_attachment']);

const CATEGORY_FOLDERS = {
  profile_image: 'users',
  client_image: 'clients',
  client_document: 'clients',
  case_document: 'cases',
  report_attachment: 'reports',
  message_attachment: 'messages',
  handover_attachment: 'handover',
  company_logo: 'general',
  branch_logo: 'general',
  signature: 'users',
  general_attachment: 'general',
};

const throwFileError = (code, message, status = 400) => {
  throw Object.assign(new Error(message), { code, status });
};

const sanitizeOriginalName = (value) => {
  const raw = String(value || 'file').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const withoutControls = raw.replace(/[\x00-\x1F\x7F]/g, '').replace(/[\\/:*?"<>|]/g, '_').trim();
  const basename = path.basename(withoutControls).replace(/^\.+/, '').slice(0, 180);
  return basename || 'file';
};

const validateOriginalFilename = (originalName) => {
  const safeName = sanitizeOriginalName(originalName);
  const lower = safeName.toLowerCase();
  if (safeName.includes('..') || lower.includes('%00')) {
    throwFileError('FILE_INVALID_NAME', 'Invalid file name.');
  }
  const parts = lower.split('.').filter(Boolean);
  if (parts.length > 2) {
    throwFileError('FILE_DOUBLE_EXTENSION', 'Double-extension filenames are not allowed.');
  }
  for (const extension of BLOCKED_EXTENSIONS) {
    if (lower.endsWith(extension) || lower.includes(`${extension}.`)) {
      throwFileError('FILE_TYPE_NOT_ALLOWED', 'Unsupported file type.');
    }
  }
  const extension = path.extname(lower);
  if (!extension || BLOCKED_EXTENSIONS.has(extension) || (!IMAGE_EXTENSIONS.has(extension) && !DOCUMENT_EXTENSIONS.has(extension))) {
    throwFileError('FILE_TYPE_NOT_ALLOWED', 'Unsupported file type.');
  }
  return { safeName, extension };
};

const detectMimeType = (buffer, extension) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
  const first = buffer.subarray(0, 16);
  if (extension === '.pdf' && first.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if ((extension === '.jpg' || extension === '.jpeg') && first[0] === 0xff && first[1] === 0xd8) return 'image/jpeg';
  if (extension === '.png' && first.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (extension === '.webp' && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if ((extension === '.docx' || extension === '.xlsx') && first.subarray(0, 2).toString() === 'PK') return MIME_BY_EXTENSION[extension];
  if ((extension === '.txt' || extension === '.csv') && !buffer.includes(0x00)) return MIME_BY_EXTENSION[extension];
  return null;
};

const validateFileType = ({ originalName, declaredMimeType, detectedBuffer }) => {
  const { safeName, extension } = validateOriginalFilename(originalName);
  const expectedMimeType = MIME_BY_EXTENSION[extension];
  const detectedMimeType = detectMimeType(detectedBuffer, extension);
  if (!detectedMimeType) {
    throwFileError('FILE_CONTENT_MISMATCH', 'File content does not match its extension.');
  }
  if (declaredMimeType && declaredMimeType !== 'application/octet-stream' && declaredMimeType !== expectedMimeType) {
    throwFileError('FILE_CONTENT_MISMATCH', 'File content does not match its declared type.');
  }
  return {
    safeName,
    extension,
    expectedMimeType,
    detectedMimeType,
    isImage: IMAGE_EXTENSIONS.has(extension),
  };
};

const categoryLimit = ({ category, isImage, config }) => {
  if (MESSAGE_CATEGORIES.has(category)) return config.maxMessageAttachmentBytes;
  if (isImage || IMAGE_CATEGORIES.has(category)) return config.maxImageBytes;
  return config.maxDocumentBytes;
};

const validateFileSize = ({ size, category, isImage, config }) => {
  const limit = categoryLimit({ category, isImage, config });
  if (!Number.isFinite(Number(size)) || Number(size) <= 0) throwFileError('FILE_EMPTY', 'File is empty.');
  if (Number(size) > limit) {
    throwFileError('FILE_TOO_LARGE', `File exceeds the ${Math.round(limit / 1024 / 1024)} MB limit.`, 413);
  }
  return limit;
};

const normalizeCategory = (value) => {
  const category = String(value || 'general_attachment').trim();
  if (!FILE_CATEGORIES.has(category)) throwFileError('FILE_CATEGORY_INVALID', 'Unsupported file category.');
  return category;
};

module.exports = {
  CATEGORY_FOLDERS,
  DOCUMENT_EXTENSIONS,
  FILE_CATEGORIES,
  IMAGE_CATEGORIES,
  IMAGE_EXTENSIONS,
  MIME_BY_EXTENSION,
  detectMimeType,
  normalizeCategory,
  sanitizeOriginalName,
  validateFileSize,
  validateFileType,
};
