const assert = require('node:assert/strict');
const test = require('node:test');
const { verifyPasskeyReadiness } = require('../scripts/verify-passkey-readiness.cjs');
const schema = require('../services/passkeySchema.cjs');

const origin = 'https://rianacims.marezi.co';
function configure(t, values = {}) {
  const settings = { NODE_ENV: 'production', WEBAUTHN_ORIGIN: origin, WEBAUTHN_RP_ID: 'rianacims.marezi.co', ...values };
  for (const [key, value] of Object.entries(settings)) {
    const previous = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}
function database(missingColumn) {
  return { query: async (sql, [table]) => {
    assert.match(sql, /^SELECT COLUMN_NAME FROM information_schema.COLUMNS/);
    assert.match(sql, /TABLE_NAME=\?/);
    return [schema[table].filter((column) => column !== missingColumn).map((COLUMN_NAME) => ({ COLUMN_NAME }))];
  } };
}

test('production readiness checks configuration and schema without reading credentials', async (t) => {
  configure(t);
  const result = await verifyPasskeyReadiness(database(), origin);
  assert.equal(result.ready, true);
  assert.deepEqual(result.checks[0], { check: 'configuration', ok: true, origin, rpID: 'rianacims.marezi.co' });
});

for (const [name, settings] of [
  ['missing origin', { WEBAUTHN_ORIGIN: undefined }],
  ['insecure origin', { WEBAUTHN_ORIGIN: 'http://rianacims.marezi.co' }],
  ['different deployment domain', { WEBAUTHN_ORIGIN: 'https://rianacims.name.ng' }],
  ['unrelated RP ID', { WEBAUTHN_RP_ID: 'attacker.test' }],
  ['development mode', { NODE_ENV: 'development' }],
]) {
  test(`production readiness rejects ${name}`, async (t) => {
    configure(t, settings);
    const result = await verifyPasskeyReadiness(database(), origin);
    assert.equal(result.ready, false);
    assert.equal(result.checks[0].code, 'PASSKEY_CONFIGURATION_REQUIRED');
  });
}

test('production readiness detects incomplete tables', async (t) => {
  configure(t);
  const result = await verifyPasskeyReadiness(database('revoked_at'), origin);
  assert.equal(result.ready, false);
  assert.deepEqual(result.checks.find((item) => item.check === 'webauthn_credentials').missing, ['revoked_at']);
});

test('production readiness sanitizes database failures', async (t) => {
  configure(t);
  const result = await verifyPasskeyReadiness({ query: async () => { throw new Error('password=private'); } }, origin);
  assert.equal(result.ready, false);
  assert.equal(result.checks.at(-1).code, 'PASSKEY_DATABASE_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(result), /password|private/);
});
