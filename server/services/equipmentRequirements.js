const E = require("./installationEquipment");
const P = require("./hardwarePolicy");
const { hasCapability } = require("../security/accessControl");
const { equipmentDefinitions, equipmentLabels } = require('./subsidiaryEquipment');
const MANAGERS = new Set([
  "SuperAdmin",
  "InventoryOfficer",
  "Admin",
  "Teamlead",
]);
const canEdit = (user, subsidiaryId) =>
  user.role === "SuperAdmin" ||
  (MANAGERS.has(user.role) &&
    Boolean(user.subsidiary_id) &&
    String(user.subsidiary_id) === String(subsidiaryId));
async function requiredFields(db, subsidiaryId) {
  const [rows] = await db.query(
    "SELECT equipment_field FROM hardware_equipment_requirements WHERE subsidiary_id=? AND serial_required=1",
    [subsidiaryId],
  );
  return new Set(rows.map((r) => r.equipment_field));
}
async function assertRequired(db, installation, entries) {
  for(const [field,label] of Object.entries(E.EQUIPMENT_FIELDS))P.integer(installation[field] || 0,0,10000,label);
  const required = await requiredFields(db, installation.subsidiary_id);
  const definitions = await equipmentDefinitions(db,installation.subsidiary_id);
  for (const field of required) {
    const count = Number(E.quantity(installation,field));
    if (
      count > 0 &&
      entries.filter((entry) => entry.equipment_field === field).length !==
        count
    )
      P.fail(
        `Select ${count} registered ${definitions[field] || 'equipment'} serial${count === 1 ? "" : "s"}. Serial numbers are required for this equipment.`,
        409,
      );
  }
}
async function listRequirements(db, user, requested) {
  if (!MANAGERS.has(user.role) && !hasCapability(user, "inventory.view"))
    P.fail("Inventory access is required.", 403);
  if (!MANAGERS.has(user.role) && !requested)
    P.fail("Select your subsidiary.", 403);
  if (!MANAGERS.has(user.role) && requested !== user.subsidiary_id)
    P.fail("Requirements are restricted to your subsidiary.", 403);
  const [subsidiaries] = await db.query(
    `SELECT id,subsidiary_name,equipment_configuration FROM subsidiaries ${requested ? "WHERE id=?" : ""} ORDER BY subsidiary_name`,
    requested ? [requested] : [],
  );
  const [models] = await db.query(
    "SELECT m.model_number,m.specifications,v.family FROM hardware_models m JOIN hardware_variants v ON v.id=m.variant_id",
  );
  const [settings]=await db.query(`SELECT subsidiary_id,equipment_field FROM hardware_equipment_requirements WHERE serial_required=1 ${requested?'AND subsidiary_id=?':''}`,requested?[requested]:[]);
  const output = [];
  for (const subsidiary of subsidiaries) {
    const required = new Set(settings.filter((item)=>item.subsidiary_id===subsidiary.id).map((item)=>item.equipment_field));
    const configuration =
      typeof subsidiary.equipment_configuration === "string"
        ? JSON.parse(subsidiary.equipment_configuration)
        : subsidiary.equipment_configuration;
    output.push({
      id: subsidiary.id,
      subsidiary_name: subsidiary.subsidiary_name,
      can_edit: canEdit(user, subsidiary.id),
      equipment: equipmentLabels(configuration,E.EQUIPMENT_FIELDS).map(({field, label}) => ({
        field,
        label:
          configuration?.find((item) => item.field === field)?.label || label,
        serial_required: required.has(field),
        model_numbers: models
          .filter((model) => E.equipmentField(model) === field)
          .map((model) => model.model_number),
      })),
    });
  }
  return { subsidiaries: output };
}
module.exports = {
  MANAGERS,
  canEdit,
  requiredFields,
  assertRequired,
  listRequirements,
};
