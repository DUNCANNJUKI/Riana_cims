const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("./installationEquipment");

test("inventory model mapping supports any known equipment quantity and overrides family defaults", () => {
  assert.equal(E.equipmentField({ family: "MC" }), "media_controllers");
  assert.equal(
    E.equipmentField({
      family: "MC",
      specifications: { installation_equipment_field: "ups_count" },
    }),
    "ups_count",
  );
  assert.equal(E.equipmentField({ family: "NEW" }), null);
  assert.equal(E.equipmentField({family:"NEW",specifications:{installation_equipment_field:"__proto__"}}),null);
});
test("selection rejects duplicates, unknown equipment items and unconfirmed physical identities", () => {
  const selection = {
    assets: [{ asset_id: "a", equipment_field: "ups_count" }],
    mark_installed: false,
    physical_confirmed: true,
  };
  E.validateSelection(selection);
  assert.throws(
    () => E.validateSelection({ ...selection, physical_confirmed: false }),
    /physical serials/,
  );
  assert.throws(
    () =>
      E.validateSelection({
        ...selection,
        assets: [...selection.assets, ...selection.assets],
      }),
    /only once/,
  );
  assert.throws(
    () =>
      E.validateSelection({
        ...selection,
        assets: [{ asset_id: "a", equipment_field: "staff_trained" }],
      }),
    /supported/,
  );
  assert.throws(
    () =>
      E.validateQuantities({ ups_count: 1 }, [
        ...selection.assets,
        ...selection.assets,
      ]),
    /exceed/,
  );
});
