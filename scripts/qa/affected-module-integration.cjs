const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const mysql = require('../../server/node_modules/mysql2/promise');
const source = require('../../server/db');
const catalog = require('../../server/services/affectedModuleCatalog');
const schema = `cims_modules_qa_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
const config = source.pool.config.connectionConfig;
if (!['localhost', '127.0.0.1', '::1'].includes(config.host)) throw Error('Local disposable-schema test only.');

(async () => {
  let admin, pool;
  try {
    admin = await mysql.createConnection({ host: config.host, port: config.port, user: config.user, password: config.password });
    await admin.query(`CREATE DATABASE ${mysql.escapeId(schema)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    pool = mysql.createPool({ host: config.host, port: config.port, user: config.user, password: config.password, database: schema });
    await pool.query('CREATE TABLE migration_history (migration_id VARCHAR(100) PRIMARY KEY, description VARCHAR(255))');
    const apply = async () => { for (const sql of fs.readFileSync('server/migrations/20261123_affected_module_catalog.sql', 'utf8').split(';').filter(s => s.trim())) await pool.query(sql); };
    await apply(); await apply();
    assert.equal((await catalog.listModules(pool)).length, 16);
    const owner = { id: 'qa-superadmin', role: 'SuperAdmin' }, lead = { id: 'qa-lead', role: 'Teamlead' };
    const data = { name: '  Client   Portal ', is_active: true, sort_order: 170 };
    for (const role of ['Admin', 'Management', 'Sales', 'User', 'Developer']) {
      await assert.rejects(catalog.saveModule({ getConnection() { throw Error('Must not query'); } }, { id: 'other', role }, null, data), { status: 403 });
    }
    const created = await catalog.saveModule(pool, owner, null, data);
    assert.equal(created.name, 'Client Portal');
    const renamed = await catalog.saveModule(pool, lead, created.id, { name: 'Customer Portal', is_active: true, sort_order: 5, version: created.version });
    await assert.rejects(catalog.saveModule(pool, owner, created.id, { name: 'Stale overwrite', is_active: true, sort_order: 10, version: created.version }), { status: 409 });
    await assert.rejects(catalog.saveModule(pool, owner, null, { name: 'customer portal', is_active: true, sort_order: 5 }), { status: 409 });
    await catalog.saveModule(pool, lead, renamed.id, { name: renamed.name, is_active: false, sort_order: 5, version: renamed.version });
    await assert.rejects(catalog.validateSelection(pool, ['Customer Portal']), { status: 400 });
    assert.deepEqual(await catalog.validateSelection(pool, ['reporting', 'Reporting']), ['Reporting']);
    assert.deepEqual(await catalog.validateSelection(pool, ['Old Client Custom Module'], ['Old Client Custom Module']), ['Old Client Custom Module']);
    await assert.rejects(catalog.validateSelection(pool, ['Unapproved module']), { status: 400 });
    const reporting = (await catalog.listModules(pool)).find(m => m.name === 'Reporting');
    await catalog.saveModule(pool, owner, reporting.id, { name: 'Standard Reports', is_active: true, sort_order: 40, version: reporting.version });
    await apply();
    assert.equal((await catalog.listModules(pool)).some(m => m.name === 'Reporting'), false, 'seed retry must preserve renamed defaults');
    const [[events]] = await pool.query('SELECT COUNT(*) AS total FROM crms_affected_module_events');
    assert.equal(events.total, 4, 'every successful management operation is audited, failures roll back');
    console.log('PASS: seed retry, role restrictions, normalization, duplicate names, version conflict, retirement, canonical selection, historical values and audit transactions.');
  } finally {
    if (pool) await pool.end();
    if (admin) {
      if (!/^cims_modules_qa_\d+_[a-f0-9]{6}$/.test(schema)) throw Error('Invalid disposable schema cleanup target');
      await admin.query(`DROP DATABASE IF EXISTS ${mysql.escapeId(schema)}`); await admin.end();
    }
    await source.end();
  }
})().catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
