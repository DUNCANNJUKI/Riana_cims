const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("./hardwarePolicy");
const { hasCapability } = require("../security/accessControl");
const {
  AVAILABLE_SQL,
  canonical,
  createHardwareInventory,
} = require("./hardwareInventory");

const available = () => ({
  status: "Available",
  serial_number: "MRZ-MC-M1-26-1001",
  manufacturing_year: 2026,
  physical_verified: 1,
  approval_status: "Approved",
  condition_grade: "Good",
  reconciliation_status: "Matched",
});
test("official Marezi and selected Core model and serial formats", () => {
  assert.equal(
    P.modelNumber({ nickname: "Wave", variant: "C" }, 2026, 1),
    "Wave-26-C1",
  );
  assert.equal(
    P.modelNumber({ nickname: "Core", variant: "M" }, 2026, 1),
    "Core-26-M1",
  );
  assert.equal(
    P.serialNumber(
      { family: "MC", variant: "M", model_sequence: 1 },
      2026,
      1001,
    ),
    "MRZ-MC-M1-26-1001",
  );
  assert.equal(
    P.serialNumber(
      { family: "QMS", variant: "C", model_sequence: 2 },
      2027,
      9999,
    ),
    "MRZ-QMS-C2-27-9999",
  );
  assert.throws(
    () =>
      P.serialNumber(
        { family: "MC", variant: "M", model_sequence: 1 },
        2026,
        10000,
      ),
    /Unit sequence/,
  );
  assert.throws(() => P.year(2100), /Year/);
});
test("issued serials never imply physical availability", () => {
  assert.equal(
    P.eligible({ ...available(), status: "Generated", physical_verified: 0 }),
    false,
  );
  for (const change of [
    { physical_verified: 0 },
    { approval_status: "Pending" },
    { approval_status: "Rejected" },
    { condition_grade: "Poor" },
    { reconciliation_status: "Missing" },
    { active_assignment_id: "busy" },
    { archived_at: "now" },
    { serial_number: null },
    { manufacturing_year: null },
  ])
    assert.equal(P.eligible({ ...available(), ...change }), false);
  assert.equal(P.eligible(available()), true);
  assert.match(AVAILABLE_SQL, /physical_verified=1/);
  assert.match(AVAILABLE_SQL, /NOT EXISTS/);
});
test("lifecycle blocks conflicting installation and terminal-state reuse", () => {
  assert.throws(
    () => P.transition({ ...available(), status: "Installed" }, "Assigned"),
    /Cannot change/,
  );
  assert.throws(
    () => P.transition({ ...available(), status: "Retired" }, "Available"),
    /Cannot change/,
  );
  assert.throws(
    () => P.transition({ ...available(), status: "Disposed" }, "Returned"),
    /Cannot change/,
  );
  assert.throws(
    () => P.transition({ ...available(), archived_at: "now" }, "Reserved"),
    /Archived/,
  );
});
test("Inventory Officer is scoped and sensitive privileges require separate grants", () => {
  const user = { role: "InventoryOfficer", subsidiary_id: "a" };
  assert.equal(P.scopedSubsidiary(user, "a"), "a");
  assert.throws(() => P.scopedSubsidiary(user, "b"), /restricted/);
  assert.throws(
    () => P.scopedSubsidiary({ ...user, subsidiary_id: null }),
    /restricted/,
  );
  assert.equal(hasCapability(user, "inventory.generate_serial"), true);
  for (const permission of [
    "inventory.policy",
    "inventory.approve_models",
    "inventory.cross_subsidiary",
    "inventory.retire_approve",
    "inventory.modify_identity",
    "inventory.approve_import",
  ])
    assert.equal(hasCapability(user, permission), false);
  assert.equal(
    hasCapability({ role: "Management" }, "inventory.policy"),
    false,
  );
  assert.equal(
    hasCapability({ role: "User" }, "inventory.field_register"),
    false,
  );
  assert.equal(
    hasCapability(
      { role: "User", extra_permissions: ["inventory.field_register"] },
      "inventory.field_register",
    ),
    true,
  );
});
test("idempotency hash canonicalizes nested JSON keys", () =>
  assert.equal(
    canonical({ z: { b: 2, a: 1 }, a: [2, 1] }),
    canonical({ a: [2, 1], z: { a: 1, b: 2 } }),
  ));

