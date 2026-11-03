const assert = require('node:assert/strict');
const test = require('node:test');
const { relyingParty } = require('../services/passkeyService');

const request = (host = 'localhost:8090', protocol = 'http') => ({
  protocol,
  headers: { host },
});

test('derives localhost WebAuthn origin and RP ID without hardcoding production', () => {
  const previous = { origin: process.env.WEBAUTHN_ORIGIN, rp: process.env.WEBAUTHN_RP_ID, environment: process.env.NODE_ENV };
  delete process.env.WEBAUTHN_ORIGIN;
  delete process.env.WEBAUTHN_RP_ID;
  process.env.NODE_ENV = 'development';
  try {
    assert.deepEqual(relyingParty(request()), { origin: 'http://localhost:8090', rpID: 'localhost', rpName: 'RIANA CIMS' });
  } finally {
    if (previous.origin === undefined) delete process.env.WEBAUTHN_ORIGIN; else process.env.WEBAUTHN_ORIGIN = previous.origin;
    if (previous.rp === undefined) delete process.env.WEBAUTHN_RP_ID; else process.env.WEBAUTHN_RP_ID = previous.rp;
    if (previous.environment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.environment;
  }
});

test('rejects non-HTTPS WebAuthn origins in production', () => {
  const previous = { origin: process.env.WEBAUTHN_ORIGIN, environment: process.env.NODE_ENV };
  process.env.WEBAUTHN_ORIGIN = 'http://example.test';
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(() => relyingParty(request('example.test')), /requires HTTPS/);
  } finally {
    if (previous.origin === undefined) delete process.env.WEBAUTHN_ORIGIN; else process.env.WEBAUTHN_ORIGIN = previous.origin;
    if (previous.environment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.environment;
  }
});

test('uses explicit production RP ID and origin configuration', () => {
  const previous = { origin: process.env.WEBAUTHN_ORIGIN, rp: process.env.WEBAUTHN_RP_ID, environment: process.env.NODE_ENV };
  process.env.WEBAUTHN_ORIGIN = 'https://cims.example.test';
  process.env.WEBAUTHN_RP_ID = 'example.test';
  process.env.NODE_ENV = 'production';
  try {
    assert.deepEqual(relyingParty(request('ignored.test', 'https')), { origin: 'https://cims.example.test', rpID: 'example.test', rpName: 'RIANA CIMS' });
  } finally {
    if (previous.origin === undefined) delete process.env.WEBAUTHN_ORIGIN; else process.env.WEBAUTHN_ORIGIN = previous.origin;
    if (previous.rp === undefined) delete process.env.WEBAUTHN_RP_ID; else process.env.WEBAUTHN_RP_ID = previous.rp;
    if (previous.environment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous.environment;
  }
});
