const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { sendVerificationCode } = require('../services/notifications');

const hashCode = (challengeId, code, secret) => crypto
  .createHash('sha256')
  .update(`${challengeId}:${code}:${secret}`)
  .digest('hex');

const maskDestination = (channel, destination) => {
  if (channel === 'email') {
    const [name, domain] = destination.split('@');
    return `${name?.slice(0, 2) || ''}***@${domain || ''}`;
  }
  return `${destination.slice(0, 3)}***${destination.slice(-3)}`;
};

async function deliverCode({ channel, destination, code }) {
  const webhook = process.env.TWO_FACTOR_DELIVERY_WEBHOOK;
  if (webhook) {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, destination, code, purpose: 'login_verification' }),
    });
    if (!response.ok) throw new Error(`2FA delivery provider returned ${response.status}`);
    return { configured: true };
  }

  if (process.env.BREVO_API_KEY || process.env.B_TEXTMAN_API_KEY) {
    await sendVerificationCode({ channel, destination, code });
    return { configured: true };
  }

  console.log(`[2FA development] ${channel} code for ${destination}: ${code}`);
  return { configured: false };
}

async function createChallenge(pool, user, secret) {
  const channel = user.two_factor_method || 'email';
  const destination = channel === 'email'
    ? user.email
    : (user.two_factor_phone || user.phone_number);
  if (!destination) throw new Error('A phone number is required for SMS or call verification.');

  const challengeId = uuidv4();
  const code = String(crypto.randomInt(100000, 1000000));
  const codeHash = hashCode(challengeId, code, secret);
  await pool.query(
    `INSERT INTO auth_two_factor_challenges
     (id,user_id,code_hash,channel,destination,expires_at)
     VALUES (?,?,?,?,?,DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
    [challengeId, user.id, codeHash, channel, destination],
  );
  const delivery = await deliverCode({ channel, destination, code });

  return {
    challengeId,
    method: channel,
    destination: maskDestination(channel, destination),
    expiresInSeconds: 600,
    ...(process.env.NODE_ENV !== 'production' && !delivery.configured ? { developmentCode: code } : {}),
  };
}

async function verifyChallenge(pool, challengeId, code, secret) {
  const [rows] = await pool.query(
    `SELECT * FROM auth_two_factor_challenges
     WHERE id = ? AND verified_at IS NULL AND expires_at > NOW() AND attempts < 5 LIMIT 1`,
    [challengeId],
  );
  if (!rows.length) return null;

  const challenge = rows[0];
  const supplied = Buffer.from(hashCode(challengeId, String(code), secret), 'hex');
  const expected = Buffer.from(challenge.code_hash, 'hex');
  const valid = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  if (!valid) {
    await pool.query('UPDATE auth_two_factor_challenges SET attempts = attempts + 1 WHERE id = ?', [challengeId]);
    return null;
  }

  await pool.query('UPDATE auth_two_factor_challenges SET verified_at = NOW() WHERE id = ?', [challengeId]);
  return challenge;
}

module.exports = { createChallenge, verifyChallenge };
