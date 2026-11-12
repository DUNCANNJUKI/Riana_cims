const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const mysql = require('../server/node_modules/mysql2/promise');
const dotenv = require('../server/node_modules/dotenv');
const { chromium } = require('playwright');
const service = require('../server/services/passkeyService');

async function main() {
  const root = path.resolve(__dirname, '..');
  const local = dotenv.parse(fs.readFileSync(path.join(root, '.env.local')));
  const config = {
    host: '127.0.0.1',
    user: process.env.HARDWARE_TEST_USER || local.DATABASE_USER || local.DB_USER || 'root',
    password: process.env.HARDWARE_TEST_PASSWORD ?? local.DATABASE_PASSWORD ?? local.DB_PASSWORD ?? local.DB_PASS ?? '',
  };
  const database = `cims_hardware_test_passkey_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  assert.match(database, /^cims_hardware_test_passkey_[a-z0-9_]+$/);
  const admin = await mysql.createConnection(config);
  let pool, browser, server;
  const previous = { origin: process.env.WEBAUTHN_ORIGIN, rp: process.env.WEBAUTHN_RP_ID, mode: process.env.NODE_ENV };
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    pool = mysql.createPool({ ...config, database });
    await pool.query('CREATE TABLE user_profiles (id VARCHAR(36) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
    const schema = fs.readFileSync(path.join(root, 'server/migrations/20261101_passkeys_and_account_security.sql'), 'utf8');
    for (const name of ['webauthn_credentials', 'webauthn_challenges']) {
      const statement = schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\([\\s\\S]*?;`));
      assert.ok(statement, `Missing ${name} migration`);
      await pool.query(statement[0]);
    }
    const user = { id: crypto.randomUUID(), email: 'passkey-qa@example.invalid', first_name: 'Passkey', last_name: 'QA' };
    await pool.query('INSERT INTO user_profiles (id) VALUES (?)', [user.id]);
    server = http.createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Isolated passkey verification</title><h1>Passkey QA</h1>'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://localhost:${server.address().port}`;
    process.env.WEBAUTHN_ORIGIN = origin;
    process.env.WEBAUTHN_RP_ID = 'localhost';
    process.env.NODE_ENV = 'test';
    const req = { protocol: 'http', headers: { host: new URL(origin).host }, user: { sid: 'isolated-qa-session' } };
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
    } });
    await page.goto(origin);
    const registration = await service.registrationOptions(pool, req, user);
    assert.equal(registration.options.authenticatorSelection.userVerification, 'required');
    const created = await page.evaluate(async options => {
      const credential = await navigator.credentials.create({ publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options) });
      return credential.toJSON();
    }, registration.options);
    assert.deepEqual(await service.verifyRegistration(pool, req, user.id, registration.challengeId, created, 'Isolated virtual authenticator'), { verified: true });
    await assert.rejects(service.verifyRegistration(pool, req, user.id, registration.challengeId, created), { status: 400 });
    const authenticate = async () => {
      const challenge = await service.authenticationOptions(pool, req, user);
      const response = await page.evaluate(async options => {
        const credential = await navigator.credentials.get({ publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options) });
        return credential.toJSON();
      }, challenge.options);
      return { challenge, response };
    };
    const success = await authenticate();
    const verified = await service.verifyAuthentication(pool, success.challenge.challengeId, success.response);
    assert.equal(verified.userId, user.id);
    await assert.rejects(service.verifyAuthentication(pool, success.challenge.challengeId, success.response), { status: 401 });
    const wrongOrigin = await authenticate();
    const data = JSON.parse(Buffer.from(wrongOrigin.response.response.clientDataJSON, 'base64url'));
    data.origin = 'https://other.example.invalid';
    wrongOrigin.response.response.clientDataJSON = Buffer.from(JSON.stringify(data)).toString('base64url');
    await assert.rejects(service.verifyAuthentication(pool, wrongOrigin.challenge.challengeId, wrongOrigin.response));
    const badSignature = await authenticate();
    const signature = Buffer.from(badSignature.response.response.signature, 'base64url');
    signature[signature.length - 1] ^= 1;
    badSignature.response.response.signature = signature.toString('base64url');
    await assert.rejects(service.verifyAuthentication(pool, badSignature.challenge.challengeId, badSignature.response));
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
    const noVerification = await service.authenticationOptions(pool, req, user);
    const unverifiedResponse = await page.evaluate(async options => {
      options.userVerification = 'discouraged';
      const credential = await navigator.credentials.get({ publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options), signal: AbortSignal.timeout(10000) });
      return credential.toJSON();
    }, noVerification.options);
    await assert.rejects(service.verifyAuthentication(pool, noVerification.challengeId, unverifiedResponse));
    await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: true });
    const expired = await authenticate();
    await pool.query('UPDATE webauthn_challenges SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE) WHERE id=?', [expired.challenge.challengeId]);
    await assert.rejects(service.verifyAuthentication(pool, expired.challenge.challengeId, expired.response), { status: 401 });
    const revoked = await authenticate();
    await pool.query('UPDATE webauthn_credentials SET revoked_at=UTC_TIMESTAMP() WHERE user_id=?', [user.id]);
    await assert.rejects(service.verifyAuthentication(pool, revoked.challenge.challengeId, revoked.response), { status: 401 });
    assert.equal(await service.authenticationOptions(pool, req, user), null);
    console.log(JSON.stringify({ database, virtualAuthenticator: true, physicalBiometricsTested: false,
      registration: 'passed', authentication: 'passed', requiredUserVerification: 'passed',
      registrationReplay: 'rejected', assertionReplay: 'rejected', wrongOrigin: 'rejected',
      invalidSignature: 'rejected', missingUserVerification: 'rejected', expiredChallenge: 'rejected', revokedCredential: 'rejected',
      operationalAccountsChanged: false }, null, 2));
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    await admin.end();
    for (const [key, value] of Object.entries({ WEBAUTHN_ORIGIN: previous.origin, WEBAUTHN_RP_ID: previous.rp, NODE_ENV: previous.mode })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}
main().catch(error => { console.error(`Passkey QA failed: ${error.message}`); process.exitCode = 1; });
