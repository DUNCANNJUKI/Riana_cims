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
  assert.throws(() => normalizeEquipmentConfigurationPayload([]), /between 1 and 100/i);
  assert.throws(() => normalizeEquipmentConfigurationPayload(Array(101).fill({field:'tablets',label:'Tablets',installed_status:'Installed'})), /between 1 and 100/i);
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

test('hybrid equipment accepts stable custom IDs and labels without executable field names',()=>{
  const {equipmentLabels}=require('./subsidiaryEquipment');
  const field='custom_0123456789abcdef0123456789abcdef';
  const config=normalizeEquipmentConfigurationPayload([{field,label:'Routers',installed_status:'Connected'}]);
  assert.equal(config[0].field,field);
  assert.deepEqual(equipmentLabels(config,{kiosk_count:'Kiosks'}),[{field:'kiosk_count',label:'Kiosks'},{field,label:'Routers'}]);
  for(const invalid of ['custom___proto__','custom_constructor','custom_abc','__proto__'])
    assert.throws(()=>normalizeEquipmentConfigurationPayload([{field:invalid,label:'Invalid',installed_status:'Installed'}]),/supported and unique/);
});

test('handover configuration preserves the existing screen quantity field',()=>{
  assert.deepEqual(normalizeEquipmentConfigurationPayload([{field:'screen_count',label:'Screens',installed_status:'Installed'}]),[{field:'screen_count',label:'Screens',installed_status:'Installed'}]);
});
