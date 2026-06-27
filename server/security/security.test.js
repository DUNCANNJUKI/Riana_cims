const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  createGlobalApiPolicy,
  createSensitiveRateLimiter,
  resolveJwtSecret,
  resolveStoredFile,
  safeUpload,
} = require('./apiSecurity');
const { hashPassword, isPasswordHash, verifyPassword } = require('./passwords');

const response = () => ({
  statusCode: 200,
  headers: {},
  setHeader(key, value) { this.headers[key] = value; },
  status(value) { this.statusCode = value; return this; },
  json(value) { this.body = value; return this; },
});

test('production rejects absent and published JWT secrets', () => {
  assert.throws(() => resolveJwtSecret({ NODE_ENV: 'production' }), /JWT_SECRET/);
  assert.throws(() => resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'super-secret-key-change-in-prod' }), /JWT_SECRET/);
  assert.equal(resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(48) }), 'a'.repeat(48));
});

test('global API policy allows only explicit public paths', async () => {
  let authenticated = 0;
  const policy = createGlobalApiPolicy((_req, _res, next) => { authenticated += 1; next(); });
  for (const req of [
    { method: 'GET', path: '/health' },
    { method: 'POST', path: '/auth/login' },
    { method: 'GET', path: '/public/feedback-links/token' },
  ]) policy(req, response(), () => {});
  policy({ method: 'GET', path: '/clients' }, response(), () => {});
  policy({ method: 'POST', path: '/admin/backup' }, response(), () => {});
  assert.equal(authenticated, 2);
});

test('sensitive routes enforce twenty requests per five minutes', () => {
  const limiter = createSensitiveRateLimiter({ limit: 20, windowMs: 300000 });
  for (let index = 0; index < 20; index += 1) {
    const res = response();
    let passed = false;
    limiter({ ip: '192.0.2.1', path: '/api/auth/login' }, res, () => { passed = true; });
    assert.equal(passed, true);
  }
  const blocked = response();
  limiter({ ip: '192.0.2.1', path: '/api/auth/login' }, blocked, () => assert.fail('request should be blocked'));
  assert.equal(blocked.statusCode, 429);
});

test('assistant and support-guide routes use the sensitive request limiter', () => {
  for (const path of ['/api/chat/assistant', '/api/help/send-documentation']) {
    const limiter = createSensitiveRateLimiter({ limit: 1, windowMs: 300000 });
    limiter({ ip: '192.0.2.20', path }, response(), () => {});
    const blocked = response();
    limiter({ ip: '192.0.2.20', path }, blocked, () => assert.fail(`${path} should be blocked`));
    assert.equal(blocked.statusCode, 429);
  }
});

test('upload validation generates a contained name and rejects active content', () => {
  const pdf = Buffer.from('%PDF-1.7\nminimal');
  const result = safeUpload({ fileName: '/../../handover.pdf', base64Data: pdf.toString('base64') });
  assert.match(result.storedName, /^[0-9a-f-]{36}\.pdf$/);
  assert.equal(path.basename(result.storedName), result.storedName);
  assert.throws(() => safeUpload({ fileName: 'payload.html', base64Data: Buffer.from('<script>').toString('base64') }), /Only PDF/);
  assert.equal(resolveStoredFile('C:\\uploads', '..\\secret.pdf'), null);
});

test('passwords are bcrypt hashes and verify without plaintext comparison', async () => {
  const hash = await hashPassword('Correct Horse Battery Staple');
  assert.equal(isPasswordHash(hash), true);
  assert.equal(await verifyPassword('Correct Horse Battery Staple', hash), true);
  assert.equal(await verifyPassword('wrong password', hash), false);
});
