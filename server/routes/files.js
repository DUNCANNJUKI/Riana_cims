const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const { hasCapability } = require('../security/accessControl');
const { logDenied, logFailure, logSuccess } = require('../services/auditService');
const {
  CATEGORY_FOLDERS,
  MIME_BY_EXTENSION,
  normalizeCategory,
  sanitizeOriginalName,
  validateFileSize,
  validateFileType,
} = require('../services/fileValidation');
const {
  checksumFile,
  cleanupTemporaryUploads,
  createTempRelativePath,
  formatBytes,
  getDiskUsage,
  getPrivateFileConfig,
  resolvePrivatePath,
  safeMkdirForRelativePath,
  safeUnlink,
} = require('../services/privateFileStorage');

let sharpModule;
const getSharp = () => {
  if (sharpModule !== undefined) return sharpModule;
  try { sharpModule = require('sharp'); } catch { sharpModule = null; }
  return sharpModule;
};

const jsonError = (res, error, fallbackStatus = 500) => {
  const status = error?.status || fallbackStatus;
  const code = error?.code || (status === 404 ? 'FILE_NOT_FOUND' : 'FILE_OPERATION_FAILED');
  const safeMessages = {
    FILE_ACCESS_DENIED: 'You do not have permission to access this file.',
    FILE_ALREADY_DELETED: 'This file has already been deleted.',
    FILE_CONTENT_MISMATCH: 'File content does not match its extension.',
    FILE_DISK_SPACE_LOW: 'Storage is critically low. Uploads are temporarily disabled.',
    FILE_NOT_FOUND: 'File not found.',
    FILE_PROCESSING_FAILED: 'The file could not be processed.',
    FILE_QUARANTINED: 'This file is quarantined.',
    FILE_STORAGE_UNAVAILABLE: 'File storage is unavailable.',
    FILE_TOO_LARGE: error?.message || 'File is too large.',
    FILE_TYPE_NOT_ALLOWED: 'Unsupported file type.',
  };
  res.status(status).json({ error: safeMessages[code] || error?.message || 'File operation failed.', code });
};