test("public QR history returns only the approved asset projection and redacted lifecycle", async () => {
  const statements = [];
  const service = createHardwareInventory({
    query: async (sql, args = []) => {
      statements.push({ sql, args });
      if (sql.includes("FROM hardware_assets a")) return [[{
        serial_number: "MRZ-QMS-C2-26-1010",
        status: "Installed",
        model_number: "Wave-26-C2",
        family: "QMS",
        nickname: "Wave",
      }]];
      if (sql.includes("FROM hardware_events")) return [[
        { action: "install", created_at: "2026-10-16T10:00:00.000Z" },
        { action: "fault", created_at: "2026-10-17T10:00:00.000Z" },
      ]];
      throw new Error(`Unexpected public-history SQL: ${sql}`);
    },
  });
  const result = await service.publicHistory("550e8400-e29b-41d4-a716-446655440000");
  assert.deepEqual(result, {
    asset: {
      serial_number: "MRZ-QMS-C2-26-1010",
      model_number: "Wave-26-C2",
      family: "QMS",
      nickname: "Wave",
      status: "Installed",
    },
    history: [
      { action: "Installation confirmed", occurred_at: "2026-10-16T10:00:00.000Z" },
      { action: "Fault reported", occurred_at: "2026-10-17T10:00:00.000Z" },
    ],
  });
  assert.equal(statements.length, 2);
  assert.match(statements[0].sql, /a\.serial_number IS NOT NULL/);
  assert.match(statements[0].sql, /registration_source <> 'Draft'/);
  assert.doesNotMatch(statements[0].sql, /manufacturer_serial|client_name|location_name|custodian_id|notes/i);
  assert.match(statements[1].sql, /action IN/);
  await assert.rejects(service.publicHistory("../not-an-asset"), /Asset not found/);
});

