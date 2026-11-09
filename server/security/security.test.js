const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const jwt = require('jsonwebtoken');
const {
  buildCorsOptions,
  createGlobalApiPolicy,
  createSessionAuthenticator,
  createSensitiveRateLimiter,
  resolveJwtSecret,
  resolveStoredFile,
  safeUpload,
  securityHeaders,
} = require('./apiSecurity');
const { hashPassword, isPasswordHash, verifyPassword } = require('./passwords');

const response = () => ({
  statusCode: 200,
  headers: {},
  setHeader(key, value) { this.headers[key] = value; },
  status(value) { this.statusCode = value; return this; },
  json(value) { this.body = value; return this; },
});

const evaluateOrigin = (options, origin) => new Promise((resolve) => {
  options.origin(origin, (error, allowed) => resolve({ error, allowed }));
});

test('security policy permits WebAssembly while keeping JavaScript eval and external scripts blocked', () => {
  const res = response();
  securityHeaders({ path: '/index.html' }, res, () => undefined);
  const policy = res.headers['Content-Security-Policy'];
  assert.match(policy, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.doesNotMatch(policy, /(?:^|\s)'unsafe-eval'(?:\s|;)/);
  assert.match(policy, /worker-src 'self' blob:/);
  assert.match(policy, /media-src 'self' blob: data:/);

  assert.doesNotMatch(policy, /script-src[^;]*https?:/);
  assert.match(policy, /connect-src 'self'/);
});

test('production rejects absent and published JWT secrets', () => {
  assert.throws(() => resolveJwtSecret({ NODE_ENV: 'production' }), /JWT_SECRET/);
  assert.throws(() => resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'super-secret-key-change-in-prod' }), /JWT_SECRET/);
  assert.equal(resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(48) }), 'a'.repeat(48));
});

test('CORS permits the production request host and rejects lookalike origins', async () => {
  const req = {
    protocol: 'http', // TLS is terminated by the production reverse proxy.
    get: (name) => name === 'host' ? 'rianacims.name.ng' : undefined,
  };
  const options = buildCorsOptions({ NODE_ENV: 'production' }, req);

  assert.deepEqual(await evaluateOrigin(options, 'https://rianacims.name.ng'), { error: null, allowed: true });
  assert.match((await evaluateOrigin(options, 'https://rianacims.name.ng.attacker.example')).error?.message || '', /not allowed/i);
  assert.match((await evaluateOrigin(options, 'http://rianacims.name.ng')).error?.message || '', /not allowed/i);
});

test('CORS normalizes configured origins without widening the allow-list', async () => {
  const options = buildCorsOptions({ CORS_ALLOWED_ORIGINS: 'https://portal.example.com/, https://admin.example.com' });

  assert.equal((await evaluateOrigin(options, 'https://portal.example.com')).allowed, true);
  assert.equal((await evaluateOrigin(options, 'https://admin.example.com')).allowed, true);
  assert.match((await evaluateOrigin(options, 'https://example.com')).error?.message || '', /not allowed/i);
});

test('global API policy allows only explicit public paths', async () => {
  let authenticated = 0;
  const policy = createGlobalApiPolicy((_req, _res, next) => { authenticated += 1; next(); });
  for (const req of [
    { method: 'GET', path: '/health' },
    { method: 'POST', path: '/auth/login' },
    { method: 'GET', path: '/public/hardware/550e8400-e29b-41d4-a716-446655440000' },
    { method: 'GET', path: '/public/feedback-links/token' },
    { method: 'GET', path: '/public/company-pwa-icon/180.png' },
    { method: 'GET', path: '/public/company-pwa-icon/192.png' },
    { method: 'GET', path: '/public/company-pwa-icon/512.png' },
    { method: 'POST', path: '/public/installation-feedback' },
  ]) policy(req, response(), () => {});
  policy({ method: 'GET', path: '/public/company-pwa-icon/1024.png' }, response(), () => {});
  policy({ method: 'GET', path: '/public/company-pwa-icon/192.png/extra' }, response(), () => {});
  policy({ method: 'GET', path: '/clients' }, response(), () => {});
  policy({ method: 'POST', path: '/admin/backup' }, response(), () => {});
  assert.equal(authenticated, 4);
});

test('locked sessions deny protected APIs but allow only server-side unlock routes', async () => {
  const secret = 's'.repeat(48);
  const token = jwt.sign({ id: 'user-1', sid: 'session-1', sv: 0 }, secret, { algorithm: 'HS256' });
  const pool = {
    async query(sql) {
      if (sql.includes('FROM user_profiles')) return [[{ id: 'user-1', email: 'user@riana.co', role: 'User', is_active: 1, first_login: 0, session_version: 0, subsidiary_id: 'sub-1', extra_permissions: '' }]];
      if (sql.includes('user_session_locks')) return [[{ session_id: 'session-1', token_hash: null, expires_at: null, revoked_at: null, locked_at: new Date(), lock_reason: 'manual' }]];
      return [[]];
    },
  };
  const authenticate = createSessionAuthenticator({ pool, jwtSecret: secret });
  const protectedResponse = response();
  await authenticate({ method: 'GET', path: '/clients', headers: { authorization: `Bearer ${token}` } }, protectedResponse, () => assert.fail('locked protected request must not continue'));
  assert.equal(protectedResponse.statusCode, 423);
  assert.equal(protectedResponse.body.code, 'SESSION_LOCKED');

  let continued = false;
  const unlockRequest = { method: 'POST', path: '/auth/unlock/password', headers: { authorization: `Bearer ${token}` } };
  await authenticate(unlockRequest, response(), () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(unlockRequest.sessionLocked, true);
  assert.equal(unlockRequest.user.id, 'user-1');
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

test('assistant, support-guide, and SMTP test routes use the sensitive request limiter', () => {
  for (const path of ['/api/chat/assistant', '/api/help/send-documentation', '/api/admin/email-configuration/test']) {
    const limiter = createSensitiveRateLimiter({ limit: 1, windowMs: 300000 });
    limiter({ ip: '192.0.2.20', path }, response(), () => {});
    const blocked = response();
    limiter({ ip: '192.0.2.20', path }, blocked, () => assert.fail(`${path} should be blocked`));
    assert.equal(blocked.statusCode, 429);
  }
});

test('TOTP enrollment, removal, and recovery regeneration use the sensitive request limiter', () => {
  for (const path of ['/api/auth/totp/enroll', '/api/auth/totp/confirm', '/api/auth/totp', '/api/auth/recovery-codes/regenerate']) {
    const limiter = createSensitiveRateLimiter({ limit: 1, windowMs: 300000 });
    limiter({ ip: '192.0.2.21', path }, response(), () => {});
    const blocked = response();
    limiter({ ip: '192.0.2.21', path }, blocked, () => assert.fail(`${path} should be blocked`));
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
