const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("./equipmentRequirements");
const E = require("./installationEquipment");
test("all equipment is optional by default and requirements follow the subsidiary settings", async () => {
  const db = { query: async () => [[]] };
  await R.assertRequired(db,{subsidiary_id:'a',kiosk_count:1,ups_count:1},[]);
  const requiredDb={query:async()=>[[{equipment_field:'kiosk_count'}]]};
  await assert.rejects(
    R.assertRequired(
      requiredDb,
      { subsidiary_id: "a", kiosk_count: 1, ups_count: 1 },
      [],
    ),
    /Kiosks/,
  );
  await R.assertRequired(
    requiredDb,
    { subsidiary_id: "a", kiosk_count: 1, ups_count: 3 },
    [{ equipment_field: "kiosk_count" }],
  );
});
test("subsidiary administrators cannot change another subsidiary", () => {
  for (const role of ["Admin", "Teamlead", "InventoryOfficer"]) {
    assert.equal(R.canEdit({ role, subsidiary_id: "a" }, "a"), true);
    assert.equal(R.canEdit({ role, subsidiary_id: "a" }, "b"), false);
  }
  assert.equal(R.canEdit({ role: "SuperAdmin" }, "b"), true);
});
test("registered generated serials explain verification rather than pretending they do not exist", () => {
  assert.match(
    E.availabilityReason({ status: "Generated", physical_verified: 0 }),
    /Receive & Verify/,
  );
  assert.equal(
    E.availabilityReason(
      {
        status: "Available",
        physical_verified: 1,
        serial_number: "known",
        manufacturing_year: 2026,
        approval_status: "Approved",
        condition_grade: "Good",
        reconciliation_status: "Matched",
        active_assignment_id: null,
        installation_id: null,
      },
      "installation",
      "technician",
    ),
    null,
  );
});
