const crypto = require('crypto');

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const webauthn = () => import('@simplewebauthn/server');

const normalizeHost = (value) => String(value || '').trim().toLowerCase().replace(/:\d+$/, '');

function relyingParty(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'http';
  const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const configuredOrigin = String(process.env.WEBAUTHN_ORIGIN || '').trim().replace(/\/+$/, '');
  const origin = configuredOrigin || `${protocol}://${requestHost}`;
  const originUrl = new URL(origin);
  const rpID = normalizeHost(process.env.WEBAUTHN_RP_ID || originUrl.hostname);
  if (!rpID) throw new Error('WebAuthn relying-party ID is not configured.');
  if (process.env.NODE_ENV === 'production' && originUrl.protocol !== 'https:') {
    throw new Error('WebAuthn requires HTTPS in production.');
  }
  return { origin: originUrl.origin, rpID, rpName: process.env.WEBAUTHN_RP_NAME || 'RIANA CIMS' };
}

const activeCredentialRows = async (db, userId) => {
  const [rows] = await db.query(
    `SELECT id,credential_id,public_key,counter,transports,device_type,backed_up,display_name,aaguid,created_at,last_used_at
     FROM webauthn_credentials WHERE user_id=? AND revoked_at IS NULL ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
};

const parseTransports = (value) => {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || '[]'); } catch { return []; }
};

async function registrationOptions(db, req, user) {
  const { generateRegistrationOptions } = await webauthn();
  const rp = relyingParty(req);
  const credentials = await activeCredentialRows(db, user.id);
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpID,
    userID: Buffer.from(String(user.id)),
    userName: user.email,
    userDisplayName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
    timeout: CHALLENGE_TTL_MS,
    attestationType: 'none',
    excludeCredentials: credentials.map((item) => ({ id: item.credential_id, transports: parseTransports(item.transports) })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  const challengeId = crypto.randomUUID();
  await db.query(
    `INSERT INTO webauthn_challenges (id,user_id,purpose,challenge,session_id,rp_id,origin,expires_at)
     VALUES (?,?, 'registration',?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE))`,
    [challengeId, user.id, options.challenge, req.user.sid || null, rp.rpID, rp.origin],
  );
  return { challengeId, options };
}

async function verifyRegistration(db, req, userId, challengeId, response, displayName) {
  const { verifyRegistrationResponse } = await webauthn();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [challenges] = await connection.query(
      `SELECT * FROM webauthn_challenges
       WHERE id=? AND user_id=? AND purpose='registration' AND used_at IS NULL AND expires_at>UTC_TIMESTAMP()
       FOR UPDATE`,
      [challengeId, userId],
    );
    const challenge = challenges[0];
    if (!challenge || challenge.session_id !== (req.user.sid || null)) {
      const error = new Error('Passkey registration challenge is invalid or expired.');
      error.status = 400;
      throw error;
    }
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rp_id,
      requireUserVerification: true,
    });
    if (!verification.verified || !verification.registrationInfo) throw new Error('Passkey verification failed.');
    const info = verification.registrationInfo;
    await connection.query(
      `INSERT INTO webauthn_credentials
       (id,user_id,credential_id,public_key,counter,transports,device_type,backed_up,display_name,aaguid)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [crypto.randomUUID(), userId, info.credential.id, Buffer.from(info.credential.publicKey), info.credential.counter,
        JSON.stringify(info.credential.transports || response.response?.transports || []), info.credentialDeviceType,
        info.credentialBackedUp, String(displayName || 'Passkey').trim().slice(0, 120) || 'Passkey', info.aaguid || null],
    );
    await connection.query('UPDATE webauthn_challenges SET used_at=UTC_TIMESTAMP() WHERE id=?', [challengeId]);
    await connection.commit();
    return { verified: true };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally { connection.release(); }
}

async function authenticationOptions(db, req, user) {
  const { generateAuthenticationOptions } = await webauthn();
  const rp = relyingParty(req);
  const credentials = await activeCredentialRows(db, user.id);
  if (!credentials.length) return null;
  const options = await generateAuthenticationOptions({
    rpID: rp.rpID,
    timeout: CHALLENGE_TTL_MS,
    userVerification: 'required',
    allowCredentials: credentials.map((item) => ({ id: item.credential_id, transports: parseTransports(item.transports) })),
  });
  const challengeId = crypto.randomUUID();
  await db.query(
    `INSERT INTO webauthn_challenges (id,user_id,purpose,challenge,rp_id,origin,expires_at)
     VALUES (?,?,'authentication',?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE))`,
    [challengeId, user.id, options.challenge, rp.rpID, rp.origin],
  );
  return { challengeId, options };
}

async function verifyAuthentication(db, challengeId, response) {
  const { verifyAuthenticationResponse } = await webauthn();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [challenges] = await connection.query(
      `SELECT * FROM webauthn_challenges WHERE id=? AND purpose='authentication'
       AND used_at IS NULL AND expires_at>UTC_TIMESTAMP() FOR UPDATE`,
      [challengeId],
    );
    const challenge = challenges[0];
    if (!challenge) { const error = new Error('Passkey challenge is invalid or expired.'); error.status = 401; throw error; }
    const [credentials] = await connection.query(
      `SELECT * FROM webauthn_credentials WHERE user_id=? AND credential_id=? AND revoked_at IS NULL FOR UPDATE`,
      [challenge.user_id, response.id],
    );
    const stored = credentials[0];
    if (!stored) { const error = new Error('Passkey is not registered for this account.'); error.status = 401; throw error; }
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: challenge.origin,
      expectedRPID: challenge.rp_id,
      credential: { id: stored.credential_id, publicKey: new Uint8Array(stored.public_key), counter: Number(stored.counter), transports: parseTransports(stored.transports) },
      requireUserVerification: true,
    });
    if (!verification.verified) { const error = new Error('Passkey verification failed.'); error.status = 401; throw error; }
    await connection.query('UPDATE webauthn_challenges SET used_at=UTC_TIMESTAMP() WHERE id=?', [challengeId]);
    await connection.query(
      'UPDATE webauthn_credentials SET counter=?,last_used_at=UTC_TIMESTAMP(),device_type=?,backed_up=? WHERE id=?',
      [verification.authenticationInfo.newCounter, verification.authenticationInfo.credentialDeviceType,
        verification.authenticationInfo.credentialBackedUp, stored.id],
    );
    await connection.commit();
    return { userId: challenge.user_id, credentialId: stored.id };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally { connection.release(); }
}

module.exports = { activeCredentialRows, authenticationOptions, registrationOptions, relyingParty, verifyAuthentication, verifyRegistration };
