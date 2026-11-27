const test = require('node:test');
const assert = require('node:assert/strict');
const { lockBusinessWrite, runBusinessWrite, decideBusinessRequest } = require('./businessWrites');

const transaction = rowsFor => {
  const operations = [];
  const db = {
    beginTransaction: async () => operations.push('begin'),
    query: async (sql, params) => {
      operations.push({ sql, params });
      return [rowsFor(sql, params)];
    },
    commit: async () => operations.push('commit'),
    rollback: async () => operations.push('rollback'),
    release: () => operations.push('release'),
  };
  return { operations, pool: { getConnection: async () => db } };
};

test('assignment writes are rolled back when a technician is outside the selected subsidiary', async () => {
  const { pool, operations } = transaction(sql => sql.includes('user_profiles') ? [] : [{ id: 'fixture' }]);
  await assert.rejects(runBusinessWrite(pool, 'business-a', async db => {
    await lockBusinessWrite(db, 'business-a', { client_id: 'client-a', hardware_technician_id: 'technician-b' });
    await db.query('INSERT INTO client_assignments VALUES (?)', ['assignment']);
  }), { status: 404 });
  assert.deepEqual(operations.slice(-2), ['rollback', 'release']);
  assert.deepEqual(operations.find(entry => entry.sql?.includes('user_profiles')).params, ['technician-b', 'business-a']);
  assert.ok(!operations.some(entry => entry.sql?.startsWith('INSERT')));
});

test('commercial approval can only transition a pending scoped request and records an audit', async () => {
  const payload = { subsidiaryId: 'a', actorId: 'head', requestId: 'request-a', status: 'approved', comment: '' };
  const fixture = transaction(sql => sql.includes('SELECT') ? [{ id: 'request-a', status: 'pending_approval' }] : []);
  const result = await decideBusinessRequest(fixture.pool, payload);
  assert.equal(result.status, 'approved');
  assert.deepEqual(fixture.operations[1].params, ['head', 'request-a', 'a']);
  assert.ok(fixture.operations.some(entry => entry.sql?.includes('INSERT INTO crms_audit_logs')));
  const reviewed = transaction(() => [{ id: 'request-a', status: 'approved' }]);
  await assert.rejects(decideBusinessRequest(reviewed.pool, payload), { status: 409 });
  const outside = transaction(() => []);
  await assert.rejects(decideBusinessRequest(outside.pool, payload), { status: 404 });
  const own = transaction(() => [{ id: 'request-a', status: 'pending_approval', submitted_by_actor: 1 }]);
  await assert.rejects(decideBusinessRequest(own.pool, payload), { status: 403 });
  const clarification = transaction(sql => sql.startsWith('SELECT') ? [{ id: 'request-a', status: 'pending_approval' }] : []);
  await assert.rejects(decideBusinessRequest(clarification.pool, { ...payload, status: 'waiting_clarification' }), { status: 400 });
  await decideBusinessRequest(clarification.pool, { ...payload, status: 'waiting_clarification', comment: 'Confirm the scope.' });
  assert.deepEqual(clarification.operations[2].params, ['waiting', 'Confirm the scope.', 'request-a']);
  assert.equal(clarification.operations[3].params[2], 'status_changed');
});
