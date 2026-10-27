const DEFAULT_MAINTENANCE_MESSAGE = 'RIANA CIMS is temporarily unavailable while scheduled maintenance is in progress.';
const CACHE_TTL_MS = 5000;

let cachedState = null;
let cachedAt = 0;

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 1 || value === '1' || /^true$/i.test(String(value));
};

const normalizeMaintenanceState = (row = {}) => {
  const enabled = toBoolean(row.maintenance_enabled, false);
  return {
    enabled,
    reason: row.maintenance_reason || '',
    message: row.maintenance_message || DEFAULT_MAINTENANCE_MESSAGE,
    estimated_completion: row.estimated_completion || null,
    enabled_by: row.maintenance_enabled_by || null,
    enabled_by_name: row.enabled_by_name || null,
    enabled_at: row.maintenance_enabled_at || null,
    disabled_by: row.maintenance_disabled_by || null,
    disabled_at: row.maintenance_disabled_at || null,
    allow_api_access: toBoolean(row.maintenance_allow_api_access, false),
    force_logout: toBoolean(row.maintenance_force_logout, true),
    notify_users: toBoolean(row.maintenance_notify_users, false),
    backup_before_enable: toBoolean(row.maintenance_backup_before_enable, true),
    allow_super_admin_only: toBoolean(row.maintenance_allow_super_admin_only, true),
  };
};

const getMaintenanceState = async (pool, { force = false } = {}) => {
  const now = Date.now();
  if (!force && cachedState && now - cachedAt < CACHE_TTL_MS) return cachedState;

  const [rows] = await pool.query(`
    SELECT cs.*,
      TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) AS enabled_by_full_name,
      u.email AS enabled_by_email
    FROM company_settings cs
    LEFT JOIN user_profiles u ON u.id = cs.maintenance_enabled_by
    LIMIT 1
  `);
  const row = rows[0] || {};
  cachedState = normalizeMaintenanceState({
    ...row,
    enabled_by_name: row.enabled_by_full_name || row.enabled_by_email || null,
  });
  cachedAt = now;
  return cachedState;
};

const invalidateMaintenanceCache = () => {
  cachedState = null;
  cachedAt = 0;
};

const maintenanceResponse = (state) => ({
  success: false,
  code: 'MAINTENANCE_MODE',
  message: 'System is currently under maintenance.',
  maintenance: state,
});

const isMaintenanceExemptApiPath = (req) => {
  if (req.method === 'GET' && req.path === '/health') return true;
  if (req.method === 'GET' && req.path === '/maintenance/status') return true;
  if (req.method === 'GET' && req.path === '/public/company-branding') return true;
  if (req.method === 'POST' && /^\/auth\/(login|verify-2fa|forgot-password|reset-password)$/.test(req.path)) return true;
  return false;
};

const createMaintenanceMiddleware = ({ pool }) => async (req, res, next) => {
  try {
    if (isMaintenanceExemptApiPath(req)) return next();
    const state = await getMaintenanceState(pool);
    if (!state.enabled) return next();
    if (req.user?.role === 'SuperAdmin') return next();
    if (state.allow_api_access) return next();
    res.setHeader('Retry-After', '60');
    return res.status(503).json(maintenanceResponse(state));
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  DEFAULT_MAINTENANCE_MESSAGE,
  createMaintenanceMiddleware,
  getMaintenanceState,
  invalidateMaintenanceCache,
  maintenanceResponse,
};
