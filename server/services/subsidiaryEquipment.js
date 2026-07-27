const HANDOVER_EQUIPMENT_FIELDS = new Set([
  'kiosk_type','kiosk_count','counter_count','led_count','screen_with_size','screen_count','service_points',
  'ups_count','speakers','amplifiers','media_controllers','tablets','digital_signage_system',
  'hdmis','splitters','staff_trained',
]);

const normalizeEquipmentConfigurationPayload = (value) => {
  const source = typeof value === 'string' ? JSON.parse(value) : value;
  if (!Array.isArray(source) || source.length === 0 || source.length > HANDOVER_EQUIPMENT_FIELDS.size) {
    throw new Error('Select between 1 and 16 supported E-handover equipment items.');
  }
  const seen = new Set();
  return source.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid E-handover equipment item.');
    const field = String(item.field || '').trim();
    if (!HANDOVER_EQUIPMENT_FIELDS.has(field) || seen.has(field)) throw new Error('E-handover equipment fields must be supported and unique.');
    const label = String(item.label || '').trim();
    const installedStatus = String(item.installed_status || '').trim();
    if (!label || label.length > 80 || !installedStatus || installedStatus.length > 40) {
      throw new Error('Each E-handover equipment item requires a valid label and status.');
    }
    seen.add(field);
    return { field, label, installed_status: installedStatus };
  });
};

module.exports = { HANDOVER_EQUIPMENT_FIELDS, normalizeEquipmentConfigurationPayload };
