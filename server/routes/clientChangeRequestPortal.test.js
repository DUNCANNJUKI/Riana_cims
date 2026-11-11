const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const createPortalRouter = require('./clientChangeRequestPortal');

const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });
const handler = (router, routePath, method) => router.stack.find(layer => layer.route?.path === routePath && layer.route.methods[method]).route.stack[0].handle;
const temporaryUploads = () => fs.mkdtempSync(path.join(os.tmpdir(), 'riana-portal-test-'));
const removeTemporaryUploads = directory => { for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name)); fs.rmdirSync(directory); };
const pdf = { fileName: 'example.pdf', base64Data: Buffer.from('%PDF-1.4 test fixture').toString('base64') };
const request = { protocol: 'http', headers: {}, get: () => 'localhost:8081' };

test('public portal responses do not expose internal database or filesystem errors', async () => {
  const pool = { query: async () => { throw new Error('ER_NO_SUCH_TABLE private_schema at D:\\private\\database'); } };
  const router = createPortalRouter({ pool, uploadsDir: os.tmpdir() });
  const res = response();
  await handler(router, '/invitation/:token', 'get')({ params: { token: 'invalid' } }, res);
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(res.body.error, /ER_NO_SUCH_TABLE|private_schema|database/);
});

test('invalid invitation tokens cannot write uploads', async () => {
  const directory = temporaryUploads();
  try {
    const pool = { query: async () => [[]] };
    const router = createPortalRouter({ pool, uploadsDir: directory });
    const res = response();
    await handler(router, '/submit', 'post')({ ...request, body: { token: 'invalid', attachments: [pdf] } }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(fs.readdirSync(directory), []);
  } finally { removeTemporaryUploads(directory); }
});

test('submission failures remove only files created by that failed request', async () => {
  const directory = temporaryUploads();
  fs.writeFileSync(path.join(directory, 'preserved.txt'), 'existing content');
  try {
    const pool = {
      query: async () => [[{ id: 'invitation-1', status: 'opened', is_expired: 0 }]],
      getConnection: async () => { throw new Error('database unavailable'); },
    };
    const router = createPortalRouter({ pool, uploadsDir: directory });
    const res = response();
    await handler(router, '/submit', 'post')({ ...request, body: { token: 'valid', attachments: [pdf] } }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(fs.readdirSync(directory), ['preserved.txt']);
    assert.equal(fs.readFileSync(path.join(directory, 'preserved.txt'), 'utf8'), 'existing content');
  } finally { removeTemporaryUploads(directory); }
});

test('a later invalid attachment cleans up an earlier validated upload', async () => {
  const directory = temporaryUploads();
  try {
    const pool = { query: async () => [[{ id: 'invitation-1', status: 'opened', is_expired: 0 }]] };
    const router = createPortalRouter({ pool, uploadsDir: directory });
    const res = response();
    await handler(router, '/submit', 'post')({ ...request, body: { token: 'valid', attachments: [pdf, { fileName: 'broken.pdf', base64Data: 'bm90IHBkZg==' }] } }, res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(fs.readdirSync(directory), []);
  } finally { removeTemporaryUploads(directory); }
});
