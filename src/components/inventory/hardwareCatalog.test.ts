import assert from "node:assert/strict";
import test from "node:test";
import { normalizeHardwareCatalog } from "./hardwareCatalog.ts";

test("normalizes a complete hardware catalog without changing approval", () => {
  const catalog = normalizeHardwareCatalog({
    variants: [],
    models: [],
    locations: [],
    subsidiaries: [],
    statuses: ["Available"],
    conditions: ["Good"],
    policy: {
      issuance_approved: 1,
      field_approval_required: 0,
      sequence_partition: "subsidiary",
      approval_reference: "POL-1",
    },
  });

  assert.equal(catalog.policy_available, true);
  assert.equal(catalog.policy.issuance_approved, 1);
});

test("fails closed when the approval policy is absent", () => {
  const catalog = normalizeHardwareCatalog({ statuses: null });

  assert.equal(catalog.policy_available, false);
  assert.equal(catalog.policy.issuance_approved, 0);
  assert.deepEqual(catalog.statuses, []);
});

test("fails closed for malformed approval values", () => {
  const catalog = normalizeHardwareCatalog({
    policy: { issuance_approved: "yes" },
  });

  assert.equal(catalog.policy_available, false);
  assert.equal(catalog.policy.issuance_approved, 0);
});
