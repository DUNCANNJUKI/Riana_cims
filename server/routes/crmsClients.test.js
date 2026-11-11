const test = require('node:test');
const assert = require('node:assert/strict');
const createRouter = require('./crms');

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const clientsHandler = (pool) => createRouter({ pool, jwtSecret: 'test-secret' }).stack
  .find(layer => layer.route?.path === '/clients' && layer.route.methods.get).route.stack[0].handle;

test('CRMS client listing uses canonical phone/email columns while preserving frontend aliases', async () => {
  const clients = [{ id: 'client', name: 'Example', contact_phone: '+254700000000', contact_person_phone: '+254700000000' }];
  const pool = { query: async (sql) => {
    assert.match(sql, /c\.contact_phone AS contact_person_phone/);
    assert.match(sql, /c\.contact_email AS contact_person_email/);
    assert.doesNotMatch(sql, /c\.contact_person_(?:phone|email)/);
    return [clients];
  } };
  const res = response();
  await clientsHandler(pool)({}, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, clients);
});

test('client listing failures return a safe actionable error', async () => {
  const res = response();
  await clientsHandler({ query: async () => { throw Object.assign(new Error('SELECT private FROM clients'), { code: 'ER_BAD_FIELD_ERROR' }); } })({}, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, 'Unable to load clients. Please try again.');
});
