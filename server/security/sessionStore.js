const crypto = require('crypto');

const ACTIVE_SESSION_WHERE = 'revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())';

const hashValue = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');

const sessionAuditRef = (sessionId) => sessionId ? `sid:${hashValue(sessionId).slice(0, 24)}` : null;

const summarizeBrowser = (userAgent = '') => {
  const source = String(userAgent || '');
  if (!source) return null;
  if (source.includes('Edg/')) return 'Edge';
  if (source.includes('Chrome/')) return 'Chrome';
  if (source.includes('Firefox/')) return 'Firefox';
  if (source.includes('Safari/')) return 'Safari';
  return 'Browser';
};

const summarizeDevice = (userAgent = '') => {
  const source = String(userAgent || '');
  if (!source) return null;
  const browser = summarizeBrowser(source) || 'Browser';
  const os = source.includes('Windows') ? 'Windows'
    : source.includes('Android') ? 'Android'
      : source.includes('iPhone') || source.includes('iPad') ? 'iOS'
        : source.includes('Mac OS') ? 'macOS'
          : source.includes('Linux') ? 'Linux'
            : 'Unknown OS';
  return `${browser} on ${os}`;
};

const requestIp = (req) => req?.ip || req?.headers?.['x-forwarded-for']?.split(',')?.[0]?.trim() || null;

async function createSingleActiveSession(pool, {
  userId,
  sessionId,
  token,
  req,
  expiresAt,
  revokeReason = 'NEW_LOGIN',
}) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SELECT id FROM user_profiles WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
    const [revoked] = await connection.query(
      `UPDATE user_sessions
       SET revoked_at = NOW(), revoke_reason = ?
       WHERE user_id = ? AND ${ACTIVE_SESSION_WHERE}`,
      [revokeReason, userId],
    );
    await connection.query(
      `INSERT INTO user_sessions
       (user_id,session_id,token_hash,device_name,browser_name,ip_address,user_agent,created_at,last_activity_at,expires_at)
       VALUES (?,?,?,?,?,?,?,NOW(),NOW(),?)`,
      [
        userId,
        sessionId,
        hashValue(token),
        summarizeDevice(req?.headers?.['user-agent']),
        summarizeBrowser(req?.headers?.['user-agent']),
        requestIp(req),
        req?.headers?.['user-agent'] || null,
        expiresAt || null,
      ],
    );
    await connection.commit();
    return { revokedCount: revoked.affectedRows || 0 };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function revokeUserSessions(poolOrConnection, userId, reason = 'SESSION_REVOKED') {
  if (!userId) return { revokedCount: 0 };
  const [result] = await poolOrConnection.query(
    `UPDATE user_sessions
     SET revoked_at = NOW(), revoke_reason = ?
     WHERE user_id = ? AND ${ACTIVE_SESSION_WHERE}`,
    [reason, userId],
  );
  return { revokedCount: result.affectedRows || 0 };
}

async function revokeCurrentSession(poolOrConnection, { userId, sessionId, reason = 'LOGOUT' }) {
  if (!userId || !sessionId) return { revokedCount: 0 };
  const [result] = await poolOrConnection.query(
    `UPDATE user_sessions
     SET revoked_at = NOW(), revoke_reason = ?
     WHERE user_id = ? AND session_id = ? AND revoked_at IS NULL`,
    [reason, userId, sessionId],
  );
  return { revokedCount: result.affectedRows || 0 };
}

const sessionError = (code, message) => ({ valid: false, code, message });

async function validateAuthenticatedSession(pool, { userId, sessionId, token }) {
  if (!sessionId) {
    const [active] = await pool.query(
      `SELECT session_id FROM user_sessions WHERE user_id = ? AND ${ACTIVE_SESSION_WHERE} LIMIT 1`,
      [userId],
    );
    return active.length
      ? sessionError('SESSION_REPLACED', 'Your account was signed in on another device.')
      : sessionError('SESSION_REVOKED', 'Your session is no longer active. Please sign in again.');
  }

  const [rows] = await pool.query(
    'SELECT session_id,token_hash,expires_at,revoked_at,revoke_reason FROM user_sessions WHERE user_id = ? AND session_id = ? LIMIT 1',
    [userId, sessionId],
  );
  const session = rows[0];
  if (!session) {
    const [active] = await pool.query(
      `SELECT session_id FROM user_sessions WHERE user_id = ? AND ${ACTIVE_SESSION_WHERE} LIMIT 1`,
      [userId],
    );
    return active.length
      ? sessionError('SESSION_REPLACED', 'Your account was signed in on another device.')
      : sessionError('SESSION_REVOKED', 'Your session is no longer active. Please sign in again.');
  }
  if (session.revoked_at) {
    return String(session.revoke_reason || '').toUpperCase() === 'NEW_LOGIN'
      ? sessionError('SESSION_REPLACED', 'Your account was signed in on another device.')
      : sessionError('SESSION_REVOKED', 'Your session is no longer active. Please sign in again.');
  }
  if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
    return sessionError('TOKEN_EXPIRED', 'Your session has expired. Please sign in again.');
  }
  if (session.token_hash && token && session.token_hash !== hashValue(token)) {
    return sessionError('SESSION_REVOKED', 'Your session is no longer active. Please sign in again.');
  }
  await pool.query('UPDATE user_sessions SET last_activity_at = NOW() WHERE user_id = ? AND session_id = ?', [userId, sessionId]);
  return { valid: true };
}

module.exports = {
  createSingleActiveSession,
  revokeCurrentSession,
  revokeUserSessions,
  sessionAuditRef,
  validateAuthenticatedSession,
};
