const crypto = require('crypto');
const OTPAuth = require('otpauth');

const PERIOD_SECONDS = 30;
const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });

function resolveEncryptionKey({ configuredKey = process.env.MFA_ENCRYPTION_KEY, nodeEnv = process.env.NODE_ENV, jwtSecret } = {}) {
  const source = String(configuredKey || '').trim();
  let key;
  if (/^[a-f0-9]{64}$/i.test(source)) key = Buffer.from(source, 'hex');
  else if (source) {
    const decoded = Buffer.from(source, 'base64');
    if (decoded.length === 32) key = decoded;
  }
  if (key?.length === 32) return key;
  if (nodeEnv === 'production') throw httpError(503, 'Authenticator-app MFA is not configured.', 'MFA_KEY_UNAVAILABLE');
  if (!jwtSecret) throw httpError(503, 'Authenticator-app MFA is not configured.', 'MFA_KEY_UNAVAILABLE');
  return crypto.createHash('sha256').update(`riana-cims:mfa-development:${jwtSecret}`).digest();
}

function encryptSecret(secret, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { ciphertext, iv, tag: cipher.getAuthTag() };
}

function decryptSecret(row, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(row.secret_iv));
  decipher.setAuthTag(Buffer.from(row.secret_tag));
  return Buffer.concat([decipher.update(Buffer.from(row.secret_ciphertext)), decipher.final()]).toString('utf8');
}

const normalizeCode = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const recoveryCodeHash = (code, key) => crypto.createHmac('sha256', key).update(`recovery:${normalizeCode(code)}`).digest('hex');
const createTotp = (secret, email) => new OTPAuth.TOTP({ issuer: 'RIANA CIMS', label: email, algorithm: 'SHA1', digits: 6, period: PERIOD_SECONDS, secret: OTPAuth.Secret.fromBase32(secret) });

function generateRecoveryCodes() {
  return Array.from({ length: 10 }, () => {
    const raw = crypto.randomBytes(12).toString('base64url').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}`;
  });
}

async function replaceRecoveryCodes(connection, userId, key) {
  const codes = generateRecoveryCodes();
  const batchId = crypto.randomUUID();
  await connection.query('DELETE FROM user_mfa_recovery_codes WHERE user_id=? AND used_at IS NULL', [userId]);
  for (const code of codes) {
    await connection.query('INSERT INTO user_mfa_recovery_codes (id,user_id,batch_id,code_hash) VALUES (?,?,?,?)', [crypto.randomUUID(), userId, batchId, recoveryCodeHash(code, key)]);
  }
  return codes;
}

async function beginTotpEnrollment(pool, { userId, email, key }) {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const encrypted = encryptSecret(secret, key);
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO user_totp_credentials (id,user_id,secret_ciphertext,secret_iv,secret_tag,enrollment_expires_at)
     VALUES (?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE))
     ON DUPLICATE KEY UPDATE id=VALUES(id),secret_ciphertext=VALUES(secret_ciphertext),secret_iv=VALUES(secret_iv),secret_tag=VALUES(secret_tag),
       confirmed_at=NULL,last_used_step=NULL,enrollment_expires_at=VALUES(enrollment_expires_at),revoked_at=NULL`,
    [id, userId, encrypted.ciphertext, encrypted.iv, encrypted.tag],
  );
  return { enrollmentId: id, secret, uri: createTotp(secret, email).toString(), expiresInSeconds: 600 };
}

