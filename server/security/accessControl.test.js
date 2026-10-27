const test = require('node:test');
const assert = require('node:assert/strict');
const { getEffectiveCapabilities, hasCapability } = require('./accessControl');

test('Finance is read-only across the approved operational modules', () => {
  const capabilities = getEffectiveCapabilities('Finance');
  assert.ok(capabilities.includes('reports.view'));
  assert.ok(capabilities.includes('installations.view'));
  assert.equal(capabilities.includes('installations.manage'), false);
  assert.equal(capabilities.includes('clients.manage'), false);
});

test('Management cannot modify installations or installation progress', () => {
  assert.equal(hasCapability({ role: 'Management' }, 'company.manage'), true);
  assert.equal(hasCapability({ role: 'Management' }, 'users.manage'), true);
  assert.equal(hasCapability({ role: 'Management' }, 'installations.manage'), false);
  assert.equal(hasCapability({ role: 'Management' }, 'progress.manage'), false);
});

test('an explicit user grant supplements the base role without changing it', () => {
  assert.equal(hasCapability({ role: 'Finance', extra_permissions: 'analytics.view' }, 'analytics.view'), true);
  assert.equal(hasCapability({ role: 'Finance', extra_permissions: '' }, 'analytics.view'), false);
});