function memoryPool({ approved = true, sequence = 1001 } = {}) {
  let state = { requests: {}, assets: [], sequence };
  let mutex = Promise.resolve();
  const statements = [];
  return {
    statements,
    get state() {
      return state;
    },
    async getConnection() {
      let unlock, snapshot;
      return {
        async beginTransaction() {
          const prior = mutex;
          mutex = new Promise((resolve) => (unlock = resolve));
          await prior;
          snapshot = structuredClone(state);
        },
        async commit() {
          unlock();
        },
        async rollback() {
          state = snapshot;
          unlock();
        },
        release() {},
        async query(sql, args = []) {
          statements.push(sql);
          if (sql.startsWith("INSERT INTO hardware_requests")) {
            const id = `${args[0]}:${args[1]}`;
            state.requests[id] ||= { request_hash: args[2], response: null };
            return [{ affectedRows: 1 }];
          }
          if (sql.startsWith("SELECT request_hash,response"))
            return [[state.requests[`${args[0]}:${args[1]}`]]];
          if (sql.startsWith("UPDATE hardware_requests")) {
            state.requests[`${args[1]}:${args[2]}`].response = args[0];
            return [{}];
          }
          if (sql.startsWith("SELECT * FROM hardware_policy"))
            return [
              [
                {
                  issuance_approved: approved,
                  sequence_partition: "per_model_year",
                  field_approval_required: 1,
                },
              ],
            ];
          if (sql.startsWith("SELECT m.*,v.family,v.variant"))
            return [
              [
                {
                  id: "model",
                  family: "MC",
                  variant: "M",
                  model_sequence: 1,
                  model_year: 2026,
                  approval_status: "Approved",
                  historical_only: 0,
                },
              ],
            ];
          if (sql.startsWith('SELECT equipment_configuration FROM subsidiaries')) return [[{equipment_configuration:null}]];
          if (sql.startsWith("INSERT INTO hardware_sequences")) return [{}];
          if (sql.startsWith("SELECT next_sequence FROM hardware_sequences")) {
            assert.match(sql, /FOR UPDATE/);
            return [[{ next_sequence: state.sequence }]];
          }
          if (sql.startsWith("UPDATE hardware_sequences")) {
            state.sequence += args[0];
            return [{}];
          }
          if (sql.includes("INSERT INTO hardware_assets")) {
            assert.equal(
              (sql.match(/\?/g) || []).length,
              args.length,
              "SQL placeholders match asset values",
            );
            if (
              state.assets.some(
                (a) =>
                  a.serial_number === args[1] ||
                  (args[7] && a.manufacturer_serial_key === args[7]),
              )
            )
              throw Object.assign(new Error("duplicate"), {
                code: "ER_DUP_ENTRY",
              });
            state.assets.push({
              id: args[0],
              serial_number: args[1],
              manufacturer_serial_key: args[7],
              status: args[18],
              physical_verified: args[11],
            });
            return [{}];
          }
          if (
            sql.startsWith("INSERT INTO hardware_events") ||
            sql.startsWith("INSERT INTO audit_logs")
          )
            return [{}];
          throw new Error(`Unexpected test SQL: ${sql}`);
        },
      };
    },
  };
}
const issuance = (key, quantity = 1) => ({
  user: {
    id: "officer",
    role: "InventoryOfficer",
    subsidiary_id: "subsidiary",
  },
  headers: { "idempotency-key": key },
  body: {
    model_id: "model",
    subsidiary_id: "subsidiary",
    serial_year: 2026,
    manufacturing_year: 2026,
    quantity,
  },
});
test("single and bulk issuance reserve consecutive numbers while physical stock stays unverified", async () => {
  const pool = memoryPool();
  const service = createHardwareInventory(pool);
  const result = await service.generate(issuance("bulk", 3));
  assert.deepEqual(
    result.assets.map((a) => a.serial_number),
    ["MRZ-MC-M1-26-1001", "MRZ-MC-M1-26-1002", "MRZ-MC-M1-26-1003"],
  );
  assert.equal(pool.state.sequence, 1004);
  assert.equal(
    pool.state.assets.every(
      (a) => a.status === "Generated" && !a.physical_verified,
    ),
    true,
  );
});
test("duplicate retries replay issuance and changed payloads cannot reuse a request key", async () => {
  const pool = memoryPool();
  const service = createHardwareInventory(pool);
  const first = await service.generate(issuance("retry", 2));
  assert.deepEqual(await service.generate(issuance("retry", 2)), first);
  assert.equal(pool.state.assets.length, 2);
  assert.equal(pool.state.sequence, 1003);
  await assert.rejects(
    service.generate(issuance("retry", 3)),
    /different operation/,
  );
});
test("concurrent service requests use transactional sequence locks and never reuse a serial", async () => {
  const pool = memoryPool();
  const service = createHardwareInventory(pool);
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      service.generate(issuance(`parallel-${i}`, 2)),
    ),
  );
  assert.equal(
    new Set(results.flatMap((r) => r.assets.map((a) => a.serial_number))).size,
    40,
  );
  assert.equal(pool.state.sequence, 1041);
  assert.equal(
    pool.statements.filter(
      (s) => s.includes("next_sequence") && s.includes("FOR UPDATE"),
    ).length,
    20,
  );
});
test("unapproved policy and sequence overflow roll back all issuance", async () => {
  for (const options of [{ approved: false }, { sequence: 9999 }]) {
    const pool = memoryPool(options);
    await assert.rejects(
      createHardwareInventory(pool).generate(issuance("blocked", 2)),
      /approval|exhausted/,
    );
    assert.equal(pool.state.assets.length, 0);
    assert.equal(Object.keys(pool.state.requests).length, 0);
  }
});
test("duplicate manufacturer identities roll back a failed issuance without advancing its counter", async () => {
  const pool = memoryPool();
  const service = createHardwareInventory(pool);
  const first = issuance("one");
  first.body.manufacturer_serial = "factory-1";
  await service.generate(first);
  const second = issuance("two");
  second.body.manufacturer_serial = "FACTORY-1";
  await assert.rejects(service.generate(second), /duplicate/);
  assert.equal(pool.state.assets.length, 1);
  assert.equal(pool.state.sequence, 1002);
});
