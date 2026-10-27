const express = require("express");
const { requireCapability } = require("../security/accessControl");

module.exports = function createHardwareRouter(
  service,
  { enabled = false } = {},
) {
  const router = express.Router();
  router.use((req, res, next) =>
    enabled
      ? next()
      : res.status(503).json({
          error:
            "Hardware inventory is awaiting its approved database rollout.",
        }),
  );
  router.use((req, res, next) => {
    const identifiers = new Set([
      "model_id",
      "variant_id",
      "subsidiary_id",
      "location_id",
      "installation_id",
      "selection_installation_id",
      "technician_id",
      "replacement_id",
      "destination_subsidiary_id",
      "destination_location_id",
      "asset_id",
      "client_id",
      "branch_id",
    ]);
    if (req.body && (typeof req.body !== "object" || Array.isArray(req.body)))
      return res.status(400).json({ error: "Supply a JSON object." });
    for (const source of [req.query, req.body || {}])
      for (const [key, value] of Object.entries(source)) {
        if (
          identifiers.has(key) &&
          value !== undefined &&
          value !== null &&
          value !== "" &&
          (typeof value !== "string" || !/^[A-Za-z0-9-]{1,36}$/.test(value))
        )
          return res
            .status(400)
            .json({ error: "Invalid hardware identifier." });
      }
    for (const key of [
      "q",
      "from",
      "to",
      "status",
      "report",
      "sort",
      "direction",
      "approval_status",
    ])
      if (
        req.query[key] !== undefined &&
        (typeof req.query[key] !== "string" || req.query[key].length > 150)
      )
        return res.status(400).json({ error: "Invalid inventory filter." });
    next();
  });
  const handle = (operation) => async (req, res) => {
    try {
      res.json(await operation(req));
    } catch (error) {
      const status =
        error.status ||
        (error.code === "ER_DUP_ENTRY"
          ? 409
          : error.code === "ER_NO_SUCH_TABLE"
            ? 503
            : error.code === "ER_LOCK_DEADLOCK"
              ? 409
              : 500);
      if (!error.status)
        console.error(
          "Hardware inventory request failed:",
          error.code || error.message,
        );
      res.status(status).json({
        error: error.status
          ? error.message
          : status === 409
            ? "Duplicate identity or concurrent inventory change. Refresh and retry."
            : status === 503
              ? "Hardware inventory migration has not been applied."
              : "Unable to complete the hardware operation.",
      });
    }
  };
  router.get(
    "/catalog",
    handle((req) => service.catalog(req.user)),
  );
  router.get('/equipment-requirements',handle((req)=>service.equipmentRequirements(req.user,req.query.subsidiary_id)));
  router.get(
    "/models/:id",
    handle((req) => service.modelHistory(req.user, req.params.id)),
  );
  router.get(
    "/assets",
    handle((req) => service.list(req.user, req.query)),
  );
  router.get(
    "/summary",
    handle((req) => service.summary(req.user, req.query)),
  );
  router.get(
    "/alerts",
    handle((req) => service.alerts(req.user)),
  );
  router.get(
    "/assets/:id",
    handle((req) => service.detail(req.user, req.params.id)),
  );
  router.get(
    "/movements",
    handle((req) => service.movements(req.user, req.query)),
  );
  router.get(
    "/installations/:id",
    handle((req) => service.installationHardware(req.user, req.params.id)),
  );
  router.get(
    "/reports",
    requireCapability("inventory.view_reports"),
    handle((req) => service.list(req.user, req.query)),
  );
  router.get(
    "/export",
    requireCapability("inventory.export"),
    handle((req) => service.list(req.user, req.query)),
  );
  router.post(
    "/generate",
    handle((req) => service.generate(req)),
  );
  router.post(
    "/register",
    handle((req) => service.register(req)),
  );
  router.post(
    "/reconcile",
    handle((req) => service.reconcile(req)),
  );
  router.post('/reconcile-preview',handle((req)=>service.previewReconcile(req)));
  router.post(
    "/import",
    handle((req) => service.importInventory(req)),
  );
  router.post(
    "/assets/:id/:action",
    handle((req) => service.mutate(req, req.params.id, req.params.action)),
  );
  for (const action of [
    'variant_create','variant_update','variant_delete',
    "policy",
    "equipment_map",
    "equipment_requirement",
    "model_propose",
    "model_approve",
    "model_edit",
    "location",
    "alert_rule",
  ])
    router.post(
      `/${action}`,
      handle((req) => service.governance(req, action)),
    );
  return router;
};
