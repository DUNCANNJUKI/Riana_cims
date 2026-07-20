const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const SENSITIVE_KEY_PATTERN = /(password|passcode|token|secret|api[_-]?key|authorization|cookie|otp|code_hash|refresh|jwt|session|card|cvv|pin|private[_-]?key)/i;

const sanitizeAuditData = (value, depth = 0) => {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '[Truncated]';
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeAuditData(item, depth + 1));
  if (typeof value !== 'object') {
    if (typeof value === 'string' && value.length > 1000) return `${value.slice(0, 1000)}...`;
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : sanitizeAuditData(item, depth + 1),
  ]));
};

const safeJson = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return JSON.stringify(value.slice(0, 4000));
  try { return JSON.stringify(sanitizeAuditData(value)); } catch { return null; }
};

const getRequestMetadata = (req) => ({
  ip_address: req?.ip || req?.headers?.['x-forwarded-for']?.split(',')?.[0]?.trim() || null,
  user_agent: req?.headers?.['user-agent'] || null,
  route: req?.originalUrl || req?.url || null,
  http_method: req?.method || null,
  request_id: req?.id || req?.headers?.['x-request-id'] || uuidv4(),
  session_id: req?.user?.sv === undefined ? null : `sv:${req.user.sv}`,
});

const summarizeDevice = (userAgent = '') => {
  const source = String(userAgent || '');
  if (!source) return null;
  const browser = source.includes('Edg/') ? 'Edge'
    : source.includes('Chrome/') ? 'Chrome'
      : source.includes('Firefox/') ? 'Firefox'
        : source.includes('Safari/') ? 'Safari'
          : 'Browser';
  const os = source.includes('Windows') ? 'Windows'
    : source.includes('Android') ? 'Android'
      : source.includes('iPhone') || source.includes('iPad') ? 'iOS'
        : source.includes('Mac OS') ? 'macOS'
          : source.includes('Linux') ? 'Linux'
            : 'Unknown OS';
  return `${browser} on ${os}`;
};

const createIntegrityHash = (event) => crypto
  .createHash('sha256')
  .update(JSON.stringify({
    event_uuid: event.event_uuid,
    user_id: event.user_id || null,
    action: event.action,
    module: event.module,
    entity_type: event.entity_type || null,
    entity_id: event.entity_id || null,
    status: event.status,
  }))
  .digest('hex');

const logAuditEvent = async (poolOrConnection, req, event = {}) => {
  const metadata = getRequestMetadata(req);
  const row = {
    id: uuidv4(),
    event_uuid: event.event_uuid || uuidv4(),
    user_id: event.user_id === undefined ? req?.user?.id || null : event.user_id,
    impersonator_user_id: event.impersonator_user_id || null,
    action: String(event.action || 'unknown').slice(0, 120),
    category: String(event.category || 'system').slice(0, 60),
    module: String(event.module || 'CIMS').slice(0, 80),
    entity_type: event.entity_type ? String(event.entity_type).slice(0, 80) : null,
    entity_id: event.entity_id ? String(event.entity_id).slice(0, 100) : null,
    description: event.description ? String(event.description).slice(0, 1000) : null,
    old_values: safeJson(event.old_values),
    new_values: safeJson(event.new_values),
    metadata: safeJson(event.metadata),
    ip_address: event.ip_address || metadata.ip_address,
    user_agent: event.user_agent || metadata.user_agent,
    device: event.device || summarizeDevice(metadata.user_agent),
    session_id: event.session_id || metadata.session_id,
    request_id: event.request_id || metadata.request_id,
    route: event.route || metadata.route,
    http_method: event.http_method || metadata.http_method,
    status: ['success', 'failure', 'denied'].includes(event.status) ? event.status : 'success',
    severity: ['info', 'notice', 'warning', 'critical'].includes(event.severity) ? event.severity : 'info',
  };
  row.integrity_hash = createIntegrityHash(row);

  await poolOrConnection.query(
    `INSERT INTO audit_logs
     (id,event_uuid,user_id,impersonator_user_id,action,category,module,entity_type,entity_id,description,
      old_values,new_values,metadata,ip_address,user_agent,device,session_id,request_id,route,http_method,status,severity,integrity_hash)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      row.id, row.event_uuid, row.user_id, row.impersonator_user_id, row.action, row.category, row.module,
      row.entity_type, row.entity_id, row.description, row.old_values, row.new_values, row.metadata,
      row.ip_address, row.user_agent, row.device, row.session_id, row.request_id, row.route,
      row.http_method, row.status, row.severity, row.integrity_hash,
    ],
  );
  return row;
};

const logSuccess = (poolOrConnection, req, event) => logAuditEvent(poolOrConnection, req, { ...event, status: 'success' });
const logFailure = (poolOrConnection, req, event) => logAuditEvent(poolOrConnection, req, { ...event, status: 'failure' });
const logDenied = (poolOrConnection, req, event) => logAuditEvent(poolOrConnection, req, { ...event, status: 'denied', severity: event?.severity || 'warning' });

module.exports = {
  getRequestMetadata,
  logAuditEvent,
  logDenied,
  logFailure,
  logSuccess,
  sanitizeAuditData,
};
