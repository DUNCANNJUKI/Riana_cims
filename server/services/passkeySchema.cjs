// Columns read or written by passkeyService; used by deployment and read-only diagnostics.
module.exports = Object.freeze({
  webauthn_credentials: ['id', 'user_id', 'credential_id', 'public_key', 'counter', 'transports', 'device_type', 'backed_up', 'display_name', 'aaguid', 'created_at', 'last_used_at', 'revoked_at'],
  webauthn_challenges: ['id', 'user_id', 'purpose', 'challenge', 'session_id', 'rp_id', 'origin', 'created_at', 'expires_at', 'used_at'],
});
