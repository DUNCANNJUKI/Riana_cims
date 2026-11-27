const test = require('node:test');
const assert = require('node:assert/strict');
const { BUSINESS_ROLE, BUSINESS_SCOPE_HEADER, businessBoundary, businessScope, canShareBusinessConversation, canShareBusinessMeeting } = require('./businessBoundary');
const { hasCapability, getEffectiveCapabilities } = require('./accessControl');

const request = (path, { role = BUSINESS_ROLE, subsidiary = 'assigned', method = 'GET', scopeHeader } = {}) => {
  const req = { path, method, headers: { [BUSINESS_SCOPE_HEADER]: scopeHeader }, query: { subsidiary_id: 'requested' }, user: { role, subsidiary_id: subsidiary } };
  let status = 200;
  const res = { status(code) { status = code; return this; }, json() {} };
  let allowed = false;
  businessBoundary(req, res, () => { allowed = true; });
  return { allowed, status, scope: businessScope(req, 'c.subsidiary_id') };
};

test('business reads are bound to the authenticated subsidiary and fail closed without one', () => {
  const expected = { allowed: true, status: 200, scope: { sql: ' WHERE c.subsidiary_id = ?', values: ['assigned'] } };
  for (const path of ['/business/overview', '/business/requests/x', '/business/activity', '/clients', '/clients/x/branches',
    '/branches/x/departments', '/installations/x', '/client_assignments', '/budgets', '/hardware/assets', '/hardware/reports',
    '/scheduling/events', '/handover_uploads', '/announcements', '/chat/users']) {
    assert.deepEqual(request(path), expected);
    assert.equal(request(path, { subsidiary: null }).status, 403);
  }
});

test('Head of Business cannot access global APIs or widen its role with extra permissions', () => {
  for (const path of ['/admin/backups', '/crms/change_requests', '/user_profiles/x', '/files', '/admin/audit-logs', '/chat/recordings', '/scheduling/policy']) {
    assert.equal(request(path).status, 403);
  }
  for (const path of ['/installations/x', '/subsidiaries/x', '/companies']) {
    assert.equal(request(path, { method: 'PUT' }).status, 403);
  }
  assert.deepEqual(request('/clients/x', { method: 'PUT' }).scope.values, ['assigned']);
  assert.equal(request('/clients/x', { method: 'DELETE' }).status, 403);
  for (const [method, path] of [
    ['POST', '/user_profiles'], ['PATCH', '/business/staff/x'], ['PATCH', '/user_profiles/x'],
    ['POST', '/budgets'], ['POST', '/hardware/generate'], ['POST', '/hardware/transfer'], ['DELETE', '/announcements/x'],
    ['PATCH', '/business/activity'],
  ]) assert.equal(request(path, { method }).status, 403);
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

test('selection headers cannot reactivate former delegated scopes', () => {
  assert.deepEqual(request('/installations/x', { method: 'PATCH', scopeHeader: 'assigned' }).scope.values, ['assigned']);
  assert.equal(request('/installations/x', { method: 'PATCH', scopeHeader: 'former-grant' }).status, 403);
  assert.equal(request('/business/delegations/x', { method: 'PUT' }).status, 403);
});

test('business conversations and group invitations allow only authorized contacts in either direction', () => {
  const head = { id: 'head', role: BUSINESS_ROLE, subsidiary_id: 'a' };
  const colleague = { id: 'local', role: 'User', subsidiary_id: 'a' };
  const outsider = { id: 'external', role: 'Admin', subsidiary_id: 'b' };
  const officer = { id: 'inventory', role: 'InventoryOfficer', subsidiary_id: null };
  assert.ok(canShareBusinessConversation(head, colleague));
  assert.ok(canShareBusinessConversation(head, officer));
  assert.equal(canShareBusinessConversation(head, outsider), false);
  assert.equal(canShareBusinessConversation(outsider, head), false);
  assert.ok(canShareBusinessMeeting([officer, head, colleague]));
  assert.equal(canShareBusinessMeeting([officer, head, outsider]), false);
  assert.ok(canShareBusinessMeeting([colleague, outsider]));
});