async function confirmTotpEnrollment(pool, { userId, enrollmentId, token, key }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT t.*,u.email FROM user_totp_credentials t JOIN user_profiles u ON u.id=t.user_id
       WHERE t.user_id=? AND t.id=? AND t.confirmed_at IS NULL AND t.revoked_at IS NULL
         AND t.enrollment_expires_at>UTC_TIMESTAMP() LIMIT 1 FOR UPDATE`, [userId, enrollmentId],
    );
    if (!rows.length) throw httpError(400, 'Authenticator enrollment expired. Start again.', 'TOTP_ENROLLMENT_EXPIRED');
    const delta = createTotp(decryptSecret(rows[0], key), rows[0].email).validate({ token: String(token || ''), window: 1 });
    if (delta === null) throw httpError(401, 'Invalid authenticator code.', 'INVALID_TOTP');
    const step = Math.floor(Date.now() / (PERIOD_SECONDS * 1000)) + delta;
    await connection.query('UPDATE user_totp_credentials SET confirmed_at=UTC_TIMESTAMP(),last_used_step=? WHERE id=?', [step, enrollmentId]);
    await connection.query("UPDATE user_profiles SET two_factor_enabled=TRUE,two_factor_method='totp',two_factor_phone=NULL WHERE id=?", [userId]);
    const recoveryCodes = await replaceRecoveryCodes(connection, userId, key);
    await connection.commit();
    return { recoveryCodes };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally { connection.release(); }
}

async function verifyTotp(pool, { userId, token, key }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT t.*,u.email FROM user_totp_credentials t JOIN user_profiles u ON u.id=t.user_id
       WHERE t.user_id=? AND t.confirmed_at IS NOT NULL AND t.revoked_at IS NULL LIMIT 1 FOR UPDATE`, [userId],
    );
    if (!rows.length) throw httpError(401, 'Authenticator verification is unavailable.', 'TOTP_UNAVAILABLE');
    const delta = createTotp(decryptSecret(rows[0], key), rows[0].email).validate({ token: String(token || ''), window: 1 });
    if (delta === null) throw httpError(401, 'Invalid authenticator code.', 'INVALID_TOTP');
    const step = Math.floor(Date.now() / (PERIOD_SECONDS * 1000)) + delta;
    if (rows[0].last_used_step !== null && step <= Number(rows[0].last_used_step)) throw httpError(401, 'This authenticator code was already used.', 'TOTP_REPLAYED');
    await connection.query('UPDATE user_totp_credentials SET last_used_step=?,last_used_at=UTC_TIMESTAMP() WHERE id=?', [step, rows[0].id]);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally { connection.release(); }
}

async function redeemRecoveryCode(pool, { userId, code, key }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT id FROM user_mfa_recovery_codes WHERE user_id=? AND code_hash=? AND used_at IS NULL LIMIT 1 FOR UPDATE', [userId, recoveryCodeHash(code, key)]);
    if (!rows.length) throw httpError(401, 'Invalid or previously used recovery code.', 'INVALID_RECOVERY_CODE');
    const [result] = await connection.query('UPDATE user_mfa_recovery_codes SET used_at=UTC_TIMESTAMP() WHERE id=? AND used_at IS NULL', [rows[0].id]);
    if (result.affectedRows !== 1) throw httpError(401, 'Invalid or previously used recovery code.', 'INVALID_RECOVERY_CODE');
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally { connection.release(); }
}

async function createTotpLoginChallenge(pool, userId) {
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO auth_mfa_login_challenges (id,user_id,method,expires_at)
     VALUES (?,?,'totp',DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE))`,
    [id, userId],
  );
  return { challengeId: id, method: 'totp', destination: 'Authenticator app', expiresInSeconds: 600, recoveryAvailable: true };
}

async function verifyTotpLoginChallenge(pool, { challengeId, code, useRecoveryCode, key }) {
  const [rows] = await pool.query(
    `SELECT id,user_id FROM auth_mfa_login_challenges
     WHERE id=? AND verified_at IS NULL AND expires_at>UTC_TIMESTAMP() AND attempts<5 LIMIT 1`,
    [challengeId],
  );
  if (!rows.length) throw httpError(401, 'Invalid or expired verification challenge.', 'INVALID_MFA_CHALLENGE');
  const challenge = rows[0];
  try {
    if (useRecoveryCode) await redeemRecoveryCode(pool, { userId: challenge.user_id, code, key });
    else await verifyTotp(pool, { userId: challenge.user_id, token: code, key });
  } catch (error) {
    await pool.query('UPDATE auth_mfa_login_challenges SET attempts=attempts+1 WHERE id=? AND verified_at IS NULL', [challengeId]);
    throw error;
  }
  const [result] = await pool.query('UPDATE auth_mfa_login_challenges SET verified_at=UTC_TIMESTAMP() WHERE id=? AND verified_at IS NULL', [challengeId]);
  if (result.affectedRows !== 1) throw httpError(401, 'Verification challenge was already used.', 'MFA_CHALLENGE_REPLAYED');
  return { user_id: challenge.user_id, usedRecoveryCode: Boolean(useRecoveryCode) };
}

module.exports = { beginTotpEnrollment, confirmTotpEnrollment, createTotpLoginChallenge, decryptSecret, encryptSecret, generateRecoveryCodes, recoveryCodeHash, redeemRecoveryCode, replaceRecoveryCodes, resolveEncryptionKey, verifyTotp, verifyTotpLoginChallenge };