const safeHeaderFilename = (value) => sanitizeOriginalName(value).replace(/["\r\n]/g, '_').slice(0, 180);
const isAdmin = (user) => ['SuperAdmin', 'Admin', 'Management'].includes(user?.role);
const canUpload = (user) => isAdmin(user) || hasCapability(user, 'files.upload') || hasCapability(user, 'installations.manage') || hasCapability(user, 'company.manage');
const canView = (user) => isAdmin(user) || hasCapability(user, 'files.view') || hasCapability(user, 'clients.view') || hasCapability(user, 'reports.view');
const canDownload = (user) => isAdmin(user) || hasCapability(user, 'files.download') || hasCapability(user, 'reports.view');
const canDelete = (user) => isAdmin(user) || hasCapability(user, 'files.delete');
const canRestore = (user) => isAdmin(user) || hasCapability(user, 'files.restore');
const canReplace = (user) => isAdmin(user) || hasCapability(user, 'files.replace');

const scopedFileWhere = (user, alias = '') => {
  const prefix = alias ? `${alias}.` : '';
  if (isAdmin(user) || hasCapability(user, 'files.manage_all')) return { clause: '1=1', values: [] };
  return {
    clause: `(${prefix}uploaded_by = ? OR (${prefix}organization_id IS NOT NULL AND ${prefix}organization_id = ?))`,
    values: [user.id, user.subsidiary_id || null],
  };
};

const fileUrlToken = (row, variantType = '') => createFileAccessToken({
  fileId: String(row.id),
  variant: variantType || undefined,
});

const toPublicFile = (row, user, variants = []) => {
  const viewToken = fileUrlToken(row);
  const downloadToken = fileUrlToken(row);
  return {
    id: row.id,
    secureId: viewToken,
    originalName: row.original_name,
    mimeType: row.mime_type,
    detectedMimeType: row.detected_mime_type,
    fileSize: Number(row.file_size || 0),
    fileSizeLabel: formatBytes(row.file_size),
    category: row.file_category,
    status: row.status,
    visibility: row.visibility,
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    uploadedBy: { id: row.uploaded_by },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    image: row.image_width || row.image_height ? { width: row.image_width, height: row.image_height } : null,
    variants: variants.map((variant) => ({
      type: variant.variant_type,
      mimeType: variant.mime_type,
      fileSize: Number(variant.file_size || 0),
      width: variant.width,
      height: variant.height,
      viewUrl: `/api/files/${fileUrlToken(row, variant.variant_type)}/view`,
    })),
    viewUrl: `/api/files/${viewToken}/view`,
    downloadUrl: `/api/files/${downloadToken}/download`,
    permissions: {
      canView: canView(user),
      canDownload: canDownload(user),
      canDelete: canDelete(user),
      canReplace: canReplace(user),
      canRestore: canRestore(user),
    },
  };
};

const parseMultipart = async (req, { maxBytes }) => new Promise((resolve, reject) => {
  const contentType = String(req.headers['content-type'] || '');
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!boundaryMatch) return reject(Object.assign(new Error('Expected multipart/form-data.'), { status: 400 }));
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const chunks = [];
  let total = 0;
  req.on('data', (chunk) => {
    total += chunk.length;
    if (total > maxBytes) {
      reject(Object.assign(new Error('Request is too large.'), { code: 'FILE_TOO_LARGE', status: 413 }));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('error', reject);
  req.on('end', () => {
    try {
      const body = Buffer.concat(chunks);
      const fields = {};
      const files = [];
      let start = body.indexOf(boundary);
      while (start >= 0) {
        start += boundary.length;
        if (body[start] === 45 && body[start + 1] === 45) break;
        if (body[start] === 13 && body[start + 1] === 10) start += 2;
        const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), start);
        if (headerEnd < 0) break;
        const header = body.subarray(start, headerEnd).toString('latin1');
        let partEnd = body.indexOf(boundary, headerEnd + 4);
        if (partEnd < 0) partEnd = body.length;
        let content = body.subarray(headerEnd + 4, partEnd);
        if (content.length >= 2 && content[content.length - 2] === 13 && content[content.length - 1] === 10) {
          content = content.subarray(0, content.length - 2);
        }
        const disposition = /content-disposition:\s*form-data;\s*([^\r\n]+)/i.exec(header)?.[1] || '';
        const name = /name="([^"]+)"/i.exec(disposition)?.[1];
        const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
        const mimeType = /content-type:\s*([^\r\n]+)/i.exec(header)?.[1]?.trim() || 'application/octet-stream';
        if (name && filename !== undefined) files.push({ fieldName: name, originalName: filename, mimeType, buffer: content });
        else if (name) fields[name] = content.toString('utf8');
        start = body.indexOf(boundary, partEnd);
      }
      resolve({ fields, files });
    } catch (error) {
      reject(error);
    }
  });
});

