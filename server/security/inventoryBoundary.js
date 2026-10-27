const { hasCapability } = require("./accessControl");

const legacyPermissions = [
  [
    /^\/(?:clients|client_branches|client_departments)(?:\/|$)/,
    "clients.view",
    "clients.manage",
  ],
  [/^\/installations(?:\/|$)/, "installations.view", "installations.manage"],
  [/^\/client_assignments(?:\/|$)/, "assignments.view", "assignments.manage"],
  [/^\/installation_progress(?:\/|$)/, "progress.view", "progress.manage"],
  [/^\/user_profiles(?:\/|$)/, "users.manage", "users.manage"],
  [/^\/budgets(?:\/|$)/, "finances.view", "finances.manage"],
  [/^\/companies$/, "company.manage", "company.manage"],
];
const inventoryBoundary = (req, res, next) => {
  if (req.user?.role !== "InventoryOfficer") return next();
  const read = ["GET", "HEAD"].includes(req.method);
  if (/^\/(?:hardware|auth|files|notifications)(?:\/|$)/.test(req.path))
    return next();
  if (
    /^\/chat(?:\/|$)/.test(req.path) &&
    !/^\/chat\/assistant(?:\/|$)/.test(req.path)
  )
    return next();
  if (
    read &&
    ["/health", "/time", "/maintenance/status", "/companies", "/announcements"].includes(
      req.path,
    )
  )
    return next();
  if (req.method === "POST" && /^\/announcements\/[^/]+\/read$/.test(req.path))
    return next();
  const route = legacyPermissions.find(([pattern]) => pattern.test(req.path));
  if (route && hasCapability(req.user, route[read ? 1 : 2])) return next();
  return res
    .status(403)
    .json({
      error: "This operation is outside your Inventory Officer permissions.",
    });
};
module.exports = { inventoryBoundary };
