const { relyingParty } = require('../services/passkeyService');
const schema = require('../services/passkeySchema.cjs');

async function verifyPasskeyReadiness(db, expectedOrigin) {
  const checks = [];
  let rp;
  try {
    if (process.env.NODE_ENV !== 'production') throw new Error('production mode required');
    rp = relyingParty({ headers: {}, protocol: 'https' });
    const host = new URL(rp.origin).hostname;
    if (host !== rp.rpID && !host.endsWith(`.${rp.rpID}`)) throw new Error('RP mismatch');
    if (expectedOrigin && new URL(expectedOrigin).origin !== rp.origin) throw new Error('origin mismatch');
    checks.push({ check: 'configuration', ok: true, origin: rp.origin, rpID: rp.rpID });
  } catch {
    checks.push({ check: 'configuration', ok: false, code: 'PASSKEY_CONFIGURATION_REQUIRED' });
  }
  try {
    await import('@simplewebauthn/server');
    checks.push({ check: 'dependency', ok: true });
  } catch {
    checks.push({ check: 'dependency', ok: false, code: 'PASSKEY_DEPENDENCY_UNAVAILABLE' });
  }
  try {
    for (const [table, columns] of Object.entries(schema)) {
      const [rows] = await db.query(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',
        [table],
      );
      const available = new Set(rows.map((row) => row.COLUMN_NAME));
      const missing = columns.filter((column) => !available.has(column));
      checks.push({ check: table, ok: missing.length === 0, ...(missing.length ? { missing, code: 'PASSKEY_MIGRATION_REQUIRED' } : {}) });
    }
  } catch {
    checks.push({ check: 'database', ok: false, code: 'PASSKEY_DATABASE_UNAVAILABLE' });
  }
  return { ready: checks.every((check) => check.ok), checks };
}

if (require.main === module) {
  require('dotenv').config({ path: require('node:path').join(__dirname, '../../.env.local') });
  let pool;
  Promise.resolve().then(async () => {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--origin')) throw new Error('invalid arguments');
    pool = require('../db');
    const result = await verifyPasskeyReadiness(pool, args[1]);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ready) process.exitCode = 1;
  }).catch(() => {
    console.error(JSON.stringify({ ready: false, code: 'PASSKEY_READINESS_CHECK_FAILED' }));
    process.exitCode = 1;
  }).finally(async () => { if (pool) await pool.end(); });
}

module.exports = { verifyPasskeyReadiness };
