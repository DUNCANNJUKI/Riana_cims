const assert = require('node:assert/strict');
const test = require('node:test');
const OTPAuth = require('otpauth');
const {
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  recoveryCodeHash,
  redeemRecoveryCode,
  resolveEncryptionKey,
  verifyTotp,
} = require('../services/accountMfa');

test('production requires an explicit 256-bit MFA encryption key', () => {
  assert.throws(() => resolveEncryptionKey({ configuredKey: '', nodeEnv: 'production', jwtSecret: 'not-used' }), /not configured/);
  const key = Buffer.alloc(32, 7);
  assert.deepEqual(resolveEncryptionKey({ configuredKey: key.toString('base64'), nodeEnv: 'production' }), key);
});

test('TOTP secrets round-trip through authenticated encryption', () => {
  const key = Buffer.alloc(32, 3);
  const encrypted = encryptSecret('JBSWY3DPEHPK3PXP', key);
  assert.notEqual(encrypted.ciphertext.toString('hex'), Buffer.from('JBSWY3DPEHPK3PXP').toString('hex'));
  assert.equal(decryptSecret({ secret_ciphertext: encrypted.ciphertext, secret_iv: encrypted.iv, secret_tag: encrypted.tag }, key), 'JBSWY3DPEHPK3PXP');
  assert.throws(() => decryptSecret({ secret_ciphertext: encrypted.ciphertext, secret_iv: encrypted.iv, secret_tag: Buffer.alloc(16) }, key));
});

test('recovery codes are random, normalized, and stored as keyed hashes', () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.ok(codes.every((code) => /^[A-Z0-9_-]{5}-[A-Z0-9_-]{5}-[A-Z0-9_-]{5}$/.test(code)));
  const key = Buffer.alloc(32, 9);
  assert.equal(recoveryCodeHash(codes[0].toLowerCase(), key), recoveryCodeHash(codes[0], key));
  assert.notEqual(recoveryCodeHash(codes[0], key), recoveryCodeHash(codes[0], Buffer.alloc(32, 8)));
});

test('a recovery code can be redeemed only once', async () => {
  const key = Buffer.alloc(32, 4);
  const code = generateRecoveryCodes()[0];
  let available = true;
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async (sql) => {
      if (sql.startsWith('SELECT id')) return [available ? [{ id: 'code-1' }] : []];
      if (sql.startsWith('UPDATE user_mfa_recovery_codes')) { const affectedRows = available ? 1 : 0; available = false; return [{ affectedRows }]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const pool = { getConnection: async () => connection };
  await assert.doesNotReject(() => redeemRecoveryCode(pool, { userId: 'user-1', code, key }));
  await assert.rejects(() => redeemRecoveryCode(pool, { userId: 'user-1', code, key }), /previously used/);
});

test('TOTP verification rejects reuse of the same accepted time step', async () => {
  const key = Buffer.alloc(32, 6);
  const secret = new OTPAuth.Secret({ size: 20 });
  const encrypted = encryptSecret(secret.base32, key);
  const totp = new OTPAuth.TOTP({ issuer: 'RIANA CIMS', label: 'test@riana.co', algorithm: 'SHA1', digits: 6, period: 30, secret });
  let lastUsedStep = null;
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async (sql, params) => {
      if (sql.startsWith('SELECT t.*')) return [[{ id: 'totp-1', email: 'test@riana.co', secret_ciphertext: encrypted.ciphertext, secret_iv: encrypted.iv, secret_tag: encrypted.tag, last_used_step: lastUsedStep }]];
      if (sql.startsWith('UPDATE user_totp_credentials')) { lastUsedStep = params[0]; return [{ affectedRows: 1 }]; }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const pool = { getConnection: async () => connection };
  const token = totp.generate();
  await assert.doesNotReject(() => verifyTotp(pool, { userId: 'user-1', token, key }));
  await assert.rejects(() => verifyTotp(pool, { userId: 'user-1', token, key }), /already used/);
});
