const crypto = require("crypto");
const { v4: uuid } = require("uuid");
const { logSuccess } = require("./auditService");
const { hasCapability } = require("../security/accessControl");
const P = require("./hardwarePolicy");
const E = require("./installationEquipment");
const R = require('./equipmentRequirements');
const { technicianAssignmentSql } = require('./installationAssignment');
const { equipmentLabels, equipmentDefinitions, normalizeEquipmentQuantities } = require('./subsidiaryEquipment');
const {stocktakeResult,stockSql}=require('./stocktake');

const parseJson = (value) =>
  typeof value === "string" ? JSON.parse(value) : value;
const text = (value, max = 255) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > max)
    P.fail(`Text must be at most ${max} characters.`);
  return value.trim() || null;
};
const canonical = (value) =>
  JSON.stringify(value, (_, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
const configuration = (value = {}) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    canonical(value).length > 10000
  )
    P.fail("Hardware configuration must be an object of at most 10 KB.");
  return JSON.stringify(value);
};
// Cloud installations and branch records may predate the unified UUID collation.
// Keep inventory joins compatible without rewriting customer records in place.
const uuidEquals = (left, right) =>
  `CONVERT(${left} USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(${right} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
const ASSET_SELECT = `SELECT a.*,m.model_number,m.model_year,m.model_sequence,JSON_UNQUOTE(JSON_EXTRACT(m.specifications,'$.installation_equipment_field')) AS equipment_field,v.family,v.nickname,v.variant,
  s.subsidiary_name,l.name AS location_name,c.client_name,c.branch,
  COALESCE(cb.branch_name COLLATE utf8mb4_unicode_ci,c.branch) AS branch_name,
  t.first_name AS technician_first_name,t.last_name AS technician_last_name,
  x.id AS active_assignment_id,x.installed_at,x.reservation_expires_at
  FROM hardware_assets a JOIN hardware_models m ON ${uuidEquals('m.id','a.model_id')}
  JOIN hardware_variants v ON ${uuidEquals('v.id','m.variant_id')} JOIN subsidiaries s ON ${uuidEquals('s.id','a.subsidiary_id')}
  LEFT JOIN hardware_locations l ON ${uuidEquals('l.id','a.location_id')}
  LEFT JOIN hardware_assignments x ON ${uuidEquals('x.asset_id','a.id')} AND x.closed_at IS NULL
  LEFT JOIN installations i ON ${uuidEquals('i.id','a.installation_id')} LEFT JOIN clients c ON ${uuidEquals('c.id','i.client_id')}
  LEFT JOIN client_branches cb ON ${uuidEquals('cb.id','i.branch_id')} LEFT JOIN user_profiles t ON ${uuidEquals('t.id','a.custodian_id')}`;
const AVAILABLE_SQL = `a.status='Available' AND a.physical_verified=1 AND a.approval_status='Approved'
  AND a.serial_number IS NOT NULL AND a.manufacturing_year IS NOT NULL
  AND a.condition_grade IN ('New','Good','Fair') AND a.reconciliation_status='Matched'
  AND NOT EXISTS (SELECT 1 FROM hardware_assignments ax WHERE ax.asset_id=a.id AND ax.closed_at IS NULL)`;

function createHardwareInventory(pool) {
  const scopeWhere = (user, alias = "a", requested) => {
    if (
      user.role === "SuperAdmin" ||
      hasCapability(user, "inventory.cross_subsidiary")
    ) {
      return requested
        ? { sql: `${alias}.subsidiary_id=?`, args: [requested] }
        : { sql: "1=1", args: [] };
    }
    return {
      sql: `${alias}.subsidiary_id=?`,
      args: [P.scopedSubsidiary(user, requested)],
    };
  };
  const event = async (db, req, action, asset, details = {}) => {
    await db.query(
      "INSERT INTO hardware_events (id,asset_id,model_id,subsidiary_id,action,actor_id,details) VALUES (?,?,?,?,?,?,?)",
      [
        uuid(),
        asset?.id || null,
        asset?.model_id || null,
        asset?.subsidiary_id || null,
        action,
        req.user.id,
        JSON.stringify(details),
      ],
    );
    await logSuccess(db, req, {
      action: `hardware_${action}`,
      category: "inventory",
      module: "Hardware & Inventory",
      entity_type: asset?.id ? "hardware_asset" : "hardware",
      entity_id: asset?.id || null,
      description: `Hardware ${action.replace(/_/g, " ")}.`,
      metadata: details,
    });
  };
  const transactionAttempt = async (req, operation, work) => {
    const key = text(req.headers["idempotency-key"], 100);
    if (!key || !/^[A-Za-z0-9_.:-]+$/.test(key))
      P.fail("A valid Idempotency-Key header is required.");
    const digest = crypto
      .createHash("sha256")
      .update(canonical({ operation, body: req.body || {} }))
      .digest("hex");
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      await db.query(
        "INSERT INTO hardware_requests (actor_id,request_key,request_hash) VALUES (?,?,?) ON DUPLICATE KEY UPDATE request_key=request_key",
        [req.user.id, key, digest],
      );
      const [[request]] = await db.query(
        "SELECT request_hash,response FROM hardware_requests WHERE actor_id=? AND request_key=? FOR UPDATE",
        [req.user.id, key],
      );
      if (request.request_hash !== digest)
        P.fail(
          "This request key was already used for a different operation.",
          409,
        );
      if (request.response) {
        await db.commit();
        return parseJson(request.response);
      }
      const result = await work(db);
      await db.query(
        "UPDATE hardware_requests SET response=? WHERE actor_id=? AND request_key=?",
        [JSON.stringify(result), req.user.id, key],
      );
      await db.commit();
      return result;
    } catch (error) {
      await db.rollback().catch(() => {});
      throw error;
    } finally {
      db.release();
    }
  };
  const transaction = async (req, operation, work) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await transactionAttempt(req, operation, work);
      } catch (error) {
        if (
          !["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(error.code) ||
          attempt >= 3
        )
          throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 20 * (attempt + 1) + crypto.randomInt(5, 25)),
        );
      }
    }
  };
  const lockAsset = async (db, user, id) => {
    const scope = scopeWhere(user);
    const [[asset]] = await db.query(
      `SELECT a.* FROM hardware_assets a WHERE a.id=? AND a.deleted_at IS NULL AND ${scope.sql} FOR UPDATE`,
      [id, ...scope.args],
    );
    if (!asset) P.fail("Asset not found.", 404);
    const [[assignment]] = await db.query(
      "SELECT * FROM hardware_assignments WHERE asset_id=? AND closed_at IS NULL",
      [id],
    );
    return { ...asset, active_assignment_id: assignment?.id, assignment };
  };
  const location = async (db, id, subsidiary) => {
    if (!id) return null;
    const [[row]] = await db.query(
      "SELECT id FROM hardware_locations WHERE id=? AND subsidiary_id=?",
      [id, subsidiary],
    );
    if (!row)
      P.fail("Inventory location must belong to the owning subsidiary.");
    return row.id;
  };
  const installation = async (db, user, id, subsidiary) => {
    if (!id) P.fail("Select an installation.");
    const [[row]] = await db.query(
      `SELECT i.*,c.subsidiary_id FROM installations i JOIN clients c ON ${uuidEquals('c.id','i.client_id')} WHERE i.id=? FOR UPDATE`,
      [id],
    );
    if (!row || row.subsidiary_id !== subsidiary)
      P.fail("Installation is unavailable in this subsidiary.", 403);
    if (
      user.role === "User" &&
      ![
        row.assigned_technician_id,
        row.hardware_technician_id,
        row.software_technician_id,
      ].includes(user.id)
    ) {
      const [[assigned]] = await db.query(
        `SELECT i.id FROM installations i JOIN clients c ON ${uuidEquals('c.id','i.client_id')}
         WHERE i.id=? AND ${technicianAssignmentSql()}`,
        [id, ...Array(5).fill(user.id)],
      );
      if (!assigned) P.fail("You are not assigned to this installation.", 403);
    }
    return row;
  };
  const technician = async (db, id, subsidiary) => {
    if (!id) return null;
    const [[row]] = await db.query(
      "SELECT id FROM user_profiles WHERE id=? AND subsidiary_id=? AND is_active=1",
      [id, subsidiary],
    );
    if (!row) P.fail("Select an active technician from the owning subsidiary.");
    return row.id;
  };
  const closeAssignment = async (db, asset) => {
    await db.query(
      "UPDATE hardware_assignments SET closed_at=NOW() WHERE asset_id=? AND closed_at IS NULL",
      [asset.id],
    );
    await db.query(
      "UPDATE hardware_assets SET installation_id=NULL,custodian_id=NULL WHERE id=?",
      [asset.id],
    );
  };
  const allocate = async (
    db,
    req,
    asset,
    body,
    reserve = false,
    allowCompleted = false,
  ) => {
    const [[equipmentModel]]=await db.query('SELECT m.specifications,v.family FROM hardware_models m JOIN hardware_variants v ON v.id=m.variant_id WHERE m.id=?',[asset.model_id]);
    const mappedField=E.equipmentField(equipmentModel);
    if(mappedField && !Object.hasOwn(await equipmentDefinitions(db,asset.subsidiary_id),mappedField))
      P.fail('Equipment item is not configured for the owning subsidiary.',409);
    if (req.user.role === "User" && body.physical_confirmed !== true)
      P.fail(
        "Confirm the physical serial and device identity before selection.",
      );
    if (asset.status === "Assigned" && !asset.installation_id && !reserve) {
      if (
        !asset.assignment ||
        !asset.custodian_id ||
        (req.user.role === "User" && asset.custodian_id !== req.user.id) ||
        (body.technician_id && body.technician_id !== asset.custodian_id) ||
        !asset.physical_verified ||
        asset.approval_status !== "Approved" ||
        !["New", "Good", "Fair"].includes(asset.condition_grade) ||
        asset.reconciliation_status !== "Matched"
      )
        P.fail(
          "Equipment custody or verification is not eligible for installation.",
          409,
        );
      const target = await installation(
        db,
        req.user,
        body.installation_id,
        asset.subsidiary_id,
      );
      if (target.status === "completed")
        P.fail("Use historical backfill for completed installations.", 409);
      if (body.client_id && target.client_id !== body.client_id)
        P.fail("Selected installation does not belong to this client.", 409);
      await db.query(
        "UPDATE hardware_assignments SET installation_id=?,configuration=? WHERE id=?",
        [
          target.id,
          configuration(body.configuration),
          asset.active_assignment_id,
        ],
      );
      await db.query(
        "UPDATE hardware_assets SET installation_id=? WHERE id=?",
        [target.id, asset.id],
      );
      await event(db, req, "allocation_linked", asset, {
        installation_id: target.id,
        technician_id: asset.custodian_id,
      });
      return;
    }
    if (asset.status === "Reserved" && !reserve) {
      if (
        asset.installation_id !== body.installation_id ||
        !asset.assignment ||
        !asset.physical_verified ||
        asset.approval_status !== "Approved" ||
        !["New", "Good", "Fair"].includes(asset.condition_grade) ||
        asset.reconciliation_status !== "Matched"
      )
        P.fail("Reservation identity or eligibility has changed.", 409);
      const reservedInstallation = await installation(
        db,
        req.user,
        asset.installation_id,
        asset.subsidiary_id,
      );
      if (reservedInstallation.status === "completed" && !allowCompleted)
        P.fail("Use historical backfill for completed installations.", 409);
      if (body.client_id && reservedInstallation.client_id !== body.client_id)
        P.fail("Selected installation does not belong to this client.", 409);
      if (
        asset.assignment.reservation_expires_at &&
        new Date(asset.assignment.reservation_expires_at) <= new Date()
      )
        P.fail(
          "This reservation has expired. Release it before allocation.",
          409,
        );
      const technicianId = await technician(
        db,
        req.user.role === "User"
          ? req.user.id
          : body.technician_id || asset.custodian_id,
        asset.subsidiary_id,
      );
      await db.query(
        "UPDATE hardware_assignments SET technician_id=?,reservation_expires_at=NULL WHERE id=?",
        [technicianId, asset.active_assignment_id],
      );
      await db.query(
        "UPDATE hardware_assets SET status='Assigned',custodian_id=? WHERE id=?",
        [technicianId, asset.id],
      );
      await event(db, req, "reservation_allocated", asset, {
        installation_id: asset.installation_id,
        technician_id: technicianId,
      });
      return;
    }
    if (!P.eligible(asset))
      P.fail(
        "Only verified, approved, reconciled available equipment can be allocated.",
        409,
      );
    const inst = body.installation_id
      ? await installation(
          db,
          req.user,
          body.installation_id,
          asset.subsidiary_id,
        )
      : null;
    if (reserve && !inst) P.fail("Reservations require an installation.");
    if (body.client_id && (!inst || inst.client_id !== body.client_id))
      P.fail("Selected installation does not belong to this client.", 409);
    if (inst?.status === "completed" && !allowCompleted)
      P.fail("Use historical backfill for completed installations.", 409);
    let technicianId = body.technician_id || null;
    if (req.user.role === "User") {
      if (!inst || (technicianId && technicianId !== req.user.id))
        P.fail(
          "Technicians can select equipment only for their own installations.",
          403,
        );
      technicianId = req.user.id;
    }
    technicianId = await technician(db, technicianId, asset.subsidiary_id);
    if (!inst && !technicianId)
      P.fail("Select an installation or receiving technician.");
    const expires = reserve
      ? new Date(
          Date.now() +
            P.integer(body.reservation_days || 7, 1, 90, "Reservation days") *
              86400000,
        )
      : null;
    await db.query(
      `INSERT INTO hardware_assignments (id,asset_id,installation_id,technician_id,assigned_by,reservation_expires_at,configuration) VALUES (?,?,?,?,?,?,?)`,
      [
        uuid(),
        asset.id,
        inst?.id || null,
        technicianId,
        req.user.id,
        expires,
        configuration(body.configuration),
      ],
    );
    await db.query(
      "UPDATE hardware_assets SET status=?,installation_id=?,custodian_id=? WHERE id=?",
      [
        reserve ? "Reserved" : "Assigned",
        inst?.id || null,
        technicianId,
        asset.id,
      ],
    );
    await event(db, req, reserve ? "reserved" : "assigned", asset, {
      installation_id: inst?.id || null,
      technician_id: technicianId,
      reservation_expires_at: expires,
    });
  };
  const filters = (user, query) => {
    const scope = scopeWhere(user, "a", query.subsidiary_id);
    const parts = [scope.sql, "a.deleted_at IS NULL"];
    const args = [...scope.args];
    if (query.archived !== "true") parts.push("a.archived_at IS NULL");
    for (const [key, col] of Object.entries({
      family: "v.family",
      model_id: "a.model_id",
      location_id: "a.location_id",
      client_id: "i.client_id",
      branch_id: "i.branch_id",
      technician_id: "a.custodian_id",
      installation_id: "a.installation_id",
      approval_status: "a.approval_status",
    })) {
      if (query[key]) {
        parts.push(`${col}=?`);
        args.push(query[key]);
      }
    }
    if (query.status) {
      if (!P.STATUSES.includes(query.status))
        P.fail("Invalid inventory status.");
      parts.push("a.status=?");
      args.push(query.status);
    }
    if (query.eligible === "true" || query.report === "available")
      parts.push(AVAILABLE_SQL);
    if (query.q) {
      parts.push(
        "(a.serial_number LIKE ? OR m.model_number LIKE ? OR a.manufacturer_serial LIKE ? OR a.id=?)",
      );
      const q = `%${String(query.q).slice(0, 150)}%`;
      args.push(q, q, q, query.q);
    }
    if (query.from) {
      parts.push("a.created_at>=?");
      args.push(date(query.from));
    }
    if (query.to) {
      parts.push("a.created_at<DATE_ADD(?,INTERVAL 1 DAY)");
      args.push(date(query.to));
    }
    if (query.report === "uninstalled")
      parts.push("a.status NOT IN ('Installed','Retired','Disposed')");
    if (query.report === "in_stock")
      parts.push("a.status IN ('Available','Reserved','Returned')");
    if (query.report === "out")
      parts.push("a.status IN ('Assigned','Installed','In Transit')");
    if (query.report === "legacy") parts.push("a.registration_source='Legacy'");
    if (query.report === "warranty")
      parts.push("a.warranty_expires IS NOT NULL");
    if (query.report === "reconciliation")
      parts.push(
        "a.reconciliation_status IN ('Missing','Discrepancy','Unverified')",
      );
    return { sql: parts.join(" AND "), args };
  };
  const date = (value) => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      P.fail("Invalid date.");
    return value;
  };
  const catalog = async (user) => {
    P.requirePermission(user, "inventory.view");
    const scope = scopeWhere(user, "l");
    const [variants] = await pool.query(
      "SELECT v.*,(SELECT COUNT(*) FROM hardware_models m WHERE m.variant_id=v.id)+(SELECT COUNT(*) FROM hardware_model_counters c WHERE c.variant_id=v.id) AS dependency_count FROM hardware_variants v WHERE v.deleted_at IS NULL ORDER BY family,nickname",
    );
    const [models] = await pool.query(
      "SELECT m.*,v.family,v.nickname,v.variant FROM hardware_models m JOIN hardware_variants v ON v.id=m.variant_id ORDER BY m.model_year DESC,m.model_number",
    );
    const [locations] = await pool.query(
      `SELECT l.* FROM hardware_locations l WHERE ${scope.sql} ORDER BY name`,
      scope.args,
    );
    const subsidiaryScope = scopeWhere(user, "s");
    // subsidiaries has id rather than subsidiary_id.
    const [subsidiaries] = await pool.query(
      `SELECT id,subsidiary_name,equipment_configuration FROM subsidiaries WHERE ${subsidiaryScope.sql.replace(/s\.subsidiary_id/g, "id")}`,
      subsidiaryScope.args,
    );
    const [[policy]] = await pool.query(
      "SELECT * FROM hardware_policy WHERE id=1",
    );
    const clientScope = scopeWhere(user, "c");
    const userScope = scopeWhere(user, "u");
    const [clients] = await pool.query(
      `SELECT c.id,c.client_name FROM clients c WHERE ${clientScope.sql} ORDER BY c.client_name`,
      clientScope.args,
    );
    const [branches] = await pool.query(
      `SELECT cb.id,cb.branch_name,cb.client_id FROM client_branches cb JOIN clients c ON ${uuidEquals('c.id','cb.client_id')} WHERE ${clientScope.sql} ORDER BY cb.branch_name`,
      clientScope.args,
    );
    const [technicians] = await pool.query(
      `SELECT u.id,u.first_name,u.last_name,u.subsidiary_id FROM user_profiles u WHERE ${userScope.sql} AND u.is_active=1 AND u.role IN ('User','Teamlead','Admin') ORDER BY u.first_name`,
      userScope.args,
    );
    const technicianFilter =
      user.role === "User"
        ? ` AND ${technicianAssignmentSql()}`
        : "";
    const [installations] = await pool.query(
      `SELECT i.id,i.client_id,c.client_name,c.subsidiary_id,i.status,COALESCE(cb.branch_name COLLATE utf8mb4_unicode_ci,c.branch) AS branch_name FROM installations i JOIN clients c ON ${uuidEquals('c.id','i.client_id')} LEFT JOIN client_branches cb ON ${uuidEquals('cb.id','i.branch_id')} WHERE ${clientScope.sql}${technicianFilter} ORDER BY i.created_at DESC LIMIT 1000`,
      [
        ...clientScope.args,
        ...(user.role === "User" ? Array(5).fill(user.id) : []),
      ],
    );
    return {
      variants,
      models: models.map((model) => {
        model.equipment_field = E.equipmentField(model);
        if (
          hasCapability(user, "inventory.manage_models") ||
          hasCapability(user, "inventory.approve_models")
        )
          return model;
        const { specifications, ...publicModel } = model;
        return publicModel;
      }),
      locations,
      subsidiaries: subsidiaries.map(({id,subsidiary_name}) => ({id,subsidiary_name})),
      equipment_fields_by_subsidiary: Object.fromEntries(subsidiaries.map((subsidiary) => [
        subsidiary.id, equipmentLabels(subsidiary.equipment_configuration, E.EQUIPMENT_FIELDS),
      ])),
      equipment_fields: Object.entries(E.EQUIPMENT_FIELDS).map(([field,label]) => ({field,label})),
      policy,
      clients,
      branches,
      technicians,
      installations,
      statuses: P.STATUSES,
      conditions: P.CONDITIONS,
    };
  };
  const list = async (user, query = {}) => {
    P.requirePermission(user, "inventory.view");
    const preview=query.suggestions==='true';
    if(preview)P.requirePermission(user,'inventory.assign');
    let selection;
    if (query.selection_installation_id) {
      P.requirePermission(user, "inventory.assign");
      const [[target]] = await pool.query(
        `SELECT i.*,c.subsidiary_id FROM installations i JOIN clients c ON ${uuidEquals('c.id','i.client_id')} WHERE i.id=?`,
        [query.selection_installation_id],
      );
      if (!target) P.fail("Installation not found.", 404);
      await installation(
        pool,
        user,
        target.id,
        P.scopedSubsidiary(user, target.subsidiary_id),
      );
      if (target.status === "completed")
        P.fail("Use historical backfill for completed installations.", 409);
      selection = target;
    }
    const f = filters(
      user,
      selection
        ? {
            ...query,
            eligible: undefined,
            subsidiary_id: selection.subsidiary_id,
          }
        : preview && query.q ? {...query,eligible:undefined,archived:'true'} : query,
    );
    if (selection && !(preview && query.q)) {
      const technicianId =
        user.role === "User"
          ? user.id
          : selection.hardware_technician_id ||
            selection.assigned_technician_id;
      f.sql += ` AND (${AVAILABLE_SQL} OR (a.status='Assigned' AND a.installation_id IS NULL AND a.custodian_id=? AND x.id IS NOT NULL AND a.physical_verified=1 AND a.approval_status='Approved' AND a.condition_grade IN ('New','Good','Fair') AND a.reconciliation_status='Matched') OR (a.status='Reserved' AND a.installation_id=? AND x.reservation_expires_at>NOW() AND a.physical_verified=1 AND a.approval_status='Approved' AND a.condition_grade IN ('New','Good','Fair') AND a.reconciliation_status='Matched'))`;
      f.args.push(technicianId || null, selection.id);
    }
    const page = P.integer(query.page || 1, 1, 100000, "Page");
    const limit = P.integer(query.limit || 30, 1, 100, "Page size");
    const sort =
      {
        serial: "a.serial_number",
        updated: "a.updated_at",
        created: "a.created_at",
        model: "m.model_number",
        status: "a.status",
      }[query.sort || "created"] || "a.created_at";
    const direction = query.direction === "asc" ? "ASC" : "DESC";
    const [rows] = await pool.query(
      `${ASSET_SELECT} WHERE ${f.sql} ORDER BY ${sort} ${direction},a.id LIMIT ? OFFSET ?`,
      [...f.args, limit, (page - 1) * limit],
    );
    const [[total]] = await pool.query(
      `SELECT COUNT(*) AS total FROM (${ASSET_SELECT} WHERE ${f.sql}) counted`,
      f.args,
    );
    return { rows: rows.map((asset) => {
      const reason=preview?E.availabilityReason(asset,selection?.id,user.role==='User'?user.id:selection?.hardware_technician_id || selection?.assigned_technician_id):null;
      return {...asset,equipment_field:asset.equipment_field || E.equipmentField(asset),...(preview?{selectable:reason===null,unavailable_reason:reason}:{})};
    }), total: Number(total.total), page, limit };
  };
  const summary = async (user, query = {}) => {
    P.requirePermission(user, "inventory.view");
    const f = filters(user, {
      ...query,
      status: undefined,
      eligible: undefined,
      report: undefined,
    });
    // Aggregate assets directly; history tables must never multiply physical stock.
    const [counts] = await pool.query(
      `SELECT a.status,COUNT(*) AS total,SUM(IF(${AVAILABLE_SQL},1,0)) AS eligible,
      SUM(IF(a.approval_status='Pending',1,0)) AS pending ${ASSET_SELECT.slice(ASSET_SELECT.indexOf("FROM "))} WHERE ${f.sql} GROUP BY a.status`,
      f.args,
    );
    return {
      total: counts.reduce((n, r) => n + Number(r.total), 0),
      pending: counts.reduce((n, r) => n + Number(r.pending), 0),
      // Raw lifecycle totals reconcile to total; eligible availability remains separate.
      status_totals: Object.fromEntries(P.STATUSES.map((status) => [
        status, Number(counts.find((r) => r.status === status)?.total || 0),
      ])),
      counts: Object.fromEntries(
        P.STATUSES.map((status) => [
          status,
          Number(
            counts.find((r) => r.status === status)?.[
              status === "Available" ? "eligible" : "total"
            ] || 0,
          ),
        ]),
      ),
    };
  };
  const detail = async (user, id) => {
    P.requirePermission(user, "inventory.view");
    const scope = scopeWhere(user);
    const [[asset]] = await pool.query(
      `${ASSET_SELECT} WHERE a.id=? AND a.deleted_at IS NULL AND ${scope.sql}`,
      [id, ...scope.args],
    );
    if (!asset) P.fail("Asset not found.", 404);
    const [assignments] = await pool.query(
      "SELECT id,installation_id,technician_id,assigned_at,installed_at,closed_at,reservation_expires_at FROM hardware_assignments WHERE asset_id=? ORDER BY assigned_at DESC",
      [id],
    );
    const [events] = hasCapability(user, "inventory.view_audit")
      ? await pool.query(
          "SELECT e.id,e.action,e.actor_id,e.details,e.created_at,TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) AS actor_name FROM hardware_events e LEFT JOIN user_profiles u ON u.id=e.actor_id WHERE e.asset_id=? ORDER BY e.created_at DESC,e.id DESC",
          [id],
        )
      : [[]];
    let technicalConfiguration;
    if (hasCapability(user, "inventory.edit") && asset.active_assignment_id) {
      const [[assignment]] = await pool.query(
        "SELECT configuration FROM hardware_assignments WHERE id=?",
        [asset.active_assignment_id],
      );
      technicalConfiguration = parseJson(assignment?.configuration || null);
    }
    return {
      ...asset,
      equipment_field: asset.equipment_field || E.equipmentField(asset),
      technical_configuration: technicalConfiguration,
      assignments,
      events: events.map((e) => ({ ...e, details: parseJson(e.details) })),
    };
  };
  const publicHistory = async (id) => {
    if (typeof id !== "string" || !/^[A-Za-z0-9-]{1,36}$/.test(id))
      P.fail("Asset not found.", 404);
    const [[asset]] = await pool.query(
      `SELECT a.serial_number,a.status,m.model_number,v.family,v.nickname
       FROM hardware_assets a
       JOIN hardware_models m ON m.id=a.model_id
       JOIN hardware_variants v ON v.id=m.variant_id
       WHERE a.id=? AND a.deleted_at IS NULL AND a.serial_number IS NOT NULL
         AND a.registration_source <> 'Draft'
       LIMIT 1`,
      [id],
    );
    if (!asset) P.fail("Asset not found.", 404);

    // The public QR page deliberately exposes lifecycle facts only. It never
    // returns people, client/site data, identifiers, notes, documents, or event metadata.
    const actionLabels = {
      generated: "Serial registered",
      generate: "Serial registered",
      verify: "Physical identity verified",
      assigned: "Allocated",
      assign: "Allocated",
      reserved: "Reserved",
      reservation_allocated: "Reservation allocated",
      allocation_linked: "Linked for installation",
      install: "Installation confirmed",
      fault: "Fault reported",
      maintenance: "Maintenance started",
      repair: "Repair completed",
      replace: "Replacement recorded",
      transfer: "Transfer in progress",
      receive_transfer: "Transfer received",
      return: "Returned to inventory",
      retire: "Retired",
      dispose: "Disposed",
      approve: "Registration approved",
    };
    const actions = Object.keys(actionLabels);
    const [events] = await pool.query(
      `SELECT action,created_at FROM hardware_events
       WHERE asset_id=? AND action IN (${actions.map(() => "?").join(",")})
       ORDER BY created_at DESC,id DESC LIMIT 100`,
      [id, ...actions],
    );
    return {
      asset: {
        serial_number: asset.serial_number,
        model_number: asset.model_number,
        family: asset.family,
        nickname: asset.nickname,
        status: asset.status,
      },
      history: events.map((event) => ({
        action: actionLabels[event.action],
        occurred_at: event.created_at,
      })),
    };
  };
  const generate = (req) => {
    const body = req.body;
    const field = body.source === "Field";
    P.requirePermission(
      req.user,
      field ? "inventory.field_register" : "inventory.generate_serial",
    );
    const count = P.integer(body.quantity ?? 1, 1, 500, "Quantity");
    if (body.source && !["Field", "Inventory"].includes(body.source))
      P.fail("Use the dedicated legacy or draft registration workflow.");
    if (count > 1) P.requirePermission(req.user, "inventory.bulk_generate");
    if (field && count !== 1)
      P.fail("Field registration creates one physical asset at a time.");
    const subsidiary = P.scopedSubsidiary(req.user, body.subsidiary_id);
    return transaction(req, "generate", async (db) => {
      const [[policy]] = await db.query(
        "SELECT * FROM hardware_policy WHERE id=1 LOCK IN SHARE MODE",
      );
      if (
        !policy?.issuance_approved ||
        policy.sequence_partition !== "per_model_year"
      )
        P.fail(
          "Serialization policy requires formal administrator approval before issuance.",
          409,
        );
      const [[model]] = await db.query(
        "SELECT m.*,v.family,v.variant FROM hardware_models m JOIN hardware_variants v ON v.id=m.variant_id WHERE m.id=? FOR UPDATE",
        [body.model_id],
      );
      if (
        !model ||
        model.approval_status !== "Approved" ||
        model.historical_only
      )
        P.fail("Select an approved current hardware model.");
      if (!field && body.equipment_field) {
        P.requirePermission(req.user,"inventory.register");
        if (!Object.hasOwn(await equipmentDefinitions(db,subsidiary),body.equipment_field)) P.fail("Select a supported installation equipment item.");
        const currentField=E.equipmentField(model);
        const [[linked]]=await db.query("SELECT COUNT(*) AS total FROM hardware_assets WHERE model_id=? AND installation_id IS NOT NULL",[model.id]);
        if(Number(linked.total) && currentField!==body.equipment_field)P.fail("Return linked hardware before changing its equipment mapping.",409);
        const specs=parseJson(model.specifications) || {};
        specs.installation_equipment_field=body.equipment_field;
        await db.query("UPDATE hardware_models SET specifications=? WHERE id=?",[JSON.stringify(specs),model.id]);
        if(currentField!==body.equipment_field)await event(db,req,"equipment_map",{model_id:model.id},{equipment_field:body.equipment_field});
      }
      const serialYear = P.year(body.serial_year);
      const mappedEquipment=body.equipment_field || E.equipmentField(model);
      if(mappedEquipment && !Object.hasOwn(await equipmentDefinitions(db,subsidiary),mappedEquipment))
        P.fail('The model equipment item is not configured for this subsidiary.');
      const manufacturingYear = P.year(body.manufacturing_year ?? serialYear);
      if (
        serialYear !== Number(model.model_year) ||
        serialYear > new Date().getFullYear() ||
        manufacturingYear < model.model_year ||
        manufacturingYear > new Date().getFullYear()
      )
        P.fail(
          "Serial YY must match the model introduction year; manufacturing year cannot precede it or be in the future.",
        );
      const locationId = await location(db, body.location_id, subsidiary);
      if (field) {
        P.requirePermission(req.user, "installations.manage");
        const target = await installation(
          db,
          req.user,
          body.installation_id,
          subsidiary,
        );
        if (target.status === "completed")
          P.fail("Use legacy backfill for completed installations.", 409);
        if (body.physical_confirmed !== true)
          P.fail(
            "Confirm the physical device identity before field registration.",
          );
        if (!text(body.manufacturer_serial, 150))
          P.fail("Manufacturer serial is required for field registration.");
      }
      await db.query(
        "INSERT INTO hardware_sequences (model_id,serial_year) VALUES (?,?) ON DUPLICATE KEY UPDATE next_sequence=next_sequence",
        [model.id, serialYear],
      );
      const [[sequence]] = await db.query(
        "SELECT next_sequence FROM hardware_sequences WHERE model_id=? AND serial_year=? FOR UPDATE",
        [model.id, serialYear],
      );
      if (Number(sequence.next_sequence) + count - 1 > 9999)
        P.fail("The four-digit serial sequence is exhausted.", 409);
      const results = [];
      for (let i = 0; i < count; i++) {
        const id = uuid();
        const serial = P.serialNumber(
          model,
          serialYear,
          Number(sequence.next_sequence) + i,
        );
        const manufacturer =
          count === 1 ? text(body.manufacturer_serial, 150) : null;
        const pending = field && Boolean(policy.field_approval_required);
        const grade = field ? body.condition_grade : null;
        if (field && !P.CONDITIONS.includes(grade))
          P.fail("Invalid physical condition.");
        await db.query(
          `INSERT INTO hardware_assets
          (id,serial_number,model_id,subsidiary_id,serial_year,manufacturing_year,manufacturer_serial,manufacturer_serial_key,location_id,
           registration_source,approval_status,physical_verified,verified_by,verified_at,reconciliation_status,condition_grade,
           issued_by,issued_at,registered_by,status,installation_id,custodian_id)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,IF(?,NOW(),NULL),?,?,?,NOW(),?,?,?,?)`,
          [
            id,
            serial,
            model.id,
            subsidiary,
            serialYear,
            manufacturingYear,
            manufacturer,
            manufacturer?.toUpperCase() || null,
            locationId,
            field ? "Field" : "Inventory",
            pending ? "Pending" : "Approved",
            field ? 1 : 0,
            field ? req.user.id : null,
            field ? 1 : 0,
            field ? "Matched" : "Unverified",
            grade,
            req.user.id,
            req.user.id,
            field ? "Assigned" : "Generated",
            field ? body.installation_id : null,
            field ? req.user.id : null,
          ],
        );
        const asset = { id, model_id: model.id, subsidiary_id: subsidiary };
        if (field) {
          await db.query(
            "INSERT INTO hardware_assignments (id,asset_id,installation_id,technician_id,assigned_by,configuration) VALUES (?,?,?,?,?,?)",
            [
              uuid(),
              id,
              body.installation_id,
              req.user.id,
              req.user.id,
              configuration(body.configuration),
            ],
          );
          await event(db, req, "physical_verified", asset, {
            manufacturer_serial: manufacturer,
            condition_grade: grade,
          });
        }
        await event(db, req, "serial_issued", asset, {
          serial_number: serial,
          source: field ? "Field" : "Inventory",
        });
        results.push({
          id,
          serial_number: serial,
          status: field ? "Assigned" : "Generated",
          approval_status: pending ? "Pending" : "Approved",
        });
      }
      await db.query(
        "UPDATE hardware_sequences SET next_sequence=next_sequence+? WHERE model_id=? AND serial_year=?",
        [count, model.id, serialYear],
      );
      return { assets: results };
    });
  };
  const mutate = (req, id, action) => {
    const permissions = {
      identity: "inventory.modify_identity",
      verify: "inventory.receive",
      approve: "inventory.approve_field_registration",
      assign: "inventory.assign",
      reserve: "inventory.reserve",
      release: "inventory.reserve",
      install: "inventory.install",
      return: "inventory.receive",
      fault: "inventory.edit",
      maintenance: "inventory.edit",
      repair: "inventory.edit",
      transfer: "inventory.transfer",
      receive_transfer: "inventory.receive",
      retire: "inventory.retire_approve",
      dispose: "inventory.retire_approve",
      archive: "inventory.archive",
      edit: "inventory.edit",
      delete_draft: "inventory.delete_draft",
      print: "inventory.print_qr",
      replace: "inventory.assign",
    };
    if (!permissions[action]) P.fail("Unknown lifecycle action.");
    P.requirePermission(req.user, permissions[action]);
    return transaction(req, `asset:${id}:${action}`, async (db) => {
      // Consistent lock order also protects simultaneous opposing replacements.
      let replacement;
      if (action === "replace") {
        if (req.body.replacement_id === id)
          P.fail("Select a different replacement asset.");
        const ids = [id, req.body.replacement_id].sort();
        const locked = [];
        for (const assetId of ids)
          locked.push(await lockAsset(db, req.user, assetId));
        replacement = locked.find((a) => a.id !== id);
      }
      const asset = await lockAsset(db, req.user, id);
      const b = req.body;
      if (asset.archived_at && !["print", "delete_draft"].includes(action))
        P.fail("Archived equipment is read-only.", 409);
      const reason = text(b.reason, 2000);
      if (
        [
          "return",
          "fault",
          "maintenance",
          "repair",
          "transfer",
          "retire",
          "dispose",
          "replace",
          "archive",
        ].includes(action) &&
        !reason
      )
        P.fail("A reason is required.");
      if (req.user.role === "User" && action !== "print") {
        if (asset.installation_id)
          await installation(
            db,
            req.user,
            asset.installation_id,
            asset.subsidiary_id,
          );
        else if (!["assign"].includes(action))
          P.fail("Select equipment through an assigned installation.", 403);
      }
      switch (action) {
        case "identity": {
          if (
            asset.registration_source !== "Legacy" ||
            b.physical_confirmed !== true
          )
            P.fail(
              "Identity reconciliation requires verified legacy equipment.",
            );
          const serial = text(b.existing_serial, 100) || asset.serial_number;
          if (asset.serial_number && serial !== asset.serial_number)
            P.fail("An issued Marezi serial is immutable.", 409);
          const manufacture =
            asset.manufacturing_year || P.year(b.manufacturing_year);
          const [[model]] = await db.query(
            "SELECT m.*,v.family,v.variant FROM hardware_models m JOIN hardware_variants v ON v.id=m.variant_id WHERE m.id=?",
            [asset.model_id],
          );
          const match = serial?.match(
            /^MRZ-([A-Z]+)-([A-Z]+)(\d+)-(\d{2})-(\d{4})$/,
          );
          if (
            !match ||
            match[1] !== model.family ||
            match[2] !== model.variant ||
            Number(match[3]) !== Number(model.model_sequence) ||
            2000 + Number(match[4]) !== Number(model.model_year) ||
            manufacture < model.model_year ||
            manufacture > new Date().getFullYear()
          )
            P.fail(
              "Provide the verified existing serial and actual manufacturing year.",
            );
          const unit = P.integer(match[5], 1001, 9999, "Unit sequence");
          const serialYear = Number(model.model_year);
          const manufacturer = text(
            b.manufacturer_serial || asset.manufacturer_serial,
            150,
          );
          if (!manufacturer) P.fail("Manufacturer identity is required.");
          await db.query(
            "INSERT INTO hardware_sequences (model_id,serial_year) VALUES (?,?) ON DUPLICATE KEY UPDATE next_sequence=next_sequence",
            [model.id, serialYear],
          );
          await db.query(
            "SELECT next_sequence FROM hardware_sequences WHERE model_id=? AND serial_year=? FOR UPDATE",
            [model.id, serialYear],
          );
          await db.query(
            "UPDATE hardware_sequences SET next_sequence=GREATEST(next_sequence,?) WHERE model_id=? AND serial_year=?",
            [unit + 1, model.id, serialYear],
          );
          await db.query(
            `UPDATE hardware_assets SET serial_number=?,serial_year=?,manufacturing_year=?,manufacturer_serial=?,manufacturer_serial_key=?,
            issued_by=COALESCE(issued_by,?),issued_at=COALESCE(issued_at,NOW()),reconciliation_status=IF(physical_verified=1,'Matched','Unverified') WHERE id=?`,
            [
              serial,
              serialYear,
              manufacture,
              manufacturer,
              manufacturer.toUpperCase(),
              req.user.id,
              id,
            ],
          );
          await event(db, req, "legacy_identity_reconciled", asset, {
            previous_serial: asset.serial_number,
            serial_number: serial,
            manufacturer_serial: manufacturer,
            manufacturing_year: manufacture,
          });
          break;
        }
        case "verify": {
          if (!asset.serial_number || !asset.manufacturing_year)
            P.fail(
              "An issued serial and verified manufacturing year are required before stock receipt.",
              409,
            );
          if (
            !["Generated", "Returned"].includes(asset.status) ||
            asset.active_assignment_id
          )
            P.fail(
              "Only unallocated generated or returned assets can enter verified stock.",
              409,
            );
          if (asset.approval_status !== "Approved")
            P.fail("Registration approval is required.", 409);
          if (
            b.physical_confirmed !== true ||
            !text(b.manufacturer_serial || asset.manufacturer_serial, 150)
          )
            P.fail("Confirm the physical identity and manufacturer serial.");
          if (!["New", "Good", "Fair"].includes(b.condition_grade))
            P.fail(
              "Only acceptable physical condition can enter available stock.",
            );
          const manufacturer = text(
            b.manufacturer_serial || asset.manufacturer_serial,
            150,
          );
          if (
            asset.physical_verified &&
            manufacturer !== asset.manufacturer_serial
          )
            P.requirePermission(req.user, "inventory.modify_identity");
          const loc = await location(
            db,
            b.location_id || asset.location_id,
            asset.subsidiary_id,
          );
          if (!loc) P.fail("Select the stock receipt location.");
          await db.query(
            `UPDATE hardware_assets SET manufacturer_serial=?,manufacturer_serial_key=?,condition_grade=?,location_id=?,
            status='Available',physical_verified=1,verified_by=?,verified_at=NOW(),reconciliation_status='Matched' WHERE id=?`,
            [
              manufacturer,
              manufacturer.toUpperCase(),
              b.condition_grade,
              loc,
              req.user.id,
              id,
            ],
          );
          break;
        }
        case "approve": {
          if (asset.approval_status !== "Pending")
            P.fail("Registration is not pending approval.", 409);
          if (!["Approved", "Rejected"].includes(b.approval_status))
            P.fail("Select Approved or Rejected.");
          if (b.approval_status === "Rejected") {
            if (!reason) P.fail("A rejection reason is required.");
            await closeAssignment(db, asset);
            await db.query(
              "UPDATE hardware_assets SET approval_status='Rejected',status='Returned' WHERE id=?",
              [id],
            );
          } else
            await db.query(
              "UPDATE hardware_assets SET approval_status='Approved' WHERE id=?",
              [id],
            );
          break;
        }
        case "assign":
        case "reserve":
          await allocate(db, req, asset, b, action === "reserve");
          break;
        case "release": {
          if (asset.status !== "Reserved")
            P.fail("Only unused reservations can be released.", 409);
          await closeAssignment(db, asset);
          const available =
            asset.physical_verified &&
            asset.approval_status === "Approved" &&
            ["New", "Good", "Fair"].includes(asset.condition_grade) &&
            asset.reconciliation_status === "Matched";
          await db.query("UPDATE hardware_assets SET status=? WHERE id=?", [
            available ? "Available" : "Returned",
            id,
          ]);
          break;
        }
        case "install": {
          const inst = await installation(
            db,
            req.user,
            asset.installation_id,
            asset.subsidiary_id,
          );
          if (
            asset.status !== "Assigned" ||
            !asset.active_assignment_id ||
            !asset.physical_verified ||
            asset.approval_status !== "Approved" ||
            !["New", "Good", "Fair"].includes(asset.condition_grade) ||
            asset.reconciliation_status !== "Matched"
          )
            P.fail(
              "Verified, approved and assigned equipment is required for installation.",
              409,
            );
          if (
            b.physical_confirmed !== true ||
            b.serial_number !== asset.serial_number
          )
            P.fail("Confirm the physical serial before installation.");
          if (!inst) P.fail("Installation is required.");
          await db.query(
            "UPDATE hardware_assets SET status='Installed' WHERE id=?",
            [id],
          );
          await db.query(
            "UPDATE hardware_assignments SET installed_at=NOW() WHERE id=?",
            [asset.active_assignment_id],
          );
          break;
        }
        case "return":
          P.transition(asset, "Returned");
          await closeAssignment(db, asset);
          await db.query(
            "UPDATE hardware_assets SET status='Returned',physical_verified=0,reconciliation_status='Unverified' WHERE id=?",
            [id],
          );
          break;
        case "fault":
          P.transition(asset, "Faulty");
          await db.query(
            "UPDATE hardware_assets SET status='Faulty',condition_grade='Unserviceable' WHERE id=?",
            [id],
          );
          break;
        case "maintenance":
          P.transition(asset, "Under Maintenance");
          await closeAssignment(db, asset);
          await db.query(
            "UPDATE hardware_assets SET status='Under Maintenance' WHERE id=?",
            [id],
          );
          break;
        case "repair":
          P.transition(asset, "Returned");
          await db.query(
            "UPDATE hardware_assets SET status='Returned',physical_verified=0,reconciliation_status='Unverified' WHERE id=?",
            [id],
          );
          break;
        case "transfer": {
          P.transition(asset, "In Transit");
          const target = P.scopedSubsidiary(
            req.user,
            b.destination_subsidiary_id || asset.subsidiary_id,
          );
          if (target !== asset.subsidiary_id) {
            P.requirePermission(req.user, "inventory.cross_subsidiary");
            if (!text(b.approval_reference))
              P.fail(
                "Cross-subsidiary transfer approval reference is required.",
              );
          }
          const destination = await location(
            db,
            b.destination_location_id,
            target,
          );
          if (!destination) P.fail("Select a destination location.");
          await closeAssignment(db, asset);
          await db.query(
            "UPDATE hardware_assets SET status='In Transit',subsidiary_id=?,location_id=?,physical_verified=0,reconciliation_status='Unverified' WHERE id=?",
            [target, destination, id],
          );
          await event(db, req, "transfer_dispatched", asset, {
            from_subsidiary: asset.subsidiary_id,
            to_subsidiary: target,
            from_location: asset.location_id,
            to_location: destination,
            reason,
            approval_reference: text(b.approval_reference),
          });
          break;
        }
        case "receive_transfer":
          P.transition(asset, "Returned");
          if (b.physical_confirmed !== true)
            P.fail("Confirm physical receipt.");
          await db.query(
            "UPDATE hardware_assets SET status='Returned' WHERE id=?",
            [id],
          );
          break;
        case "retire":
          P.transition(asset, "Retired");
          await closeAssignment(db, asset);
          await db.query(
            "UPDATE hardware_assets SET status='Retired' WHERE id=?",
            [id],
          );
          break;
        case "dispose":
          P.transition(asset, "Disposed");
          if (!text(b.approval_reference))
            P.fail("Disposal evidence reference is required.");
          await db.query(
            "UPDATE hardware_assets SET status='Disposed' WHERE id=?",
            [id],
          );
          break;
        case "archive":
          if (
            asset.active_assignment_id ||
            !["Generated", "Returned", "Retired", "Disposed"].includes(
              asset.status,
            )
          )
            P.fail("Release operational equipment before archival.", 409);
          await db.query(
            "UPDATE hardware_assets SET archived_at=NOW() WHERE id=?",
            [id],
          );
          break;
        case "delete_draft": {
          const [[history]] = await db.query(
            "SELECT COUNT(*) AS total FROM hardware_assignments WHERE asset_id=?",
            [id],
          );
          if (
            asset.serial_number ||
            asset.issued_at ||
            asset.registration_source !== "Draft" ||
            Number(history.total)
          )
            P.fail(
              "Only unissued drafts without assignment history can be deleted.",
              409,
            );
          await db.query(
            "UPDATE hardware_assets SET deleted_at=NOW() WHERE id=?",
            [id],
          );
          break;
        }
        case "edit": {
          const grade = b.condition_grade || asset.condition_grade;
          if (!P.CONDITIONS.includes(grade)) P.fail("Invalid condition.");
          if (
            asset.status === "Available" &&
            !["New", "Good", "Fair"].includes(grade)
          )
            P.fail(
              "Record a fault before changing available stock to an unacceptable condition.",
            );
          await db.query(
            "UPDATE hardware_assets SET notes=?,warranty_expires=?,condition_grade=? WHERE id=?",
            [
              text(b.notes, 5000),
              b.warranty_expires ? date(b.warranty_expires) : null,
              grade,
              id,
            ],
          );
          break;
        }
        case "print":
          break;
        case "replace": {
          if (
            !["Installed", "Faulty"].includes(asset.status) ||
            !asset.installation_id ||
            !asset.active_assignment_id
          )
            P.fail(
              "Select currently installed equipment for replacement.",
              409,
            );
          if (
            replacement.subsidiary_id !== asset.subsidiary_id ||
            !P.eligible(replacement)
          )
            P.fail(
              "Replacement must be eligible stock in the same subsidiary.",
              409,
            );
          if (b.physical_confirmed !== true)
            P.fail("Confirm replacement physical identity.");
          const inst = asset.installation_id;
          await installation(db, req.user, inst, asset.subsidiary_id);
          await closeAssignment(db, asset);
          await db.query(
            "UPDATE hardware_assets SET status='Returned',physical_verified=0,reconciliation_status='Unverified' WHERE id=?",
            [id],
          );
          await allocate(
            db,
            req,
            replacement,
            {
              installation_id: inst,
              technician_id: asset.custodian_id,
            },
            false,
            true,
          );
          await db.query(
            "UPDATE hardware_assets SET status='Installed' WHERE id=?",
            [replacement.id],
          );
          await db.query(
            "UPDATE hardware_assignments SET installed_at=NOW() WHERE asset_id=? AND closed_at IS NULL",
            [replacement.id],
          );
          await event(db, req, "replacement_received", replacement, {
            old_asset_id: id,
            old_serial: asset.serial_number,
            new_serial: replacement.serial_number,
            installation_id: inst,
            reason,
          });
          break;
        }
      }
      await event(db, req, action, asset, {
        reason,
        previous_status: asset.status,
        approval_status: b.approval_status || null,
        replacement_id: replacement?.id || null,
        old_serial: replacement ? asset.serial_number : null,
        new_serial: replacement?.serial_number || null,
        installation_id: asset.installation_id,
        location_id: asset.location_id,
        approval_reference: text(b.approval_reference),
        service_details: text(b.service_details, 5000),
        document_reference: text(b.document_reference),
        performed_by: req.user.id,
        receiving_user_id: ["verify", "return", "receive_transfer"].includes(
          action,
        )
          ? req.user.id
          : null,
        physical_confirmed: b.physical_confirmed === true,
      });
      return { success: true, id };
    });
  };
  const governance = (req, action) => {
    if(['variant_create','variant_update','variant_delete'].includes(action))return transaction(req,action,(db)=>require('./inventoryVariants').manageVariant(db,req,action,event));
    if(action==='equipment_requirement')return transaction(req,action,async(db)=>{
      const b=req.body;
      if(!R.canEdit(req.user,b.subsidiary_id))P.fail('You can configure equipment only for your own subsidiary.',403);
      if(!Object.hasOwn(await equipmentDefinitions(db,b.subsidiary_id),b.equipment_field) || typeof b.serial_required!=='boolean')P.fail('Select an equipment item and a serial requirement.');
      const [[subsidiary]]=await db.query('SELECT id FROM subsidiaries WHERE id=?',[b.subsidiary_id]);
      if(!subsidiary)P.fail('Subsidiary not found.',404);
      await db.query('INSERT INTO hardware_equipment_requirements (subsidiary_id,equipment_field,serial_required,updated_by) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE serial_required=VALUES(serial_required),updated_by=VALUES(updated_by)',[b.subsidiary_id,b.equipment_field,b.serial_required,req.user.id]);
      await event(db,req,action,{subsidiary_id:b.subsidiary_id},{equipment_field:b.equipment_field,serial_required:b.serial_required});
      return {success:true};
    });
    P.requirePermission(
      req.user,
      action === "policy"
        ? "inventory.policy"
        : action === "model_propose"
          ? "inventory.manage_models"
          : ["model_approve", "model_edit"].includes(action)
            ? "inventory.approve_models"
            : action === "alert_rule"
              ? "inventory.edit"
              : "inventory.register",
    );
    return transaction(req, action, async (db) => {
      const b = req.body;
      if (action === "equipment_map") {
        const subsidiary=P.scopedSubsidiary(req.user,b.subsidiary_id);
        if (!Object.hasOwn(await equipmentDefinitions(db,subsidiary),b.equipment_field)) P.fail("Select an installation equipment item.");
        const [[model]] = await db.query("SELECT m.*,v.family FROM hardware_models m JOIN hardware_variants v ON v.id=m.variant_id WHERE m.id=? FOR UPDATE", [b.model_id]);
        if (!model) P.fail("Model not found.",404);
        const specs = parseJson(model.specifications) || {};
        const [[linked]] = await db.query("SELECT COUNT(*) AS total FROM hardware_assets WHERE model_id=? AND installation_id IS NOT NULL",[model.id]);
        if (Number(linked.total) && E.equipmentField(model) !== b.equipment_field)
          P.fail("Return linked equipment before changing its installation equipment mapping.",409);
        specs.installation_equipment_field = b.equipment_field;
        await db.query("UPDATE hardware_models SET specifications=? WHERE id=?",[JSON.stringify(specs),model.id]);
        await event(db,req,action,{model_id:model.id},{equipment_field:b.equipment_field});
      } else if (action === "policy") {
        if (
          b.sequence_partition !== "per_model_year" ||
          typeof b.issuance_approved !== "boolean" ||
          typeof b.field_approval_required !== "boolean"
        )
          P.fail(
            "Approve per-model annual sequencing and select a field approval policy.",
          );
        if (b.issuance_approved && !text(b.approval_reference))
          P.fail("A formal organizational approval reference is required.");
        await db.query(
          "UPDATE hardware_policy SET sequence_partition=?,issuance_approved=?,field_approval_required=?,approved_by=?,approved_at=NOW(),approval_reference=? WHERE id=1",
          [
            b.sequence_partition,
            b.issuance_approved,
            b.field_approval_required,
            req.user.id,
            text(b.approval_reference),
          ],
        );
      } else if (action === "model_propose") {
        const [[variant]] = await db.query(
          "SELECT * FROM hardware_variants WHERE id=? AND deleted_at IS NULL FOR UPDATE",
          [b.variant_id],
        );
        if (!variant) P.fail("Select an official variant.");
        const modelYear = P.year(b.model_year);
        if (modelYear > new Date().getFullYear())
          P.fail("Future models cannot be registered.");
        if (variant.retired && b.historical_only !== true)
          P.fail(
            "Retired Edge is restricted to actual historical manufacturing years.",
          );
        await db.query(
          "INSERT INTO hardware_model_counters (variant_id,model_year) VALUES (?,?) ON DUPLICATE KEY UPDATE next_sequence=next_sequence",
          [variant.id, modelYear],
        );
        const [[counter]] = await db.query(
          "SELECT next_sequence FROM hardware_model_counters WHERE variant_id=? AND model_year=? FOR UPDATE",
          [variant.id, modelYear],
        );
        const number = P.modelNumber(
          variant,
          modelYear,
          Number(counter.next_sequence),
        );
        const id = uuid();
        const specs = b.specifications || {};
        if (canonical(specs).length > 10000)
          P.fail("Model specifications are too large.");
        await db.query(
          "INSERT INTO hardware_models (id,variant_id,model_year,model_sequence,model_number,historical_only,specifications,submitted_by) VALUES (?,?,?,?,?,?,?,?)",
          [
            id,
            variant.id,
            modelYear,
            counter.next_sequence,
            number,
            b.historical_only === true,
            JSON.stringify(specs),
            req.user.id,
          ],
        );
        await db.query(
          "UPDATE hardware_model_counters SET next_sequence=next_sequence+1 WHERE variant_id=? AND model_year=?",
          [variant.id, modelYear],
        );
        await event(
          db,
          req,
          action,
          { model_id: id },
          { model_number: number },
        );
        return { id, model_number: number };
      } else if (action === "model_edit") {
        const [[model]] = await db.query(
          "SELECT * FROM hardware_models WHERE id=? FOR UPDATE",
          [b.model_id],
        );
        if (!model) P.fail("Model not found.", 404);
        if (!["minor", "software"].includes(b.change_type))
          P.fail(
            "Hardware redesigns or functional changes require a new model proposal.",
          );
        if (!text(b.reason, 2000)) P.fail("Record the revision reason.");
        if (
          !b.specifications ||
          typeof b.specifications !== "object" ||
          Array.isArray(b.specifications)
        )
          P.fail("Model specifications must be an object.");
        const specs = {
          ...parseJson(model.specifications),
          ...b.specifications,
        };
        if (canonical(specs).length > 10000)
          P.fail("Model specifications are too large.");
        await db.query(
          "UPDATE hardware_models SET specifications=? WHERE id=?",
          [JSON.stringify(specs), model.id],
        );
        await event(
          db,
          req,
          action,
          { model_id: model.id },
          {
            change_type: b.change_type,
            reason: b.reason,
            previous_specifications: parseJson(model.specifications),
            specifications: specs,
          },
        );
        return { success: true };
      } else if (action === "model_approve") {
        const [[model]] = await db.query(
          "SELECT * FROM hardware_models WHERE id=? FOR UPDATE",
          [b.model_id],
        );
        if (!model) P.fail("Model not found.", 404);
        if (!["Approved", "Rejected", "Retired"].includes(b.approval_status))
          P.fail("Invalid model decision.");
        if (!text(b.reason, 2000)) P.fail("Model decision reason is required.");
        if (!(
          (model.approval_status === "Pending" &&
            ["Approved", "Rejected"].includes(b.approval_status)) ||
          (model.approval_status === "Approved" &&
            b.approval_status === "Retired")
        ))
          P.fail(
            "Approved model identifiers are immutable; submit a new revision.",
            409,
          );
        await db.query(
          "UPDATE hardware_models SET approval_status=?,approved_by=? WHERE id=?",
          [b.approval_status, req.user.id, model.id],
        );
        await event(
          db,
          req,
          action,
          { model_id: model.id },
          {
            model_number: model.model_number,
            approval_status: b.approval_status,
            reason: b.reason,
          },
        );
        return { success: true };
      } else if (action === "alert_rule") {
        const subsidiary = P.scopedSubsidiary(req.user, b.subsidiary_id);
        const loc = await location(db, b.location_id, subsidiary);
        if (!loc) P.fail("Select a stock alert location.");
        const minimum = P.integer(
          b.minimum_stock ?? 0,
          0,
          100000,
          "Minimum stock",
        );
        const warranty = P.integer(
          b.warranty_days || 30,
          1,
          365,
          "Warranty alert days",
        );
        const aging = P.integer(b.aging_days || 90, 1, 3650, "Aging days");
        await db.query(
          `INSERT INTO hardware_alert_rules (id,subsidiary_id,model_id,location_id,minimum_stock,warranty_days,aging_days,configured_by)
          VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE minimum_stock=VALUES(minimum_stock),warranty_days=VALUES(warranty_days),aging_days=VALUES(aging_days),configured_by=VALUES(configured_by)`,
          [
            uuid(),
            subsidiary,
            b.model_id,
            loc,
            minimum,
            warranty,
            aging,
            req.user.id,
          ],
        );
        await event(
          db,
          req,
          action,
          { subsidiary_id: subsidiary },
          {
            model_id: b.model_id,
            location_id: loc,
            minimum_stock: minimum,
            warranty_days: warranty,
            aging_days: aging,
          },
        );
        return { success: true };
      } else if (action === "location") {
        const subsidiary = P.scopedSubsidiary(req.user, b.subsidiary_id);
        const name = text(b.name, 100);
        if (!name) P.fail("Location name is required.");
        const id = uuid();
        await db.query(
          "INSERT INTO hardware_locations (id,subsidiary_id,name) VALUES (?,?,?)",
          [id, subsidiary, name],
        );
        await event(
          db,
          req,
          action,
          { subsidiary_id: subsidiary },
          { id, name },
        );
        return { id, name };
      }
      await event(db, req, action, null, {
        approval_reference: text(b.approval_reference),
        field_approval_required: b.field_approval_required,
        issuance_approved: b.issuance_approved,
      });
      return { success: true };
    });
  };
  const register = (req, existingDb = null) => {
    P.requirePermission(req.user, "inventory.register");
    const b = req.body;
    const subsidiary = P.scopedSubsidiary(req.user, b.subsidiary_id);
    const work = async (db) => {
      const [[model]] = await db.query(
        "SELECT m.*,v.family,v.variant FROM hardware_models m JOIN hardware_variants v ON v.id=m.variant_id WHERE m.id=?",
        [b.model_id],
      );
      if (!model || !["Approved", "Retired"].includes(model.approval_status))
        P.fail("Select an approved model for backfill or draft.");
      const legacy = b.source === "Legacy";
      if (!legacy && b.source !== "Draft")
        P.fail("Use serial issuance for new hardware.");
      const manufacture = b.manufacturing_year
        ? P.year(b.manufacturing_year)
        : null;
      if (
        manufacture &&
        (manufacture < model.model_year ||
          manufacture > new Date().getFullYear())
      )
        P.fail("Invalid manufacturing year for this model.");
      const manufacturer = text(b.manufacturer_serial, 150);
      const serial = text(b.serial_number, 100);
      if (
        model.family === "QMS" &&
        model.variant === "E" &&
        manufacture &&
        manufacture !== Number(model.model_year)
      )
        P.fail(
          "Retired Edge backfill must use the actual manufacturing year in its model and serial.",
        );
      if (!legacy && serial) P.fail("Drafts cannot contain issued serials.");
      let serialYear = null;
      if (serial) {
        const match = serial.match(
          /^MRZ-([A-Z]+)-([A-Z]+)(\d+)-(\d{2})-(\d{4})$/,
        );
        if (
          !match ||
          match[1] !== model.family ||
          match[2] !== model.variant ||
          Number(match[3]) !== Number(model.model_sequence)
        )
          P.fail("Historical serial does not match the selected model.");
        serialYear = 2000 + Number(match[4]);
        const unit = P.integer(match[5], 1001, 9999, "Unit sequence");
        if (
          serialYear !== Number(model.model_year) ||
          (manufacture && serialYear > manufacture) ||
          serialYear > new Date().getFullYear()
        )
          P.fail(
            "Preserve the model serial year and actual historical manufacturing year.",
          );
        await db.query(
          "INSERT INTO hardware_sequences (model_id,serial_year) VALUES (?,?) ON DUPLICATE KEY UPDATE next_sequence=next_sequence",
          [model.id, serialYear],
        );
        await db.query(
          "SELECT next_sequence FROM hardware_sequences WHERE model_id=? AND serial_year=? FOR UPDATE",
          [model.id, serialYear],
        );
        await db.query(
          "UPDATE hardware_sequences SET next_sequence=GREATEST(next_sequence,?) WHERE model_id=? AND serial_year=?",
          [unit + 1, model.id, serialYear],
        );
      }
      const inst =
        legacy && b.installation_id
          ? await installation(db, req.user, b.installation_id, subsidiary)
          : null;
      if (inst && b.physical_confirmed !== true)
        P.fail(
          "Installed legacy backfill requires physical verification. Unknown identification must remain pending reconciliation.",
        );
      const id = uuid();
      const loc = await location(db, b.location_id, subsidiary);
      const grade = inst ? b.condition_grade : null;
      if (inst && !P.CONDITIONS.includes(grade))
        P.fail(
          "Record the verified physical condition of historical installed equipment.",
        );
      await db.query(
        `INSERT INTO hardware_assets (id,serial_number,model_id,subsidiary_id,manufacturing_year,serial_year,manufacturer_serial,manufacturer_serial_key,
        registration_source,registered_by,issued_by,issued_at,status,physical_verified,verified_by,verified_at,reconciliation_status,installation_id,location_id,condition_grade)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,IF(?,NOW(),NULL),?,?,?,IF(?,NOW(),NULL),?,?,?,?)`,
        [
          id,
          serial,
          model.id,
          subsidiary,
          manufacture,
          serialYear,
          manufacturer,
          manufacturer?.toUpperCase() || null,
          legacy ? "Legacy" : "Draft",
          req.user.id,
          serial ? req.user.id : null,
          Boolean(serial),
          inst ? "Installed" : "Generated",
          Boolean(inst),
          inst ? req.user.id : null,
          Boolean(inst),
          inst && serial && manufacture ? "Matched" : "Unverified",
          inst?.id || null,
          loc,
          grade,
        ],
      );
      if (inst)
        await db.query(
          "INSERT INTO hardware_assignments (id,asset_id,installation_id,assigned_by,installed_at) VALUES (?,?,?,?,?)",
          [uuid(), id, inst.id, req.user.id, inst.completion_date || null],
        );
      await event(
        db,
        req,
        legacy ? "legacy_backfill" : "draft_created",
        { id, model_id: model.id, subsidiary_id: subsidiary },
        {
          serial_number: serial,
          manufacturer_serial: manufacturer,
          manufacturing_year: manufacture,
          installation_id: inst?.id || null,
          missing_identity: !serial || !manufacture,
        },
      );
      return { id, serial_number: serial };
    };
    return existingDb ? work(existingDb) : transaction(req, "register", work);
  };
  const previewReconcile = async (req) => {
    P.requirePermission(req.user,"inventory.reconcile");
    const subsidiary=P.scopedSubsidiary(req.user,req.body.subsidiary_id);
    const loc=await location(pool,req.body.location_id,subsidiary);
    if(!loc)P.fail("Select a stocktake location.");
    const [assets]=await pool.query(stockSql,[loc,subsidiary]);
    return stocktakeResult(assets,req.body.observed_ids);
  };
  const reconcile = (req) => {
    P.requirePermission(req.user,"inventory.reconcile");
    const b=req.body;const subsidiary=P.scopedSubsidiary(req.user,b.subsidiary_id);
    return transaction(req,"reconcile",async(db)=>{
      const loc=await location(db,b.location_id,subsidiary);
      if(!loc)P.fail("Select a stocktake location.");
      const [assets]=await db.query(stockSql+" FOR UPDATE",[loc,subsidiary]);
      const results=stocktakeResult(assets,b.observed_ids);
      if(b.snapshot && b.snapshot!==results.snapshot)P.fail("Stock changed after preview. Preview the count again before applying.",409);
      if(results.missing.length && b.confirm_missing!==true)P.fail("Confirm the missing items before applying this stocktake.",409);
      const observed=new Set(results.matched);
      for(const asset of assets){
        const found=observed.has(asset.id);
        await db.query("UPDATE hardware_assets SET reconciliation_status=? WHERE id=?",[found?"Matched":"Missing",asset.id]);
        await event(db,req,"reconciled",asset,{found,location_id:loc});
      }
      const id=uuid();
      await db.query("INSERT INTO hardware_reconciliations (id,subsidiary_id,location_id,performed_by,results) VALUES (?,?,?,?,?)",[id,subsidiary,loc,req.user.id,JSON.stringify(results)]);
      return {id,...results};
    });
  };
  const installationHardware = async (user, id, db = pool) => {
    if (
      !hasCapability(user, "installations.view") &&
      !hasCapability(user, "inventory.view")
    )
      P.fail("Insufficient permissions.", 403);
    const [[inst]] = await db.query(
      `SELECT i.*,c.subsidiary_id FROM installations i JOIN clients c ON ${uuidEquals('c.id','i.client_id')} WHERE i.id=?`,
      [id],
    );
    if (!inst) P.fail("Installation not found.", 404);
    P.scopedSubsidiary(user, inst.subsidiary_id);
    if (user.role === "User")
      await installation(db, user, id, inst.subsidiary_id);
    const [[snapshot]] = await db.query(
      "SELECT hardware,captured_at FROM hardware_handover_snapshots WHERE installation_id=?",
      [id],
    );
    const [rows] = await db.query(
      `SELECT a.id,a.serial_number,m.model_number,v.family,JSON_UNQUOTE(JSON_EXTRACT(m.specifications,'$.installation_equipment_field')) AS equipment_field,v.description AS equipment_type,a.manufacturer_serial,a.condition_grade,
      COALESCE(cb.branch_name COLLATE utf8mb4_unicode_ci,c.branch) AS installation_location,x.installed_at AS installation_date,x.technician_id AS installed_by,a.status,a.approval_status
      FROM hardware_assets a JOIN hardware_models m ON m.id=a.model_id JOIN hardware_variants v ON v.id=m.variant_id
      JOIN hardware_assignments x ON ${uuidEquals('x.asset_id','a.id')} AND x.closed_at IS NULL JOIN installations i ON ${uuidEquals('i.id','x.installation_id')}
      JOIN clients c ON ${uuidEquals('c.id','i.client_id')}
      LEFT JOIN client_branches cb ON ${uuidEquals('cb.id','i.branch_id')} WHERE x.installation_id=? AND a.deleted_at IS NULL`,
      [id],
    );
    return {
      rows: rows.map((asset) => ({...asset,equipment_field:asset.equipment_field || E.equipmentField(asset)})),
      snapshot: snapshot ? parseJson(snapshot.hardware) : null,
      handover_rows: snapshot
        ? parseJson(snapshot.hardware)
        : inst.handover_status === "signed"
          ? []
          : rows,
      captured_at: snapshot?.captured_at || null,
    };
  };
  const assertCompletion = async (db, id, {validateQuantities=false} = {}) => {
    const [[pending]] = await db.query(
      `SELECT COUNT(*) AS total FROM hardware_assets WHERE installation_id=? AND deleted_at IS NULL
      AND (status<>'Installed' OR physical_verified=0 OR approval_status<>'Approved' OR reconciliation_status<>'Matched')`,
      [id],
    );
    if (Number(pending.total))
      P.fail(
        "Approve, verify and confirm all linked hardware before completing this installation.",
        409,
      );
    if(validateQuantities) {
      const [[target]]=await db.query("SELECT * FROM installations WHERE id=?",[id]);
      const [assets]=await db.query("SELECT m.specifications,v.family FROM hardware_assets a JOIN hardware_models m ON m.id=a.model_id JOIN hardware_variants v ON v.id=m.variant_id WHERE a.installation_id=? AND a.deleted_at IS NULL AND a.status='Installed'",[id]);
      const [[scope]]=await db.query('SELECT subsidiary_id FROM clients WHERE id=?',[target.client_id]);
      const required=await R.requiredFields(db,scope.subsidiary_id);
      for(const field of required) {
        const expected=Number(E.quantity(target || {},field));
        if(expected>0 && assets.filter((a)=>E.equipmentField(a)===field).length!==expected)
          P.fail(`Select and confirm ${expected} ${E.EQUIPMENT_FIELDS[field] || 'equipment'} serials before completing this installation.`,409);
      }
    }
  };
  const captureHandover = async (db, user, id) => {
    await assertCompletion(db, id);
    const data = await installationHardware(user, id, db);
    if (!data.rows.length) return;
    await db.query(
      "INSERT IGNORE INTO hardware_handover_snapshots (installation_id,hardware,captured_by) VALUES (?,?,?)",
      [id, JSON.stringify(data.rows), user.id],
    );
  };
  const movements = async (user, query = {}) => {
    P.requirePermission(user, "inventory.view_reports");
    const scope = scopeWhere(user, "e", query.subsidiary_id);
    const args = [...scope.args];
    let where = scope.sql;
    if (query.asset_id) {
      where += " AND e.asset_id=?";
      args.push(query.asset_id);
    }
    if (query.action) {
      where += " AND e.action=?";
      args.push(query.action);
    }
    if (query.q) {
      where += " AND (e.asset_id=? OR a.serial_number LIKE ?)";
      args.push(query.q, `%${String(query.q).slice(0, 150)}%`);
    }
    if (query.from) {
      where += " AND e.created_at>=?";
      args.push(date(query.from));
    }
    if (query.to) {
      where += " AND e.created_at<DATE_ADD(?,INTERVAL 1 DAY)";
      args.push(date(query.to));
    }
    if (query.model_id) {
      where += " AND a.model_id=?";
      args.push(query.model_id);
    }
    if (query.family) {
      where += " AND v.family=?";
      args.push(query.family);
    }
    if (query.technician_id) {
      where += " AND e.actor_id=?";
      args.push(query.technician_id);
    }
    const page = P.integer(query.page || 1, 1, 100000, "Page");
    const limit = P.integer(query.limit || 30, 1, 100, "Page size");
    if (query.client_id) {
      where += " AND i.client_id=?";
      args.push(query.client_id);
    }
    if (query.branch_id) {
      where += " AND i.branch_id=?";
      args.push(query.branch_id);
    }
    if (query.location_id) {
      where += " AND JSON_UNQUOTE(JSON_EXTRACT(e.details,'$.location_id'))=?";
      args.push(query.location_id);
    }
    const joins =
      "FROM hardware_events e LEFT JOIN user_profiles u ON u.id=e.actor_id LEFT JOIN hardware_assets a ON a.id=e.asset_id LEFT JOIN hardware_models m ON m.id=a.model_id LEFT JOIN hardware_variants v ON v.id=m.variant_id LEFT JOIN installations i ON i.id=JSON_UNQUOTE(JSON_EXTRACT(e.details,'$.installation_id'))";
    const [rows] = await pool.query(
      `SELECT e.*,a.serial_number,TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) AS actor_name ${joins} WHERE ${where} ORDER BY e.created_at DESC,e.id LIMIT ? OFFSET ?`,
      [...args, limit, (page - 1) * limit],
    );
    const [[total]] = await pool.query(
      `SELECT COUNT(*) AS total ${joins} WHERE ${where}`,
      args,
    );
    return {
      rows: rows.map((row) => ({ ...row, details: parseJson(row.details) })),
      total: Number(total.total),
      page,
      limit,
    };
  };
  const applyInstallationSelection = async (db, req, id, selection, allowCompletion=false) => {
    E.validateSelection(selection);
    P.requirePermission(req.user, "inventory.assign");
    if (selection.mark_installed) P.requirePermission(req.user,"inventory.install");
    const [[target]] = await db.query(`SELECT i.*,c.subsidiary_id FROM installations i JOIN clients c ON ${uuidEquals('c.id','i.client_id')} WHERE i.id=? FOR UPDATE`,[id]);
    if (!target) P.fail("Installation not found.",404);
    P.scopedSubsidiary(req.user,target.subsidiary_id);
    await installation(db,req.user,id,target.subsidiary_id);
    const definitions=await equipmentDefinitions(db,target.subsidiary_id);
    if(selection.assets.some((item)=>!Object.hasOwn(definitions,item.equipment_field))) P.fail('Equipment item is not configured for this subsidiary.');
    if (!allowCompletion && (target.handover_status === "signed" || target.status === "completed"))
      P.fail("Use the existing return or replacement workflow for completed installations.",409);
    const [existing] = await db.query("SELECT a.id,m.specifications,v.family FROM hardware_assets a JOIN hardware_models m ON m.id=a.model_id JOIN hardware_variants v ON v.id=m.variant_id WHERE a.installation_id=? AND a.deleted_at IS NULL",[id]);
    const combined = new Map(existing.map((a) => [a.id,{asset_id:a.id,equipment_field:E.equipmentField(a)}]));
    const selected = [];
    for (const entry of [...selection.assets].sort((a,b)=>a.asset_id.localeCompare(b.asset_id))) {
      const asset = await lockAsset(db,req.user,entry.asset_id);
      const [[model]] = await db.query("SELECT m.specifications,v.family FROM hardware_models m JOIN hardware_variants v ON v.id=m.variant_id WHERE m.id=?",[asset.model_id]);
      if (E.equipmentField(model) !== entry.equipment_field) P.fail("Selected serial does not match this equipment item.",409);
      if (asset.installation_id && asset.installation_id !== id) P.fail("Selected equipment is linked to another installation.",409);
      combined.set(asset.id,entry);
      selected.push(asset);
    }
    E.validateQuantities(target,[...combined.values()].filter((e)=>e.equipment_field));
    if(req.user.role==='User')await R.assertRequired(db,target,[...combined.values()].filter((e)=>e.equipment_field));
    for (const asset of selected) {
      if (asset.installation_id !== id || asset.status === "Reserved")
        await allocate(db,req,asset,{installation_id:id,physical_confirmed:true,technician_id:req.user.role==="User"?req.user.id:target.hardware_technician_id || target.assigned_technician_id});
      const current = await lockAsset(db,req.user,asset.id);
      if (selection.mark_installed && current.status !== "Installed") {
        if (current.status!=="Assigned" || !current.active_assignment_id || !current.physical_verified || current.approval_status!=="Approved" || !["New","Good","Fair"].includes(current.condition_grade) || current.reconciliation_status!=="Matched")
          P.fail("Only verified, approved assigned equipment can be confirmed installed.",409);
        await db.query("UPDATE hardware_assets SET status='Installed' WHERE id=?",[current.id]);
        await db.query("UPDATE hardware_assignments SET installed_at=NOW() WHERE id=?",[current.active_assignment_id]);
        await event(db,req,"install",current,{installation_id:id,physical_confirmed:true,serial_number:current.serial_number});
      }
    }
  };
  const installationWrite = async (
    req,
    id,
    { complete = false, snapshot = false, scopeChanged = false, selection, create = false } = {},
    work,
  ) => {
    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      let result;
      if (create) result = await work(db);
      const [[row]] = await db.query(
        "SELECT * FROM installations WHERE id=? FOR UPDATE",
        [id],
      );
      if (!row) P.fail("Installation not found.", 404);
      if (complete) {
        const [[target]]=await db.query(`SELECT c.subsidiary_id FROM installations i JOIN clients c ON ${uuidEquals('c.id','i.client_id')} WHERE i.id=?`,[id]);
        P.scopedSubsidiary(req.user,target.subsidiary_id);
        if(req.user.role==='User')await installation(db,req.user,id,target.subsidiary_id);
      }
      if (scopeChanged && ["client_id","branch_id","department_id"].some((field)=>req.body[field] !== undefined && String(req.body[field] || "") !== String(row[field] || ""))) {
        const [[linked]] = await db.query(
          "SELECT COUNT(*) AS total FROM hardware_assets WHERE installation_id=?",
          [id],
        );
        if (Number(linked.total))
          P.fail(
            "Return or transfer linked hardware before changing the installation client or branch.",
            409,
          );
      }
      if (!create) result = await work(db);
      const [[updated]]=await db.query('SELECT * FROM installations WHERE id=?',[id]);
      if(updated.equipment_quantities) await normalizeEquipmentQuantities(db,updated.client_id,parseJson(updated.equipment_quantities),req.user);
      if (selection !== undefined) await applyInstallationSelection(db,req,id,selection,complete && row.handover_status!=='signed' && row.status!=='completed');
      if (req.user.role==='User' && row.status!=='completed' && row.handover_status!=='signed') {
        const [[target]]=await db.query(`SELECT i.*,c.subsidiary_id FROM installations i JOIN clients c ON ${uuidEquals('c.id','i.client_id')} WHERE i.id=?`,[id]);
        const [linked]=await db.query('SELECT m.specifications,v.family FROM hardware_assets a JOIN hardware_models m ON m.id=a.model_id JOIN hardware_variants v ON v.id=m.variant_id WHERE a.installation_id=? AND a.deleted_at IS NULL',[id]);
        await R.assertRequired(db,target,linked.map((asset)=>({equipment_field:E.equipmentField(asset)})));
      }
      if (complete) await assertCompletion(db, id,{validateQuantities:row.handover_status!=='signed'});
      if (snapshot && row.handover_status !== "signed")
        await captureHandover(db, req.user, id);
      await db.commit();
      return result;
    } catch (error) {
      await db.rollback().catch(() => {});
      throw error;
    } finally {
      db.release();
    }
  };
  const importInventory = async (req) => {
    P.requirePermission(req.user, "inventory.import");
    const rows = req.body.rows;
    if (!Array.isArray(rows) || !rows.length || rows.length > 500)
      P.fail("Import between 1 and 500 rows.");
    return transaction(req, "import", async (db) => {
      const serials = new Set();
      const manufacturers = new Set();
      const results = [];
      for (let i = 0; i < rows.length; i++) {
        try {
          const row = rows[i];
          if (!row || typeof row !== "object" || Array.isArray(row))
            P.fail("Invalid row.");
          for (const field of [
            "model_id",
            "subsidiary_id",
            "location_id",
            "installation_id",
          ])
            if (
              row[field] !== undefined &&
              row[field] !== null &&
              row[field] !== "" &&
              (typeof row[field] !== "string" ||
                !/^[A-Za-z0-9-]{1,36}$/.test(row[field]))
            )
              P.fail("Invalid import identifier.");
          const subsidiary = P.scopedSubsidiary(req.user, row.subsidiary_id);
          if (!["Legacy", "Draft"].includes(row.source))
            P.fail(
              "Imports accept Legacy or Draft records only; new issuance uses the serialization engine.",
            );
          const [[model]] = await db.query(
            "SELECT m.*,v.family,v.variant FROM hardware_models m JOIN hardware_variants v ON v.id=m.variant_id WHERE m.id=?",
            [row.model_id],
          );
          if (
            !model ||
            !["Approved", "Retired"].includes(model.approval_status)
          )
            P.fail("Invalid or unapproved model.");
          const serial = text(row.serial_number, 100);
          const manufacturer = text(row.manufacturer_serial, 150);
          if (serial) {
            if (row.source === "Draft")
              P.fail("Draft imports cannot issue serials.");
            const match = serial.match(
              /^MRZ-([A-Z]+)-([A-Z]+)(\d+)-(\d{2})-(\d{4})$/,
            );
            if (
              !match ||
              match[1] !== model.family ||
              match[2] !== model.variant ||
              Number(match[3]) !== Number(model.model_sequence) ||
              Number(match[4]) + 2000 !== Number(model.model_year) ||
              (row.manufacturing_year &&
                Number(row.manufacturing_year) < Number(model.model_year))
            )
              P.fail(
                "Serial format does not match the model and manufacturing year.",
              );
            P.integer(match[5], 1001, 9999, "Unit sequence");
            if (serials.has(serial)) P.fail("Duplicate serial in this import.");
            serials.add(serial);
          }
          if (manufacturer) {
            const key = manufacturer.toUpperCase();
            if (manufacturers.has(key))
              P.fail("Duplicate manufacturer serial in this import.");
            manufacturers.add(key);
          }
          const [[existing]] = await db.query(
            "SELECT id FROM hardware_assets WHERE serial_number=? OR manufacturer_serial_key=? LIMIT 1",
            [serial, manufacturer?.toUpperCase() || null],
          );
          if (existing)
            P.fail("An asset with this identity is already registered.");
          await location(db, row.location_id, subsidiary);
          if (row.manufacturing_year) {
            const y = P.year(row.manufacturing_year);
            if (y < model.model_year || y > new Date().getFullYear())
              P.fail("Invalid historical manufacturing year.");
          }
          if (row.installation_id) {
            if (
              !P.CONDITIONS.includes(row.condition_grade) ||
              ![true, "true"].includes(row.physical_confirmed)
            )
              P.fail(
                "Historical installed rows require physical confirmation and a recorded condition.",
              );
            await installation(db, req.user, row.installation_id, subsidiary);
          }
          results.push({ row: i + 1, valid: true });
        } catch (error) {
          results.push({
            row: i + 1,
            valid: false,
            error: error.status ? error.message : "Unable to validate row.",
          });
        }
      }
      if (req.body.commit !== true) return { rows: results };
      P.requirePermission(req.user, "inventory.approve_import");
      if (!text(req.body.approval_reference))
        P.fail("Bulk import approval reference is required.");
      if (results.some((row) => !row.valid))
        P.fail("Resolve all import errors before approval.");
      // Savepoints keep row-level diagnostics and successful rows in one idempotent batch commit.
      const imported = [];
      for (let i = 0; i < rows.length; i++) {
        await db.query("SAVEPOINT hardware_import_row");
        try {
          const asset = await register(
            {
              ...req,
              body: {
                ...rows[i],
                physical_confirmed:
                  rows[i].physical_confirmed === true ||
                  rows[i].physical_confirmed === "true",
              },
            },
            db,
          );
          imported.push({ row: i + 1, valid: true, id: asset.id });
        } catch (error) {
          await db.query("ROLLBACK TO SAVEPOINT hardware_import_row");
          imported.push({
            row: i + 1,
            valid: false,
            error: error.status
              ? error.message
              : "Duplicate identity or import failure.",
          });
        }
      }
      await logSuccess(db, req, {
        action: "hardware_bulk_import",
        category: "inventory",
        module: "Hardware & Inventory",
        metadata: {
          approval_reference: req.body.approval_reference,
          results: imported,
        },
      });
      return { rows: imported };
    });
  };
  const alerts = async (user) => {
    P.requirePermission(user, "inventory.view");
    const scope = scopeWhere(user, "r");
    const [rules] = await pool.query(
      `SELECT r.*,m.model_number,l.name AS location_name,
      (SELECT COUNT(*) FROM hardware_assets a WHERE a.model_id=r.model_id AND a.location_id=r.location_id AND a.subsidiary_id=r.subsidiary_id
       AND a.archived_at IS NULL AND a.deleted_at IS NULL AND ${AVAILABLE_SQL}) AS available
      FROM hardware_alert_rules r JOIN hardware_models m ON m.id=r.model_id JOIN hardware_locations l ON l.id=r.location_id WHERE ${scope.sql}`,
      scope.args,
    );
    const assetScope = scopeWhere(user);
    const [assets] = await pool.query(
      `SELECT a.id,a.serial_number,a.status,a.warranty_expires,a.reconciliation_status,a.created_at,
      COALESCE(r.warranty_days,30) AS warranty_days,COALESCE(r.aging_days,90) AS aging_days FROM hardware_assets a
      LEFT JOIN hardware_alert_rules r ON r.subsidiary_id=a.subsidiary_id AND r.model_id=a.model_id AND r.location_id=a.location_id
      WHERE ${assetScope.sql} AND a.archived_at IS NULL AND a.deleted_at IS NULL AND a.status NOT IN ('Retired','Disposed')
      AND (a.reconciliation_status IN ('Missing','Discrepancy') OR a.warranty_expires<=DATE_ADD(CURDATE(),INTERVAL COALESCE(r.warranty_days,30) DAY)
        OR (a.status IN ('Generated','Available','Returned') AND a.created_at<DATE_SUB(NOW(),INTERVAL COALESCE(r.aging_days,90) DAY))) ORDER BY a.created_at LIMIT 200`,
      assetScope.args,
    );
    return {
      rules,
      low_stock: rules.filter(
        (r) => Number(r.available) < Number(r.minimum_stock),
      ),
      assets,
    };
  };
  const modelHistory = async (user, id) => {
    P.requirePermission(user, "inventory.manage_models");
    const [[model]] = await pool.query(
      "SELECT * FROM hardware_models WHERE id=?",
      [id],
    );
    if (!model) P.fail("Model not found.", 404);
    const [events] = await pool.query(
      "SELECT e.id,e.action,e.actor_id,e.details,e.created_at,TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) AS actor_name FROM hardware_events e LEFT JOIN user_profiles u ON u.id=e.actor_id WHERE e.model_id=? AND e.asset_id IS NULL ORDER BY e.created_at,e.id",
      [id],
    );
    return {
      model: { ...model, specifications: parseJson(model.specifications) },
      events: events.map((e) => ({ ...e, details: parseJson(e.details) })),
    };
  };
  return {
    catalog,
    list,
    summary,
    detail,
    generate,
    mutate,
    governance,
    register,
    reconcile,
    previewReconcile,
    installationHardware,
    assertCompletion,
    captureHandover,
    movements,
    installationWrite,
    importInventory,
    alerts,
    modelHistory,
    publicHistory,
    equipmentRequirements:(user,subsidiaryId)=>R.listRequirements(pool,user,subsidiaryId),
  };
}
module.exports = { createHardwareInventory, AVAILABLE_SQL, canonical };
