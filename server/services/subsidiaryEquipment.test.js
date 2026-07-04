const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEquipmentConfigurationPayload } = require('./subsidiaryEquipment');

test('normalizes an ordered subsidiary handover equipment list', () => {
  assert.deepEqual(normalizeEquipmentConfigurationPayload([
    { field: 'tablets', label: ' Customer Tablets ', installed_status: ' Configured ' },
    { field: 'ups_count', label: 'UPS', installed_status: 'Installed' },
  ]), [
    { field: 'tablets', label: 'Customer Tablets', installed_status: 'Configured' },
    { field: 'ups_count', label: 'UPS', installed_status: 'Installed' },
  ]);
});

test('rejects unsupported, duplicate, empty, and oversized equipment configuration', () => {
  assert.throws(() => normalizeEquipmentConfigurationPayload([]), /between 1 and 15/i);
  assert.throws(() => normalizeEquipmentConfigurationPayload([
    { field: 'unknown_device', label: 'Unknown', installed_status: 'Installed' },
  ]), /supported and unique/i);
  assert.throws(() => normalizeEquipmentConfigurationPayload([
    { field: 'tablets', label: 'Tablets', installed_status: 'Installed' },
    { field: 'tablets', label: 'Duplicate', installed_status: 'Installed' },
  ]), /supported and unique/i);
  assert.throws(() => normalizeEquipmentConfigurationPayload([
    { field: 'tablets', label: '', installed_status: 'Installed' },
  ]), /valid label and status/i);
});
