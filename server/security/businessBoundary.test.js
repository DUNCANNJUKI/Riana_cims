const test = require('node:test');
const assert = require('node:assert/strict');
const { BUSINESS_ROLE, BUSINESS_SCOPE_HEADER, businessBoundary, businessScope, createBusinessBoundary } = require('./businessBoundary');
const { hasCapability, getEffectiveCapabilities } = require('./accessControl');

const request = (path, { role = BUSINESS_ROLE, subsidiary = 'assigned', method = 'GET' } = {}) => {
  const req = { path, method, query: { subsidiary_id: 'requested' }, user: { role, subsidiary_id: subsidiary } };
  let status = 200;
  const res = { status(code) { status = code; return this; }, json() {} };
  let allowed = false;
  businessBoundary(req, res, () => { allowed = true; });
  return { allowed, status, scope: businessScope(req, 'c.subsidiary_id') };
};

test('business reads are bound to the authenticated subsidiary and fail closed without one', () => {
  const expected = { allowed: true, status: 200, scope: { sql: ' WHERE c.subsidiary_id = ?', values: ['assigned'] } };
  for (const path of ['/business/overview', '/clients', '/clients/x/branches', '/branches/x/departments', '/installations/x', '/client_assignments']) {
    assert.deepEqual(request(path), expected);
    assert.equal(request(path, { subsidiary: null }).status, 403);
  }
});

test('Head of Business cannot access global APIs or widen its role with extra permissions', () => {
  for (const path of ['/admin/backups', '/crms/change_requests', '/user_profiles/x', '/files', '/chat/users', '/hardware/assets']) {
    assert.equal(request(path).status, 403);
  }
  for (const path of ['/installations/x', '/subsidiaries/x', '/companies']) {
    assert.equal(request(path, { method: 'PUT' }).status, 403);
  }
  assert.deepEqual(request('/clients/x', { method: 'PUT' }).scope.values, ['assigned']);
  assert.equal(request('/clients/x', { method: 'DELETE' }).status, 403);
  assert.equal(hasCapability({ role: BUSINESS_ROLE, extra_permissions: ['company.manage'] }, 'company.manage'), false);
  assert.ok(getEffectiveCapabilities(BUSINESS_ROLE).includes('clients.view'));
  assert.ok(!getEffectiveCapabilities(BUSINESS_ROLE, ['users.manage']).includes('users.manage'));
});

test('existing Admin and Super Admin routes are unaffected by the business boundary', () => {
  for (const role of ['Admin', 'SuperAdmin']) {
    const response = request('/user_profiles', { role, method: 'POST' });
    assert.deepEqual(response, { allowed: true, status: 200, scope: { sql: '', values: [] } });
    assert.equal(hasCapability({ role }, 'users.manage'), true);
  }
});

test('delegated scopes are checked against the authenticated actor on every request', async () => {
  const calls = [];
  const boundary = createBusinessBoundary({ query: async (_sql, args) => {
    calls.push(args);
    return [[{ id: 'own' }, { id: 'granted' }]];
  } });
  for (const [selected, expected] of [['granted', 200], ['ungranted', 403]]) {
    const req = { method: 'PATCH', path: '/installations/test', user: { id: 'head', role: BUSINESS_ROLE, subsidiary_id: 'own' }, headers: { [BUSINESS_SCOPE_HEADER]: selected } };
    let statusCode = 200;
    let passed = false;
    await boundary(req, { status(code) { statusCode = code; return this; }, json() {} }, error => {
      assert.ifError(error);
      passed = true;
    });
    assert.equal(statusCode, expected);
    assert.equal(passed, expected === 200);
    if (passed) assert.equal(req.businessSubsidiaryId, 'granted');
  }
  assert.deepEqual(calls, [['own', 'head'], ['own', 'head']]);
});
