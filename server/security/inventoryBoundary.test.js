const test = require("node:test");
const assert = require("node:assert/strict");
const { inventoryBoundary } = require("./inventoryBoundary");
const { hasCapability } = require("./accessControl");
const request = (role, path, method = "GET", extra_permissions = []) => {
  let allowed = false,
    status;
  inventoryBoundary(
    { user: { role, extra_permissions }, path, method },
    {
      status(code) {
        status = code;
        return this;
      },
      json() {},
    },
    () => {
      allowed = true;
    },
  );
  return { allowed, status };
};
test("Inventory Officer has no implicit legacy business or administration access", () => {
  for (const path of [
    "/clients",
    "/installations",
    "/client_assignments",
    "/user_profiles",
    "/budgets",
    "/admin/backup",
    "/chat/assistant",
  ])
    assert.deepEqual(request("InventoryOfficer", path), {
      allowed: false,
      status: 403,
    });
  assert.equal(
    hasCapability({ role: "InventoryOfficer" }, "installations.view"),
    false,
  );
  for (const path of [
    "/hardware/assets",
    "/auth/me",
    "/notifications",
    "/chat/messages",
    "/files",
    "/companies",
  ])
    assert.equal(request("InventoryOfficer", path).allowed, true);
});
test("existing roles and explicit additional capability grants preserve legacy behavior", () => {
  for (const role of [
    "SuperAdmin",
    "Admin",
    "Management",
    "Finance",
    "Teamlead",
    "User",
    "Sales",
    "Developer",
  ])
    assert.equal(request(role, "/clients").allowed, true);
  assert.equal(
    request("InventoryOfficer", "/clients", "GET", ["clients.view"]).allowed,
    true,
  );
  assert.equal(
    request("InventoryOfficer", "/clients", "POST", ["clients.view"]).allowed,
    false,
  );
  assert.equal(request("InventoryOfficer", "/companies", "PUT").allowed, false);
});
