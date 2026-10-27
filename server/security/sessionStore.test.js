const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAuthenticatedSession } = require('./sessionStore');

test('missing legacy sid is rejected as replaced when another active session exists', async () => {
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT session_id FROM user_sessions')) return [[{ session_id: 'new-session' }]];
      return [[]];
    },
  };

  const result = await validateAuthenticatedSession(pool, { userId: 'user-1', sessionId: null, token: 'old-token' });
  assert.equal(result.valid, false);
  assert.equal(result.code, 'SESSION_REPLACED');
});

test('session revoked by a new login returns SESSION_REPLACED', async () => {
  const pool = {
    async query(sql) {
      if (sql.includes('WHERE user_id = ? AND session_id = ?')) {
        return [[{ session_id: 'old-session', revoked_at: new Date(), revoke_reason: 'NEW_LOGIN', expires_at: null }]];
      }
      return [[]];
    },
  };

  const result = await validateAuthenticatedSession(pool, { userId: 'user-1', sessionId: 'old-session', token: 'old-token' });
  assert.equal(result.valid, false);
  assert.equal(result.code, 'SESSION_REPLACED');
});
