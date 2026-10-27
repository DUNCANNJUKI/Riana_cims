const assert = require('node:assert/strict');
const test = require('node:test');
const os = require('node:os');
const path = require('node:path');
const {
  normalizeCategory,
  validateFileSize,
  validateFileType,
} = require('./fileValidation');
const {
  getPrivateFileConfig,
  normalizeRelativePath,
  resolvePrivatePath,
} = require('./privateFileStorage');

const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x00]);
const pdf = Buffer.from('%PDF-1.7\n');
const exe = Buffer.from('MZ');

test('validates allowed image and PDF magic bytes', () => {
  const image = validateFileType({ originalName: 'client-photo.png', declaredMimeType: 'image/png', detectedBuffer: png });
  assert.equal(image.extension, '.png');
  assert.equal(image.detectedMimeType, 'image/png');
  assert.equal(image.isImage, true);

  const document = validateFileType({ originalName: 'handover.pdf', declaredMimeType: 'application/pdf', detectedBuffer: pdf });
  assert.equal(document.extension, '.pdf');
  assert.equal(document.detectedMimeType, 'application/pdf');
  assert.equal(document.isImage, false);
});

test('rejects executable and double-extension uploads', () => {
  assert.throws(
    () => validateFileType({ originalName: 'invoice.pdf.php', declaredMimeType: 'application/octet-stream', detectedBuffer: exe }),
    /Unsupported file type|Double-extension/,
  );
  assert.throws(
    () => validateFileType({ originalName: 'photo.jpg.exe', declaredMimeType: 'application/octet-stream', detectedBuffer: exe }),
    /Unsupported file type|Double-extension/,
  );
});

test('rejects content that does not match the extension', () => {
  assert.throws(
    () => validateFileType({ originalName: 'document.pdf', declaredMimeType: 'application/pdf', detectedBuffer: png }),
    /File content does not match/,
  );
});

test('enforces category-specific size limits', () => {
  const config = { maxImageBytes: 8, maxDocumentBytes: 20, maxMessageAttachmentBytes: 10 };
  assert.equal(validateFileSize({ size: 8, category: 'profile_image', isImage: true, config }), 8);
  assert.throws(
    () => validateFileSize({ size: 11, category: 'message_attachment', isImage: false, config }),
    /10 MB limit|limit/,
  );
});

test('normalizes categories and rejects unknown categories', () => {
  assert.equal(normalizeCategory('client_document'), 'client_document');
  assert.throws(() => normalizeCategory('script_upload'), /Unsupported file category/);
});

test('private path resolution blocks traversal and absolute paths', () => {
  const config = getPrivateFileConfig({ PRIVATE_UPLOAD_ROOT: path.join(os.tmpdir(), 'riana-private-test') });
  assert.equal(normalizeRelativePath('organizations/1/clients/2/documents/file.pdf'), 'organizations/1/clients/2/documents/file.pdf');
  assert.throws(() => normalizeRelativePath('../config.env'), /Invalid storage path/);
  assert.throws(() => normalizeRelativePath('C:\\server\\secret.env'), /Invalid storage path/);
  const resolved = resolvePrivatePath('organizations/1/file.pdf', config);
  assert.ok(resolved.startsWith(path.resolve(config.uploadRoot)));
});
