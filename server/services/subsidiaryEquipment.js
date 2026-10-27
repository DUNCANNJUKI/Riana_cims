const HANDOVER_EQUIPMENT_FIELDS = new Set([
  'kiosk_type','kiosk_count','counter_count','led_count','screen_with_size','screen_count','service_points',
  'ups_count','speakers','amplifiers','media_controllers','tablets','digital_signage_system',
  'hdmis','splitters','staff_trained',
]);
const isCustomEquipment = (field) => typeof field === 'string' && /^custom_[a-f0-9]{32}$/.test(field);

const normalizeEquipmentConfigurationPayload = (value) => {
  const source = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(source) || source.length === 0 || source.length > 100) {
    throw new Error('Select between 1 and 100 E-handover equipment items.');
  }
  const seen = new Set();
  return source.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid E-handover equipment item.');
    const field = String(item.field || '').trim();
    if ((!HANDOVER_EQUIPMENT_FIELDS.has(field) && !isCustomEquipment(field)) || seen.has(field)) throw new Error('E-handover equipment fields must be supported and unique.');
    const label = String(item.label || '').trim();
    const installedStatus = String(item.installed_status || '').trim();
    if (!label || label.length > 80 || !installedStatus || installedStatus.length > 40) {
      throw new Error('Each E-handover equipment item requires a valid label and status.');
    }
    seen.add(field);
    return { field, label, installed_status: installedStatus };
  });
};

const equipmentLabels = (configuration, defaults) => {
  const items = typeof configuration === 'string' ? JSON.parse(configuration) : configuration;
  const labels = Object.entries(defaults).map(([field, label]) => ({
    field,
    label: (Array.isArray(items) && items.find((item) => item?.field === field)?.label) || label,
  }));
  return labels.concat((Array.isArray(items) ? items : []).filter((item) => isCustomEquipment(item?.field)).map(({field,label}) => ({field,label})));
};

async function equipmentDefinitions(db, subsidiaryId) {
  const [[row]] = await db.query('SELECT equipment_configuration FROM subsidiaries WHERE id=? LOCK IN SHARE MODE',[subsidiaryId]);
  return Object.fromEntries(equipmentLabels(row?.equipment_configuration, require('./installationEquipment').EQUIPMENT_FIELDS).map(({field,label})=>[field,label]));
}
async function normalizeEquipmentQuantities(db, clientId, value, user) {
  const P = require('./hardwarePolicy');
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 100)
    P.fail('Equipment quantities must be an object with at most 100 items.');
  const [[client]] = await db.query('SELECT subsidiary_id FROM clients WHERE id=?',[clientId]);
  if (!client) P.fail('Client not found.',404);
  if(user && Object.keys(value).length) P.scopedSubsidiary(user,client.subsidiary_id);
  const definitions = await equipmentDefinitions(db,client.subsidiary_id);
  const result = {};
  for (const [field,count] of Object.entries(value)) {
    if (!isCustomEquipment(field) || !Object.hasOwn(definitions,field)) P.fail('Unknown equipment item for this subsidiary.');
    result[field] = P.integer(count,0,10000,definitions[field]);
  }
  return result;
}
async function assertEquipmentRemovalSafe(db, subsidiaryId, next) {
  const P = require('./hardwarePolicy');
  const [[row]] = await db.query('SELECT equipment_configuration FROM subsidiaries WHERE id=? FOR UPDATE',[subsidiaryId]);
  const previous = typeof row?.equipment_configuration === 'string' ? JSON.parse(row.equipment_configuration) : row?.equipment_configuration;
  for (const item of (previous || []).filter((item)=>isCustomEquipment(item.field) && !next.some((entry)=>entry.field===item.field))) {
    const [[usage]] = await db.query(`SELECT (
      (SELECT COUNT(*) FROM installations i JOIN clients c ON c.id=i.client_id WHERE c.subsidiary_id=? AND JSON_CONTAINS_PATH(i.equipment_quantities,'one',?)=1) +
      (SELECT COUNT(*) FROM hardware_equipment_requirements WHERE subsidiary_id=? AND equipment_field=? AND serial_required=1) +
      (SELECT COUNT(*) FROM hardware_models WHERE JSON_UNQUOTE(JSON_EXTRACT(specifications,'$.installation_equipment_field'))=?)
    ) AS total`,[subsidiaryId,`$.${item.field}`,subsidiaryId,item.field,item.field]);
    if(Number(usage.total)) P.fail(`Cannot remove ${item.label}: installations, serial rules or models still reference it. Rename it instead.`,409);
  }
}
module.exports = { HANDOVER_EQUIPMENT_FIELDS, normalizeEquipmentConfigurationPayload, equipmentLabels, isCustomEquipment, equipmentDefinitions, normalizeEquipmentQuantities, assertEquipmentRemovalSafe };
