const { hasCapability } = require("../security/accessControl");

const STATUSES = [
  "Generated",
  "Available",
  "Reserved",
  "Assigned",
  "Installed",
  "Faulty",
  "Under Maintenance",
  "In Transit",
  "Returned",
  "Retired",
  "Disposed",
];
const CONDITIONS = ["New", "Good", "Fair", "Poor", "Unserviceable"];
const TRANSITIONS = {
  Generated: ["Available", "Retired"],
  Available: ["Reserved", "Assigned", "Faulty", "In Transit", "Retired"],
  Reserved: ["Available", "Assigned", "Faulty", "Returned"],
  Assigned: ["Installed", "Returned", "Faulty", "In Transit"],
  Installed: ["Faulty", "Returned", "In Transit"],
  Faulty: ["Under Maintenance", "Returned", "Retired"],
  "Under Maintenance": ["Returned", "Retired"],
  "In Transit": ["Returned", "Faulty"],
  Returned: ["Available", "Faulty", "Under Maintenance", "Retired"],
  Retired: ["Disposed"],
  Disposed: [],
};
const fail = (message, status = 400) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};
const integer = (value, min, max, label) => {
  if (!["number", "string"].includes(typeof value))
    fail(`${label} must be a number.`);
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max)
    fail(`${label} must be between ${min} and ${max}.`);
  return result;
};
const year = (value) => integer(value, 2000, 2099, "Year");
const shortYear = (value) => String(year(value) % 100).padStart(2, "0");
const modelNumber = (variant, modelYear, sequence) =>
  `${variant.nickname}-${shortYear(modelYear)}-${variant.variant}${integer(sequence, 1, 999, "Model sequence")}`;
const serialNumber = (model, serialYear, unitSequence) =>
  `MRZ-${model.family}-${model.variant}${model.model_sequence}-${shortYear(serialYear)}-${integer(unitSequence, 1001, 9999, "Unit sequence")}`;
const eligible = (asset) =>
  asset.status === "Available" &&
  Boolean(Number(asset.physical_verified)) &&
  Boolean(asset.serial_number) &&
  Boolean(asset.manufacturing_year) &&
  asset.approval_status === "Approved" &&
  ["New", "Good", "Fair"].includes(asset.condition_grade) &&
  asset.reconciliation_status === "Matched" &&
  !asset.archived_at &&
  !asset.deleted_at &&
  !asset.active_assignment_id;
const scopedSubsidiary = (user, requested) => {
  if (
    requested !== undefined &&
    requested !== null &&
    requested !== "" &&
    (typeof requested !== "string" || !/^[A-Za-z0-9-]{1,36}$/.test(requested))
  )
    fail("Invalid subsidiary identifier.");
  if (
    user.role === "SuperAdmin" ||
    hasCapability(user, "inventory.cross_subsidiary")
  ) {
    if (!requested) fail("Select an owning subsidiary.");
    return requested;
  }
  if (!user.subsidiary_id || (requested && requested !== user.subsidiary_id))
    fail("Inventory access is restricted to your subsidiary.", 403);
  return user.subsidiary_id;
};
const requirePermission = (user, permission) => {
  if (!hasCapability(user, permission))
    fail("Insufficient inventory permissions.", 403);
};
const transition = (asset, target) => {
  if (!TRANSITIONS[asset.status]?.includes(target))
    fail(`Cannot change ${asset.status} to ${target}.`, 409);
  if (asset.archived_at || asset.deleted_at)
    fail("Archived assets cannot change operational state.", 409);
};
module.exports = {
  STATUSES,
  CONDITIONS,
  TRANSITIONS,
  fail,
  integer,
  year,
  modelNumber,
  serialNumber,
  eligible,
  scopedSubsidiary,
  requirePermission,
  transition,
};