const resolveRelatedEntity = async (pool, req, { entityType, entityId, category }) => {
  const type = String(entityType || '').trim() || (category === 'profile_image' ? 'user' : 'general');
  const id = String(entityId || '').trim() || (type === 'user' ? req.user.id : '');
  if (type === 'general') return { type, id: id || null, organizationId: req.user.subsidiary_id || null, branchId: null };
  if (type === 'user') {
    if (id !== String(req.user.id) && !isAdmin(req.user) && !hasCapability(req.user, 'files.manage_all')) {
      throw Object.assign(new Error('Access denied.'), { code: 'FILE_ACCESS_DENIED', status: 404 });
    }
    const [rows] = await pool.query('SELECT id,subsidiary_id FROM user_profiles WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) throw Object.assign(new Error('Record not found.'), { code: 'FILE_ACCESS_DENIED', status: 404 });
    return { type, id, organizationId: rows[0].subsidiary_id || null, branchId: null };
  }
  if (type === 'client') {
    const [rows] = await pool.query('SELECT id,subsidiary_id,branch FROM clients WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) throw Object.assign(new Error('Record not found.'), { code: 'FILE_ACCESS_DENIED', status: 404 });
    return { type, id, organizationId: rows[0].subsidiary_id || req.user.subsidiary_id || null, branchId: rows[0].branch || null };
  }
  if (type === 'installation' || type === 'handover' || type === 'case') {
    const [rows] = await pool.query('SELECT id,client_id,branch FROM installations WHERE id = ? LIMIT 1', [id]);
    if (!rows.length) throw Object.assign(new Error('Record not found.'), { code: 'FILE_ACCESS_DENIED', status: 404 });
    return { type, id, organizationId: req.user.subsidiary_id || null, branchId: rows[0].branch || null };
  }
  if (type === 'message') {
    const [rows] = await pool.query('SELECT id,sender_id,receiver_id FROM messages WHERE id = ? LIMIT 1', [id]);
    const row = rows[0];
    if (!row || (String(row.sender_id) !== String(req.user.id) && String(row.receiver_id) !== String(req.user.id))) {
      throw Object.assign(new Error('Record not found.'), { code: 'FILE_ACCESS_DENIED', status: 404 });
    }
    return { type, id, organizationId: req.user.subsidiary_id || null, branchId: null };
  }
  if (type === 'report') return { type, id: id || null, organizationId: req.user.subsidiary_id || null, branchId: null };
  throw Object.assign(new Error('Unsupported related record type.'), { code: 'FILE_ACCESS_DENIED', status: 400 });
};

const createImageVariants = async ({ fileId, sourceAbsolutePath, relativePath, storedName, mimeType, connection, config }) => {
  const variants = [];
  const stats = await fsp.stat(sourceAbsolutePath);
  variants.push({ variant_type: 'original', stored_name: storedName, relative_path: relativePath, mime_type: mimeType, file_size: stats.size, width: null, height: null });
  const sharp = getSharp();
  if (!sharp || !String(mimeType).startsWith('image/')) return variants;

  const image = sharp(sourceAbsolutePath, { failOn: 'none' }).rotate();
  const metadata = await image.metadata();
  variants[0].width = metadata.width || null;
  variants[0].height = metadata.height || null;
  const baseName = path.basename(storedName, path.extname(storedName));
  const parent = path.posix.dirname(relativePath);
  const optimizedRelative = path.posix.join(parent, '..', 'optimized', `${baseName}.webp`);
  const thumbnailRelative = path.posix.join(parent, '..', 'thumbnails', `${baseName}.webp`);
  const optimizedAbsolute = await safeMkdirForRelativePath(optimizedRelative, config);
  const thumbnailAbsolute = await safeMkdirForRelativePath(thumbnailRelative, config);

  await sharp(sourceAbsolutePath, { failOn: 'none' }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(optimizedAbsolute);
  await sharp(sourceAbsolutePath, { failOn: 'none' }).rotate().resize({ width: 250, height: 250, fit: 'cover' }).webp({ quality: 74 }).toFile(thumbnailAbsolute);

  for (const [variantType, absolutePath, rel] of [
    ['optimized', optimizedAbsolute, optimizedRelative],
    ['thumbnail', thumbnailAbsolute, thumbnailRelative],
  ]) {
    const variantStats = await fsp.stat(absolutePath);
    const variantMetadata = await sharp(absolutePath).metadata();
    variants.push({
      variant_type: variantType,
      stored_name: path.basename(rel),
      relative_path: path.posix.normalize(rel),
      mime_type: 'image/webp',
      file_size: variantStats.size,
      width: variantMetadata.width || null,
      height: variantMetadata.height || null,
    });
  }
  await connection.query('UPDATE uploaded_files SET image_width=?, image_height=? WHERE id=?', [metadata.width || null, metadata.height || null, fileId]);
  return variants;
};

const insertVariants = async (connection, fileId, variants) => {
  for (const variant of variants) {
    await connection.query(
      `INSERT INTO uploaded_file_variants
       (file_id,variant_type,stored_name,relative_path,mime_type,file_size,width,height)
       VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE stored_name=VALUES(stored_name),relative_path=VALUES(relative_path),mime_type=VALUES(mime_type),file_size=VALUES(file_size),width=VALUES(width),height=VALUES(height)`,
      [fileId, variant.variant_type, variant.stored_name, variant.relative_path, variant.mime_type, variant.file_size, variant.width, variant.height],
    );
  }
};

const createFilesRouter = ({ pool, config = getPrivateFileConfig() }) => {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const page = Math.max(1, Number(req.query.page || 1));
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
      const offset = (page - 1) * limit;
      const scope = scopedFileWhere(req.user, 'f');
      const filters = [`${scope.clause}`, "f.status <> 'deleted'"];
      const values = [...scope.values];
      if (req.query.relatedEntityType) { filters.push('f.related_entity_type = ?'); values.push(String(req.query.relatedEntityType)); }
      if (req.query.relatedEntityId) { filters.push('f.related_entity_id = ?'); values.push(String(req.query.relatedEntityId)); }
      if (req.query.category) { filters.push('f.file_category = ?'); values.push(String(req.query.category)); }
      const [rows] = await pool.query(
        `SELECT f.* FROM uploaded_files f WHERE ${filters.join(' AND ')} ORDER BY f.created_at DESC LIMIT ? OFFSET ?`,
        [...values, limit, offset],
      );
      res.json({ data: rows.map((row) => toPublicFile(row, req.user)), page, limit });
    } catch (error) {
      jsonError(res, error);
    }
  });

  router.get('/admin/storage-summary', async (req, res) => {
    if (!isAdmin(req.user) && !hasCapability(req.user, 'files.manage_all')) return jsonError(res, { code: 'FILE_ACCESS_DENIED', status: 404 });
    try {
      const [[counts]] = await pool.query(`
        SELECT
          COUNT(*) AS total_files,
          COALESCE(SUM(file_size),0) AS total_bytes,
          COALESCE(SUM(CASE WHEN mime_type LIKE 'image/%' THEN file_size ELSE 0 END),0) AS image_bytes,
          COALESCE(SUM(CASE WHEN mime_type NOT LIKE 'image/%' THEN file_size ELSE 0 END),0) AS document_bytes,
          COALESCE(SUM(CASE WHEN status='deleted' THEN file_size ELSE 0 END),0) AS deleted_bytes,
          COALESCE(SUM(CASE WHEN status='quarantined' THEN file_size ELSE 0 END),0) AS quarantined_bytes,
          SUM(status='failed') AS failed_files
        FROM uploaded_files
      `);
      const [largestFiles] = await pool.query('SELECT id,original_name,mime_type,file_size,created_at FROM uploaded_files ORDER BY file_size DESC LIMIT 10');
      const disk = await getDiskUsage(config);
      res.json({ counts, largestFiles, disk });
    } catch (error) {
      jsonError(res, error);
    }
  });

  router.post('/upload', async (req, res) => {
    if (!canUpload(req.user)) {
      await logDenied(pool, req, { action: 'FILE_ACCESS_DENIED', category: 'files', module: 'Files', description: 'Upload permission denied.' }).catch(() => undefined);
      return jsonError(res, { code: 'FILE_ACCESS_DENIED', status: 404 });
    }
    const disk = await getDiskUsage(config);
    if (disk.usedPercent !== null && disk.usedPercent >= 95) return jsonError(res, { code: 'FILE_DISK_SPACE_LOW', status: 507 });

    const maxRequestBytes = Math.max(config.maxDocumentBytes, config.maxImageBytes, config.maxMessageAttachmentBytes) * 5 + 1024 * 1024;
    let parsed;
    try {
      parsed = await parseMultipart(req, { maxBytes: maxRequestBytes });
      if (!parsed.files.length) throw Object.assign(new Error('Select at least one file.'), { status: 400 });
      if (parsed.files.length > 5) throw Object.assign(new Error('Maximum of 5 files per upload.'), { status: 400 });
    } catch (error) {
      return jsonError(res, error, error.status || 400);
    }

    const category = normalizeCategory(parsed.fields.category);
    const related = await resolveRelatedEntity(pool, req, {
      entityType: parsed.fields.relatedEntityType,
      entityId: parsed.fields.relatedEntityId,
      category,
    });
    const visibility = ['private', 'organization', 'public'].includes(parsed.fields.visibility) ? parsed.fields.visibility : 'private';
    const folder = CATEGORY_FOLDERS[category] || 'general';
    const scopeSegment = related.organizationId ? `organizations/${related.organizationId}` : 'organizations/global';
    const uploaded = [];

    for (const file of parsed.files) {
      const connection = await pool.getConnection();
      let tempAbsolutePath = null;
      let finalAbsolutePath = null;
      let fileId = null;
      try {
        const typeInfo = validateFileType({ originalName: file.originalName, declaredMimeType: file.mimeType, detectedBuffer: file.buffer.subarray(0, 4100) });
        validateFileSize({ size: file.buffer.length, category, isImage: typeInfo.isImage, config });
        const storedName = `${crypto.randomUUID()}${typeInfo.extension}`;
        const tempRelativePath = createTempRelativePath(typeInfo.extension);
        tempAbsolutePath = await safeMkdirForRelativePath(tempRelativePath, config);
        await fsp.writeFile(tempAbsolutePath, file.buffer, { flag: 'wx', mode: 0o640 });
        const checksum = await checksumFile(tempAbsolutePath);
        const relativePath = path.posix.join(scopeSegment, folder, related.type, String(related.id || 'general'), typeInfo.isImage ? 'images/original' : 'documents', storedName);
        finalAbsolutePath = await safeMkdirForRelativePath(relativePath, config);

        await connection.beginTransaction();
        const [result] = await connection.query(
          `INSERT INTO uploaded_files
           (organization_id,branch_id,uploaded_by,original_name,stored_name,relative_path,mime_type,detected_mime_type,extension,file_size,file_category,related_entity_type,related_entity_id,visibility,status,checksum_sha256)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [related.organizationId, related.branchId, req.user.id, typeInfo.safeName, storedName, relativePath, typeInfo.expectedMimeType, typeInfo.detectedMimeType, typeInfo.extension.replace('.', ''), file.buffer.length, category, related.type, related.id, visibility, 'processing', checksum],
        );
        fileId = result.insertId;
        await fsp.rename(tempAbsolutePath, finalAbsolutePath);
        tempAbsolutePath = null;
        const variants = await createImageVariants({ fileId, sourceAbsolutePath: finalAbsolutePath, relativePath, storedName, mimeType: typeInfo.expectedMimeType, connection, config });
        await insertVariants(connection, fileId, variants);
        await connection.query("UPDATE uploaded_files SET status='active' WHERE id=?", [fileId]);
        await logSuccess(connection, req, {
          action: 'FILE_UPLOAD_COMPLETED',
          category: 'files',
          module: 'Files',
          entity_type: related.type,
          entity_id: related.id,
          description: 'File uploaded to private storage.',
          metadata: { file_id: fileId, original_filename: typeInfo.safeName, file_size: file.buffer.length, file_category: category },
        });
        await connection.commit();
        const [rows] = await pool.query('SELECT * FROM uploaded_files WHERE id=?', [fileId]);
        const [variantRows] = await pool.query('SELECT * FROM uploaded_file_variants WHERE file_id=? ORDER BY FIELD(variant_type, "thumbnail", "optimized", "original")', [fileId]);
        uploaded.push(toPublicFile(rows[0], req.user, variantRows));
      } catch (error) {
        await connection.rollback().catch(() => undefined);
        if (fileId) await pool.query("UPDATE uploaded_files SET status='failed' WHERE id=?", [fileId]).catch(() => undefined);
        if (tempAbsolutePath) await safeUnlink(tempAbsolutePath).catch(() => undefined);
        if (finalAbsolutePath) await safeUnlink(finalAbsolutePath).catch(() => undefined);
        await logFailure(pool, req, {
          action: 'FILE_UPLOAD_FAILED',
          category: 'files',
          module: 'Files',
          description: 'File upload failed.',
          metadata: { reason: error.code || error.message, original_filename: sanitizeOriginalName(file.originalName), file_category: category },
        }).catch(() => undefined);
        return jsonError(res, error, error.status || 400);
      } finally {
        connection.release();
      }
    }
    res.status(201).json({ files: uploaded });
  });

  const parseRouteFileAccess = (routeId) => {
    try {
      const payload = readFileAccessToken(routeId);
      return { fileId: payload.fileId, variant: payload.variant || '' };
    } catch {
      return { fileId: routeId, variant: '' };
    }
  };

  const loadFile = async (req, { includeDeleted = false } = {}) => {
    const access = parseRouteFileAccess(req.params.id);
    req.fileAccessVariant = access.variant || '';
    const scope = scopedFileWhere(req.user, 'f');
    const filters = ['f.id = ?', scope.clause];
    const values = [access.fileId, ...scope.values];
    if (!includeDeleted) filters.push("f.status = 'active'", 'f.deleted_at IS NULL');
    const [rows] = await pool.query(`SELECT f.* FROM uploaded_files f WHERE ${filters.join(' AND ')} LIMIT 1`, values);
    return rows[0] || null;
  };

  router.get('/:id', async (req, res) => {
    try {
      const file = await loadFile(req, { includeDeleted: true });
      if (!file || (!canView(req.user) && String(file.uploaded_by) !== String(req.user.id))) return jsonError(res, { code: 'FILE_NOT_FOUND', status: 404 });
      const [variants] = await pool.query('SELECT * FROM uploaded_file_variants WHERE file_id=? ORDER BY FIELD(variant_type, "thumbnail", "optimized", "original")', [file.id]);
      res.json(toPublicFile(file, req.user, variants));
    } catch (error) {
      jsonError(res, error);
    }
  });

  const streamFile = async (req, res, { download }) => {
    const file = await loadFile(req);
    if (!file || (!canView(req.user) && !download) || (!canDownload(req.user) && download)) {
      await logDenied(pool, req, { action: 'FILE_ACCESS_DENIED', category: 'files', module: 'Files', entity_type: 'file', entity_id: req.params.id, description: 'File access denied.' }).catch(() => undefined);
      return jsonError(res, { code: 'FILE_NOT_FOUND', status: 404 });
    }
    const requestedVariant = String(req.fileAccessVariant || req.query.variant || '').trim();
    let target = file;
    if (requestedVariant) {
      const [variants] = await pool.query('SELECT * FROM uploaded_file_variants WHERE file_id=? AND variant_type=? LIMIT 1', [file.id, requestedVariant]);
      if (variants[0]) target = variants[0];
    } else if (!download && String(file.mime_type).startsWith('image/')) {
      const [variants] = await pool.query('SELECT * FROM uploaded_file_variants WHERE file_id=? AND variant_type IN ("optimized","original") ORDER BY FIELD(variant_type, "optimized", "original") LIMIT 1', [file.id]);
      if (variants[0]) target = variants[0];
    }
    const absolutePath = resolvePrivatePath(target.relative_path, config);
    await fsp.access(absolutePath, fs.constants.R_OK).catch(() => { throw Object.assign(new Error('File not found.'), { code: 'FILE_NOT_FOUND', status: 404 }); });
    const mimeType = target.mime_type || file.mime_type || 'application/octet-stream';
    const inlineAllowed = !download && (mimeType.startsWith('image/') || mimeType === 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', mimeType.startsWith('image/') ? 'private, max-age=300' : 'private, no-store');
    if (mimeType === 'application/pdf') res.setHeader('Content-Security-Policy', 'sandbox');
    res.setHeader('Content-Type', inlineAllowed ? mimeType : 'application/octet-stream');
    res.setHeader('Content-Disposition', `${inlineAllowed ? 'inline' : 'attachment'}; filename="${safeHeaderFilename(file.original_name)}"`);
    if (download) {
      await logSuccess(pool, req, { action: 'FILE_DOWNLOADED', category: 'files', module: 'Files', entity_type: 'file', entity_id: file.id, description: 'File downloaded.', metadata: { file_category: file.file_category } }).catch(() => undefined);
    }
    const stream = fs.createReadStream(absolutePath);
    stream.on('error', () => {
      if (!res.headersSent) jsonError(res, { code: 'FILE_NOT_FOUND', status: 404 });
      else res.destroy();
    });
    stream.pipe(res);
  };

  router.get('/:id/view', (req, res) => streamFile(req, res, { download: false }).catch((error) => jsonError(res, error)));
  router.get('/:id/download', (req, res) => streamFile(req, res, { download: true }).catch((error) => jsonError(res, error)));

  router.delete('/:id', async (req, res) => {
    if (!canDelete(req.user)) return jsonError(res, { code: 'FILE_ACCESS_DENIED', status: 404 });
    try {
      const file = await loadFile(req);
      if (!file) return jsonError(res, { code: 'FILE_NOT_FOUND', status: 404 });
      await pool.query("UPDATE uploaded_files SET status='deleted',deleted_at=CURRENT_TIMESTAMP,deleted_by=?,deletion_reason=? WHERE id=? AND status='active'", [req.user.id, String(req.body?.reason || '').slice(0, 500) || null, file.id]);
      await logSuccess(pool, req, { action: 'FILE_DELETED', category: 'files', module: 'Files', entity_type: 'file', entity_id: file.id, description: 'File soft-deleted.', severity: 'warning' });
      res.json({ success: true });
    } catch (error) {
      jsonError(res, error);
    }
  });

  router.post('/:id/restore', async (req, res) => {
    if (!canRestore(req.user)) return jsonError(res, { code: 'FILE_ACCESS_DENIED', status: 404 });
    try {
      const file = await loadFile(req, { includeDeleted: true });
      if (!file) return jsonError(res, { code: 'FILE_NOT_FOUND', status: 404 });
      await pool.query("UPDATE uploaded_files SET status='active',deleted_at=NULL,deleted_by=NULL,deletion_reason=NULL WHERE id=? AND status='deleted'", [file.id]);
      await logSuccess(pool, req, { action: 'FILE_RESTORED', category: 'files', module: 'Files', entity_type: 'file', entity_id: file.id, description: 'File restored.' });
      res.json({ success: true });
    } catch (error) {
      jsonError(res, error);
    }
  });

  router.post('/:id/replace', async (req, res) => {
    if (!canReplace(req.user)) return jsonError(res, { code: 'FILE_ACCESS_DENIED', status: 404 });
    const existing = await loadFile(req).catch(() => null);
    if (!existing) return jsonError(res, { code: 'FILE_NOT_FOUND', status: 404 });
    const maxRequestBytes = Math.max(config.maxDocumentBytes, config.maxImageBytes, config.maxMessageAttachmentBytes) + 1024 * 1024;
    let parsed;
    try {
      parsed = await parseMultipart(req, { maxBytes: maxRequestBytes });
      if (parsed.files.length !== 1) throw Object.assign(new Error('Select one replacement file.'), { status: 400 });
    } catch (error) {
      return jsonError(res, error, error.status || 400);
    }

    const file = parsed.files[0];
    const connection = await pool.getConnection();
    let tempAbsolutePath = null;
    let finalAbsolutePath = null;
    let fileId = null;
    try {
      const category = existing.file_category;
      const typeInfo = validateFileType({ originalName: file.originalName, declaredMimeType: file.mimeType, detectedBuffer: file.buffer.subarray(0, 4100) });
      validateFileSize({ size: file.buffer.length, category, isImage: typeInfo.isImage, config });
      const storedName = crypto.randomUUID() + typeInfo.extension;
      const tempRelativePath = createTempRelativePath(typeInfo.extension);
      tempAbsolutePath = await safeMkdirForRelativePath(tempRelativePath, config);
      await fsp.writeFile(tempAbsolutePath, file.buffer, { flag: 'wx', mode: 0o640 });
      const checksum = await checksumFile(tempAbsolutePath);
      const folder = CATEGORY_FOLDERS[category] || 'general';
      const scopeSegment = existing.organization_id ? 'organizations/' + existing.organization_id : 'organizations/global';
      const relativePath = path.posix.join(scopeSegment, folder, existing.related_entity_type || 'general', String(existing.related_entity_id || 'general'), typeInfo.isImage ? 'images/original' : 'documents', storedName);
      finalAbsolutePath = await safeMkdirForRelativePath(relativePath, config);

      await connection.beginTransaction();
      const [result] = await connection.query(
        'INSERT INTO uploaded_files (organization_id,branch_id,uploaded_by,original_name,stored_name,relative_path,mime_type,detected_mime_type,extension,file_size,file_category,related_entity_type,related_entity_id,visibility,status,checksum_sha256,original_file_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [existing.organization_id, existing.branch_id, req.user.id, typeInfo.safeName, storedName, relativePath, typeInfo.expectedMimeType, typeInfo.detectedMimeType, typeInfo.extension.replace('.', ''), file.buffer.length, category, existing.related_entity_type, existing.related_entity_id, existing.visibility, 'processing', checksum, existing.id],
      );
      fileId = result.insertId;
      await fsp.rename(tempAbsolutePath, finalAbsolutePath);
      tempAbsolutePath = null;
      const variants = await createImageVariants({ fileId, sourceAbsolutePath: finalAbsolutePath, relativePath, storedName, mimeType: typeInfo.expectedMimeType, connection, config });
      await insertVariants(connection, fileId, variants);
      await connection.query("UPDATE uploaded_files SET status='active' WHERE id=?", [fileId]);
      await connection.query("UPDATE uploaded_files SET status='deleted',deleted_at=CURRENT_TIMESTAMP,deleted_by=?,deletion_reason=? WHERE id=?", [req.user.id, 'Replaced by file ' + fileId, existing.id]);
      await logSuccess(connection, req, { action: 'FILE_REPLACED', category: 'files', module: 'Files', entity_type: 'file', entity_id: existing.id, description: 'File replaced with a new private file.', metadata: { old_file_id: existing.id, new_file_id: fileId, original_filename: typeInfo.safeName } });
      await connection.commit();
      const [rows] = await pool.query('SELECT * FROM uploaded_files WHERE id=?', [fileId]);
      const [variantRows] = await pool.query('SELECT * FROM uploaded_file_variants WHERE file_id=? ORDER BY FIELD(variant_type, "thumbnail", "optimized", "original")', [fileId]);
      res.status(201).json(toPublicFile(rows[0], req.user, variantRows));
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      if (fileId) await pool.query("UPDATE uploaded_files SET status='failed' WHERE id=?", [fileId]).catch(() => undefined);
      if (tempAbsolutePath) await safeUnlink(tempAbsolutePath).catch(() => undefined);
      if (finalAbsolutePath) await safeUnlink(finalAbsolutePath).catch(() => undefined);
      await logFailure(pool, req, { action: 'FILE_REPLACEMENT_FAILED', category: 'files', module: 'Files', entity_type: 'file', entity_id: existing.id, description: 'File replacement failed.', metadata: { reason: error.code || error.message } }).catch(() => undefined);
      jsonError(res, error, error.status || 400);
    } finally {
      connection.release();
    }
  });

  router.post('/maintenance/cleanup-temporary', async (req, res) => {
    if (!isAdmin(req.user) && !hasCapability(req.user, 'files.manage_all')) return jsonError(res, { code: 'FILE_ACCESS_DENIED', status: 404 });
    try {
      const result = await cleanupTemporaryUploads({ config, dryRun: Boolean(req.body?.dryRun) });
      res.json(result);
    } catch (error) {
      jsonError(res, error);
    }
  });

  return router;
};

module.exports = createFilesRouter;

