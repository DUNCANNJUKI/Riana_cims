const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('./affectedModuleCatalog');

test('only SuperAdmin and Developer Lead may manage the catalogue', async () => {
  for (const role of ['Admin', 'Management', 'Sales', 'User', 'Developer']) {
    await assert.rejects(catalog.saveModule({ getConnection() { throw Error('Unexpected database access'); } }, { id: 'actor', role }, null, {}), { status: 403 });
  }
  assert.equal(catalog.canManage({ role: 'SuperAdmin' }), true);
  assert.equal(catalog.canManage({ role: 'Teamlead' }), true);
});

test('catalogue names are normalized and invalid names rejected', () => {
  assert.equal(catalog.nameOf('  Standard   Reports '), 'Standard Reports');
  for (const value of ['', 'a'.repeat(101), 'Reports\u0000', null]) assert.throws(() => catalog.nameOf(value), { status: 400 });
});

test('selections use canonical active names and preserve only previously stored legacy values', async () => {
  const pool = { query: async () => [[{ name: 'Reporting', is_active: 1 }, { name: 'Retired Module', is_active: 0 }]] };
  assert.deepEqual(await catalog.validateSelection(pool, ['reporting', 'Reporting']), ['Reporting']);
  assert.deepEqual(await catalog.validateSelection(pool, ['Retired Module'], ['Retired Module']), ['Retired Module']);
  await assert.rejects(catalog.validateSelection(pool, ['Retired Module']), { status: 400 });
  await assert.rejects(catalog.validateSelection(pool, ['Unapproved custom option']), { status: 400 });
  await assert.rejects(catalog.validateSelection(pool, 'Reporting'), { status: 400 });
  assert.deepEqual(await catalog.validateSelection({ query() { throw Error('No catalogue lookup is needed'); } }, []), []);
});
