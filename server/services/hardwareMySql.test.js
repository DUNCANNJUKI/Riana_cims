const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const mysql = require("mysql2/promise");
const { createHardwareInventory } = require("./hardwareInventory");

// Explicit opt-in. Never load the application's .env.local or connect to a remote host.
test(
  "isolated MySQL migration, concurrency, assignment, approval, reconciliation and snapshot integration",
  {
    skip: !process.env.HARDWARE_TEST_DATABASE,
    timeout: 120000,
  },
  async () => {
    const database = process.env.HARDWARE_TEST_DATABASE;
    assert.match(database, /^cims_hardware_test_[a-z0-9_]+$/);
    const host = process.env.HARDWARE_TEST_HOST || "127.0.0.1";
    assert.ok(["127.0.0.1", "localhost", "::1"].includes(host));
    const config = {
      host,
      port: Number(process.env.HARDWARE_TEST_PORT || 3306),
      user: process.env.HARDWARE_TEST_USER || "root",
      password: process.env.HARDWARE_TEST_PASSWORD || "",
    };
    const admin = await mysql.createConnection(config);
    let pool;
    try {
      // Fail if the name already exists. Keep the test database for inspection; no destructive cleanup.
      await admin.query(
        `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
      pool = mysql.createPool({
        ...config,
        database,
        connectionLimit: 20,
        multipleStatements: true,
      });
      await pool.query(`
      CREATE TABLE subsidiaries (id VARCHAR(36) PRIMARY KEY,subsidiary_name VARCHAR(50));
      CREATE TABLE user_profiles (id VARCHAR(36) PRIMARY KEY,role ENUM('SuperAdmin','User') NOT NULL,subsidiary_id VARCHAR(36),is_active BOOLEAN DEFAULT TRUE,first_name VARCHAR(100),last_name VARCHAR(100));
      CREATE TABLE clients (id VARCHAR(36) PRIMARY KEY,subsidiary_id VARCHAR(36),client_name VARCHAR(100),branch VARCHAR(100));
      CREATE TABLE client_branches (id VARCHAR(36) PRIMARY KEY,client_id VARCHAR(36),branch_name VARCHAR(100)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
      CREATE TABLE installations (id VARCHAR(36) PRIMARY KEY,client_id VARCHAR(36),branch_id VARCHAR(36),department_id VARCHAR(36),status VARCHAR(30),handover_status VARCHAR(30),completion_date DATE,assigned_date DATE,assigned_technician_id VARCHAR(36),hardware_technician_id VARCHAR(36),software_technician_id VARCHAR(36),created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE client_assignments (id VARCHAR(36) PRIMARY KEY,installation_id VARCHAR(36),client_id VARCHAR(36),branch_id VARCHAR(36),department_id VARCHAR(36),branch VARCHAR(100),hardware_technician_id VARCHAR(36),software_technician_id VARCHAR(36));
      CREATE TABLE audit_logs (id VARCHAR(36) PRIMARY KEY,event_uuid VARCHAR(36),user_id VARCHAR(36),impersonator_user_id VARCHAR(36),action VARCHAR(120),category VARCHAR(60),module VARCHAR(80),entity_type VARCHAR(80),entity_id VARCHAR(100),description TEXT,old_values JSON,new_values JSON,metadata JSON,ip_address VARCHAR(100),user_agent TEXT,device VARCHAR(100),session_id VARCHAR(100),request_id VARCHAR(100),route TEXT,http_method VARCHAR(20),status VARCHAR(20),severity VARCHAR(20),integrity_hash VARCHAR(64));
    `);
      await pool.query(
        fs.readFileSync(
          path.join(__dirname, "../migrations/20261012_hardware_inventory.sql"),
          "utf8",
        ),
      );
      await pool.query(`INSERT INTO subsidiaries VALUES ('a','Subsidiary A'),('b','Subsidiary B');
      INSERT INTO user_profiles (id,role,subsidiary_id) VALUES ('admin','SuperAdmin',NULL),('officer','InventoryOfficer','a'),('tech','User','a'),('outsider','InventoryOfficer','b');
      INSERT INTO clients VALUES ('client','a','Test Client','Legacy branch');
      INSERT INTO installations (id,client_id,status,hardware_technician_id,handover_status) VALUES ('installation','client','pending','tech','pending');`);
      await pool.query(fs.readFileSync(path.join(__dirname,'../migrations/20261014_equipment_serial_requirements.sql'),'utf8'));
      await pool.query('ALTER TABLE hardware_variants ADD COLUMN deleted_at DATETIME NULL');
      await pool.query('ALTER TABLE subsidiaries ADD COLUMN equipment_configuration JSON');
      const service = createHardwareInventory(pool);
      await pool.query("ALTER TABLE installations ADD COLUMN media_controllers INT DEFAULT 0, ADD COLUMN ups_count INT DEFAULT 0, ADD COLUMN equipment_quantities JSON");
      await pool.query("UPDATE user_profiles SET first_name=?,last_name=? WHERE id=?", ["Inventory", "Officer", "officer"]);
      const adminUser = { id: "admin", role: "SuperAdmin" };
      const officer = {
        id: "officer",
        role: "InventoryOfficer",
        subsidiary_id: "a",
      };
      const tech = {
        id: "tech",
        role: "User",
        subsidiary_id: "a",
        extra_permissions: [
          "inventory.view",
          "inventory.field_register",
          "inventory.assign",
          "inventory.install",
        ],
      };
      let sequence = 0;
      const req = (user, body, key) => ({
        user,
        body,
        headers: { "idempotency-key": key || `test-${++sequence}` },
      });
      const model = await service.governance(
        req(adminUser, {
          variant_id: "MC-M",
          model_year: 2026,
          specifications: { processor: "Test processor" },
        }),
        "model_propose",
      );
      await service.governance(
        req(adminUser, {
          model_id: model.id,
          approval_status: "Approved",
          reason: "Test model approval",
        }),
        "model_approve",
      );
      await service.governance(
        req(adminUser, {
          sequence_partition: "per_model_year",
          issuance_approved: true,
          field_approval_required: true,
          approval_reference: "TEST-ONLY",
        }),
        "policy",
      );
      const location = await service.governance(
        req(officer, { name: "Test Warehouse", subsidiary_id: "a" }),
        "location",
      );
      const catalog = await service.catalog(officer);
      const addedVariant=await service.governance(req(adminUser,{family:'NET',variant:'R',nickname:'Router',description:'Network router',retired:false}),'variant_create');
      await service.governance(req(adminUser,{variant_id:addedVariant.id,family:'NET',variant:'R',nickname:'ManagedRouter',description:'Managed network router',retired:false}),'variant_update');
      await assert.rejects(service.governance(req(officer,{variant_id:addedVariant.id}),'variant_delete'),/permissions/);
      await service.governance(req(adminUser,{variant_id:addedVariant.id}),'variant_delete');
      assert.ok(!(await service.catalog(adminUser)).variants.some((v)=>v.id===addedVariant.id));
      await assert.rejects(service.governance(req(adminUser,{variant_id:'MC-M'}),'variant_delete'),/dependencies/);
      await pool.query(`INSERT INTO installations (id,client_id,branch_id,department_id,status) VALUES
        ('scoped-installation','client','branch-a','department-a','pending'),
        ('other-branch','client','branch-b','department-a','pending'),
        ('other-department','client','branch-a','department-b','pending'),
        ('legacy-installation','client',NULL,NULL,'pending');
        INSERT INTO client_assignments (id,client_id,branch_id,department_id,hardware_technician_id) VALUES
        ('scoped-assignment','client','branch-a','department-a','tech');`);
      assert.ok((await service.catalog(tech)).installations.some((i)=>i.id==='scoped-installation'));
      await service.list(tech,{selection_installation_id:'scoped-installation',suggestions:'true'});
      assert.deepEqual((await service.installationHardware(tech,'scoped-installation')).rows,[]);
      for (const id of ['other-branch','other-department','legacy-installation']) {
        await assert.rejects(service.list(tech,{selection_installation_id:id,suggestions:'true'}), /not assigned/);
        await assert.rejects(service.installationHardware(tech,id), /not assigned/);
      }
      await pool.query("UPDATE client_assignments SET installation_id='other-branch' WHERE id='scoped-assignment'");
      await assert.rejects(service.list(tech,{selection_installation_id:'scoped-installation',suggestions:'true'}), /not assigned/);
      await service.list(tech,{selection_installation_id:'other-branch',suggestions:'true'});
      await pool.query("DELETE FROM client_assignments WHERE id='scoped-assignment'");
      await pool.query("INSERT INTO client_assignments (id,client_id,branch,software_technician_id) VALUES ('legacy-assignment','client','Wrong branch','tech')");
      await assert.rejects(service.list(tech,{selection_installation_id:'legacy-installation',suggestions:'true'}), /not assigned/);
      await pool.query("UPDATE client_assignments SET branch='  LEGACY BRANCH  ' WHERE id='legacy-assignment'");
      await service.list(tech,{selection_installation_id:'legacy-installation',suggestions:'true'});
      await assert.rejects(service.list({...tech,subsidiary_id:'b'},{selection_installation_id:'legacy-installation',suggestions:'true'}), /subsidiary/i);
      await pool.query("DELETE FROM client_assignments WHERE id='legacy-assignment'");
      await pool.query("DELETE FROM installations WHERE id IN ('scoped-installation','other-branch','other-department','legacy-installation')");
      assert.equal(catalog.variants.length, 10);
      assert.deepEqual(
        catalog.subsidiaries.map((s) => s.id),
        ["a"],
      );
      assert.equal(catalog.installations.length, 1);
      assert.equal(catalog.installations[0].branch_name, "Legacy branch");
      await pool.query(
        "INSERT INTO client_branches (id,client_id,branch_name) VALUES (?,?,?)",
        ["branch", "client", "Verified branch"],
      );
      await pool.query("UPDATE installations SET branch_id=? WHERE id=?", [
        "branch",
        "installation",
      ]);
      const branchCatalog = await service.catalog(officer);
      assert.equal(branchCatalog.branches[0].client_id, "client");
      assert.equal(
        branchCatalog.installations[0].branch_name,
        "Verified branch",
      );
      await service.list(officer);
      await service.summary(officer);
      await service.installationHardware(officer, "installation");
      await service.governance(
        req(adminUser, {
          model_id: model.id,
          change_type: "software",
          reason: "Firmware revision",
          specifications: { firmware: "2.0" },
        }),
        "model_edit",
      );
      assert.equal(
        (await service.modelHistory(officer, model.id)).model.specifications
          .firmware,
        "2.0",
      );
      assert.equal(
        (await service.modelHistory(officer, model.id)).model.specifications
          .processor,
        "Test processor",
      );
      await assert.rejects(
        service.governance(
          req(adminUser, {
            model_id: model.id,
            change_type: "hardware",
            reason: "Chassis changed",
          }),
          "model_edit",
        ),
        /new model/,
      );
      const issue = (key, count = 1) =>
        service.generate(
          req(
            officer,
            {
              model_id: model.id,
              subsidiary_id: "a",
              serial_year: 2026,
              manufacturing_year: 2026,
              quantity: count,
              location_id: location.id,
            },
            key,
          ),
        );
      const parallel = await Promise.all(
        Array.from({ length: 10 }, (_, i) => issue(`parallel-${i}`, 3)),
      );
      assert.equal(
        new Set(parallel.flatMap((r) => r.assets.map((a) => a.serial_number)))
          .size,
        30,
      );
      const duplicateParallel = await Promise.all([
        issue("same-concurrent-key", 3),
        issue("same-concurrent-key", 3),
      ]);
      assert.deepEqual(duplicateParallel[0], duplicateParallel[1]);
      const first = await issue("retry", 2);
      assert.deepEqual(await issue("retry", 2), first);
      assert.equal((await service.summary(officer)).counts.Available, 0);
      const importRows = [
        {
          source: "Legacy",
          model_id: model.id,
          subsidiary_id: "a",
          manufacturing_year: 2026,
          serial_number: "MRZ-MC-M1-26-8000",
          manufacturer_serial: "IMPORT-1",
          location_id: location.id,
        },
      ];
      const preview = await service.importInventory(
        req(adminUser, { rows: importRows, commit: false }),
      );
      assert.equal(preview.rows[0].valid, true);
      const batch = req(adminUser, {
        rows: importRows,
        commit: true,
        approval_reference: "TEST-IMPORT",
      });
      const imported = await service.importInventory(batch);
      assert.equal(imported.rows[0].valid, true);
      assert.deepEqual(await service.importInventory(batch), imported);
      const advanced = await issue("after-backfill");
      assert.equal(advanced.assets[0].serial_number, "MRZ-MC-M1-26-8001");
      const draft = await service.register(
        req(officer, {
          source: "Draft",
          model_id: model.id,
          subsidiary_id: "a",
          manufacturing_year: 2026,
          manufacturer_serial: "DRAFT-1",
        }),
      );
      await service.mutate(req(officer, {}), draft.id, "delete_draft");
      await assert.rejects(service.detail(officer, draft.id), /not found/);
      await assert.rejects(
        service.mutate(req(officer, {}), advanced.assets[0].id, "delete_draft"),
        /Only unissued/,
      );
      const asset = first.assets[0];
      await service.mutate(
        req(officer, {
          physical_confirmed: true,
          manufacturer_serial: "FACTORY-1",
          condition_grade: "Good",
          location_id: location.id,
        }),
        asset.id,
        "verify",
      );
      assert.equal((await service.summary(officer)).counts.Available, 1);
      await assert.rejects(
        service.mutate(
          req(officer, {
            installation_id: "installation",
            client_id: "different-client",
            technician_id: "tech",
          }),
          asset.id,
          "assign",
        ),
        /does not belong/,
      );
      await service.mutate(
        req(officer, {
          installation_id: "installation",
          client_id: "client",
          technician_id: "tech",
        }),
        asset.id,
        "reserve",
      );
      await pool.query(
        "UPDATE installations SET status='completed' WHERE id=?",
        ["installation"],
      );
      await assert.rejects(
        service.mutate(
          req(officer, {
            installation_id: "installation",
            client_id: "client",
            technician_id: "tech",
          }),
          asset.id,
          "assign",
        ),
        /historical backfill/,
      );
      await pool.query("UPDATE installations SET status='pending' WHERE id=?", [
        "installation",
      ]);
      await service.mutate(req(officer, {}), asset.id, "release");
      await service.mutate(
        req(officer, { technician_id: "tech" }),
        asset.id,
        "assign",
      );
      const technicianSelection = await service.list(tech, {
        selection_installation_id: "installation",
      });
      assert.ok(technicianSelection.rows.some((row) => row.id === asset.id));
      await pool.query(
        "INSERT INTO user_profiles (id,role,subsidiary_id) VALUES (?,?,?)",
        ["another-tech", "User", "a"],
      );
      await assert.rejects(
        service.mutate(
          req(
            { ...tech, id: "another-tech" },
            {
              installation_id: "installation",
              physical_confirmed: true,
            },
          ),
          asset.id,
          "assign",
        ),
        /custody/,
      );
      await service.mutate(
        req(tech, {
          installation_id: "installation",
          physical_confirmed: true,
          configuration: { installation_notes: "Technician allocated stock" },
        }),
        asset.id,
        "assign",
      );
      assert.equal(
        (await service.detail(officer, asset.id)).installation_id,
        "installation",
      );
      const [[activeCustody]] = await pool.query(
        "SELECT COUNT(*) AS total FROM hardware_assignments WHERE asset_id=? AND closed_at IS NULL",
        [asset.id],
      );
      assert.equal(activeCustody.total, 1);
      await service.mutate(
        req(officer, { reason: "Regression return" }),
        asset.id,
        "return",
      );
      await service.mutate(
        req(officer, {
          physical_confirmed: true,
          manufacturer_serial: "FACTORY-1",
          condition_grade: "Good",
          location_id: location.id,
        }),
        asset.id,
        "verify",
      );
      const attempts = await Promise.allSettled([
        service.mutate(
          req(officer, {
            installation_id: "installation",
            technician_id: "tech",
          }),
          asset.id,
          "assign",
        ),
        service.mutate(
          req(officer, {
            installation_id: "installation",
            technician_id: "tech",
          }),
          asset.id,
          "assign",
        ),
      ]);
      assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
      if ((await service.detail(officer, asset.id)).status === "Reserved")
        await service.mutate(
          req(officer, {
            installation_id: "installation",
            technician_id: "tech",
          }),
          asset.id,
          "assign",
        );
      await service.mutate(
        req(tech, {
          physical_confirmed: true,
          serial_number: asset.serial_number,
        }),
        asset.id,
        "install",
      );
      await assert.rejects(
        service.detail(
          { id: "outsider", role: "InventoryOfficer", subsidiary_id: "b" },
          asset.id,
        ),
        /not found/,
      );
      const field = await service.generate(
        req(tech, {
          source: "Field",
          model_id: model.id,
          subsidiary_id: "a",
          serial_year: 2026,
          manufacturing_year: 2026,
          manufacturer_serial: "FIELD-1",
          condition_grade: "Good",
          physical_confirmed: true,
          installation_id: "installation",
        }),
      );
      await assert.rejects(
        service.mutate(
          req(tech, {
            physical_confirmed: true,
            serial_number: field.assets[0].serial_number,
          }),
          field.assets[0].id,
          "install",
        ),
        /approved/,
      );
      await assert.rejects(
        service.installationWrite(
          req(adminUser, {}),
          "installation",
          { complete: true },
          async () => {},
        ),
        /Approve/,
      );
      await service.mutate(
        req(officer, { approval_status: "Approved" }),
        field.assets[0].id,
        "approve",
      );
      await service.mutate(
        req(tech, {
          physical_confirmed: true,
          serial_number: field.assets[0].serial_number,
        }),
        field.assets[0].id,
        "install",
      );
      await service.installationWrite(
        req(adminUser, {}),
        "installation",
        { complete: true, snapshot: true },
        (db) =>
          db.query(
            "UPDATE installations SET status='completed',handover_status='signed' WHERE id='installation'",
          ),
      );
      const signed = (
        await service.installationHardware(adminUser, "installation")
      ).snapshot;
      assert.equal(signed.length, 2);
      await service.mutate(
        req(officer, { reason: "Returned from site" }),
        asset.id,
        "return",
      );
      assert.deepEqual(
        (await service.installationHardware(adminUser, "installation"))
          .snapshot,
        signed,
      );
      await service.mutate(
        req(officer, {
          physical_confirmed: true,
          manufacturer_serial: "FACTORY-1",
          condition_grade: "Good",
          location_id: location.id,
        }),
        asset.id,
        "verify",
      );
      const stocktake = await service.reconcile(
        req(officer, {
          subsidiary_id: "a",
          location_id: location.id,
          observed_ids: [],
          confirm_missing:true,
        }),
      );
      assert.ok(stocktake.missing.includes(asset.id));
      const stockPreview=await service.previewReconcile(req(officer,{subsidiary_id:'a',location_id:location.id,observed_ids:[asset.serial_number]}));
      assert.ok(stockPreview.matched.includes(asset.id));
      await assert.rejects(service.reconcile(req(officer,{subsidiary_id:'a',location_id:location.id,observed_ids:[asset.serial_number],snapshot:'stale',confirm_missing:true})),/changed after preview/);
      await assert.rejects(service.reconcile(req(officer,{subsidiary_id:'a',location_id:location.id,observed_ids:[]})),/Confirm the missing/);
      assert.equal((await service.summary(officer)).counts.Available, 0);
      const missingSummary=await service.summary(officer);
      assert.ok(missingSummary.status_totals.Available >= 1);
      assert.equal(Object.values(missingSummary.status_totals).reduce((a,b)=>a+b,0),missingSummary.total);
      const inStockReport=await service.list(officer,{report:'in_stock',limit:100});
      assert.ok(inStockReport.rows.some((row)=>row.id===asset.id));
      assert.ok(inStockReport.rows.every((row)=>['Available','Reserved','Returned'].includes(row.status)));
      const issuedReport=await service.list(officer,{report:'out',limit:100});
      assert.ok(issuedReport.rows.every((row)=>['Assigned','Installed','In Transit'].includes(row.status)));
      await assert.rejects(service.summary(officer,{subsidiary_id:'b'}),/restricted to your subsidiary/);
      await service.reconcile(
        req(officer, {
          subsidiary_id: "a",
          location_id: location.id,
          observed_ids: [asset.id],
          confirm_missing:true,
        }),
      );
      assert.equal((await service.summary(officer)).counts.Available, 1);
      const locationB = await service.governance(
        req(adminUser, { name: "Warehouse B", subsidiary_id: "b" }),
        "location",
      );
      await assert.rejects(
        service.mutate(
          req(officer, {
            destination_subsidiary_id: "b",
            destination_location_id: locationB.id,
            reason: "Transfer",
          }),
          asset.id,
          "transfer",
        ),
        /restricted|permissions/,
      );
      await service.mutate(
        req(adminUser, {
          destination_subsidiary_id: "b",
          destination_location_id: locationB.id,
          reason: "Approved transfer",
          approval_reference: "TRANSFER-TEST",
        }),
        asset.id,
        "transfer",
      );
      await assert.rejects(service.detail(officer, asset.id), /not found/);
      const receiver = {
        id: "outsider",
        role: "InventoryOfficer",
        subsidiary_id: "b",
      };
      await service.mutate(
        req(receiver, { physical_confirmed: true }),
        asset.id,
        "receive_transfer",
      );
      await service.mutate(
        req(receiver, {
          physical_confirmed: true,
          manufacturer_serial: "FACTORY-1",
          condition_grade: "Good",
          location_id: locationB.id,
        }),
        asset.id,
        "verify",
      );
      assert.equal((await service.summary(receiver)).counts.Available, 1);
      const replacements = await issue("replacement-assets", 2);
      for (let i = 0; i < 2; i++)
        await service.mutate(
          req(officer, {
            physical_confirmed: true,
            manufacturer_serial: `REPLACEMENT-${i}`,
            condition_grade: "Good",
            location_id: location.id,
          }),
          replacements.assets[i].id,
          "verify",
        );
      const replacementAttempts = await Promise.allSettled(
        replacements.assets.map((a) =>
          service.mutate(
            req(officer, {
              replacement_id: a.id,
              physical_confirmed: true,
              reason: "Replace failed hardware",
            }),
            field.assets[0].id,
            "replace",
          ),
        ),
      );
      assert.equal(
        replacementAttempts.filter((r) => r.status === "fulfilled").length,
        1,
      );
      assert.deepEqual(
        (await service.installationHardware(adminUser, "installation"))
          .snapshot,
        signed,
      );
      await service.mutate(
        req(officer, { reason: "Fault confirmed" }),
        field.assets[0].id,
        "fault",
      );
      await service.mutate(
        req(officer, {
          reason: "Repair started",
          service_details: "Diagnosis recorded",
        }),
        field.assets[0].id,
        "maintenance",
      );
      await service.mutate(
        req(officer, {
          reason: "Repair completed",
          service_details: "Components replaced and tested",
        }),
        field.assets[0].id,
        "repair",
      );
      assert.equal(
        (await service.detail(officer, field.assets[0].id)).physical_verified,
        0,
      );
      await service.governance(
        req(officer, {
          subsidiary_id: "a",
          model_id: model.id,
          location_id: location.id,
          minimum_stock: 20,
          warranty_days: 30,
          aging_days: 90,
        }),
        "alert_rule",
      );
      assert.equal((await service.alerts(officer)).low_stock.length, 1);
      assert.ok(
        (await service.movements(officer, { action: "replace" })).total >= 1,
      );
      assert.ok((await service.movements(officer)).rows.some((event) => event.actor_name === "Inventory Officer"));
      const retiring = advanced.assets[0];
      assert.throws(
        () =>
          service.mutate(
            req(officer, { reason: "Retirement" }),
            retiring.id,
            "retire",
          ),
        /permissions/,
      );
      await service.mutate(
        req(adminUser, { reason: "Cancelled issuance, serial retained" }),
        retiring.id,
        "retire",
      );
      await service.mutate(
        req(adminUser, {
          reason: "Disposal approved",
          approval_reference: "DISPOSAL-TEST",
        }),
        retiring.id,
        "dispose",
      );
      await service.mutate(
        req(officer, { reason: "Archive permanent history" }),
        retiring.id,
        "archive",
      );
      assert.equal(
        (await service.detail(adminUser, retiring.id)).status,
        "Disposed",
      );
      await assert.rejects(
        pool.query("DELETE FROM hardware_assets WHERE id=?", [asset.id]),
        (error) => error.code === "ER_ROW_IS_REFERENCED_2",
      );
      const [[audit]] = await pool.query(
        "SELECT COUNT(*) AS total FROM audit_logs",
      );
      assert.ok(audit.total > 30);
      const serialized = await issue('installation-selection',2);
      for (const device of serialized.assets)await service.mutate(req(officer,{physical_confirmed:true,manufacturer_serial:`SELECTION-${device.id}`,condition_grade:'Good',location_id:location.id}),device.id,'verify');
      await pool.query("INSERT INTO installations (id,client_id,status,handover_status,hardware_technician_id,media_controllers) VALUES ('serial-save','client','in_progress','pending','tech',2)");
      const selection={assets:serialized.assets.map((a)=>({asset_id:a.id,equipment_field:'media_controllers'})),physical_confirmed:true,mark_installed:true};
      await assert.rejects(service.installationWrite(req(tech,{}),'serial-save',{selection:{...selection,assets:selection.assets.map((a)=>({...a,equipment_field:'ups_count'}))}},(db)=>db.query("UPDATE installations SET media_controllers=1 WHERE id='serial-save'")),/equipment item/);
      const [[unchanged]]=await pool.query("SELECT media_controllers FROM installations WHERE id='serial-save'");assert.equal(unchanged.media_controllers,2);
      assert.equal((await service.detail(officer,serialized.assets[0].id)).status,'Available');
      await service.installationWrite(req(tech,{}),'serial-save',{selection},async()=>{});
      for(const device of serialized.assets)assert.equal((await service.detail(officer,device.id)).status,'Installed');
      await service.installationWrite(req(tech,{}),'serial-save',{selection},async()=>{});
      const [[assignmentCount]]=await pool.query("SELECT COUNT(*) AS total FROM hardware_assignments WHERE installation_id='serial-save' AND closed_at IS NULL");assert.equal(assignmentCount.total,2);
      await service.governance(req(officer,{subsidiary_id:'a',equipment_field:'media_controllers',serial_required:true}),'equipment_requirement');
      await assert.rejects(service.governance(req(officer,{subsidiary_id:'b',equipment_field:'ups_count',serial_required:true}),'equipment_requirement'),/own subsidiary/);
      await service.governance(req(officer,{subsidiary_id:'a',equipment_field:'kiosk_count',serial_required:false}),'equipment_requirement');
      const allRequirements=await service.equipmentRequirements(officer);assert.equal(allRequirements.subsidiaries.length,2);assert.equal(allRequirements.subsidiaries.find((s)=>s.id==='b').can_edit,false);
      await assert.rejects(service.installationWrite(req(tech,{}),'serial-save',{complete:true},(db)=>db.query("UPDATE installations SET media_controllers=3,status='completed' WHERE id='serial-save'")),/3.*Media Controllers/);
      const [[notCompleted]]=await pool.query("SELECT status,media_controllers FROM installations WHERE id='serial-save'");assert.equal(notCompleted.status,'in_progress');assert.equal(notCompleted.media_controllers,2);
      await service.installationWrite(req(tech,{}),'serial-save',{complete:true,snapshot:true},(db)=>db.query("UPDATE installations SET status='completed',handover_status='signed' WHERE id='serial-save'"));
      const searchGenerated=await issue('search-generated',1);
      const hybrid=require('./subsidiaryEquipment');
      const customField='custom_0123456789abcdef0123456789abcdef';
      const customConfig=hybrid.normalizeEquipmentConfigurationPayload([{field:customField,label:'Network Routers',installed_status:'Connected'}]);
      await pool.query('UPDATE subsidiaries SET equipment_configuration=? WHERE id=?',[JSON.stringify(customConfig),'a']);
      assert.equal((await service.catalog(officer)).equipment_fields_by_subsidiary.a.find((item)=>item.field===customField).label,'Network Routers');
      assert.equal((await service.equipmentRequirements(officer)).subsidiaries.find((item)=>item.id==='a').equipment.find((item)=>item.field===customField).serial_required,false);
      await assert.rejects(hybrid.normalizeEquipmentQuantities(pool,'client',{__proto__:1,unknown:1}),/Unknown equipment/);
      await assert.rejects(hybrid.normalizeEquipmentQuantities(pool,'client',{[customField]:-1}),/between/);
      await assert.rejects(hybrid.normalizeEquipmentQuantities(pool,'client',{[customField]:1},{...tech,subsidiary_id:'b'}),/subsidiary/i);
      const customModel=await service.governance(req(adminUser,{variant_id:'MC-M',model_year:2026,specifications:{summary:'Router hardware'}}),'model_propose');
      await service.governance(req(adminUser,{model_id:customModel.id,approval_status:'Approved',reason:'Hybrid test model'}),'model_approve');
      await service.governance(req(officer,{model_id:customModel.id,subsidiary_id:'a',equipment_field:customField}),'equipment_map');
      await assert.rejects(service.governance(req({...officer,subsidiary_id:'b'},{model_id:customModel.id,subsidiary_id:'b',equipment_field:customField}),'equipment_map'),/equipment item/);
      const customDevices=await service.generate(req(officer,{model_id:customModel.id,subsidiary_id:'a',serial_year:2026,manufacturing_year:2026,quantity:1,location_id:location.id}));
      const customDevice=customDevices.assets[0];
      await service.mutate(req(officer,{physical_confirmed:true,manufacturer_serial:'ROUTER-FACTORY-1',condition_grade:'Good',location_id:location.id}),customDevice.id,'verify');
      await pool.query("INSERT INTO installations (id,client_id,status,handover_status,hardware_technician_id,equipment_quantities) VALUES ('custom-installation','client','in_progress','pending','tech',?)",[JSON.stringify({[customField]:1})]);
      await service.governance(req(officer,{subsidiary_id:'a',equipment_field:customField,serial_required:true}),'equipment_requirement');
      await assert.rejects(service.installationWrite(req(tech,{}),'custom-installation',{complete:true},async()=>{}),/Network Routers|equipment.*serial/i);
      await service.installationWrite(req(tech,{}),'custom-installation',{selection:{assets:[{asset_id:customDevice.id,equipment_field:customField}],physical_confirmed:true,mark_installed:true}},async()=>{});
      assert.equal((await service.detail(officer,customDevice.id)).status,'Installed');
      assert.equal((await service.installationHardware(tech,'custom-installation')).rows[0].equipment_field,customField);
      await pool.query('UPDATE subsidiaries SET equipment_configuration=? WHERE id=?',[JSON.stringify([{...customConfig[0],label:'Managed Routers'}]),'a']);
      assert.equal((await service.catalog(officer)).equipment_fields_by_subsidiary.a.find((item)=>item.field===customField).label,'Managed Routers');
      assert.equal((await service.detail(officer,customDevice.id)).installation_id,'custom-installation');
      await assert.rejects(hybrid.assertEquipmentRemovalSafe(pool,'a',[]),/Cannot remove Managed Routers/);
      await pool.query("INSERT INTO installations (id,client_id,status,handover_status,hardware_technician_id) VALUES ('serial-search','client','in_progress','pending','tech')");
      const suggestions=await service.list(tech,{selection_installation_id:'serial-search',suggestions:'true',q:searchGenerated.assets[0].serial_number});
      assert.equal(suggestions.rows.length,1);assert.equal(suggestions.rows[0].selectable,false);assert.match(suggestions.rows[0].unavailable_reason,/Receive & Verify/);
      await pool.query(`CREATE TABLE uploaded_files (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,organization_id VARCHAR(36),branch_id VARCHAR(36),uploaded_by VARCHAR(36),original_name VARCHAR(255),stored_name VARCHAR(255),relative_path VARCHAR(500),mime_type VARCHAR(150),detected_mime_type VARCHAR(150),extension VARCHAR(20),file_size BIGINT,file_category VARCHAR(100),related_entity_type VARCHAR(100),related_entity_id VARCHAR(64),visibility VARCHAR(30),status VARCHAR(30),checksum_sha256 CHAR(64),image_width INT,image_height INT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,deleted_at DATETIME);
        CREATE TABLE uploaded_file_variants (file_id BIGINT,variant_type VARCHAR(30));`);
      const os=require('node:os');
      const uploadRoot=await require('node:fs/promises').mkdtemp(path.join(os.tmpdir(),'cims-handover-db-test-'));
      const {createHandoverSupportingDocuments,renderHandoverPages}=require('./handoverSupportingDocuments');
      const {jsPDF}=require('../../node_modules/jspdf');
      const pdf=new jsPDF();pdf.text('Installation signed handover',20,30);pdf.addPage();pdf.text('Equipment serials and signature',20,30);
      const images=await renderHandoverPages(Buffer.from(pdf.output('arraybuffer')));
      const supporting=createHandoverSupportingDocuments({uploadRoot});
      const imageDb=await pool.getConnection();
      try {await imageDb.beginTransaction();await supporting.save(imageDb,req(tech,{}),'serial-save','signed.pdf',images);await imageDb.commit();}finally{imageDb.release();}
      const [files]=await pool.query("SELECT * FROM uploaded_files");assert.equal(files.length,4);
      const duplicateDb=await pool.getConnection();
      try{await duplicateDb.beginTransaction();assert.equal(await supporting.save(duplicateDb,req(tech,{}),'serial-save','signed.pdf',images),0);await duplicateDb.commit();}finally{duplicateDb.release();}
      const [[fileCount]]=await pool.query('SELECT COUNT(*) AS total FROM uploaded_files');assert.equal(fileCount.total,4);
      await pool.query(`INSERT INTO uploaded_files (organization_id,uploaded_by,original_name,stored_name,relative_path,mime_type,file_category,related_entity_type,related_entity_id,visibility,status,checksum_sha256)
        SELECT organization_id,uploaded_by,original_name,'duplicate-preserved',relative_path,mime_type,file_category,related_entity_type,related_entity_id,visibility,status,checksum_sha256 FROM uploaded_files WHERE id=?`,[files[0].id]);
      const express=require('express');const filesRouter=require('../routes/files');
      const app=express();
      app.use((request,_response,next)=>{request.user=request.headers['x-test-scope']==='b'?{id:'outsider',role:'InventoryOfficer',subsidiary_id:'b'}:request.headers['x-test-scope']==='denied'?{id:'denied',role:'User',subsidiary_id:'a'}:officer;next();});
      app.use('/files',filesRouter({pool,config:{uploadRoot}}));
      const http=await new Promise((resolve)=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
      try {
        const base=`http://127.0.0.1:${http.address().port}/files`;
        const response=await fetch(`${base}/${files[0].id}/view`);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/png/);await response.arrayBuffer();
        for(const scope of ['b','denied']){const denied=await fetch(`${base}/${files[0].id}/view`,{headers:{'x-test-scope':scope}});assert.equal(denied.status,404);await denied.text();}
        const listing=await fetch(`${base}?relatedEntityType=hardware_asset&relatedEntityId=${serialized.assets[0].id}`);assert.equal(listing.status,200);const payload=await listing.json();assert.equal(payload.data.length,2);assert.equal(payload.data[0].permissions.canView,true);
        const secure=await fetch(`http://127.0.0.1:${http.address().port}${payload.data[0].viewUrl.replace('/api/files','/files')}`);assert.equal(secure.status,200);await secure.arrayBuffer();
      }finally{await new Promise((resolve)=>http.close(resolve));await supporting.cleanup();}
    } finally {
      await pool?.end();
      await admin.end();
    }
  },
);
