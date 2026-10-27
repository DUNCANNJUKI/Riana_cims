const { fail, integer } = require("./hardwarePolicy");
const { isCustomEquipment } = require('./subsidiaryEquipment');
const supportedField = (field) => Object.hasOwn(EQUIPMENT_FIELDS, field) || isCustomEquipment(field);
const quantity = (installation,field) => {
  const custom = typeof installation.equipment_quantities === 'string' ? JSON.parse(installation.equipment_quantities) : installation.equipment_quantities;
  return isCustomEquipment(field) ? custom?.[field] || 0 : installation[field] || 0;
};

const EQUIPMENT_FIELDS = {
  kiosk_count: "Kiosks",
  counter_count: "Tripleplay Devices",
  service_points: "Service Points",
  led_count: "LED Displays",
  screen_count: "TVs",
  ups_count: "UPS Units",
  speakers: "Speakers",
  amplifiers: "Amplifiers",
  media_controllers: "Media Controllers",
  tablets: "Tablets / Feedback Devices",
  digital_signage_system: "Digital Signage",
  hdmis: "HDMI Cables / Adapters",
  splitters: "Splitters",
};
const DEFAULT_FAMILY_FIELDS = {
  QMS: "kiosk_count",
  SSK: "kiosk_count",
  MC: "media_controllers",
  LED: "led_count",
  DS: "digital_signage_system",
  FBT: "tablets",
};
const equipmentField = (model) => {
  const specs =
    typeof model.specifications === "string"
      ? JSON.parse(model.specifications)
      : model.specifications;
  const field = (
    specs?.installation_equipment_field ||
    DEFAULT_FAMILY_FIELDS[model.family] ||
    null
  );
  return supportedField(field) ? field : null;
};
const validateSelection = (selection) => {
  if (
    !selection ||
    typeof selection !== "object" ||
    Array.isArray(selection) ||
    !Array.isArray(selection.assets) ||
    selection.assets.length > 100
  )
    fail("Select at most 100 serialized devices.");
  if (
    typeof selection.mark_installed !== "boolean" ||
    typeof selection.physical_confirmed !== "boolean"
  )
    fail("Supply physical confirmation and installation state.");
  const seen = new Set();
  for (const entry of selection.assets) {
    if (
      !entry ||
      !supportedField(entry.equipment_field) ||
      typeof entry.asset_id !== "string" ||
      !/^[A-Za-z0-9-]{1,36}$/.test(entry.asset_id) ||
      seen.has(entry.asset_id)
    )
      fail(
        "Select each registered device only once for a supported equipment item.",
      );
    seen.add(entry.asset_id);
  }
  if (selection.assets.length && !selection.physical_confirmed)
    fail("Confirm the physical serials before saving selected equipment.");
  return selection;
};
const validateQuantities = (installation, entries) => {
  const counts = {};
  for (const entry of entries)
    counts[entry.equipment_field] = (counts[entry.equipment_field] || 0) + 1;
  for (const [field, count] of Object.entries(counts))
    if (
      count >
      integer(quantity(installation,field), 0, 10000, EQUIPMENT_FIELDS[field] || 'Equipment')
    )
      fail(
        `Selected ${EQUIPMENT_FIELDS[field] || 'equipment'} exceed the installation quantity.`,
        409,
      );
};
const availabilityReason = (asset,installationId,technicianId) => {
  if(asset.archived_at)return 'Archived equipment cannot be selected.';
  if(asset.status==='Generated' || !Number(asset.physical_verified))return 'Registered serial; Receive & Verify is required before allocation.';
  if(asset.approval_status!=='Approved')return 'Registration approval is pending.';
  if(!['New','Good','Fair'].includes(asset.condition_grade))return 'The device condition is not eligible for installation.';
  if(asset.reconciliation_status!=='Matched')return 'Physical stock reconciliation is required.';
  if(!asset.serial_number || !asset.manufacturing_year)return 'Device identity or manufacturing year needs reconciliation.';
  if(asset.installation_id && asset.installation_id!==installationId)return 'Already allocated to another installation.';
  if(asset.status==='Reserved' && asset.installation_id===installationId && new Date(asset.reservation_expires_at)>new Date())return null;
  if(asset.status==='Assigned' && !asset.installation_id && asset.custodian_id===technicianId)return null;
  if(asset.installation_id===installationId && ['Assigned','Installed'].includes(asset.status))return null;
  if(asset.status==='Available' && !asset.active_assignment_id)return null;
  return `${asset.status}: not available for this installation.`;
};
module.exports = {
  EQUIPMENT_FIELDS,
  equipmentField,
  validateSelection,
  validateQuantities,
  availabilityReason,
  quantity,
  supportedField,
};
