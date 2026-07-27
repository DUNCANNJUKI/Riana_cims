const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const fs = require('fs');
const fsp = require('fs/promises');
const jwt = require('jsonwebtoken');
const createCrmsRouter = require('./routes/crms');
const createFilesRouter = require('./routes/files');
const { createChallenge, verifyChallenge } = require('./utils/twoFactor');
const { normalizePhone, sendEmail, sendSms, sendWelcomeCredentials, sendWhatsApp, smtpStatus, verifySmtpConnection, whatsappConfigured, whatsappStatus, smsStatus } = require('./services/notifications');
const { sendUserNotification, sendUsersNotification } = require('./services/notificationDispatcher');
const { logAuditEvent, logDenied, logFailure, logSuccess, sanitizeAuditData } = require('./services/auditService');
const { normalizeEquipmentConfigurationPayload } = require('./services/subsidiaryEquipment');
const { isSensitiveTechnicalRequest } = require('./services/chatbotPolicy');
const { getAssistantResponse } = require('./services/chatbotKnowledge');
const { createDatabaseBackup, listBackups, pruneBackups, getLastRun } = require('./services/databaseBackup');
const {
  createMaintenanceMiddleware,
  getMaintenanceState,
  invalidateMaintenanceCache,
  maintenanceResponse,
} = require('./services/maintenanceMode');
const { createFileAccessToken, ensurePrivateUploadRoot, getPrivateFileConfig, readFileAccessToken } = require('./services/privateFileStorage');
const { hashPassword, verifyPassword, verifyAndUpgradePassword } = require('./security/passwords');
const { createSingleActiveSession, revokeCurrentSession, revokeUserSessions, sessionAuditRef } = require('./security/sessionStore');
const {
  CAPABILITY_DEFINITIONS,
  getEffectiveCapabilities,
  hasCapability,
  normalizePermissions,
  requireAnyCapability,
  requireCapability,
} = require('./security/accessControl');
const {
  auditSecurityEvent,
  buildCorsOptions,
  canonicalAppUrl,
  createGlobalApiPolicy,
  createSensitiveRateLimiter,
  createSessionAuthenticator,
  parseCookies,
  requireRole,
  resolveJwtSecret,
  resolveStoredFile,
  safeUpload,
  securityHeaders,
} = require('./security/apiSecurity');

const app = express();
const port = process.env.PORT || process.env.VITE_API_PORT || 3001;
const JWT_SECRET = resolveJwtSecret();
const CIMS_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const privateFileConfig = getPrivateFileConfig();
const configuredCallRingTimeout = Number(process.env.CHAT_CALL_RING_TIMEOUT_SECONDS || 45);
const CHAT_CALL_RING_TIMEOUT_SECONDS = Number.isFinite(configuredCallRingTimeout)
  ? Math.max(15, Math.min(300, Math.round(configuredCallRingTimeout)))
  : 45;
const CHAT_MISSED_CALL_LOOKBACK_DAYS = 14;

const normalizedScore = (value, minimum, maximum, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const score = Number(value);
  return Number.isFinite(score) && score >= minimum && score <= maximum ? score : fallback;
};
const normalizeFeedbackResponses = (dynamicResponses) => (
  dynamicResponses && typeof dynamicResponses === 'object' && !Array.isArray(dynamicResponses)
    ? dynamicResponses
    : {}
);
const textFeedbackFromResponses = (dynamicResponses) => Object.values(normalizeFeedbackResponses(dynamicResponses))
  .filter((value) => typeof value === 'string')
  .map((value) => value.trim())
  .filter(Boolean);
const slugifyFeedbackClientName = (value) => {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'client';
};
const buildFeedbackUrl = (req, feedback) => {
  const baseUrl = canonicalAppUrl(req).replace(/\/+$/, '');
  return `${baseUrl}/feedback/${encodeURIComponent(slugifyFeedbackClientName(feedback.client_name))}/${encodeURIComponent(feedback.unique_token)}`;
};
const MAIN_SCOPE_LABEL = 'MAIN';
const scopeCount = (value) => {
  const count = Number(value);
  return Number.isFinite(count) ? count : null;
};
const cleanScopeLabel = (value) => {
  const label = String(value || '').trim();
  if (!label) return '';
  return /^(main|main branch|primary|primary branch)$/i.test(label) ? MAIN_SCOPE_LABEL : label;
};
const scopedBranchLabel = (row = {}) => {
  const count = scopeCount(row.branch_count);
  if (count !== null && count <= 1) return MAIN_SCOPE_LABEL;
  return cleanScopeLabel(row.branch_name || row.branch || row.client_branch) || MAIN_SCOPE_LABEL;
};
const scopedDepartmentLabel = (row = {}) => {
  const count = scopeCount(row.department_count);
  if (count !== null && count <= 1) return MAIN_SCOPE_LABEL;
  return cleanScopeLabel(row.department_name) || MAIN_SCOPE_LABEL;
};
const scopedLabel = (row = {}) => {
  const branch = scopedBranchLabel(row);
  const department = scopedDepartmentLabel(row);
  return branch === department ? branch : `${branch} / ${department}`;
};
const scopedClientLabel = (row = {}) => {
  const clientName = row.client_name || 'Client';
  const scope = scopedLabel(row);
  return scope ? `${clientName} - ${scope}` : clientName;
};
const buildFeedbackLinkPreview = (req, feedback) => {
  const recipientName = feedback.contact_person_name || feedback.client_name || 'Client';
  const feedbackUrl = buildFeedbackUrl(req, feedback);
  const clientLabel = scopedClientLabel(feedback);
  return {
    recipient_name: recipientName,
    recipient_email: feedback.contact_email || '',
    recipient_phone: feedback.contact_phone || '',
    can_send_email: Boolean(feedback.contact_email),
    can_send_sms: Boolean(feedback.contact_phone),
    feedback_url: feedbackUrl,
    client_slug: slugifyFeedbackClientName(feedback.client_name),
    client_label: clientLabel,
    branch_label: scopedBranchLabel(feedback),
    department_label: scopedDepartmentLabel(feedback),
    message: `Hello ${recipientName}, please rate your installation experience for ${clientLabel}. Your secure one-time feedback link is ${feedbackUrl}`,
  };
};
const normalizeFeedbackExpiryDays = (value) => {
  const days = Number(value);
  if (!Number.isFinite(days)) return null;
  return Math.max(1, Math.min(180, Math.round(days)));
};
const resolveFeedbackExpiresAt = (data = {}) => {
  const expiryDays = normalizeFeedbackExpiryDays(data.expiry_days ?? data.expires_in_days ?? data.link_expiry_days);
  if (expiryDays) return new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  const requestedExpiry = new Date(data.expires_at);
  if (Number.isFinite(requestedExpiry.getTime()) && requestedExpiry.getTime() > Date.now()) return requestedExpiry;

  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
};

const normalizeEscalationMatrixPayload = (value, allowExtraTiers) => {
  if (value === null || value === undefined || value === '') return null;
  const source = typeof value === 'string' ? JSON.parse(value) : value;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Escalation matrix must be an object.');
  const entries = Object.entries(source);
  if (entries.length > 10) throw new Error('Escalation matrix cannot exceed 10 tiers.');
  const normalized = {};
  for (const [key, tier] of entries) {
    const match = /^tier([1-9]|10)$/.exec(key);
    if (!match || !tier || typeof tier !== 'object' || Array.isArray(tier)) throw new Error('Escalation matrix contains an invalid tier.');
    if (Number(match[1]) > 3 && !allowExtraTiers) throw new Error('Only SuperAdmin can add escalation tiers above tier 3.');
    normalized[key] = {
      name: String(tier.name || '').trim().slice(0, 100),
      role: String(tier.role || '').trim().slice(0, 100),
      phone_number: String(tier.phone_number || '').trim().slice(0, 20),
      email: String(tier.email || '').trim().slice(0, 254),
    };
  }
  return normalized;
};

const allowedEntries = (body, allowedFields) => Object.entries(body || {}).filter(([key]) => allowedFields.has(key));
const sqlValue = (value) => typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
const maskPhoneNumber = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length <= 4) return raw.replace(/.(?=.)/g, '*');
  const visible = digits.slice(-4);
  const prefix = raw.startsWith('+') ? '+' : '';
  return `${prefix}${'*'.repeat(Math.max(digits.length - 4, 4))}${visible}`;
};
const maskEmailAddress = (value) => {
  const raw = String(value || '').trim();
  if (!raw || !raw.includes('@')) return raw ? '***' : '';
  const [localPart, domain] = raw.split('@');
  const visibleLocal = localPart.slice(0, 1);
  return `${visibleLocal || '*'}***@${domain}`;
};
const normalizeRevealField = (field) => ({
  contact_person_phone: 'contact_phone',
  contact_person_email: 'contact_email',
}[field] || field);
const attachClientContactAliases = (row, { includeSensitive = false } = {}) => {
  const contactPhone = row.contact_phone || row.contact_person_phone || '';
  const contactEmail = row.contact_email || row.contact_person_email || '';
  const client = { ...row };

  if (!includeSensitive) {
    delete client.contact_phone;
    delete client.contact_email;
  }

  return {
    ...client,
    contact_person_phone: includeSensitive ? contactPhone : '',
    contact_person_email: includeSensitive ? contactEmail : '',
    contact_phone_masked: maskPhoneNumber(contactPhone),
    contact_email_masked: maskEmailAddress(contactEmail),
    contact_person_phone_masked: maskPhoneNumber(contactPhone),
    contact_person_email_masked: maskEmailAddress(contactEmail),
  };
};
const normalizeClientPayload = (body = {}) => {
  const normalized = { ...body };
  if (Object.prototype.hasOwnProperty.call(normalized, 'contact_person_phone') && !Object.prototype.hasOwnProperty.call(normalized, 'contact_phone')) {
    normalized.contact_phone = normalized.contact_person_phone;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'contact_person_email') && !Object.prototype.hasOwnProperty.call(normalized, 'contact_email')) {
    normalized.contact_email = normalized.contact_person_email;
  }
  delete normalized.contact_person_phone;
  delete normalized.contact_person_email;
  return normalized;
};
const CLIENT_FIELDS = new Set(['client_name','industry_classification','current_vendor','tags','contact_person_name','contact_person_department','contact_email','contact_phone','account_manager_id','subsidiary_id','department_id','branch','start_date','contract_type']);
const INSTALLATION_FIELDS = new Set(['client_id','branch_id','department_id','kiosk_type','kiosk_count','counter_count','counter_names','led_count','led_names','service_points','ups_count','speakers','screen_with_size','screen_count','media_controllers','tablets','digital_signage_system','staff_trained','amplifiers','hdmis','splitters','handover_file_path','handover_status','account_manager_id','assigned_technician_id','hardware_technician_id','software_technician_id','status','remarks','assigned_date','completion_date','scheduled_end_date','extension_reason','escalation_matrix','waiting_reason']);
const ASSIGNMENT_FIELDS = new Set(['client_id','branch_id','department_id','installation_id','hardware_technician_id','software_technician_id','installation_start_date','scheduled_end_date','status','progress_percentage','notes','branch']);
const ASSIGNMENT_SELF_UPDATE_FIELDS = new Set(['status','progress_percentage','notes']);
const ASSIGNMENT_STATUSES = new Set(['assigned','waiting','in_progress','completed']);
const SUBSIDIARY_FIELDS = new Set(['subsidiary_name','default_escalation_matrix','equipment_configuration']);
const FEEDBACK_LINK_FIELDS = new Set(['client_id','installation_id','branch_id','department_id','expires_at','is_used']);
const COMPANY_FIELDS = new Set(['name','logo_path','tagline','website','email','phone','address','contract_types','contract_durations','font_color','primary_color','secondary_color','accent_color','font_type','timezone','date_format','enable_email_notifications','enable_sms_notifications','enable_push_notifications','auto_reminder_days','backup_schedule','backup_day','backup_time','maintenance_enabled','maintenance_reason','maintenance_message','estimated_completion','maintenance_enabled_by','maintenance_enabled_at','maintenance_disabled_by','maintenance_disabled_at','maintenance_allow_api_access','maintenance_force_logout','maintenance_notify_users','maintenance_backup_before_enable','maintenance_allow_super_admin_only']);
const COMPANY_MAINTENANCE_COLUMNS = [
  ['maintenance_enabled', 'BOOLEAN NOT NULL DEFAULT FALSE'],
  ['maintenance_reason', 'VARCHAR(255) NULL'],
  ['maintenance_message', 'TEXT NULL'],
  ['estimated_completion', 'DATETIME NULL'],
  ['maintenance_enabled_by', 'VARCHAR(36) NULL'],
  ['maintenance_enabled_at', 'DATETIME NULL'],
  ['maintenance_disabled_by', 'VARCHAR(36) NULL'],
  ['maintenance_disabled_at', 'DATETIME NULL'],
  ['maintenance_allow_api_access', 'BOOLEAN NOT NULL DEFAULT FALSE'],
  ['maintenance_force_logout', 'BOOLEAN NOT NULL DEFAULT TRUE'],
  ['maintenance_notify_users', 'BOOLEAN NOT NULL DEFAULT FALSE'],
  ['maintenance_backup_before_enable', 'BOOLEAN NOT NULL DEFAULT TRUE'],
  ['maintenance_allow_super_admin_only', 'BOOLEAN NOT NULL DEFAULT TRUE'],
];

const ensureCompanyMaintenanceColumns = async () => {
  const [columns] = await pool.query('SHOW COLUMNS FROM company_settings');
  const existing = new Set(columns.map((column) => column.Field));
  for (const [column, definition] of COMPANY_MAINTENANCE_COLUMNS) {
    if (!existing.has(column)) {
      await pool.query(`ALTER TABLE company_settings ADD COLUMN ${column} ${definition}`);
      existing.add(column);
    }
  }
};
const SYSTEM_ROLES = new Set(['SuperAdmin', 'Admin', 'Management', 'Finance', 'Developer', 'Teamlead', 'Sales', 'User']);
const PRIVILEGED_ROLES = new Set(['SuperAdmin', 'Admin', 'Management']);
const CRMS_ACCESS_ROLES = new Set(['SuperAdmin', 'Admin', 'Management', 'Teamlead', 'Developer', 'Sales']);
const isSuperAdmin = (req) => req.user?.role === 'SuperAdmin';
const isAdminOrSuperAdmin = (req) => ['SuperAdmin', 'Admin', 'Management'].includes(req.user?.role);
const userCanManageTargetRole = (req, targetRole) => isSuperAdmin(req) || !PRIVILEGED_ROLES.has(targetRole);
const CHAT_REACTION_TYPES = new Set(['like', 'love', 'laugh', 'wow', 'sad', 'angry']);
const MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MINUTES = Number(process.env.MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MINUTES || 1440);
const USER_MODULE_ROLES_SQL = `
  COALESCE((
    SELECT GROUP_CONCAT(CONCAT(umr.module_id, ':', r.code) SEPARATOR ',')
    FROM user_module_roles umr
    JOIN roles r ON r.id = umr.role_id
    WHERE umr.user_id = u.id
  ), '') AS module_roles
`;
const USER_PERMISSIONS_SQL = `
  COALESCE((
    SELECT GROUP_CONCAT(up.permission_id ORDER BY up.permission_id SEPARATOR ',')
    FROM user_permissions up
    WHERE up.user_id = u.id
  ), '') AS extra_permissions
`;

const withEffectivePermissions = (user) => ({
  ...user,
  extra_permissions: normalizePermissions(user.extra_permissions),
  permissions: getEffectiveCapabilities(user.role, user.extra_permissions),
});

const normalizeModuleRoles = (moduleRoles) => {
  if (!moduleRoles) return {};
  if (typeof moduleRoles === 'string') {
    if (!moduleRoles.trim()) return {};
    if (moduleRoles.trim().startsWith('{')) {
      try { return JSON.parse(moduleRoles) || {}; } catch { return {}; }
    }
    return moduleRoles.split(',').reduce((roles, assignment) => {
      const [moduleId, roleCode] = assignment.split(':');
      if (moduleId && roleCode) roles[moduleId] = roleCode;
      return roles;
    }, {});
  }
  return typeof moduleRoles === 'object' ? moduleRoles : {};
};

const applyModuleRoleAssignments = async ({ userId, moduleRoles, grantedBy }) => {
  const normalized = normalizeModuleRoles(moduleRoles);
  for (const [moduleId, roleCode] of Object.entries(normalized)) {
    if (!['cims', 'crms'].includes(moduleId)) {
      throw new Error(`Unsupported module role target: ${moduleId}`);
    }

    const cleanRole = roleCode === null || roleCode === undefined || roleCode === '' || roleCode === 'none'
      ? null
      : String(roleCode);

    if (!cleanRole) {
      await pool.query('DELETE FROM user_module_roles WHERE user_id = ? AND module_id = ?', [userId, moduleId]);
      continue;
    }

    const allowedRoles = moduleId === 'crms' ? CRMS_ACCESS_ROLES : SYSTEM_ROLES;
    if (!allowedRoles.has(cleanRole)) {
      throw new Error(`Invalid ${moduleId.toUpperCase()} module role.`);
    }

    await pool.query(
      `INSERT INTO user_module_roles (user_id,module_id,role_id,granted_by) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE role_id=VALUES(role_id),granted_by=VALUES(granted_by),granted_at=CURRENT_TIMESTAMP`,
      [userId, moduleId, `${moduleId}:${cleanRole}`, grantedBy || null],
    );
  }
  await pool.query('UPDATE user_profiles SET session_version=session_version+1 WHERE id=?', [userId]);
  await revokeUserSessions(pool, userId, 'ROLE_CHANGED');
};

const superAdminBootstrapEmail = () => String(process.env.SUPERADMIN_EMAIL || 'superadmin@riana.co').trim().toLowerCase();

const repairSuperAdminAccounts = async () => {
  const bootstrapEmail = superAdminBootstrapEmail();
  const [rows] = await pool.query(
    `SELECT id,email,role,designation,is_active
     FROM user_profiles
     WHERE LOWER(email)=LOWER(?) OR LOWER(COALESCE(designation,''))='superadmin' OR role='SuperAdmin'`,
    [bootstrapEmail],
  );
  let repaired = 0;

  for (const row of rows) {
    const assignments = [];
    const intendedBootstrapAccount = String(row.email || '').toLowerCase() === bootstrapEmail
      || String(row.designation || '').toLowerCase() === 'superadmin';

    if (row.role !== 'SuperAdmin') assignments.push("role='SuperAdmin'");
    if (intendedBootstrapAccount && row.designation !== 'SuperAdmin') assignments.push("designation='SuperAdmin'");
    if (intendedBootstrapAccount && !row.is_active) assignments.push('is_active=TRUE');
    if (!assignments.length) continue;

    await pool.query(
      `UPDATE user_profiles SET ${assignments.join(', ')}, session_version=session_version+1 WHERE id=?`,
      [row.id],
    );
    repaired += 1;
  }

  return repaired;
};

const authMiddleware = createSessionAuthenticator({ pool, jwtSecret: JWT_SECRET });

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const normalizeStoredFileReference = (reference) => {
  const raw = String(reference || '').replace(/\\/g, '/').trim();
  if (!raw || raw.includes('\0') || raw.includes('..')) return '';
  const parts = raw.split('/').filter(Boolean);
  const filename = parts.length === 1
    ? parts[0]
    : (parts.length === 2 && parts[0] === 'uploads' ? parts[1] : '');
  if (!filename || filename !== path.basename(filename)) return '';
  return filename;
};

const CHAT_ATTACHMENT_TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const safeChatAttachmentUpload = ({ fileName, base64Data, maxBytes = 10 * 1024 * 1024 }) => {
  const extension = path.extname(String(fileName || '')).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(CHAT_ATTACHMENT_TYPES, extension)) {
    throw Object.assign(new Error('Only PDF, image, text, CSV, and Office document attachments are allowed.'), { status: 400 });
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(String(base64Data || ''))) {
    throw Object.assign(new Error('Invalid base64 file data.'), { status: 400 });
  }
  const buffer = Buffer.from(base64Data, 'base64');
  if (!buffer.length || buffer.length > maxBytes) {
    throw Object.assign(new Error('Attachment must be between 1 byte and 10 MB.'), { status: 413 });
  }
  const zipBased = ['.docx', '.xlsx', '.pptx'];
  const signatures = {
    '.pdf': (b) => b.subarray(0, 5).toString() === '%PDF-',
    '.png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),
    '.jpg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9,
    '.jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9,
    '.webp': (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
    '.txt': (b) => !b.includes(0x00),
    '.csv': (b) => !b.includes(0x00),
  };
  const matchesSignature = zipBased.includes(extension)
    ? buffer.subarray(0, 2).toString() === 'PK'
    : signatures[extension]?.(buffer);
  if (!matchesSignature) {
    throw Object.assign(new Error('Attachment content does not match its extension.'), { status: 400 });
  }
  return {
    buffer,
    storedName: `${crypto.randomUUID()}${extension}`,
    extension,
    contentType: CHAT_ATTACHMENT_TYPES[extension],
  };
};

const LOGO_CONTENT_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
const bundledLogoCandidates = (logoPath = '/Riana_logo.png') => {
  const relativeLogoPath = String(logoPath || '/Riana_logo.png').replace(/^\/+/, '');
  return [
    path.join(__dirname, '../public', relativeLogoPath),
    path.join(__dirname, '../dist', relativeLogoPath),
    path.join(__dirname, '../client/dist', relativeLogoPath),
  ];
};
const attachLogoFile = async (branding, filePath, filename = path.basename(filePath)) => {
  const extension = path.extname(filename).toLowerCase();
  if (!LOGO_CONTENT_TYPES[extension] || !fs.existsSync(filePath)) return false;
  try {
    branding.logoContent = await fsp.readFile(filePath);
    branding.logoFilename = filename;
    branding.logoContentType = LOGO_CONTENT_TYPES[extension];
    return true;
  } catch {
    return false;
  }
};
const attachFirstAvailableLogo = async (branding, candidates) => {
  for (const candidate of candidates) {
    if (await attachLogoFile(branding, candidate)) return true;
  }
  return false;
};

const notificationBranding = async (loginUrl) => {
  const [rows] = await pool.query(
    'SELECT name,logo_path,primary_color,secondary_color,font_type FROM company_settings ORDER BY id LIMIT 1',
  );
  const settings = rows[0] || {};
  const logoPath = String(settings.logo_path || '/Riana_logo.png').trim();
  const branding = {
    name: settings.name || 'RIANA CIMS',
    primaryColor: settings.primary_color || '#0D8390',
    secondaryColor: settings.secondary_color || '#2563EB',
    fontFamily: settings.font_type || 'Arial',
  };

  if (/^https?:\/\//i.test(logoPath)) {
    branding.logoUrl = logoPath;
    return branding;
  }
  if (logoPath.startsWith('/')) {
    branding.logoUrl = new URL(logoPath, loginUrl).toString();
    await attachFirstAvailableLogo(branding, bundledLogoCandidates(logoPath));
    return branding;
  }

  const filename = normalizeStoredFileReference(logoPath);
  const resolved = filename && resolveStoredFile(uploadsDir, filename);
  if (!resolved || !(await attachLogoFile(branding, resolved, filename))) {
    await attachFirstAvailableLogo(branding, bundledLogoCandidates());
  }
  return branding;
};

const legacyFileAccessUrls = (filePath) => {
  const filename = normalizeStoredFileReference(filePath);
  if (!filename) return { secure_preview_url: null, secure_download_url: null };
  const previewToken = createFileAccessToken({ legacyUploadPath: filename, disposition: 'inline' });
  const downloadToken = createFileAccessToken({ legacyUploadPath: filename, disposition: 'attachment' });
  return {
    secure_preview_url: `/api/download?token=${encodeURIComponent(previewToken)}&disposition=inline`,
    secure_download_url: `/api/download?token=${encodeURIComponent(downloadToken)}`,
  };
};

const legacyFileAvailability = (filePath) => {
  const filename = normalizeStoredFileReference(filePath);
  const resolved = filename && resolveStoredFile(uploadsDir, filename);
  return {
    filename,
    available: Boolean(resolved && fs.existsSync(resolved)),
  };
};

const attachSecureHandoverUrls = (row) => {
  const availability = legacyFileAvailability(row.file_path);
  return {
    ...row,
    ...legacyFileAccessUrls(row.file_path),
    file_available: availability.available,
    file_path_label: path.basename(availability.filename || row.file_name || 'document'),
  };
};

const resolveLegacyDownloadFilename = (req) => {
  if (req.query.token) {
    const payload = readFileAccessToken(req.query.token);
    return normalizeStoredFileReference(payload.legacyUploadPath);
  }
  return normalizeStoredFileReference(req.query.path);
};

const normalizeNullableId = (value) => {
  const normalized = String(value || '').trim();
  return normalized || null;
};

const validateClientBranchDepartment = async ({ clientId, branchId, departmentId, allowInactive = false }) => {
  const normalizedClientId = normalizeNullableId(clientId);
  const normalizedBranchId = normalizeNullableId(branchId);
  const normalizedDepartmentId = normalizeNullableId(departmentId);
  if (!normalizedClientId) throw Object.assign(new Error('client_id is required.'), { status: 400 });
  const [clients] = await pool.query('SELECT id FROM clients WHERE id = ? LIMIT 1', [normalizedClientId]);
  if (!clients.length) throw Object.assign(new Error('Client not found.'), { status: 404 });
  if (normalizedBranchId) {
    const [branches] = await pool.query('SELECT id,client_id,status,deleted_at FROM client_branches WHERE id = ? LIMIT 1', [normalizedBranchId]);
    const branch = branches[0];
    if (!branch || String(branch.client_id) !== String(normalizedClientId) || (!allowInactive && (branch.deleted_at || branch.status !== 'active'))) {
      throw Object.assign(new Error('Selected branch does not belong to this active client.'), { status: 400 });
    }
  }
  if (normalizedDepartmentId) {
    const [departments] = await pool.query('SELECT id,client_id,branch_id,status,deleted_at FROM client_departments WHERE id = ? LIMIT 1', [normalizedDepartmentId]);
    const department = departments[0];
    if (!department || String(department.client_id) !== String(normalizedClientId) || (!allowInactive && (department.deleted_at || department.status !== 'active'))) {
      throw Object.assign(new Error('Selected department does not belong to this active client.'), { status: 400 });
    }
    if (normalizedBranchId && String(department.branch_id) !== String(normalizedBranchId)) {
      throw Object.assign(new Error('Selected department does not belong to the selected branch.'), { status: 400 });
    }
  }
  return { clientId: normalizedClientId, branchId: normalizedBranchId, departmentId: normalizedDepartmentId };
};
const storedFileIsRegistered = async (filename) => {
  const safeFilename = normalizeStoredFileReference(filename);
  if (!safeFilename) return false;
  const compatiblePaths = [safeFilename, `uploads/${safeFilename}`, `/uploads/${safeFilename}`];
  const [handoverRows] = await pool.query('SELECT id FROM handover_uploads WHERE file_path IN (?, ?, ?) LIMIT 1', compatiblePaths);
  if (handoverRows.length) return true;
  const [companyRows] = await pool.query('SELECT id FROM company_settings WHERE logo_path IN (?, ?, ?) LIMIT 1', compatiblePaths);
  if (companyRows.length) return true;
  const [avatarRows] = await pool.query('SELECT id FROM user_profiles WHERE avatar_url IN (?, ?, ?) LIMIT 1', compatiblePaths);
  return avatarRows.length > 0;
};

const authorizeStoredFile = async (req, res, next) => {
  try {
    const filename = path.basename(String(req.path || '').replace(/^\/+/, ''));
    const resolved = resolveStoredFile(uploadsDir, filename);
    if (!resolved || !fs.existsSync(resolved) || !(await storedFileIsRegistered(filename))) {
      return res.status(404).json({ error: 'File not found.' });
    }
    req.storedFile = { filename, resolved };
    req.url = `/${encodeURIComponent(filename)}`;
    next();
  } catch {
    res.status(500).json({ error: 'Unable to authorize file access.' });
  }
};

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(securityHeaders);
// CORS is an API boundary. Applying it to same-origin hashed assets can reject
// legitimate browser resource requests when production and test hostnames differ.
app.use('/api', cors((req, callback) => callback(null, buildCorsOptions(process.env, req))));
app.use(express.json({ limit: '15mb' }));
app.use(createSensitiveRateLimiter({ limit: Number(process.env.SENSITIVE_RATE_LIMIT || 120), windowMs: Number(process.env.SENSITIVE_RATE_WINDOW_MS || 60 * 1000) }));
app.use('/api', createGlobalApiPolicy(authMiddleware));
app.use('/api', createMaintenanceMiddleware({ pool }));
app.use('/uploads', authMiddleware, authorizeStoredFile, express.static(uploadsDir, {
  fallthrough: false,
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (path.extname(filePath).toLowerCase() === '.pdf') res.setHeader('Content-Disposition', 'attachment');
  },
}));
app.use('/api/crms', createCrmsRouter({ pool, jwtSecret: JWT_SECRET }));
app.use('/api/files', createFilesRouter({ pool, config: privateFileConfig }));

// File Upload & Handover Metadata
app.post('/api/upload', requireAnyCapability('installations.manage', 'company.manage'), async (req, res) => {
  try {
    const { fileName, base64Data, client_id, installation_id, branch_id, department_id, change_request_id, work_type, is_signed, notes, purpose } = req.body;
    if (purpose === 'company-logo' && !hasCapability(req.user, 'company.manage')) {
      return res.status(403).json({ error: 'Company branding permission is required.' });
    }
    if (purpose !== 'company-logo' && !hasCapability(req.user, 'installations.manage')) {
      return res.status(403).json({ error: 'Installation management permission is required.' });
    }
    if (!fileName || !base64Data) return res.status(400).json({ error: 'Missing file data' });
    const { buffer, storedName: finalFileName } = safeUpload({ fileName, base64Data });
    const filePath = resolveStoredFile(uploadsDir, finalFileName);
    await fsp.writeFile(filePath, buffer, { flag: 'wx', mode: 0o640 });

    if (purpose === 'company-logo') {
      await pool.query('UPDATE company_settings SET logo_path = ? WHERE id = 1', [finalFileName]);
      await auditSecurityEvent(pool, req, 'company_logo_uploaded', { fileName: finalFileName });
    }
    
    // If metadata provided, also save to DB
    let handoverId = null;
    const secureUrls = legacyFileAccessUrls(finalFileName);
    if (client_id && installation_id) {
      const [installations] = await pool.query('SELECT client_id,branch_id,department_id FROM installations WHERE id = ? LIMIT 1', [installation_id]);
      const installation = installations[0];
      if (!installation || String(installation.client_id) !== String(client_id)) {
        return res.status(400).json({ error: 'Installation does not belong to the selected client.' });
      }
      const scope = await validateClientBranchDepartment({
        clientId: client_id,
        branchId: branch_id || installation.branch_id,
        departmentId: department_id || installation.department_id,
      });
      handoverId = uuidv4();
      const versionGroupId = uuidv4();
      const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
      await pool.query(
        `INSERT INTO handover_uploads
         (id, client_id, installation_id, branch_id, department_id, work_type, change_request_id, version_group_id, version_number, is_latest_version, status, file_hash, file_name, file_path, file_size, is_signed, notes, uploaded_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, TRUE, 'uploaded', ?, ?, ?, ?, ?, ?, ?)`,
        [handoverId, client_id, installation_id, scope.branchId, scope.departmentId, work_type || 'installation', change_request_id || null, versionGroupId, fileHash, fileName, finalFileName, buffer.length, is_signed === 'true' || is_signed === true, notes || '', req.user.id]
      );
      await pool.query(
        `UPDATE installations
         SET status = 'completed', completion_date = COALESCE(completion_date, CURDATE()), handover_file_path = ?, handover_status = ?
         WHERE id = ?`,
        [finalFileName, is_signed === 'true' || is_signed === true ? 'signed' : 'uploaded', installation_id],
      );
    }
    
    res.json({ 
      success: true, 
      filePath: finalFileName,
      id: handoverId,
      file_path: finalFileName,
      file_path_label: path.basename(finalFileName),
      ...secureUrls,
      file_name: fileName,
      upload_date: new Date().toISOString()
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Upload failed.' });
  }
});


// Database Initialization
const initDb = async () => {
  try {
    // Subsidiaries
    await pool.query(`CREATE TABLE IF NOT EXISTS subsidiaries (
      id VARCHAR(36) PRIMARY KEY,
      subsidiary_name VARCHAR(50) NOT NULL UNIQUE,
      default_escalation_matrix JSON,
      equipment_configuration JSON
    )`);

    // Departments
    await pool.query(`CREATE TABLE IF NOT EXISTS departments (
      id VARCHAR(36) PRIMARY KEY,
      department_name VARCHAR(100) NOT NULL UNIQUE
    )`);

    // User Profiles
    await pool.query(`CREATE TABLE IF NOT EXISTS user_profiles (
      id VARCHAR(36) PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role ENUM('SuperAdmin', 'Admin', 'Management', 'Finance', 'Developer', 'Teamlead', 'Sales', 'User') NOT NULL,
      designation VARCHAR(100),
      department_id VARCHAR(36),
      subsidiary_id VARCHAR(36),
      phone_number VARCHAR(20),
      avatar_url VARCHAR(255),
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      first_login BOOLEAN DEFAULT TRUE,
      is_active BOOLEAN DEFAULT TRUE,
      two_factor_enabled BOOLEAN DEFAULT FALSE,
      two_factor_method ENUM('email', 'sms', 'call') DEFAULT 'email',
      two_factor_phone VARCHAR(30),
      session_version INT UNSIGNED NOT NULL DEFAULT 0,
      last_seen_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
      FOREIGN KEY (subsidiary_id) REFERENCES subsidiaries(id) ON DELETE SET NULL
    )`);

    await pool.query("ALTER TABLE user_profiles MODIFY role ENUM('SuperAdmin','Admin','Management','Finance','Developer','Teamlead','Sales','User') NOT NULL");
    await pool.query(`ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255) NULL,
      ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS two_factor_method ENUM('email','sms','call') NOT NULL DEFAULT 'email',
      ADD COLUMN IF NOT EXISTS two_factor_phone VARCHAR(30) NULL,
      ADD COLUMN IF NOT EXISTS session_version INT UNSIGNED NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP NULL`);

    await pool.query(`CREATE TABLE IF NOT EXISTS user_permissions (
      user_id VARCHAR(36) NOT NULL,
      permission_id VARCHAR(100) NOT NULL,
      granted_by VARCHAR(36),
      granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, permission_id),
      INDEX idx_user_permissions_permission (permission_id),
      CONSTRAINT fk_user_permissions_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
      CONSTRAINT fk_user_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
      CONSTRAINT fk_user_permissions_grantor FOREIGN KEY (granted_by) REFERENCES user_profiles(id) ON DELETE SET NULL
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS uploaded_files (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      tenant_id VARCHAR(36) NULL,
      organization_id VARCHAR(36) NULL,
      branch_id VARCHAR(100) NULL,
      uploaded_by VARCHAR(36) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL,
      relative_path VARCHAR(500) NOT NULL,
      mime_type VARCHAR(150) NOT NULL,
      detected_mime_type VARCHAR(150) NULL,
      extension VARCHAR(20) NULL,
      file_size BIGINT UNSIGNED NOT NULL,
      file_category VARCHAR(100) NOT NULL,
      related_entity_type VARCHAR(100) NULL,
      related_entity_id VARCHAR(64) NULL,
      visibility ENUM('private','organization','public') NOT NULL DEFAULT 'private',
      status ENUM('uploading','processing','active','failed','quarantined','deleted') NOT NULL DEFAULT 'processing',
      checksum_sha256 CHAR(64) NULL,
      image_width INT UNSIGNED NULL,
      image_height INT UNSIGNED NULL,
      original_file_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP NULL,
      deleted_by VARCHAR(36) NULL,
      deletion_reason VARCHAR(500) NULL,
      INDEX idx_file_tenant (tenant_id, id),
      INDEX idx_file_organization (organization_id, id),
      INDEX idx_file_branch (branch_id, id),
      INDEX idx_file_owner (uploaded_by),
      INDEX idx_file_entity (related_entity_type, related_entity_id),
      INDEX idx_file_status (status),
      INDEX idx_file_checksum (checksum_sha256)
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS uploaded_file_variants (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      file_id BIGINT UNSIGNED NOT NULL,
      variant_type ENUM('original','optimized','thumbnail') NOT NULL,
      stored_name VARCHAR(255) NOT NULL,
      relative_path VARCHAR(500) NOT NULL,
      mime_type VARCHAR(150) NOT NULL,
      file_size BIGINT UNSIGNED NOT NULL,
      width INT UNSIGNED NULL,
      height INT UNSIGNED NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_file_variant (file_id, variant_type),
      INDEX idx_uploaded_file_variants_file (file_id)
    )`);



    for (const capability of CAPABILITY_DEFINITIONS) {
      await pool.query(
        `INSERT INTO permissions (id,module_id,code,description) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE description=VALUES(description)`,
        [capability.code, 'cims', capability.code, capability.label],
      );
    }

    await pool.query(`
      INSERT INTO roles (id,module_id,code,name) VALUES
        ('cims:Management','cims','Management','Management'),
        ('cims:Finance','cims','Finance','Finance'),
        ('crms:Management','crms','Management','Management')
      ON DUPLICATE KEY UPDATE name=VALUES(name)
    `);
    await pool.query(`
      INSERT INTO user_module_roles (user_id,module_id,role_id)
      SELECT id,'cims',CONCAT('cims:',role) FROM user_profiles WHERE role IN ('Management','Finance')
      ON DUPLICATE KEY UPDATE role_id=VALUES(role_id)
    `);
    await pool.query(`
      INSERT INTO user_module_roles (user_id,module_id,role_id)
      SELECT id,'crms','crms:Management' FROM user_profiles WHERE role='Management'
      ON DUPLICATE KEY UPDATE role_id=VALUES(role_id)
    `);
    await pool.query(`CREATE TABLE IF NOT EXISTS auth_two_factor_challenges (
      id CHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      code_hash CHAR(64) NOT NULL,
      channel ENUM('email','sms','call') NOT NULL,
      destination VARCHAR(255) NOT NULL,
      expires_at DATETIME NOT NULL,
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      verified_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_2fa_user_active (user_id,verified_at,expires_at)
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id CHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_password_reset_active (user_id,used_at,expires_at)
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS user_sessions (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      session_id VARCHAR(128) NOT NULL UNIQUE,
      token_hash CHAR(64) NULL,
      device_name VARCHAR(255) NULL,
      browser_name VARCHAR(100) NULL,
      ip_address VARCHAR(45) NULL,
      user_agent TEXT NULL,
      created_at DATETIME NOT NULL,
      last_activity_at DATETIME NOT NULL,
      expires_at DATETIME NULL,
      revoked_at DATETIME NULL,
      revoke_reason VARCHAR(100) NULL,
      INDEX idx_user_sessions_user_id (user_id),
      INDEX idx_user_sessions_session_id (session_id),
      INDEX idx_user_sessions_active (user_id,revoked_at,expires_at),
      CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS crms_notifications (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      request_id VARCHAR(36),
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type ENUM('info','success','warning','error') NOT NULL DEFAULT 'info',
      \`read\` BOOLEAN DEFAULT FALSE,
      action_url TEXT,
      email_sent BOOLEAN DEFAULT FALSE,
      sms_sent BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_crms_notifications_user_read (user_id,\`read\`)
    )`);
    await pool.query("ALTER TABLE crms_notifications ADD COLUMN IF NOT EXISTS notification_type VARCHAR(32) NOT NULL DEFAULT 'GENERAL' AFTER type");
    await pool.query("UPDATE crms_notifications SET notification_type = 'GENERAL' WHERE notification_type IS NULL OR notification_type = ''");

    try {
      await pool.query(`ALTER TABLE company_settings
        ADD COLUMN IF NOT EXISTS maintenance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS maintenance_reason VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS maintenance_message TEXT NULL,
        ADD COLUMN IF NOT EXISTS estimated_completion DATETIME NULL,
        ADD COLUMN IF NOT EXISTS maintenance_enabled_by VARCHAR(36) NULL,
        ADD COLUMN IF NOT EXISTS maintenance_enabled_at DATETIME NULL,
        ADD COLUMN IF NOT EXISTS maintenance_disabled_by VARCHAR(36) NULL,
        ADD COLUMN IF NOT EXISTS maintenance_disabled_at DATETIME NULL,
        ADD COLUMN IF NOT EXISTS maintenance_allow_api_access BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS maintenance_force_logout BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS maintenance_notify_users BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS maintenance_backup_before_enable BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS maintenance_allow_super_admin_only BOOLEAN NOT NULL DEFAULT TRUE`);
    } catch (err) {
      console.warn('Bulk maintenance schema patch failed, falling back to per-column repair:', err.message);
    }
    await ensureCompanyMaintenanceColumns();
    await pool.query(`INSERT INTO company_settings (id, maintenance_enabled, maintenance_force_logout, maintenance_backup_before_enable, maintenance_allow_super_admin_only)
      VALUES (1, FALSE, TRUE, TRUE, TRUE)
      ON DUPLICATE KEY UPDATE id=id`);

    // Clients
    await pool.query(`CREATE TABLE IF NOT EXISTS clients (
      id VARCHAR(36) PRIMARY KEY,
      client_name VARCHAR(255) NOT NULL,
      industry_classification VARCHAR(100),
      current_vendor VARCHAR(255),
      tags JSON,
      contact_person_name VARCHAR(255),
      contact_email VARCHAR(255),
      contact_phone VARCHAR(20),
      account_manager_id VARCHAR(36),
      subsidiary_id VARCHAR(36),
      department_id VARCHAR(36),
      branch VARCHAR(100),
      added_by_user_id VARCHAR(36),
      start_date DATE,
      contract_type VARCHAR(50) DEFAULT 'AMC',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_manager_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
      FOREIGN KEY (subsidiary_id) REFERENCES subsidiaries(id) ON DELETE SET NULL,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
      FOREIGN KEY (added_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
    )`);

    // Client Branches and Departments
    await pool.query(`CREATE TABLE IF NOT EXISTS client_branches (
      id VARCHAR(36) PRIMARY KEY,
      client_id VARCHAR(36) NOT NULL,
      branch_name VARCHAR(150) NOT NULL,
      branch_code VARCHAR(60),
      contact_person_name VARCHAR(150),
      contact_email VARCHAR(255),
      contact_phone VARCHAR(30),
      physical_address TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      notes TEXT,
      created_by VARCHAR(36),
      updated_by VARCHAR(36),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP NULL,
      INDEX idx_client_branches_client_status (client_id,status),
      UNIQUE KEY uq_client_branches_name (client_id,branch_name)
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS client_departments (
      id VARCHAR(36) PRIMARY KEY,
      client_id VARCHAR(36) NOT NULL,
      branch_id VARCHAR(36) NOT NULL,
      department_name VARCHAR(150) NOT NULL,
      department_code VARCHAR(60),
      contact_person_name VARCHAR(150),
      contact_email VARCHAR(255),
      contact_phone VARCHAR(30),
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      notes TEXT,
      created_by VARCHAR(36),
      updated_by VARCHAR(36),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP NULL,
      INDEX idx_client_departments_branch_status (branch_id,status),
      INDEX idx_client_departments_client_status (client_id,status),
      UNIQUE KEY uq_client_departments_name (branch_id,department_name)
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS user_access_scopes (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      scope_type VARCHAR(40) NOT NULL DEFAULT 'all_clients',
      client_id VARCHAR(36),
      branch_id VARCHAR(36),
      department_id VARCHAR(36),
      include_future_departments BOOLEAN NOT NULL DEFAULT TRUE,
      created_by VARCHAR(36),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_access_scope (user_id,scope_type,client_id,branch_id,department_id),
      INDEX idx_user_access_scope_user (user_id)
    )`);
    // Installations
    await pool.query(`CREATE TABLE IF NOT EXISTS installations (
      id VARCHAR(36) PRIMARY KEY,
      client_id VARCHAR(36) NOT NULL,
      branch_id VARCHAR(36),
      department_id VARCHAR(36),
      branch VARCHAR(100),
      kiosk_type VARCHAR(100),
      kiosk_count INT DEFAULT 0,
      counter_count INT DEFAULT 0,
      counter_names JSON,
      led_count INT DEFAULT 0,
      led_names JSON,
      service_points INT DEFAULT 0,
      ups_count INT DEFAULT 0,
      speakers INT DEFAULT 0,
      screen_with_size VARCHAR(100),
      screen_count INT DEFAULT 0,
      media_controllers INT DEFAULT 0,
      tablets INT DEFAULT 0,
      digital_signage_system INT DEFAULT 0,
      staff_trained INT DEFAULT 0,
      amplifiers INT DEFAULT 0,
      hdmis INT DEFAULT 0,
      splitters INT DEFAULT 0,
      handover_file_path VARCHAR(512),
      handover_status VARCHAR(50) DEFAULT 'pending',
      account_manager_id VARCHAR(36),
      assigned_technician_id VARCHAR(36),
      hardware_technician_id VARCHAR(36),
      software_technician_id VARCHAR(36),
      status ENUM('pending', 'in_progress', 'completed', 'waiting') DEFAULT 'pending',
      remarks TEXT,
      assigned_date DATE,
      completion_date DATE,
      scheduled_end_date DATE,
      extension_reason TEXT,
      escalation_matrix JSON,
      waiting_reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_installations_branch_department (branch_id,department_id),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (account_manager_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_technician_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
      FOREIGN KEY (hardware_technician_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
      FOREIGN KEY (software_technician_id) REFERENCES user_profiles(id) ON DELETE SET NULL
    )`);

    await pool.query(`ALTER TABLE installations
      ADD COLUMN IF NOT EXISTS branch_id VARCHAR(36) NULL,
      ADD COLUMN IF NOT EXISTS department_id VARCHAR(36) NULL,
      ADD COLUMN IF NOT EXISTS handover_status VARCHAR(50) DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS screen_count INT DEFAULT 0`);

    // Client Assignments
    await pool.query(`CREATE TABLE IF NOT EXISTS client_assignments (
      id VARCHAR(36) PRIMARY KEY,
      client_id VARCHAR(36) NOT NULL,
      branch_id VARCHAR(36),
      department_id VARCHAR(36),
      installation_id VARCHAR(36),
      hardware_technician_id VARCHAR(36),
      software_technician_id VARCHAR(36),
      assigned_by_user_id VARCHAR(36),
      installation_start_date DATE,
      scheduled_end_date DATE,
      status ENUM('assigned', 'waiting', 'in_progress', 'completed') DEFAULT 'assigned',
      progress_percentage INT DEFAULT 0,
      notes TEXT,
      branch VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_assignment_scope (client_id,branch_id,department_id),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE SET NULL,
      FOREIGN KEY (hardware_technician_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
      FOREIGN KEY (software_technician_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
    )`);

    // Ensure scoped assignment columns exist on pre-existing databases.
    for (const [column, definition] of [
      ['branch_id', 'VARCHAR(36) NULL AFTER client_id'],
      ['department_id', 'VARCHAR(36) NULL AFTER branch_id'],
      ['installation_id', 'VARCHAR(36) NULL AFTER department_id'],
    ]) {
      try {
        const [assignmentColumns] = await pool.query('SHOW COLUMNS FROM client_assignments LIKE ?', [column]);
        if (!assignmentColumns.length) await pool.query(`ALTER TABLE client_assignments ADD COLUMN ${column} ${definition}`);
      } catch (e) {
        console.warn(`Unable to ensure client_assignments.${column}:`, e.message);
      }
    }
    try {
      const [assignmentIndexes] = await pool.query("SHOW INDEX FROM client_assignments WHERE Key_name = 'idx_assignment_scope'");
      if (!assignmentIndexes.length) await pool.query('ALTER TABLE client_assignments ADD INDEX idx_assignment_scope (client_id,branch_id,department_id)');
    } catch (e) {
      console.warn('Unable to ensure client_assignments scope index:', e.message);
    }

    // Seed Departments if empty
    const [existingDepts] = await pool.query('SELECT COUNT(*) as count FROM departments');
    if (existingDepts[0].count === 0) {
      const depts = ['Support', 'Management', 'IT', 'Customer care', 'Admin', 'Manager'];
      for (const dept of depts) {
        await pool.query('INSERT INTO departments (id, department_name) VALUES (?, ?)', [uuidv4(), dept]);
      }
    }

    // Seed Subsidiaries if empty
    const [existingSubs] = await pool.query('SELECT COUNT(*) as count FROM subsidiaries');
    if (existingSubs[0].count === 0) {
      const subs = ['RIANA Kenya', 'RIANA Uganda', 'RIANA Tanzania'];
      for (const sub of subs) {
        await pool.query('INSERT INTO subsidiaries (id, subsidiary_name) VALUES (?, ?)', [uuidv4(), sub]);
      }
    }

    // Feedback Questions (Dynamic configuration)
    await pool.query(`CREATE TABLE IF NOT EXISTS feedback_questions (
      id VARCHAR(36) PRIMARY KEY,
      question_text TEXT NOT NULL,
      question_type ENUM('rating', 'nps', 'text') NOT NULL DEFAULT 'rating',
      category VARCHAR(50) DEFAULT 'general',
      is_active BOOLEAN DEFAULT TRUE,
      order_index INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Insert Default Questions if empty
    const [existingQuestions] = await pool.query('SELECT COUNT(*) as count FROM feedback_questions');
    if (existingQuestions[0].count === 0) {
      const defaultQuestions = [
        ['q1', 'How satisfied are you with the overall installation quality?', 'rating', 'Quality', 1],
        ['q2', 'How would you rate the timeliness of the installation?', 'rating', 'Timeliness', 2],
        ['q3', 'How well did the technicians communicate the process to you?', 'rating', 'Communication', 3],
        ['q4', 'How would you rate the technicians knowledge of the product?', 'rating', 'Technician', 4],
        ['q5', 'How likely are you to recommend us to another client?', 'nps', 'General', 5],
        ['q6', 'Do you have any other comments or suggestions?', 'text', 'Comments', 6]
      ];
      for (const q of defaultQuestions) {
        await pool.query('INSERT INTO feedback_questions (id, question_text, question_type, category, order_index) VALUES (?, ?, ?, ?, ?)', q);
      }
    }

    // Installation Feedback
    await pool.query(`CREATE TABLE IF NOT EXISTS installation_feedback (
      id VARCHAR(36) PRIMARY KEY,
      client_id VARCHAR(36) NOT NULL,
      branch_id VARCHAR(36),
      department_id VARCHAR(36),
      installation_id VARCHAR(36),
      submitted_by VARCHAR(36),
      installation_quality_rating INT DEFAULT 5,
      installation_timeliness_rating INT DEFAULT 5,
      installation_communication_rating INT DEFAULT 5,
      technician_knowledge_rating INT DEFAULT 5,
      technician_professionalism_rating INT DEFAULT 5,
      technician_helpfulness_rating INT DEFAULT 5,
      recommendation_score INT DEFAULT 10,
      overall_satisfaction INT DEFAULT 5,
      positive_feedback TEXT,
      improvement_suggestions TEXT,
      dynamic_responses JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
    
    try {
      await pool.query('ALTER TABLE installation_feedback ADD COLUMN dynamic_responses JSON');
    } catch (e) {
      // Ignore error if column already exists
    }

    // Feedback Links
    await pool.query(`CREATE TABLE IF NOT EXISTS feedback_links (
      id VARCHAR(36) PRIMARY KEY,
      client_id VARCHAR(36) NOT NULL,
      branch_id VARCHAR(36),
      department_id VARCHAR(36),
      installation_id VARCHAR(36),
      unique_token VARCHAR(100) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      is_used BOOLEAN DEFAULT FALSE,
      used_at TIMESTAMP,
      email_sent BOOLEAN DEFAULT FALSE,
      sms_sent BOOLEAN DEFAULT FALSE,
      created_by_user_id VARCHAR(36),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Repair older local/live databases created before scoped feedback links.
    // CREATE TABLE IF NOT EXISTS does not add columns to an existing table.
    for (const [column, definition] of [
      ['branch_id', 'VARCHAR(36) NULL AFTER client_id'],
      ['department_id', 'VARCHAR(36) NULL AFTER branch_id'],
      ['installation_id', 'VARCHAR(36) NULL AFTER department_id'],
      ['is_used', 'BOOLEAN DEFAULT FALSE AFTER expires_at'],
      ['used_at', 'TIMESTAMP NULL AFTER is_used'],
      ['email_sent', 'BOOLEAN DEFAULT FALSE AFTER used_at'],
      ['sms_sent', 'BOOLEAN DEFAULT FALSE AFTER email_sent'],
      ['created_by_user_id', 'VARCHAR(36) NULL AFTER sms_sent'],
      ['created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER created_by_user_id'],
    ]) {
      try {
        const [feedbackColumns] = await pool.query('SHOW COLUMNS FROM feedback_links LIKE ?', [column]);
        if (!feedbackColumns.length) await pool.query(`ALTER TABLE feedback_links ADD COLUMN ${column} ${definition}`);
      } catch (e) {
        console.warn(`Unable to ensure feedback_links.${column}:`, e.message);
      }
    }
    try {
      const [feedbackScopeIndexes] = await pool.query("SHOW INDEX FROM feedback_links WHERE Key_name = 'idx_feedback_links_scope'");
      if (!feedbackScopeIndexes.length) await pool.query('ALTER TABLE feedback_links ADD INDEX idx_feedback_links_scope (client_id,branch_id,department_id,is_used,expires_at)');
    } catch (e) {
      console.warn('Unable to ensure feedback_links scope index:', e.message);
    }
    try {
      const [feedbackTokenIndexes] = await pool.query("SHOW INDEX FROM feedback_links WHERE Key_name = 'idx_feedback_links_token_expires'");
      if (!feedbackTokenIndexes.length) await pool.query('ALTER TABLE feedback_links ADD INDEX idx_feedback_links_token_expires (unique_token,expires_at)');
    } catch (e) {
      console.warn('Unable to ensure feedback_links token index:', e.message);
    }
    try {
      await pool.query('ALTER TABLE feedback_links MODIFY COLUMN expires_at TIMESTAMP NOT NULL');
      await pool.query(`
        UPDATE feedback_links
        SET expires_at = DATE_ADD(created_at, INTERVAL 30 DAY)
        WHERE is_used = FALSE
          AND (email_sent = TRUE OR sms_sent = TRUE)
          AND created_at IS NOT NULL
          AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
          AND expires_at <= NOW()
      `);
    } catch (e) {
      console.warn('Unable to ensure immutable feedback_links.expires_at:', e.message);
    }

    // Announcements
    await pool.query(`CREATE TABLE IF NOT EXISTS announcements (
      id VARCHAR(36) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      subsidiary_id VARCHAR(36),
      priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
      target_audience VARCHAR(50) DEFAULT 'all',
      is_active BOOLEAN DEFAULT TRUE,
      expires_at TIMESTAMP NULL,
      created_by_user_id VARCHAR(36),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (subsidiary_id) REFERENCES subsidiaries(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
    )`);

    await pool.query(`ALTER TABLE announcements
      ADD COLUMN IF NOT EXISTS subsidiary_id VARCHAR(36) NULL,
      ADD COLUMN IF NOT EXISTS priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
      ADD COLUMN IF NOT EXISTS target_audience VARCHAR(50) DEFAULT 'all',
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);

    // Announcement Reads
    await pool.query(`CREATE TABLE IF NOT EXISTS announcement_reads (
      id VARCHAR(36) PRIMARY KEY,
      announcement_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE
    )`);

    // Handover Uploads
    await pool.query(`CREATE TABLE IF NOT EXISTS handover_uploads (
      id VARCHAR(36) PRIMARY KEY,
      client_id VARCHAR(36) NOT NULL,
      branch_id VARCHAR(36),
      department_id VARCHAR(36),
      installation_id VARCHAR(36),
      work_type VARCHAR(40) NOT NULL DEFAULT 'installation',
      change_request_id VARCHAR(36),
      version_group_id VARCHAR(36),
      version_number INT NOT NULL DEFAULT 1,
      is_latest_version BOOLEAN NOT NULL DEFAULT TRUE,
      status VARCHAR(30) NOT NULL DEFAULT 'uploaded',
      file_hash CHAR(64),
      file_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(512) NOT NULL,
      file_size BIGINT,
      upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_signed BOOLEAN DEFAULT FALSE,
      notes TEXT,
      uploaded_by_user_id VARCHAR(36),
      INDEX idx_handover_scope (client_id,branch_id,department_id,work_type),
      INDEX idx_handover_version_group (version_group_id,is_latest_version),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE SET NULL,
      FOREIGN KEY (uploaded_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
    )`);

    await pool.query(`ALTER TABLE handover_uploads
      ADD COLUMN IF NOT EXISTS branch_id VARCHAR(36) NULL,
      ADD COLUMN IF NOT EXISTS department_id VARCHAR(36) NULL,
      ADD COLUMN IF NOT EXISTS work_type VARCHAR(40) NOT NULL DEFAULT 'installation',
      ADD COLUMN IF NOT EXISTS change_request_id VARCHAR(36) NULL,
      ADD COLUMN IF NOT EXISTS version_group_id VARCHAR(36) NULL,
      ADD COLUMN IF NOT EXISTS version_number INT NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS is_latest_version BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'uploaded',
      ADD COLUMN IF NOT EXISTS file_hash CHAR(64) NULL`);
    // Technician Performance Scores
    await pool.query(`CREATE TABLE IF NOT EXISTS technician_performance_scores (
      id VARCHAR(36) PRIMARY KEY,
      technician_id VARCHAR(36) NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      total_installations INT DEFAULT 0,
      completed_on_time INT DEFAULT 0,
      completed_late INT DEFAULT 0,
      average_completion_days FLOAT DEFAULT 0,
      average_feedback_rating FLOAT DEFAULT 0,
      total_feedback_count INT DEFAULT 0,
      completion_rate_score FLOAT DEFAULT 0,
      time_efficiency_score FLOAT DEFAULT 0,
      client_satisfaction_score FLOAT DEFAULT 0,
      overall_score FLOAT DEFAULT 0,
      performance_tier VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (technician_id) REFERENCES user_profiles(id) ON DELETE CASCADE
    )`);

    // Installation Budgets
    await pool.query(`CREATE TABLE IF NOT EXISTS installation_budgets (
      id VARCHAR(36) PRIMARY KEY,
      installation_id VARCHAR(36) NOT NULL,
      total_budget FLOAT DEFAULT 0,
      labor_cost FLOAT DEFAULT 0,
      equipment_cost FLOAT DEFAULT 0,
      transport_cost FLOAT DEFAULT 0,
      miscellaneous_cost FLOAT DEFAULT 0,
      notes TEXT,
      created_by VARCHAR(36),
      currency VARCHAR(10) DEFAULT 'KES',
      branch VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE SET NULL
    )`);

    // Patching existing tables for missing columns
    try {
      const [columns] = await pool.query('SHOW COLUMNS FROM installations');
      const columnNames = columns.map(c => c.Field);
      
      if (!columnNames.includes('counter_names')) {
        await pool.query('ALTER TABLE installations ADD COLUMN counter_names JSON AFTER counter_count');
      }
      if (!columnNames.includes('led_names')) {
        await pool.query('ALTER TABLE installations ADD COLUMN led_names JSON AFTER led_count');
      }
      if (!columnNames.includes('escalation_matrix')) {
        await pool.query('ALTER TABLE installations ADD COLUMN escalation_matrix JSON AFTER scheduled_end_date');
      }
      if (!columnNames.includes('screen_count')) {
        await pool.query('ALTER TABLE installations ADD COLUMN screen_count INT DEFAULT 0 AFTER screen_with_size');
      }

      const [clientColumns] = await pool.query('SHOW COLUMNS FROM clients');
      const clientColumnNames = clientColumns.map(c => c.Field);
      if (!clientColumnNames.includes('start_date')) {
        await pool.query('ALTER TABLE clients ADD COLUMN start_date DATE AFTER added_by_user_id');
      }
      if (!clientColumnNames.includes('contract_type')) {
        await pool.query("ALTER TABLE clients ADD COLUMN contract_type VARCHAR(50) DEFAULT 'AMC' AFTER start_date");
      }
      if (!columnNames.includes('counter_count')) {
        await pool.query('ALTER TABLE installations ADD COLUMN counter_count INT DEFAULT 0 AFTER kiosk_count');
      }
      if (!columnNames.includes('led_count')) {
        await pool.query('ALTER TABLE installations ADD COLUMN led_count INT DEFAULT 0 AFTER counter_names');
      }
    } catch (err) {
      console.warn('Error patching installations table:', err.message);
    }

    try {
      const [columns] = await pool.query('SHOW COLUMNS FROM client_assignments');
      const columnNames = columns.map(c => c.Field);
      if (!columnNames.includes('branch')) {
        await pool.query('ALTER TABLE client_assignments ADD COLUMN branch VARCHAR(100) AFTER notes');
      }
    } catch (err) {
      console.warn('Error patching client_assignments table:', err.message);
    }

    try {
      const [columns] = await pool.query('SHOW COLUMNS FROM subsidiaries');
      const columnNames = columns.map(c => c.Field);
      if (!columnNames.includes('default_escalation_matrix')) {
        await pool.query('ALTER TABLE subsidiaries ADD COLUMN default_escalation_matrix JSON');
      }
      if (!columnNames.includes('equipment_configuration')) {
        await pool.query('ALTER TABLE subsidiaries ADD COLUMN equipment_configuration JSON AFTER default_escalation_matrix');
      }
    } catch (err) {
      console.warn('Error patching subsidiaries table:', err.message);
    }

    try {
      const [columns] = await pool.query('SHOW COLUMNS FROM company_settings');
      const columnNames = columns.map(c => c.Field);
      if (!columnNames.includes('backup_schedule')) {
        await pool.query('ALTER TABLE company_settings ADD COLUMN backup_schedule VARCHAR(50) DEFAULT "0 2 * * *" AFTER contract_types');
      }
      if (!columnNames.includes('primary_color')) {
        await pool.query('ALTER TABLE company_settings ADD COLUMN primary_color VARCHAR(20) DEFAULT "#1e3a8a" AFTER font_color');
      }
      await pool.query(`ALTER TABLE company_settings
        ADD COLUMN IF NOT EXISTS tagline VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS website VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL,
        ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL,
        ADD COLUMN IF NOT EXISTS address TEXT NULL,
        ADD COLUMN IF NOT EXISTS contract_durations JSON NULL,
        ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(20) NULL,
        ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20) NULL,
        ADD COLUMN IF NOT EXISTS font_type VARCHAR(50) DEFAULT 'Inter',
        ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'Africa/Nairobi',
        ADD COLUMN IF NOT EXISTS date_format VARCHAR(30) DEFAULT 'DD/MM/YYYY',
        ADD COLUMN IF NOT EXISTS enable_email_notifications BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS enable_sms_notifications BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS enable_push_notifications BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS auto_reminder_days SMALLINT UNSIGNED DEFAULT 3`);
    } catch (err) {
      console.warn('Error patching company_settings table:', err.message);
    }

    // System Logs
    await pool.query(`CREATE TABLE IF NOT EXISTS system_logs (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36),
      action VARCHAR(255) NOT NULL,
      details TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS security_audit_events (
      id CHAR(36) PRIMARY KEY,
      actor_user_id VARCHAR(36),
      module VARCHAR(32) NOT NULL,
      action VARCHAR(100) NOT NULL,
      outcome ENUM('success','failure') NOT NULL DEFAULT 'success',
      source_ip VARCHAR(45),
      details JSON,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_security_audit_actor_created (actor_user_id,created_at),
      INDEX idx_security_audit_action_created (action,created_at),
      FOREIGN KEY (actor_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
    )`);


    await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR(36) PRIMARY KEY,
      event_uuid VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NULL,
      impersonator_user_id VARCHAR(36) NULL,
      action VARCHAR(120) NOT NULL,
      category VARCHAR(60) NOT NULL DEFAULT 'system',
      module VARCHAR(80) NOT NULL,
      entity_type VARCHAR(80) NULL,
      entity_id VARCHAR(100) NULL,
      description VARCHAR(1000) NULL,
      old_values JSON NULL,
      new_values JSON NULL,
      metadata JSON NULL,
      ip_address VARCHAR(45) NULL,
      user_agent TEXT NULL,
      device VARCHAR(255) NULL,
      session_id VARCHAR(120) NULL,
      request_id VARCHAR(80) NULL,
      route VARCHAR(255) NULL,
      http_method VARCHAR(12) NULL,
      status ENUM('success','failure','denied') NOT NULL DEFAULT 'success',
      severity ENUM('info','notice','warning','critical') NOT NULL DEFAULT 'info',
      integrity_hash CHAR(64) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_logs_user_created (user_id,created_at),
      INDEX idx_audit_logs_action (action),
      INDEX idx_audit_logs_module_created (module,created_at),
      INDEX idx_audit_logs_entity (entity_type,entity_id),
      INDEX idx_audit_logs_created (created_at),
      INDEX idx_audit_logs_severity (severity),
      INDEX idx_audit_logs_status (status),
      INDEX idx_audit_logs_ip (ip_address),
      UNIQUE KEY uq_audit_event_uuid (event_uuid),
      FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
      FOREIGN KEY (impersonator_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
    )`);
    // Messages for user-to-user chat
    await pool.query(`CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(36) PRIMARY KEY,
      sender_id VARCHAR(36) NOT NULL,
      receiver_id VARCHAR(36) NOT NULL,
      content TEXT NOT NULL,
      message_kind ENUM('text','attachment','call') NOT NULL DEFAULT 'text',
      reply_to_message_id VARCHAR(36),
      attachment_file_name VARCHAR(255),
      attachment_file_path VARCHAR(255),
      attachment_content_type VARCHAR(120),
      attachment_size INT UNSIGNED,
      call_type ENUM('audio','video'),
      call_status ENUM('ringing','accepted','declined','missed','ended') NULL,
      call_started_at DATETIME NULL,
      call_ended_at DATETIME NULL,
      is_edited BOOLEAN DEFAULT FALSE,
      edited_at TIMESTAMP NULL,
      is_deleted_for_everyone BOOLEAN DEFAULT FALSE,
      deleted_for_everyone_at TIMESTAMP NULL,
      deleted_for_everyone_by VARCHAR(36) NULL,
      deletion_reason VARCHAR(255) NULL,
      content_hash CHAR(64) NULL,
      is_read BOOLEAN DEFAULT FALSE,
      read_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_messages_inbox (receiver_id, is_read, created_at),
      INDEX idx_messages_thread (sender_id, receiver_id, created_at),
      INDEX idx_messages_reply (reply_to_message_id),
      INDEX idx_messages_attachment (attachment_file_path),
      FOREIGN KEY (sender_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
      FOREIGN KEY (reply_to_message_id) REFERENCES messages(id) ON DELETE SET NULL
    )`);

    await pool.query(`ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS message_kind ENUM('text','attachment','call') NOT NULL DEFAULT 'text',
      ADD COLUMN IF NOT EXISTS reply_to_message_id VARCHAR(36) NULL,
      ADD COLUMN IF NOT EXISTS attachment_file_name VARCHAR(255) NULL,
      ADD COLUMN IF NOT EXISTS attachment_file_path VARCHAR(255) NULL,
      ADD COLUMN IF NOT EXISTS attachment_content_type VARCHAR(120) NULL,
      ADD COLUMN IF NOT EXISTS attachment_size INT UNSIGNED NULL,
      ADD COLUMN IF NOT EXISTS call_type ENUM('audio','video') NULL,
      ADD COLUMN IF NOT EXISTS call_status ENUM('ringing','accepted','declined','missed','ended') NULL,
      ADD COLUMN IF NOT EXISTS call_started_at DATETIME NULL,
      ADD COLUMN IF NOT EXISTS call_ended_at DATETIME NULL,
      ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS is_deleted_for_everyone BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS deleted_for_everyone_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS deleted_for_everyone_by VARCHAR(36) NULL,
      ADD COLUMN IF NOT EXISTS deletion_reason VARCHAR(255) NULL,
      ADD COLUMN IF NOT EXISTS content_hash CHAR(64) NULL`);


    await pool.query(`CREATE TABLE IF NOT EXISTS message_edit_history (
      id VARCHAR(36) PRIMARY KEY,
      message_id VARCHAR(36) NOT NULL,
      edited_by VARCHAR(36) NULL,
      previous_content TEXT NULL,
      new_content_hash CHAR(64) NOT NULL,
      edited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_message_edit_history_message (message_id,edited_at),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (edited_by) REFERENCES user_profiles(id) ON DELETE SET NULL
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS message_reactions (
      id VARCHAR(36) PRIMARY KEY,
      message_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      reaction_type ENUM('like','love','laugh','wow','sad','angry') NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_message_reaction_user (message_id,user_id),
      INDEX idx_message_reactions_user (user_id),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS message_user_deletions (
      id VARCHAR(36) PRIMARY KEY,
      message_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_message_user_deletion (message_id,user_id),
      INDEX idx_message_user_deletions_user (user_id,deleted_at),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS message_recipient_status (
      id VARCHAR(36) PRIMARY KEY,
      message_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      delivered_at TIMESTAMP NULL,
      read_at TIMESTAMP NULL,
      UNIQUE KEY uq_message_recipient_status (message_id,user_id),
      INDEX idx_message_recipient_status_user_read (user_id,read_at),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS call_participants (
      id VARCHAR(36) PRIMARY KEY,
      call_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      status ENUM('invited','ringing','accepted','declined','ended','missed') NOT NULL DEFAULT 'ringing',
      joined_at DATETIME NULL,
      left_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_call_participant (call_id,user_id),
      INDEX idx_call_participants_user_status (user_id,status,created_at),
      FOREIGN KEY (call_id) REFERENCES messages(id) ON DELETE CASCADE
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS missed_call_dismissals (
      id VARCHAR(36) PRIMARY KEY,
      call_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      dismissed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_missed_call_dismissal (call_id,user_id),
      INDEX idx_missed_call_dismissals_user (user_id,dismissed_at),
      FOREIGN KEY (call_id) REFERENCES messages(id) ON DELETE CASCADE
    )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS contact_reveal_audit (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id VARCHAR(36) NOT NULL,
      field_name VARCHAR(80) NOT NULL,
      reason VARCHAR(255) NULL,
      ip_address VARCHAR(64) NULL,
      user_agent VARCHAR(255) NULL,
      revealed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_contact_reveal_entity (entity_type,entity_id,revealed_at),
      INDEX idx_contact_reveal_user (user_id,revealed_at),
      FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
    )`);
    // Patch company_settings for backup_schedule and colors
    try {
      const [columns] = await pool.query('SHOW COLUMNS FROM company_settings');
      const columnNames = columns.map(c => c.Field);
      if (!columnNames.includes('backup_schedule')) {
        await pool.query('ALTER TABLE company_settings ADD COLUMN backup_schedule VARCHAR(50) DEFAULT "0 2 * * *"');
      }
      if (!columnNames.includes('backup_day')) {
        await pool.query('ALTER TABLE company_settings ADD COLUMN backup_day VARCHAR(20) DEFAULT "Daily"');
        await pool.query('ALTER TABLE company_settings ADD COLUMN backup_time VARCHAR(10) DEFAULT "02:00"');
      }
    } catch (err) {
      console.warn('Error patching company_settings:', err.message);
    }

    // Seed Company Settings if empty
    const [existingCompany] = await pool.query('SELECT COUNT(*) as count FROM company_settings');
    if (existingCompany[0].count === 0) {
      await pool.query('INSERT INTO company_settings (id, name, logo_path, contract_types) VALUES (1, ?, ?, ?)', 
        ['RIANA Technologies', '/Riana_logo.png', JSON.stringify(['AMC', 'Once-off', 'Subscription'])]);
    }

    try {
      const repairedSuperAdmins = await repairSuperAdminAccounts();
      if (repairedSuperAdmins) {
        console.log(`Repaired ${repairedSuperAdmins} SuperAdmin account record(s).`);
      }
      const [superAdminRows] = await pool.query("SELECT id FROM user_profiles WHERE role='SuperAdmin' LIMIT 1");
      if (!superAdminRows.length) {
        const [adminRows] = await pool.query("SELECT id,email FROM user_profiles WHERE role='Admin' AND is_active = TRUE ORDER BY created_at ASC LIMIT 1");
        if (adminRows.length) {
          await pool.query(
            "UPDATE user_profiles SET role='SuperAdmin', session_version=session_version+1 WHERE id=?",
            [adminRows[0].id],
          );
          console.log(`No SuperAdmin account existed; promoted ${adminRows[0].email} to SuperAdmin.`);
        }
      }
      await pool.query(`
        INSERT IGNORE INTO roles (id,module_id,code,name) VALUES
          ('cims:SuperAdmin','cims','SuperAdmin','Super Administrator'),
          ('crms:SuperAdmin','crms','SuperAdmin','Super Administrator')
      `);
      if (process.env.SUPERADMIN_PASSWORD) {
        const superAdminEmail = superAdminBootstrapEmail();
        const superAdminPasswordHash = await hashPassword(String(process.env.SUPERADMIN_PASSWORD));
        const [existingSuperAdmins] = await pool.query('SELECT id FROM user_profiles WHERE LOWER(email)=LOWER(?) LIMIT 1', [superAdminEmail]);
        const superAdminId = existingSuperAdmins[0]?.id || uuidv4();
        if (existingSuperAdmins.length) {
          await pool.query(
            `UPDATE user_profiles
             SET password=?,role='SuperAdmin',designation='SuperAdmin',first_login=FALSE,is_active=TRUE,session_version=session_version+1
             WHERE id=?`,
            [superAdminPasswordHash, superAdminId],
          );
        } else {
          await pool.query(
            `INSERT INTO user_profiles
             (id,email,password,role,designation,first_name,last_name,first_login,is_active)
             VALUES (?,?,?,?,?,?,?,FALSE,TRUE)`,
            [superAdminId, superAdminEmail, superAdminPasswordHash, 'SuperAdmin', 'SuperAdmin', 'Super', 'Admin'],
          );
        }
        await applyModuleRoleAssignments({
          userId: superAdminId,
          moduleRoles: { cims: 'SuperAdmin', crms: 'SuperAdmin' },
          grantedBy: superAdminId,
        });
      }
      await pool.query(`
        INSERT IGNORE INTO role_permissions (role_id,permission_id)
        SELECT 'cims:SuperAdmin',id FROM permissions WHERE module_id='cims'
      `);
      await pool.query(`
        INSERT IGNORE INTO role_permissions (role_id,permission_id)
        SELECT 'crms:SuperAdmin',id FROM permissions WHERE module_id='crms'
      `);
      await pool.query(`
        INSERT INTO user_module_roles (user_id,module_id,role_id)
        SELECT id,'cims','cims:SuperAdmin' FROM user_profiles WHERE role='SuperAdmin'
        ON DUPLICATE KEY UPDATE role_id=VALUES(role_id)
      `);
      await pool.query(`
        INSERT INTO user_module_roles (user_id,module_id,role_id)
        SELECT id,'crms','crms:SuperAdmin' FROM user_profiles WHERE role='SuperAdmin'
        ON DUPLICATE KEY UPDATE role_id=VALUES(role_id)
      `);
    } catch (err) {
      console.warn('Error patching SuperAdmin RBAC rows:', err.message);
    }

    // Patch: Ensure all users are active so they show up in chat
    await pool.query('UPDATE user_profiles SET is_active = 1 WHERE is_active IS NULL');
    
    console.log('Database initialization complete');
  } catch (err) {
    console.error('Database initialization failed:', err);
  }
};

// ------------------------------------------------------------------
// API ENDPOINTS
// ------------------------------------------------------------------

// Health Check
app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  timestamp: new Date(),
  corsPolicy: 'same-origin-host-v1',
}));

const toRequestBoolean = (body, key, fallback) => (
  Object.prototype.hasOwnProperty.call(body || {}, key)
    ? body[key] === true || body[key] === 1 || body[key] === '1' || /^true$/i.test(String(body[key]))
    : fallback
);

const toMysqlDateTimeOrNull = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw Object.assign(new Error('Estimated completion must be a valid date and time.'), { status: 400 });
  }
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
};

const normalizeMaintenanceRequest = (body = {}, previous = {}) => ({
  enabled: toRequestBoolean(body, 'maintenance_enabled', toRequestBoolean(body, 'enabled', previous.enabled)),
  reason: String(body.maintenance_reason ?? body.reason ?? previous.reason ?? '').trim().slice(0, 255),
  message: String(body.maintenance_message ?? body.message ?? previous.message ?? '').trim().slice(0, 1000) || undefined,
  estimated_completion: Object.prototype.hasOwnProperty.call(body, 'estimated_completion')
    ? toMysqlDateTimeOrNull(body.estimated_completion)
    : previous.estimated_completion,
  allow_api_access: toRequestBoolean(body, 'maintenance_allow_api_access', toRequestBoolean(body, 'allow_api_access', previous.allow_api_access)),
  force_logout: toRequestBoolean(body, 'maintenance_force_logout', toRequestBoolean(body, 'force_logout', previous.force_logout)),
  notify_users: toRequestBoolean(body, 'maintenance_notify_users', toRequestBoolean(body, 'notify_users', previous.notify_users)),
  backup_before_enable: toRequestBoolean(body, 'maintenance_backup_before_enable', toRequestBoolean(body, 'backup_before_enable', previous.backup_before_enable)),
  allow_super_admin_only: true,
});

const activeNonSuperAdminUserIds = async () => {
  const [users] = await pool.query("SELECT id FROM user_profiles WHERE is_active = TRUE AND role <> 'SuperAdmin'");
  return users.map((user) => user.id);
};

app.get('/api/maintenance/status', async (_req, res) => {
  try {
    res.json({ success: true, maintenance: await getMaintenanceState(pool) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/maintenance-mode', requireRole('SuperAdmin'), async (_req, res) => {
  try {
    res.json({ success: true, maintenance: await getMaintenanceState(pool, { force: true }) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/maintenance-mode', requireRole('SuperAdmin'), async (req, res) => {
  let backup = null;
  let backupWarning = null;
  try {
    const previous = await getMaintenanceState(pool, { force: true });
    const nextState = normalizeMaintenanceRequest(req.body, previous);
    const isEnabling = !previous.enabled && nextState.enabled;
    const isDisabling = previous.enabled && !nextState.enabled;

    if (isEnabling && nextState.backup_before_enable) {
      await logSuccess(pool, req, { action: 'maintenance_backup_started', category: 'maintenance', module: 'Maintenance Mode', description: 'Database backup started before enabling maintenance mode.' });
      try {
        backup = await createDatabaseBackup(pool);
        pruneBackups();
        await logSuccess(pool, req, { action: 'maintenance_backup_successful', category: 'maintenance', module: 'Maintenance Mode', description: 'Database backup completed before enabling maintenance mode.', metadata: backup, severity: 'notice' });
      } catch (error) {
        backupWarning = error.message;
        await logFailure(pool, req, { action: 'maintenance_backup_failed', category: 'maintenance', module: 'Maintenance Mode', description: 'Database backup failed before enabling maintenance mode.', metadata: { error: error.message }, severity: 'warning' });
      }
    }

    await pool.query(`UPDATE company_settings SET
      maintenance_enabled = ?,
      maintenance_reason = ?,
      maintenance_message = ?,
      estimated_completion = ?,
      maintenance_allow_api_access = ?,
      maintenance_force_logout = ?,
      maintenance_notify_users = ?,
      maintenance_backup_before_enable = ?,
      maintenance_allow_super_admin_only = TRUE,
      maintenance_enabled_by = CASE WHEN ? THEN ? ELSE maintenance_enabled_by END,
      maintenance_enabled_at = CASE WHEN ? THEN NOW() ELSE maintenance_enabled_at END,
      maintenance_disabled_by = CASE WHEN ? THEN ? ELSE maintenance_disabled_by END,
      maintenance_disabled_at = CASE WHEN ? THEN NOW() ELSE maintenance_disabled_at END
      WHERE id = 1`, [
      nextState.enabled,
      nextState.reason || null,
      nextState.message || null,
      nextState.estimated_completion || null,
      nextState.allow_api_access,
      nextState.force_logout,
      nextState.notify_users,
      nextState.backup_before_enable,
      isEnabling, req.user.id,
      isEnabling,
      isDisabling, req.user.id,
      isDisabling,
    ]);

    if (isEnabling && nextState.force_logout) {
      const [result] = await pool.query(`UPDATE user_sessions us
        JOIN user_profiles u ON u.id = us.user_id
        SET us.revoked_at = NOW(), us.revoke_reason = 'MAINTENANCE_MODE'
        WHERE u.role <> 'SuperAdmin' AND us.revoked_at IS NULL AND (us.expires_at IS NULL OR us.expires_at > NOW())`);
      await logSuccess(pool, req, { action: 'maintenance_forced_logout', category: 'maintenance', module: 'Maintenance Mode', description: 'Active non-SuperAdmin sessions were revoked for maintenance mode.', metadata: { revokedSessions: result.affectedRows || 0 }, severity: 'notice' });
    }

    invalidateMaintenanceCache();
    const current = await getMaintenanceState(pool, { force: true });
    const action = isEnabling ? 'maintenance_enabled' : isDisabling ? 'maintenance_disabled' : 'maintenance_settings_updated';
    await logSuccess(pool, req, {
      action,
      category: 'maintenance',
      module: 'Maintenance Mode',
      description: isEnabling ? 'Maintenance mode enabled.' : isDisabling ? 'Maintenance mode disabled.' : 'Maintenance mode settings updated.',
      old_values: previous,
      new_values: current,
      severity: current.enabled ? 'warning' : 'notice',
    });

    if (nextState.notify_users && (isEnabling || isDisabling)) {
      const userIds = await activeNonSuperAdminUserIds();
      await sendUsersNotification({
        pool,
        userIds,
        title: isEnabling ? 'System Maintenance' : 'Maintenance Complete',
        message: isEnabling
          ? `RIANA CIMS is entering scheduled maintenance.${current.estimated_completion ? ` Estimated completion: ${current.estimated_completion}` : ''}`
          : 'RIANA CIMS maintenance is complete. You may now sign in normally.',
        type: isEnabling ? 'warning' : 'success',
        notificationType: 'maintenance',
        email: false,
        sms: false,
        whatsapp: false,
      });
    }

    res.json({ success: true, maintenance: current, backup, backupWarning });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Persistent notifications shared by CIMS and CRMS.
app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM crms_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id],
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'UPDATE crms_notifications SET `read` = TRUE WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id],
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE crms_notifications SET `read` = TRUE WHERE user_id = ?', [req.user.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// File Serving
app.get('/api/files/:filename', async (req, res) => {
  const filePath = resolveStoredFile(uploadsDir, req.params.filename);
  if (filePath && fs.existsSync(filePath) && await storedFileIsRegistered(req.params.filename)) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.download(filePath, path.basename(filePath));
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Compatibility endpoints for E-Handover document consumers.
app.get('/api/uploads', async (req, res) => {
  try {
    const filters = [];
    const values = [];
    if (req.query.client_id) { filters.push('client_id = ?'); values.push(req.query.client_id); }
    if (req.query.installation_id) { filters.push('installation_id = ?'); values.push(req.query.installation_id); }
    const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
    const scopedWhere = where ? where.replace(/\bclient_id\b/g, 'h.client_id').replace(/\binstallation_id\b/g, 'h.installation_id') : '';
    const [rows] = await pool.query(`
      SELECT h.*, c.client_name, c.branch AS client_branch, cb.branch_name, cd.department_name,
             i.status AS installation_status, i.remarks AS installation_notes,
             (SELECT COUNT(*) FROM client_branches b2 WHERE ${sqlUuidEquals('b2.client_id', 'h.client_id')} AND b2.deleted_at IS NULL) AS branch_count,
             (SELECT COUNT(*) FROM client_departments d2 WHERE ${sqlUuidEquals('d2.client_id', 'h.client_id')} AND d2.deleted_at IS NULL AND (COALESCE(h.branch_id, i.branch_id) IS NULL OR ${sqlUuidEquals('d2.branch_id', 'COALESCE(h.branch_id, i.branch_id)')})) AS department_count
      FROM handover_uploads h
      LEFT JOIN clients c ON ${sqlUuidEquals('c.id', 'h.client_id')}
      LEFT JOIN installations i ON ${sqlUuidEquals('i.id', 'h.installation_id')}
      LEFT JOIN client_branches cb ON ${sqlUuidEquals('cb.id', 'COALESCE(h.branch_id, i.branch_id)')}
      LEFT JOIN client_departments cd ON ${sqlUuidEquals('cd.id', 'COALESCE(h.department_id, i.department_id)')}
      ${scopedWhere}
      ORDER BY h.upload_date DESC`, values);
    res.json(rows.map(row => attachSecureHandoverUrls({
      ...row,
      branch: row.branch_name || row.client_branch,
      branch_name: row.branch_name || row.client_branch,
      department_name: row.department_name || null,
      branch_label: scopedBranchLabel(row),
      department_label: scopedDepartmentLabel(row),
      scope_label: scopedLabel(row),
      clients: { client_name: row.client_name, branch: row.branch_name || row.client_branch },
      installations: { status: row.installation_status, remarks: row.installation_notes },
    })));
  } catch {
    res.status(500).json({ error: 'Unable to load uploaded documents.' });
  }
});

app.get('/api/download', async (req, res) => {
  try {
    const filename = resolveLegacyDownloadFilename(req);
    const filePath = resolveStoredFile(uploadsDir, filename);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'The handover file is missing from server storage. Restore the uploads backup or re-upload the signed document.',
        code: 'HANDOVER_FILE_MISSING',
      });
    }
    if (!(await storedFileIsRegistered(filename))) {
      return res.status(404).json({ error: 'File not found.', code: 'FILE_NOT_REGISTERED' });
    }
    if (!req.query.token) res.setHeader('Deprecation', 'true');
    const disposition = req.query.disposition === 'inline' ? 'inline' : 'attachment';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${disposition}; filename="${path.basename(filename).replace(/["\r\n]/g, '')}"`);
    res.sendFile(filePath);
  } catch (err) {
    const status = err.status && err.status < 500 ? err.status : 500;
    if (err.code === 'FILE_ACCESS_DENIED') {
      return res.status(status).json({
        error: 'This file access link is invalid or expired. Refresh the handover list and try again.',
        code: 'FILE_ACCESS_DENIED',
      });
    }
    res.status(status).json({ error: status >= 500 ? 'Unable to download file.' : err.message, code: err.code || 'FILE_DOWNLOAD_FAILED' });
  }
});

// DATA BACKUPS
const cron = require('node-cron');

let backupJob = null;

const initBackupSchedule = async () => {
  try {
    const [rows] = await pool.query('SELECT backup_schedule FROM company_settings WHERE id = 1');
    const schedule = rows.length && rows[0].backup_schedule ? rows[0].backup_schedule : '0 2 * * *';
    
    if (backupJob) {
      backupJob.stop();
    }
    
    backupJob = cron.schedule(schedule, async () => {
      console.log('Running scheduled automatic database backup...');
      try {
        const result = await createDatabaseBackup(pool);
        pruneBackups();
        console.log(`Scheduled backup successful: ${result.fileName} (${result.size} bytes)`);
      } catch (error) {
        console.error(`Scheduled backup failed: ${error.message}`);
      }
    }, { timezone: process.env.BACKUP_TIMEZONE || 'Africa/Nairobi' });
    console.log(`Database backup scheduled with cron expression: ${schedule}`);
  } catch (err) {
    console.error('Failed to init backup schedule:', err);
  }
};

app.get('/api/admin/backup-schedule', requireCapability('backup.manage'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT backup_schedule, backup_day, backup_time FROM company_settings WHERE id = 1');
    if (rows.length) {
      res.json({ 
        schedule: rows[0].backup_schedule || '0 2 * * *',
        day: rows[0].backup_day || 'Daily',
        time: rows[0].backup_time || '02:00'
      });
    } else {
      res.json({ schedule: '0 2 * * *', day: 'Daily', time: '02:00' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/backup-schedule', requireCapability('backup.manage'), async (req, res) => {
  try {
    const { schedule, day, time } = req.body;
    let finalSchedule = schedule;

    // If day and time are provided, convert to cron
    if (day && time) {
      const [hour, minute] = time.split(':');
      const dayMap = {
        'Daily': '*',
        'Monday': '1',
        'Tuesday': '2',
        'Wednesday': '3',
        'Thursday': '4',
        'Friday': '5',
        'Saturday': '6',
        'Sunday': '0'
      };
      const dayCron = dayMap[day] || '*';
      finalSchedule = `${minute} ${hour} * * ${dayCron}`;
    }

    if (!cron.validate(finalSchedule)) {
      return res.status(400).json({ error: 'Invalid schedule parameters' });
    }

    await pool.query(
      'UPDATE company_settings SET backup_schedule = ?, backup_day = ?, backup_time = ? WHERE id = 1', 
      [finalSchedule, day || 'Daily', time || '02:00']
    );
    await initBackupSchedule();
    await auditSecurityEvent(pool, req, 'backup_schedule_updated', { schedule: finalSchedule, day, time });
    res.json({ success: true, schedule: finalSchedule, day, time });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/backups', requireCapability('backup.manage'), async (req, res) => {
  try {
    res.json(listBackups());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/backup-status', requireCapability('backup.manage'), async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT backup_schedule, backup_day, backup_time FROM company_settings WHERE id = 1');
    res.json({
      scheduled: Boolean(backupJob),
      timezone: process.env.BACKUP_TIMEZONE || 'Africa/Nairobi',
      schedule: rows[0]?.backup_schedule || '0 2 * * *',
      day: rows[0]?.backup_day || 'Daily',
      time: rows[0]?.backup_time || '02:00',
      lastRun: getLastRun(),
      latestBackup: listBackups()[0] || null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/backup', requireCapability('backup.manage'), async (req, res) => {
  try {
    const result = await createDatabaseBackup(pool);
    pruneBackups();
    await auditSecurityEvent(pool, req, 'database_backup_created', { fileName: result.fileName, size: result.size });
    res.json({ success: true, message: 'Database backup created successfully', ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DASHBOARD STATS
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const isRegularUser = role !== 'SuperAdmin' && role !== 'Admin' && role !== 'Teamlead';

    const [[{ count: totalClients }]] = await pool.query('SELECT COUNT(*) as count FROM clients');
    const [[{ count: totalInstallations }]] = await pool.query('SELECT COUNT(*) as count FROM installations');
    const [[{ count: totalUsers }]] = await pool.query('SELECT COUNT(*) as count FROM user_profiles');
    
    let logsQuery = 'SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 10';
    const logsParams = [];
    if (isRegularUser && userId) {
      logsQuery = 'SELECT * FROM system_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 10';
      logsParams.push(userId);
    }
    const [recentLogs] = await pool.query(logsQuery, logsParams);

    res.json({
      totalClients,
      totalInstallations,
      totalUsers,
      recentLogs
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// AUTHENTICATION
const safeUser = (user) => {
  const { password, ...result } = user;
  result.module_roles = normalizeModuleRoles(result.module_roles);
  return withEffectivePermissions(result);
};

const issueCimsSession = async (req, res, user) => {
  const sessionVersion = Number(user.session_version || 0);
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + CIMS_SESSION_MAX_AGE_MS);
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, sv: sessionVersion, sid: sessionId },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '7d' },
  );
  const sessionResult = await createSingleActiveSession(pool, {
    userId: user.id,
    sessionId,
    token,
    req,
    expiresAt,
  });
  res.cookie('riana_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: CIMS_SESSION_MAX_AGE_MS,
    path: '/',
  });
  return { sessionId, token, ...sessionResult };
};

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const [rows] = await pool.query(`
      SELECT u.*, s.subsidiary_name, ${USER_MODULE_ROLES_SQL}, ${USER_PERMISSIONS_SQL}
      FROM user_profiles u
      LEFT JOIN subsidiaries s ON s.id = u.subsidiary_id
      WHERE LOWER(u.email) = ?
    `, [email]);
    if (!rows.length) {
      await logFailure(pool, req, { action: 'login_failed', category: 'authentication', module: 'Auth', description: 'Login failed for an unknown email address.', metadata: { email } });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = rows[0];
    if (!user.is_active) {
      await logFailure(pool, req, { user_id: user.id, action: 'login_failed', category: 'authentication', module: 'Auth', description: 'Inactive user attempted to log in.', severity: 'warning' });
      return res.status(403).json({ error: 'This user account is inactive.' });
    }
    if (!(await verifyAndUpgradePassword(pool, user, password))) {
      await logFailure(pool, req, { user_id: user.id, action: 'login_failed', category: 'authentication', module: 'Auth', description: 'Login failed because the password was invalid.', severity: 'warning' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const maintenance = await getMaintenanceState(pool);
    if (maintenance.enabled && user.role !== 'SuperAdmin') {
      await logDenied(pool, req, { user_id: user.id, action: 'login_blocked_maintenance', category: 'maintenance', module: 'Auth', description: 'Login was blocked because maintenance mode is active.', severity: 'warning' });
      res.setHeader('Retry-After', '60');
      return res.status(503).json(maintenanceResponse(maintenance));
    }

    if (user.two_factor_enabled) {
      const challenge = await createChallenge(pool, user, JWT_SECRET);
      await logSuccess(pool, req, { user_id: user.id, action: 'login_2fa_challenge_created', category: 'authentication', module: 'Auth', description: 'Two-factor challenge created during login.' });
      return res.json({ requiresTwoFactor: true, ...challenge });
    }
    const sessionResult = await issueCimsSession(req, res, user);
    await logSuccess(pool, req, { user_id: user.id, action: 'login_success', category: 'authentication', module: 'Auth', description: 'User logged in successfully.', session_id: sessionAuditRef(sessionResult.sessionId) });
    if (sessionResult.revokedCount) {
      await logSuccess(pool, req, { user_id: user.id, action: 'session_replaced', category: 'authentication', module: 'Auth', description: 'Previous active session was replaced by a new login.', metadata: { revokedSessions: sessionResult.revokedCount }, session_id: sessionAuditRef(sessionResult.sessionId), severity: 'notice' });
    }
    res.json({ user: safeUser(user), token: sessionResult.token });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/verify-2fa', async (req, res) => {
  try {
    const challenge = await verifyChallenge(pool, req.body.challengeId, req.body.code, JWT_SECRET);
    if (!challenge) {
      await logFailure(pool, req, { action: 'login_2fa_failed', category: 'authentication', module: 'Auth', description: 'Invalid or expired two-factor verification code.', severity: 'warning' });
      return res.status(401).json({ error: 'Invalid or expired verification code.' });
    }
    const [rows] = await pool.query(`
      SELECT u.*, s.subsidiary_name, ${USER_MODULE_ROLES_SQL}, ${USER_PERMISSIONS_SQL}
      FROM user_profiles u
      LEFT JOIN subsidiaries s ON s.id = u.subsidiary_id
      WHERE u.id = ? AND u.is_active = TRUE
    `, [challenge.user_id]);
    if (!rows.length) return res.status(403).json({ error: 'User account is unavailable.' });
    const maintenance = await getMaintenanceState(pool);
    if (maintenance.enabled && rows[0].role !== 'SuperAdmin') {
      await logDenied(pool, req, { user_id: rows[0].id, action: 'login_blocked_maintenance', category: 'maintenance', module: 'Auth', description: 'Two-factor login was blocked because maintenance mode is active.', severity: 'warning' });
      res.setHeader('Retry-After', '60');
      return res.status(503).json(maintenanceResponse(maintenance));
    }
    const sessionResult = await issueCimsSession(req, res, rows[0]);
    await logSuccess(pool, req, { user_id: rows[0].id, action: 'login_success', category: 'authentication', module: 'Auth', description: 'User completed two-factor login successfully.', session_id: sessionAuditRef(sessionResult.sessionId) });
    if (sessionResult.revokedCount) {
      await logSuccess(pool, req, { user_id: rows[0].id, action: 'session_replaced', category: 'authentication', module: 'Auth', description: 'Previous active session was replaced by a new login.', metadata: { revokedSessions: sessionResult.revokedCount }, session_id: sessionAuditRef(sessionResult.sessionId), severity: 'notice' });
    }
    res.json({ user: safeUser(rows[0]), token: sessionResult.token });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/2fa-settings', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT two_factor_enabled,two_factor_method,two_factor_phone,phone_number,email FROM user_profiles WHERE id = ?',
      [req.user.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/auth/2fa-settings', authMiddleware, async (req, res) => {
  try {
    const enabled = Boolean(req.body.enabled);
    const method = ['email', 'sms', 'call'].includes(req.body.method) ? req.body.method : 'email';
    let phone = null;
    if (method !== 'email') {
      const rawPhone = String(req.body.phone || '').trim();
      if (enabled && !rawPhone) {
        return res.status(400).json({ error: 'A phone number is required for SMS or call verification.' });
      }
      if (rawPhone) {
        try {
          phone = normalizePhone(rawPhone);
        } catch {
          return res.status(400).json({ error: 'Select the country and enter a valid international phone number.' });
        }
      }
    }
    await pool.query(
      'UPDATE user_profiles SET two_factor_enabled=?,two_factor_method=?,two_factor_phone=? WHERE id=?',
      [enabled, method, phone, req.user.id],
    );
    await logSuccess(pool, req, { action: 'two_factor_settings_changed', category: 'authentication', module: 'Auth', entity_type: 'user', entity_id: req.user.id, description: 'Two-factor settings changed.', metadata: { enabled, method } });
    res.json({ success: true, enabled, method, phone });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/auth/avatar', authMiddleware, async (req, res) => {
  try {
    const { fileName, base64Data } = req.body || {};
    if (!fileName || !base64Data) return res.status(400).json({ error: 'Missing profile picture data.' });
    const { buffer, storedName: finalFileName, extension } = safeUpload({ fileName, base64Data, maxBytes: 5 * 1024 * 1024 });
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
      return res.status(400).json({ error: 'Only PNG, JPEG, and WebP profile pictures are allowed.' });
    }
    const filePath = resolveStoredFile(uploadsDir, finalFileName);
    await fsp.writeFile(filePath, buffer, { flag: 'wx', mode: 0o640 });
    await pool.query('UPDATE user_profiles SET avatar_url=? WHERE id=?', [finalFileName, req.user.id]);
    await auditSecurityEvent(pool, req, 'profile_avatar_uploaded', { fileName: finalFileName });
    res.json({ success: true, avatar_url: finalFileName });
  } catch (err) {
    console.error('Profile avatar upload error:', err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Profile picture upload failed.' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.*, d.department_name, s.subsidiary_name, ${USER_MODULE_ROLES_SQL}, ${USER_PERMISSIONS_SQL}
      FROM user_profiles u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN subsidiaries s ON u.subsidiary_id = s.id
      WHERE u.id = ?
    `, [req.user.id]);

    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: safeUser(rows[0]) });
  } catch (err) { res.status(500).json({ error: 'Unable to load the current user.' }); }
});

app.get('/api/auth/session-status', authMiddleware, (req, res) => {
  res.json({ success: true, active: true, user_id: req.user.id });
});

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  try {
    await revokeCurrentSession(pool, { userId: req.user.id, sessionId: req.user.sid, reason: 'LOGOUT' });
    await logSuccess(pool, req, { user_id: req.user.id, action: 'logout', category: 'authentication', module: 'Auth', description: 'User logged out.', session_id: sessionAuditRef(req.user.sid) });
    res.clearCookie('riana_session', { path: '/', sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Unable to log out.' }); }
});

app.get('/api/user_profiles', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id,u.email,u.role,u.designation,u.department_id,u.subsidiary_id,u.phone_number,u.avatar_url,
        u.first_name,u.last_name,u.first_login,u.is_active,u.two_factor_enabled,u.two_factor_method,
        u.two_factor_phone,u.created_at,d.department_name,s.subsidiary_name, ${USER_MODULE_ROLES_SQL}, ${USER_PERMISSIONS_SQL}
      FROM user_profiles u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN subsidiaries s ON u.subsidiary_id = s.id
      ORDER BY u.created_at DESC
    `);
    res.json(rows.map((row) => withEffectivePermissions({ ...row, module_roles: normalizeModuleRoles(row.module_roles) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/auth/password', authMiddleware, async (req, res) => {
  try {
    const password = String(req.body.password || '');
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const passwordHash = await hashPassword(password);
    await pool.query('UPDATE user_profiles SET password = ?, first_login = FALSE, session_version = session_version + 1 WHERE id = ?', [passwordHash, req.user.id]);
    await revokeUserSessions(pool, req.user.id, 'PASSWORD_CHANGED');
    await logSuccess(pool, req, { action: 'password_changed', category: 'authentication', module: 'Auth', entity_type: 'user', entity_id: req.user.id, description: 'User changed their password.', severity: 'notice' });
    const loginUrl = canonicalAppUrl(req);
    const delivery = await sendUserNotification({
      pool,
      userId: req.user.id,
      title: 'Password changed',
      message: 'Your RIANA CIMS password was changed successfully. If you did not make this change, contact an administrator immediately.',
      type: 'success',
      actionUrl: loginUrl,
      notificationType: 'password_changed',
      email: true,
      sms: true,
      smsMessage: 'RIANA CIMS: Your password was changed. If this was not you, contact an administrator immediately.',
    });
    res.json({ success: true, notification_delivery: delivery });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/auth/first-login', async (req, res) => {
  try {
    await pool.query('UPDATE user_profiles SET first_login = 0 WHERE id = ?', [req.user.id]);
    res.json({ success: true });
  } catch (err) { 
    console.error('Error in first-login PATCH:', err);
    res.status(500).json({ error: 'Unable to update first-login state.' });
  }
});

// CLIENTS
app.get('/api/clients', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.*, d.department_name, s.subsidiary_name, u.first_name as added_by_first, u.last_name as added_by_last
      FROM clients c
      LEFT JOIN departments d ON c.department_id = d.id
      LEFT JOIN subsidiaries s ON c.subsidiary_id = s.id
      LEFT JOIN user_profiles u ON c.added_by_user_id = u.id
      ORDER BY c.created_at DESC
    `);
    res.json(rows.map(r => ({
      ...attachClientContactAliases(r, { includeSensitive: hasCapability(req.user, 'clients.manage') }),
      tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags,
      departments: { department_name: r.department_name },
      subsidiaries: { subsidiary_name: r.subsidiary_name },
      user_profiles: { first_name: r.added_by_first, last_name: r.added_by_last }
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/clients/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.*, d.department_name, s.subsidiary_name, u.first_name as added_by_first, u.last_name as added_by_last
      FROM clients c
      LEFT JOIN departments d ON c.department_id = d.id
      LEFT JOIN subsidiaries s ON c.subsidiary_id = s.id
      LEFT JOIN user_profiles u ON c.added_by_user_id = u.id
      WHERE c.id = ?
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    const r = rows[0];
    res.json({
      ...attachClientContactAliases(r, { includeSensitive: hasCapability(req.user, 'clients.manage') }),
      tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags,
      departments: { department_name: r.department_name },
      subsidiaries: { subsidiary_name: r.subsidiary_name },
      user_profiles: { first_name: r.added_by_first, last_name: r.added_by_last }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


app.post('/api/clients/:id/reveal-contact', requireAnyCapability('clients.view', 'clients.manage'), async (req, res) => {
  try {
    const field = normalizeRevealField(req.body?.field);
    if (!['contact_phone', 'contact_email'].includes(field)) return res.status(400).json({ error: 'Invalid contact field.' });
    const [rows] = await pool.query(`SELECT id,client_name,contact_phone,contact_email FROM clients WHERE id = ? LIMIT 1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Client not found.' });
    const value = rows[0][field] || '';
    await pool.query(
      `INSERT INTO contact_reveal_audit (id,user_id,entity_type,entity_id,field_name,reason,ip_address,user_agent) VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), req.user.id, 'client', rows[0].id, field, String(req.body?.reason || '').slice(0, 255) || null, req.ip || null, String(req.headers['user-agent'] || '').slice(0, 255)],
    );
    await logSuccess(pool, req, {
      action: 'client_contact_revealed',
      category: 'data_access',
      module: 'Clients',
      entity_type: 'client',
      entity_id: rows[0].id,
      description: 'Client hidden contact information was revealed.',
      metadata: { field_name: field, client_name: rows[0].client_name },
    });
    res.json({ field, value, masked: field === 'contact_email' ? maskEmailAddress(value) : maskPhoneNumber(value) });
  } catch (err) { res.status(500).json({ error: 'Unable to reveal contact information.' }); }
});

app.post('/api/user_profiles/:id/reveal-contact', authMiddleware, async (req, res) => {
  try {
    const targetUserId = String(req.params.id || '').trim();
    const field = normalizeRevealField(req.body?.field);
    if (!['phone_number', 'two_factor_phone', 'email'].includes(field)) return res.status(400).json({ error: 'Invalid contact field.' });
    if (targetUserId !== String(req.user.id) && !hasCapability(req.user, 'users.manage')) {
      await logDenied(pool, req, { action: 'user_contact_reveal_denied', category: 'data_access', module: 'Users', entity_type: 'user', entity_id: targetUserId, description: 'Unauthorized user contact reveal attempt.' });
      return res.status(403).json({ error: 'User management permission is required.' });
    }
    const [rows] = await pool.query(`SELECT id,email,phone_number,two_factor_phone FROM user_profiles WHERE id = ? LIMIT 1`, [targetUserId]);
    if (!rows.length) return res.status(404).json({ error: 'User not found.' });
    const value = rows[0][field] || '';
    await pool.query(
      `INSERT INTO contact_reveal_audit (id,user_id,entity_type,entity_id,field_name,reason,ip_address,user_agent) VALUES (?,?,?,?,?,?,?,?)`,
      [uuidv4(), req.user.id, 'user_profile', rows[0].id, field, String(req.body?.reason || '').slice(0, 255) || null, req.ip || null, String(req.headers['user-agent'] || '').slice(0, 255)],
    );
    await logSuccess(pool, req, { action: 'user_contact_revealed', category: 'data_access', module: 'Users', entity_type: 'user', entity_id: rows[0].id, description: 'User hidden contact information was revealed.', metadata: { field_name: field } });
    res.json({ field, value, masked: field === 'email' ? maskEmailAddress(value) : maskPhoneNumber(value) });
  } catch (err) { res.status(500).json({ error: 'Unable to reveal user contact information.' }); }
});
app.post('/api/clients', requireCapability('clients.manage'), async (req, res) => {
  try {
    const id = uuidv4();
    const data = req.body;

    // Check for duplicate: same client_name + branch combination
    const branch = data.branch || '';
    const [existing] = await pool.query(
      'SELECT id FROM clients WHERE LOWER(client_name) = LOWER(?) AND LOWER(IFNULL(branch, \'\')) = LOWER(?)',
      [data.client_name, branch]
    );
    if (existing.length > 0) {
      return res.status(409).json({ 
        error: `Client "${data.client_name}"${branch ? ` (${branch} branch)` : ''} already exists in the system.` 
      });
    }

    await pool.query(
      `INSERT INTO clients (id, client_name, industry_classification, current_vendor, tags, contact_person_name, contact_person_department, contact_email, contact_phone, account_manager_id, subsidiary_id, department_id, branch, added_by_user_id, start_date, contract_type) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
       [id, data.client_name, data.industry_classification, data.current_vendor, JSON.stringify(data.tags || []), data.contact_person_name, data.contact_person_department, data.contact_email, data.contact_phone, data.account_manager_id, data.subsidiary_id, data.department_id, data.branch, req.user.id, data.start_date, data.contract_type]
    );
    res.json({ id, ...data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/clients/:id', requireCapability('clients.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = allowedEntries(normalizeClientPayload(req.body), CLIENT_FIELDS);
    if (!updates.length) return res.status(400).json({ error: 'No valid client fields supplied.' });
    const fields = updates.map(([key]) => `${key} = ?`).join(', ');
    const values = updates.map(([, value]) => sqlValue(value));
    await pool.query(`UPDATE clients SET ${fields} WHERE id = ?`, [...values, id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/clients/:id', requireCapability('clients.manage'), async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CLIENT BRANCHES AND DEPARTMENTS API
const sanitizeScopeText = (value, maxLength = 255) => String(value || '').trim().slice(0, maxLength) || null;

app.get('/api/clients/:id/branches', requireAnyCapability('clients.view', 'clients.manage'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.*,
        (SELECT COUNT(*) FROM client_departments d WHERE ${sqlUuidEquals('d.branch_id', 'b.id')} AND d.deleted_at IS NULL) AS department_count,
        (SELECT COUNT(*) FROM installations i WHERE ${sqlUuidEquals('i.branch_id', 'b.id')}) AS installation_count
       FROM client_branches b
       WHERE ${sqlUuidParamEquals('b.client_id')} AND b.deleted_at IS NULL
       ORDER BY b.branch_name ASC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/clients/:id/branches', requireCapability('clients.manage'), async (req, res) => {
  try {
    const [clients] = await pool.query('SELECT id FROM clients WHERE id = ? LIMIT 1', [req.params.id]);
    if (!clients.length) return res.status(404).json({ error: 'Client not found.' });
    const branchName = sanitizeScopeText(req.body.branch_name || req.body.name, 150);
    if (!branchName) return res.status(400).json({ error: 'branch_name is required.' });
    const id = uuidv4();
    await pool.query(
      `INSERT INTO client_branches
       (id,client_id,branch_name,branch_code,contact_person_name,contact_email,contact_phone,physical_address,status,notes,created_by,updated_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.params.id, branchName, sanitizeScopeText(req.body.branch_code, 60), sanitizeScopeText(req.body.contact_person_name, 150), sanitizeScopeText(req.body.contact_email, 255), sanitizeScopeText(req.body.contact_phone, 30), sanitizeScopeText(req.body.physical_address, 5000), 'active', sanitizeScopeText(req.body.notes, 5000), req.user.id, req.user.id],
    );
    await logSuccess(pool, req, { action: 'client_branch_created', category: 'clients', module: 'Clients', entity_type: 'client_branch', entity_id: id, description: 'Client branch created.', metadata: { client_id: req.params.id, branch_name: branchName } });
    res.status(201).json({ id, client_id: req.params.id, branch_name: branchName, status: 'active' });
  } catch (err) { res.status(err.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: err.code === 'ER_DUP_ENTRY' ? 'This branch already exists for the selected client.' : err.message }); }
});

app.put('/api/branches/:id', requireCapability('clients.manage'), async (req, res) => {
  try {
    const updates = [
      ['branch_name', sanitizeScopeText(req.body.branch_name || req.body.name, 150)],
      ['branch_code', sanitizeScopeText(req.body.branch_code, 60)],
      ['contact_person_name', sanitizeScopeText(req.body.contact_person_name, 150)],
      ['contact_email', sanitizeScopeText(req.body.contact_email, 255)],
      ['contact_phone', sanitizeScopeText(req.body.contact_phone, 30)],
      ['physical_address', sanitizeScopeText(req.body.physical_address, 5000)],
      ['notes', sanitizeScopeText(req.body.notes, 5000)],
    ].filter(([, value], index) => index !== 0 || value);
    if (!updates.length) return res.status(400).json({ error: 'No valid branch fields supplied.' });
    const fields = updates.map(([field]) => `${field} = ?`).concat('updated_by = ?').join(', ');
    const values = updates.map(([, value]) => value).concat(req.user.id, req.params.id);
    await pool.query(`UPDATE client_branches SET ${fields} WHERE id = ? AND deleted_at IS NULL`, values);
    res.json({ success: true });
  } catch (err) { res.status(err.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: err.code === 'ER_DUP_ENTRY' ? 'This branch already exists for the selected client.' : err.message }); }
});

app.patch('/api/branches/:id/status', requireCapability('clients.manage'), async (req, res) => {
  try {
    const status = ['active', 'inactive'].includes(req.body.status) ? req.body.status : 'inactive';
    await pool.query("UPDATE client_branches SET status=?,updated_by=?,deleted_at=CASE WHEN ? = 'inactive' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?", [status, req.user.id, status, req.params.id]);
    res.json({ success: true, status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/clients/:id/departments', requireAnyCapability('clients.view', 'clients.manage'), async (req, res) => {
  try {
    const filters = [sqlUuidParamEquals('d.client_id'), 'd.deleted_at IS NULL'];
    const values = [req.params.id];
    if (req.query.branch_id) { filters.push(sqlUuidParamEquals('d.branch_id')); values.push(req.query.branch_id); }
    const [rows] = await pool.query(
      `SELECT d.*, b.branch_name,
        (SELECT COUNT(*) FROM installations i WHERE ${sqlUuidEquals('i.department_id', 'd.id')}) AS installation_count
       FROM client_departments d
       INNER JOIN client_branches b ON ${sqlUuidEquals('b.id', 'd.branch_id')}
       WHERE ${filters.join(' AND ')}
       ORDER BY b.branch_name ASC, d.department_name ASC`,
      values,
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/branches/:id/departments', requireAnyCapability('clients.view', 'clients.manage'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT d.*, b.branch_name
       FROM client_departments d
       INNER JOIN client_branches b ON ${sqlUuidEquals('b.id', 'd.branch_id')}
       WHERE ${sqlUuidParamEquals('d.branch_id')} AND d.deleted_at IS NULL
       ORDER BY d.department_name ASC`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/branches/:id/departments', requireCapability('clients.manage'), async (req, res) => {
  try {
    const [branches] = await pool.query('SELECT id,client_id,status,deleted_at FROM client_branches WHERE id = ? LIMIT 1', [req.params.id]);
    const branch = branches[0];
    if (!branch || branch.deleted_at || branch.status !== 'active') return res.status(404).json({ error: 'Active branch not found.' });
    const departmentName = sanitizeScopeText(req.body.department_name || req.body.name, 150);
    if (!departmentName) return res.status(400).json({ error: 'department_name is required.' });
    const id = uuidv4();
    await pool.query(
      `INSERT INTO client_departments
       (id,client_id,branch_id,department_name,department_code,contact_person_name,contact_email,contact_phone,status,notes,created_by,updated_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, branch.client_id, req.params.id, departmentName, sanitizeScopeText(req.body.department_code, 60), sanitizeScopeText(req.body.contact_person_name, 150), sanitizeScopeText(req.body.contact_email, 255), sanitizeScopeText(req.body.contact_phone, 30), 'active', sanitizeScopeText(req.body.notes, 5000), req.user.id, req.user.id],
    );
    await logSuccess(pool, req, { action: 'client_department_created', category: 'clients', module: 'Clients', entity_type: 'client_department', entity_id: id, description: 'Client department created.', metadata: { client_id: branch.client_id, branch_id: req.params.id, department_name: departmentName } });
    res.status(201).json({ id, client_id: branch.client_id, branch_id: req.params.id, department_name: departmentName, status: 'active' });
  } catch (err) { res.status(err.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: err.code === 'ER_DUP_ENTRY' ? 'This department already exists for the selected branch.' : err.message }); }
});

app.put('/api/departments/:id', requireCapability('clients.manage'), async (req, res) => {
  try {
    const updates = [
      ['department_name', sanitizeScopeText(req.body.department_name || req.body.name, 150)],
      ['department_code', sanitizeScopeText(req.body.department_code, 60)],
      ['contact_person_name', sanitizeScopeText(req.body.contact_person_name, 150)],
      ['contact_email', sanitizeScopeText(req.body.contact_email, 255)],
      ['contact_phone', sanitizeScopeText(req.body.contact_phone, 30)],
      ['notes', sanitizeScopeText(req.body.notes, 5000)],
    ].filter(([, value], index) => index !== 0 || value);
    if (!updates.length) return res.status(400).json({ error: 'No valid department fields supplied.' });
    const fields = updates.map(([field]) => `${field} = ?`).concat('updated_by = ?').join(', ');
    const values = updates.map(([, value]) => value).concat(req.user.id, req.params.id);
    await pool.query(`UPDATE client_departments SET ${fields} WHERE id = ? AND deleted_at IS NULL`, values);
    res.json({ success: true });
  } catch (err) { res.status(err.code === 'ER_DUP_ENTRY' ? 409 : 500).json({ error: err.code === 'ER_DUP_ENTRY' ? 'This department already exists for the selected branch.' : err.message }); }
});

app.patch('/api/departments/:id/status', requireCapability('clients.manage'), async (req, res) => {
  try {
    const status = ['active', 'inactive'].includes(req.body.status) ? req.body.status : 'inactive';
    await pool.query("UPDATE client_departments SET status=?,updated_by=?,deleted_at=CASE WHEN ? = 'inactive' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?", [status, req.user.id, status, req.params.id]);
    res.json({ success: true, status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
const sqlUuidEquals = (left, right) => `CONVERT(${left} USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(${right} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
const sqlUuidParamEquals = (column) => `CONVERT(${column} USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
// INSTALLATIONS
const formatInstallationRow = (r) => ({
  ...r,
  clients: { client_name: r.client_name, contact_person_name: r.contact_person_name, branch: r.branch_name || r.client_branch || r.branch },
  branch_name: r.branch_name || r.branch || r.client_branch,
  department_name: r.department_name || null,
  escalation_matrix: typeof r.escalation_matrix === 'string' ? JSON.parse(r.escalation_matrix) : r.escalation_matrix,
  led_names: typeof r.led_names === 'string' ? JSON.parse(r.led_names) : r.led_names,
});

const installationSelectWithScope = `
  SELECT i.*, c.client_name, c.contact_person_name, c.branch as client_branch, cb.branch_name, cd.department_name,
    (SELECT COUNT(*) FROM client_branches b2 WHERE ${sqlUuidEquals('b2.client_id', 'i.client_id')} AND b2.deleted_at IS NULL) AS branch_count,
    (SELECT COUNT(*) FROM client_departments d2 WHERE ${sqlUuidEquals('d2.client_id', 'i.client_id')} AND d2.deleted_at IS NULL AND (i.branch_id IS NULL OR ${sqlUuidEquals('d2.branch_id', 'i.branch_id')})) AS department_count
  FROM installations i
  LEFT JOIN clients c ON ${sqlUuidEquals('i.client_id', 'c.id')}
  LEFT JOIN client_branches cb ON ${sqlUuidEquals('cb.id', 'i.branch_id')}
  LEFT JOIN client_departments cd ON ${sqlUuidEquals('cd.id', 'i.department_id')}
`;

const installationSelectFallback = `
  SELECT i.*, c.client_name, c.contact_person_name, c.branch as client_branch, NULL AS branch_name, NULL AS department_name, 1 AS branch_count, 0 AS department_count
  FROM installations i
  LEFT JOIN clients c ON ${sqlUuidEquals('i.client_id', 'c.id')}
`;

const queryInstallations = async ({ id } = {}) => {
  const where = id ? ' WHERE i.id = ?' : '';
  const order = id ? '' : ' ORDER BY i.created_at DESC';
  const values = id ? [id] : [];
  try {
    const [rows] = await pool.query(`${installationSelectWithScope}${where}${order}`, values);
    return rows;
  } catch (error) {
    if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR', 'ER_CANT_CREATE_TABLE'].includes(error.code)) throw error;
    console.warn('Installations hierarchy query fallback:', error.message);
    const [rows] = await pool.query(`${installationSelectFallback}${where}${order}`, values);
    return rows;
  }
};

app.get('/api/installations', async (req, res) => {
  try {
    const rows = await queryInstallations();
    res.json(rows.map(formatInstallationRow));
  } catch (err) {
    console.error('Installations fetch failed:', err);
    res.status(500).json({ error: 'Unable to load installations.' });
  }
});

app.get('/api/installations/:id', async (req, res) => {
  try {
    const rows = await queryInstallations({ id: req.params.id });
    if (rows.length === 0) return res.status(404).json({ error: 'Installation not found' });
    res.json(formatInstallationRow(rows[0]));
  } catch (err) {
    console.error('Installation fetch failed:', err);
    res.status(500).json({ error: 'Unable to load installation.' });
  }
});
app.post('/api/installations', requireCapability('installations.manage'), async (req, res) => {
  try {
    const id = uuidv4();
    const updates = allowedEntries(req.body, INSTALLATION_FIELDS);
    const matrixUpdate = updates.find(([key]) => key === 'escalation_matrix');
    if (matrixUpdate) {
      try {
        matrixUpdate[1] = normalizeEscalationMatrixPayload(matrixUpdate[1], isSuperAdmin(req));
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
    }
    if (!updates.some(([key]) => key === 'client_id')) return res.status(400).json({ error: 'client_id is required.' });
    const installationScope = await validateClientBranchDepartment({
      clientId: req.body.client_id,
      branchId: req.body.branch_id,
      departmentId: req.body.department_id,
    });
    for (const [field, value] of [['branch_id', installationScope.branchId], ['department_id', installationScope.departmentId]]) {
      const existing = updates.find(([key]) => key === field);
      if (existing) existing[1] = value;
      else if (value) updates.push([field, value]);
    }
    const fields = ['id', ...updates.map(([key]) => key)];
    const placeholders = fields.map(() => '?').join(', ');
    const values = [id, ...updates.map(([, value]) => sqlValue(value))];
    await pool.query(`INSERT INTO installations (${fields.join(', ')}) VALUES (${placeholders})`, values);
    res.json({ id, ...Object.fromEntries(updates) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/installations/:id', requireCapability('installations.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = allowedEntries(req.body, INSTALLATION_FIELDS);
    const matrixUpdate = updates.find(([key]) => key === 'escalation_matrix');
    if (matrixUpdate) {
      try {
        matrixUpdate[1] = normalizeEscalationMatrixPayload(matrixUpdate[1], isSuperAdmin(req));
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No valid installation fields supplied.' });
    if (updates.some(([key]) => ['client_id', 'branch_id', 'department_id'].includes(key))) {
      const [existingRows] = await pool.query('SELECT client_id,branch_id,department_id FROM installations WHERE id = ? LIMIT 1', [id]);
      if (!existingRows.length) return res.status(404).json({ error: 'Installation not found.' });
      const nextScope = { ...existingRows[0], ...Object.fromEntries(updates) };
      const installationScope = await validateClientBranchDepartment({
        clientId: nextScope.client_id,
        branchId: nextScope.branch_id,
        departmentId: nextScope.department_id,
      });
      for (const [field, value] of [['branch_id', installationScope.branchId], ['department_id', installationScope.departmentId]]) {
        const existing = updates.find(([key]) => key === field);
        if (existing) existing[1] = value;
      }
    }
    const fields = updates.map(([key]) => `${key} = ?`).join(', ');
    const values = updates.map(([, value]) => sqlValue(value));
    await pool.query(`UPDATE installations SET ${fields} WHERE id = ?`, [...values, id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// CLIENT ASSIGNMENTS
app.get('/api/client_assignments', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.*, c.client_name, c.branch as client_branch, c.contact_person_name, c.contact_email, c.contact_phone, cb.branch_name, cd.department_name,
             ht.first_name as ht_f, ht.last_name as ht_l,
             st.first_name as st_f, st.last_name as st_l,
             i.status as installation_status, i.kiosk_type, i.kiosk_count, i.counter_count, i.led_count,
             i.service_points, i.ups_count, i.speakers, i.screen_with_size, i.screen_count, i.media_controllers,
             i.tablets, i.digital_signage_system
      FROM client_assignments a
      LEFT JOIN clients c ON ${sqlUuidEquals('a.client_id', 'c.id')}
      LEFT JOIN client_branches cb ON ${sqlUuidEquals('a.branch_id', 'cb.id')}
      LEFT JOIN client_departments cd ON ${sqlUuidEquals('a.department_id', 'cd.id')}
      LEFT JOIN installations i ON ${sqlUuidEquals('a.installation_id', 'i.id')}
      LEFT JOIN user_profiles ht ON ${sqlUuidEquals('a.hardware_technician_id', 'ht.id')}
      LEFT JOIN user_profiles st ON ${sqlUuidEquals('a.software_technician_id', 'st.id')}
      ORDER BY a.created_at DESC
    `);
    res.json(rows.map(r => ({
      ...r,
      status: r.installation_status || r.status,
      client_name: r.client_name,
      branch: r.branch_name || r.branch || r.client_branch,
      department_name: r.department_name || null,
      contact_person_name: r.contact_person_name || null,
      contact_phone: r.contact_phone || null,
      contact_email: r.contact_email || null,
      clients: {
        client_name: r.client_name,
        branch: r.branch_name || r.branch || r.client_branch,
        contact_person_name: r.contact_person_name || null,
        contact_person_phone: r.contact_phone || null,
        contact_person_email: r.contact_email || null,
      },
      hardware_tech: { first_name: r.ht_f, last_name: r.ht_l },
      software_tech: { first_name: r.st_f, last_name: r.st_l }
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.get('/api/client_assignments/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.*, c.client_name, c.branch AS client_branch, c.contact_person_name, c.contact_email, c.contact_phone, cb.branch_name, cd.department_name,
             ht.first_name as ht_f, ht.last_name as ht_l, st.first_name as st_f, st.last_name as st_l,
             i.status as installation_status, i.kiosk_type, i.kiosk_count, i.counter_count, i.led_count,
             i.service_points, i.ups_count, i.speakers, i.screen_with_size, i.screen_count, i.media_controllers,
             i.tablets, i.digital_signage_system
      FROM client_assignments a
      LEFT JOIN clients c ON ${sqlUuidEquals('a.client_id', 'c.id')}
      LEFT JOIN client_branches cb ON ${sqlUuidEquals('a.branch_id', 'cb.id')}
      LEFT JOIN client_departments cd ON ${sqlUuidEquals('a.department_id', 'cd.id')}
      LEFT JOIN installations i ON ${sqlUuidEquals('a.installation_id', 'i.id')}
      LEFT JOIN user_profiles ht ON ${sqlUuidEquals('a.hardware_technician_id', 'ht.id')}
      LEFT JOIN user_profiles st ON ${sqlUuidEquals('a.software_technician_id', 'st.id')}
      WHERE a.id = ?
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Assignment not found' });
    const r = rows[0];
    res.json({
      ...r,
      client_name: r.client_name,
      branch: r.branch_name || r.branch || r.client_branch,
      department_name: r.department_name || null,
      contact_person_name: r.contact_person_name || null,
      contact_phone: r.contact_phone || null,
      contact_email: r.contact_email || null,
      clients: {
        client_name: r.client_name,
        branch: r.branch_name || r.branch || r.client_branch,
        contact_person_name: r.contact_person_name || null,
        contact_person_phone: r.contact_phone || null,
        contact_person_email: r.contact_email || null,
      },
      hardware_tech: { first_name: r.ht_f, last_name: r.ht_l },
      software_tech: { first_name: r.st_f, last_name: r.st_l }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/client_assignments', requireCapability('assignments.manage'), async (req, res) => {
  try {
    const id = uuidv4();
    const data = { ...req.body, assigned_by_user_id: req.user.id };
    const updates = allowedEntries(data, new Set([...ASSIGNMENT_FIELDS, 'assigned_by_user_id']));
    if (!updates.some(([key]) => key === 'client_id')) return res.status(400).json({ error: 'client_id is required.' });
    const assignmentScope = await validateClientBranchDepartment({
      clientId: data.client_id,
      branchId: data.branch_id,
      departmentId: data.department_id,
    });
    for (const [field, value] of [['client_id', assignmentScope.clientId], ['branch_id', assignmentScope.branchId], ['department_id', assignmentScope.departmentId]]) {
      const existing = updates.find(([key]) => key === field);
      if (existing) existing[1] = value;
      else if (value) updates.push([field, value]);
    }
    let branchLabel = data.branch || '';
    if (assignmentScope.branchId) {
      const [branchRows] = await pool.query('SELECT branch_name FROM client_branches WHERE id = ? LIMIT 1', [assignmentScope.branchId]);
      branchLabel = branchRows[0]?.branch_name || branchLabel;
      if (branchLabel) {
        const existingBranch = updates.find(([key]) => key === 'branch');
        if (existingBranch) existingBranch[1] = branchLabel;
        else updates.push(['branch', branchLabel]);
      }
    }
    let departmentLabel = '';
    if (assignmentScope.departmentId) {
      const [departmentRows] = await pool.query('SELECT department_name FROM client_departments WHERE id = ? LIMIT 1', [assignmentScope.departmentId]);
      departmentLabel = departmentRows[0]?.department_name || '';
    }
    if (!updates.some(([key]) => key === 'installation_id')) {
      const installationFilters = [sqlUuidParamEquals('client_id')];
      const installationValues = [assignmentScope.clientId];
      if (assignmentScope.branchId) { installationFilters.push(sqlUuidParamEquals('branch_id')); installationValues.push(assignmentScope.branchId); }
      else installationFilters.push('branch_id IS NULL');
      if (assignmentScope.departmentId) { installationFilters.push(sqlUuidParamEquals('department_id')); installationValues.push(assignmentScope.departmentId); }
      else installationFilters.push('department_id IS NULL');
      const [installationRows] = await pool.query(`SELECT id FROM installations WHERE ${installationFilters.join(' AND ')} ORDER BY created_at DESC LIMIT 1`, installationValues);
      if (installationRows[0]?.id) updates.push(['installation_id', installationRows[0].id]);
    }
    const fields = ['id', ...updates.map(([key]) => key)];
    const placeholders = fields.map(() => '?').join(', ');
    await pool.query(`INSERT INTO client_assignments (${fields.join(', ')}) VALUES (${placeholders})`, [id, ...updates.map(([, value]) => sqlValue(value))]);
    const [clients] = await pool.query('SELECT client_name,branch FROM clients WHERE id = ? LIMIT 1', [data.client_id]);
    const client = clients[0] || {};
    const scopeLabel = [branchLabel || client.branch, departmentLabel].filter(Boolean).join(' / ');
    const clientLabel = (client.client_name || 'a client') + (scopeLabel ? ' - ' + scopeLabel : '');
    const loginUrl = canonicalAppUrl(req);
    const notificationDelivery = await sendUsersNotification({
      pool,
      userIds: [data.hardware_technician_id, data.software_technician_id],
      title: 'New installation assignment',
      message: `You have been assigned to ${clientLabel}. Open RIANA CIMS to review the schedule and assignment details.`,
      type: 'info',
      actionUrl: loginUrl,
      requestId: id,
      notificationType: 'assignment',
      email: true,
      sms: true,
      smsMessage: `RIANA CIMS: New assignment for ${clientLabel}. Sign in to review the details.`,
      details: { clientName: clientLabel },
    });
    res.json({ id, ...Object.fromEntries(updates), notification_delivery: notificationDelivery });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/client_assignments/:id', async (req, res) => {
  try {
    const [beforeRows] = await pool.query('SELECT * FROM client_assignments WHERE id = ? LIMIT 1', [req.params.id]);
    if (!beforeRows.length) return res.status(404).json({ error: 'Assignment not found' });
    const before = beforeRows[0];
    const canManageAssignments = hasCapability(req.user, 'assignments.manage');
    const isAssignedTechnician = [before.hardware_technician_id, before.software_technician_id]
      .filter(Boolean)
      .some((technicianId) => String(technicianId) === String(req.user?.id));

    if (!canManageAssignments && !isAssignedTechnician) {
      return res.status(403).json({ error: 'Insufficient permissions.' });
    }

    const updates = allowedEntries(req.body, ASSIGNMENT_FIELDS);
    if (!updates.length) return res.status(400).json({ error: 'No valid assignment fields supplied' });

    if (updates.some(([key]) => ['client_id', 'branch_id', 'department_id'].includes(key))) {
      const nextScope = { ...before, ...Object.fromEntries(updates) };
      const assignmentScope = await validateClientBranchDepartment({
        clientId: nextScope.client_id,
        branchId: nextScope.branch_id,
        departmentId: nextScope.department_id,
      });
      for (const [field, value] of [['client_id', assignmentScope.clientId], ['branch_id', assignmentScope.branchId], ['department_id', assignmentScope.departmentId]]) {
        const existing = updates.find(([key]) => key === field);
        if (existing) existing[1] = value;
      }
      if (assignmentScope.branchId) {
        const [branchRows] = await pool.query('SELECT branch_name FROM client_branches WHERE id = ? LIMIT 1', [assignmentScope.branchId]);
        const branchName = branchRows[0]?.branch_name;
        if (branchName) {
          const existingBranch = updates.find(([key]) => key === 'branch');
          if (existingBranch) existingBranch[1] = branchName;
          else updates.push(['branch', branchName]);
        }
      }
    }
    if (!canManageAssignments) {
      const disallowedFields = updates.map(([key]) => key).filter((key) => !ASSIGNMENT_SELF_UPDATE_FIELDS.has(key));
      if (disallowedFields.length) {
        return res.status(403).json({ error: 'Assigned technicians can only update task status, progress, or notes.' });
      }
    }

    const statusUpdate = updates.find(([key]) => key === 'status');
    if (statusUpdate && !ASSIGNMENT_STATUSES.has(String(statusUpdate[1]))) {
      return res.status(400).json({ error: 'Invalid assignment status.' });
    }

    const progressUpdate = updates.find(([key]) => key === 'progress_percentage');
    if (progressUpdate) {
      const progress = Number(progressUpdate[1]);
      if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
        return res.status(400).json({ error: 'Progress must be an integer between 0 and 100.' });
      }
      progressUpdate[1] = progress;
    }

    const fields = updates.map(([key]) => `${key} = ?`).join(', ');
    await pool.query(`UPDATE client_assignments SET ${fields} WHERE id = ?`, [...updates.map(([, value]) => sqlValue(value)), req.params.id]);
    const [afterRows] = await pool.query(
      `SELECT a.*,c.client_name,c.branch AS client_branch,cb.branch_name,cd.department_name FROM client_assignments a
       LEFT JOIN clients c ON ${sqlUuidEquals('c.id', 'a.client_id')}
       LEFT JOIN client_branches cb ON ${sqlUuidEquals('cb.id', 'a.branch_id')}
       LEFT JOIN client_departments cd ON ${sqlUuidEquals('cd.id', 'a.department_id')}
       WHERE a.id = ? LIMIT 1`,
      [req.params.id],
    );
    const after = afterRows[0];
    const technicianChanged = before.hardware_technician_id !== after.hardware_technician_id
      || before.software_technician_id !== after.software_technician_id;
    const statusChanged = before.status !== after.status;
    let notificationDelivery = [];
    if (technicianChanged || statusChanged) {
      const newlyAssigned = [
        before.hardware_technician_id !== after.hardware_technician_id ? after.hardware_technician_id : null,
        before.software_technician_id !== after.software_technician_id ? after.software_technician_id : null,
      ];
      const recipients = statusChanged
        ? [after.hardware_technician_id, after.software_technician_id]
        : newlyAssigned;
      const scopeLabel = [after.branch_name || after.branch || after.client_branch, after.department_name].filter(Boolean).join(' / ');
      const clientLabel = (after.client_name || 'a client') + (scopeLabel ? ' - ' + scopeLabel : '');
      const statusLabel = String(after.status || 'updated').replaceAll('_', ' ');
      const loginUrl = canonicalAppUrl(req);
      notificationDelivery = await sendUsersNotification({
        pool,
        userIds: recipients,
        title: technicianChanged && !statusChanged ? 'New installation assignment' : 'Installation assignment updated',
        message: statusChanged
          ? `The ${clientLabel} assignment status changed to ${statusLabel}.`
          : `You have been assigned to ${clientLabel}. Open RIANA CIMS to review the details.`,
        type: after.status === 'completed' ? 'success' : after.status === 'waiting' ? 'warning' : 'info',
        actionUrl: loginUrl,
        requestId: req.params.id,
        notificationType: technicianChanged && !statusChanged ? 'assignment' : 'assignment_updated',
        email: true,
        sms: technicianChanged || ['waiting', 'completed'].includes(after.status),
        smsMessage: statusChanged
          ? `RIANA CIMS: ${clientLabel} assignment status is now ${statusLabel}.`
          : `RIANA CIMS: New assignment for ${clientLabel}. Sign in to review details.`,
        details: { clientName: clientLabel },
      });
    }
    res.json({ success: true, notification_delivery: notificationDelivery });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// FORGOT PASSWORD
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const [users] = await pool.query('SELECT id FROM user_profiles WHERE LOWER(email) = ? AND is_active = TRUE LIMIT 1', [email]);
    if (!users.length) return res.status(404).json({ error: 'User does not exist.' });

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [users[0].id]);
    await pool.query(
      'INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL 30 MINUTE))',
      [uuidv4(), users[0].id, tokenHash],
    );
    const loginUrl = canonicalAppUrl(req);
    const resetUrl = `${loginUrl}reset-password?token=${encodeURIComponent(token)}`;
    await sendUserNotification({
      pool,
      userId: users[0].id,
      title: 'Password reset requested',
      message: 'A password reset was requested for your account. The secure reset link expires in 30 minutes.',
      type: 'warning',
      actionUrl: loginUrl,
      emailActionUrl: resetUrl,
      notificationType: 'password_reset',
      email: true,
      sms: true,
      smsMessage: `RIANA CIMS password reset requested. Reset within 30 minutes: ${resetUrl}`,
    });
    res.json({ success: true, message: 'Password reset instructions have been sent by email and SMS where a phone number is available.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/reset-password', async (req, res) => {
  let connection;
  try {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    if (!token) return res.status(400).json({ error: 'Reset token is required.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [tokens] = await connection.query(
      `SELECT id,user_id FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1 FOR UPDATE`,
      [tokenHash],
    );
    if (!tokens.length) {
      await connection.rollback();
      return res.status(400).json({ error: 'This password reset link is invalid or has expired.' });
    }
    const passwordHash = await hashPassword(password);
    await connection.query('UPDATE user_profiles SET password = ?, first_login = FALSE, session_version = session_version + 1 WHERE id = ?', [passwordHash, tokens[0].user_id]);
    await revokeUserSessions(connection, tokens[0].user_id, 'PASSWORD_RESET');
    await connection.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [tokens[0].user_id]);
    await connection.commit();
    connection.release();
    connection = null;
    const loginUrl = canonicalAppUrl(req);
    await sendUserNotification({
      pool,
      userId: tokens[0].user_id,
      title: 'Password reset completed',
      message: 'Your RIANA CIMS password was reset successfully. If you did not make this change, contact an administrator immediately.',
      type: 'success',
      actionUrl: loginUrl,
      notificationType: 'password_changed',
      email: true,
      sms: true,
      smsMessage: 'RIANA CIMS: Your password reset is complete. If this was not you, contact an administrator immediately.',
    });
    res.json({ success: true });
  } catch (err) {
    if (connection) {
      await connection.rollback().catch(() => {});
      connection.release();
    }
    res.status(500).json({ error: 'Unable to reset password.' });
  }
});

app.get('/api/user_profiles/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id,u.email,u.role,u.designation,u.department_id,u.subsidiary_id,u.phone_number,u.avatar_url,
        u.first_name,u.last_name,u.first_login,u.is_active,u.two_factor_enabled,u.two_factor_method,
        u.two_factor_phone,u.created_at,d.department_name,s.subsidiary_name, ${USER_MODULE_ROLES_SQL}, ${USER_PERMISSIONS_SQL}
      FROM user_profiles u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN subsidiaries s ON u.subsidiary_id = s.id
      WHERE u.id = ?
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(withEffectivePermissions({ ...rows[0], module_roles: normalizeModuleRoles(rows[0].module_roles) }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/user_profiles', authMiddleware, async (req, res) => {
  try {
    if (!isAdminOrSuperAdmin(req)) return res.status(403).json({ error: 'Only Admin or SuperAdmin can create users.' });
    const id = uuidv4();
    const data = req.body;
    const email = String(data.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@riana\.co$/i.test(email)) return res.status(400).json({ error: 'New users must use a @riana.co email address.' });
    let phoneNumber;
    try {
      phoneNumber = normalizePhone(data.phone_number);
    } catch {
      return res.status(400).json({ error: 'Select the country and enter a valid phone number so the welcome SMS can be delivered.' });
    }
    if (!SYSTEM_ROLES.has(data.role)) return res.status(400).json({ error: 'Invalid user role.' });
    if (!userCanManageTargetRole(req, data.role)) return res.status(403).json({ error: 'Only SuperAdmin can create Admin or SuperAdmin users.' });
    const passwordHash = await hashPassword(crypto.randomBytes(32).toString('base64url'));
    await pool.query(
      `INSERT INTO user_profiles
       (id,email,password,role,designation,department_id,subsidiary_id,phone_number,first_name,last_name,first_login,is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,TRUE,TRUE)`,
      [id,email,passwordHash,data.role,data.designation || null,data.department_id || null,data.subsidiary_id || null,phoneNumber,data.first_name || null,data.last_name || null],
    );
    await pool.query(
      `INSERT INTO user_module_roles (user_id,module_id,role_id,granted_by) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE role_id=VALUES(role_id),granted_by=VALUES(granted_by),granted_at=CURRENT_TIMESTAMP`,
      [id, 'cims', `cims:${data.role}`, req.user.id],
    );
    if (CRMS_ACCESS_ROLES.has(data.role)) {
      await pool.query(
        `INSERT INTO user_module_roles (user_id,module_id,role_id,granted_by) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE role_id=VALUES(role_id),granted_by=VALUES(granted_by),granted_at=CURRENT_TIMESTAMP`,
        [id, 'crms', `crms:${data.role}`, req.user.id],
      );
    }
    if (data.module_roles && isSuperAdmin(req)) {
      await applyModuleRoleAssignments({ userId: id, moduleRoles: data.module_roles, grantedBy: req.user.id });
    }
    const loginUrl = canonicalAppUrl(req);
    const setupToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(setupToken).digest('hex');
    await pool.query(
      'INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL 30 MINUTE))',
      [uuidv4(), id, tokenHash],
    );
    const setupUrl = `${loginUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(setupToken)}`;
    const branding = await notificationBranding(loginUrl);
    const welcomeDelivery = await sendWelcomeCredentials({
      email, phoneNumber, name: `${data.first_name || ''} ${data.last_name || ''}`.trim(), role: data.role, loginUrl, setupUrl, branding,
    });
    const inAppDelivery = await sendUserNotification({
      pool,
      userId: id,
      title: 'Welcome to RIANA CIMS',
      message: 'Your RIANA CIMS account is ready. Your username, login URL, and secure password-setup link were sent by email and SMS.',
      type: 'success',
      actionUrl: loginUrl,
      notificationType: 'welcome',
      email: false,
      sms: false,
    });
    res.status(201).json({ id, ...data, email, phone_number: phoneNumber, first_login: true, welcome_delivery: welcomeDelivery, in_app_notification: inAppDelivery });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A user with this email already exists.' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/user_profiles/:id', authMiddleware, async (req, res) => {
  try {
    if (!isAdminOrSuperAdmin(req)) return res.status(403).json({ error: 'Only Admin or SuperAdmin can update users.' });
    const [targetRows] = await pool.query('SELECT id,role FROM user_profiles WHERE id = ? LIMIT 1', [req.params.id]);
    if (!targetRows.length) return res.status(404).json({ error: 'User not found.' });
    const targetRole = targetRows[0].role;
    if (!userCanManageTargetRole(req, targetRole)) return res.status(403).json({ error: 'Only SuperAdmin can update Admin or SuperAdmin users.' });
    const allowedFields = new Set(['email','role','designation','department_id','subsidiary_id','phone_number','first_name','last_name','is_active','two_factor_enabled','two_factor_method','two_factor_phone']);
    const updates = Object.entries(req.body).filter(([key]) => allowedFields.has(key));
    const moduleRolesUpdate = req.body.module_roles && typeof req.body.module_roles === 'object' ? req.body.module_roles : null;
    if (moduleRolesUpdate && !isSuperAdmin(req)) return res.status(403).json({ error: 'Only SuperAdmin can assign module roles.' });
    if (!updates.length && !moduleRolesUpdate) return res.status(400).json({ error: 'No valid user fields supplied.' });
    const emailUpdate = updates.find(([key]) => key === 'email');
    if (emailUpdate) {
      emailUpdate[1] = String(emailUpdate[1] || '').trim().toLowerCase();
      if (!/^[^\s@]+@riana\.co$/i.test(emailUpdate[1])) return res.status(400).json({ error: 'Users must use a @riana.co email address.' });
    }
    const roleUpdate = updates.find(([key]) => key === 'role');
    if (roleUpdate && !SYSTEM_ROLES.has(roleUpdate[1])) {
      return res.status(400).json({ error: 'Invalid user role.' });
    }
    if (roleUpdate && !isSuperAdmin(req)) return res.status(403).json({ error: 'Only SuperAdmin can assign or remove system roles.' });
    if (roleUpdate && !userCanManageTargetRole(req, roleUpdate[1])) return res.status(403).json({ error: 'Only SuperAdmin can assign privileged roles.' });
    for (const phoneField of ['phone_number', 'two_factor_phone']) {
      const phoneUpdate = updates.find(([key]) => key === phoneField);
      if (!phoneUpdate) continue;
      if (!phoneUpdate[1] && phoneField === 'two_factor_phone') {
        phoneUpdate[1] = null;
        continue;
      }
      try {
        phoneUpdate[1] = normalizePhone(phoneUpdate[1]);
      } catch {
        return res.status(400).json({ error: 'Select the country and enter a valid international phone number.' });
      }
    }
    if (updates.length) {
      const revokesSessions = updates.some(([key]) => key === 'role' || key === 'is_active');
      const fields = `${updates.map(([key]) => `${key} = ?`).join(', ')}${revokesSessions ? ', session_version = session_version + 1' : ''}`;
      await pool.query(`UPDATE user_profiles SET ${fields} WHERE id = ?`, [...updates.map(([, value]) => value), req.params.id]);
      if (revokesSessions) await revokeUserSessions(pool, req.params.id, updates.some(([key, value]) => key === 'is_active' && !value) ? 'ACCOUNT_DISABLED' : 'ROLE_CHANGED');
    }
    if (roleUpdate) {
      await pool.query(
        `INSERT INTO user_module_roles (user_id,module_id,role_id,granted_by) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE role_id=VALUES(role_id),granted_by=VALUES(granted_by),granted_at=CURRENT_TIMESTAMP`,
        [req.params.id, 'cims', `cims:${roleUpdate[1]}`, req.user.id],
      );
      if (CRMS_ACCESS_ROLES.has(roleUpdate[1])) {
        await pool.query(
          `INSERT INTO user_module_roles (user_id,module_id,role_id,granted_by) VALUES (?,?,?,?)
           ON DUPLICATE KEY UPDATE role_id=VALUES(role_id),granted_by=VALUES(granted_by),granted_at=CURRENT_TIMESTAMP`,
          [req.params.id, 'crms', `crms:${roleUpdate[1]}`, req.user.id],
        );
      } else {
        await pool.query("DELETE FROM user_module_roles WHERE user_id = ? AND module_id = 'crms'", [req.params.id]);
      }
    }
    if (moduleRolesUpdate) {
      await applyModuleRoleAssignments({ userId: req.params.id, moduleRoles: moduleRolesUpdate, grantedBy: req.user.id });
    }
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A user with this email already exists.' });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/access/permissions', requireRole('SuperAdmin'), (_req, res) => {
  res.json(CAPABILITY_DEFINITIONS);
});

app.put('/api/user_profiles/:id/permissions', requireRole('SuperAdmin'), async (req, res) => {
  let connection;
  try {
    const requested = Array.isArray(req.body.permissions) ? req.body.permissions : [];
    const normalized = normalizePermissions(requested);
    if (normalized.length !== new Set(requested).size) {
      return res.status(400).json({ error: 'One or more permissions are invalid.' });
    }
    const [targets] = await pool.query('SELECT id FROM user_profiles WHERE id = ? LIMIT 1', [req.params.id]);
    if (!targets.length) return res.status(404).json({ error: 'User not found.' });

    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query('DELETE FROM user_permissions WHERE user_id = ?', [req.params.id]);
    for (const permissionId of normalized) {
      await connection.query(
        'INSERT INTO user_permissions (user_id,permission_id,granted_by) VALUES (?,?,?)',
        [req.params.id, permissionId, req.user.id],
      );
    }
    await connection.query('UPDATE user_profiles SET session_version=session_version+1 WHERE id=?', [req.params.id]);
    await revokeUserSessions(connection, req.params.id, 'PERMISSIONS_CHANGED');
    await connection.commit();
    connection.release();
    connection = null;
    await auditSecurityEvent(pool, req, 'user_permissions_updated', {
      targetUserId: req.params.id,
      permissions: normalized,
    });
    res.json({ success: true, extra_permissions: normalized });
  } catch (err) {
    if (connection) {
      await connection.rollback().catch(() => {});
      connection.release();
    }
    res.status(500).json({ error: 'Unable to update user permissions.' });
  }
});

app.delete('/api/user_profiles/:id', authMiddleware, requireCapability('users.manage'), async (req, res) => {
  try {
    const [targets] = await pool.query('SELECT role FROM user_profiles WHERE id=? LIMIT 1', [req.params.id]);
    if (!targets.length) return res.status(404).json({ error: 'User not found.' });
    if (!userCanManageTargetRole(req, targets[0].role)) return res.status(403).json({ error: 'Only SuperAdmin can delete privileged users.' });
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'SuperAdmin cannot delete their own account.' });
    await pool.query('DELETE FROM user_profiles WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/user_profiles/:id/password', authMiddleware, async (req, res) => {
  try {
    if (!isAdminOrSuperAdmin(req)) return res.status(403).json({ error: 'Only Admin or SuperAdmin can reset user passwords.' });
    const [targetRows] = await pool.query('SELECT role FROM user_profiles WHERE id = ? LIMIT 1', [req.params.id]);
    if (!targetRows.length) return res.status(404).json({ error: 'User not found.' });
    if (!userCanManageTargetRole(req, targetRows[0].role)) return res.status(403).json({ error: 'Only SuperAdmin can reset Admin or SuperAdmin passwords.' });
    const password = String(req.body.password || '');
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const passwordHash = await hashPassword(password);
    await pool.query('UPDATE user_profiles SET password = ?, first_login = TRUE, session_version = session_version + 1 WHERE id = ?', [passwordHash, req.params.id]);
    await revokeUserSessions(pool, req.params.id, 'PASSWORD_RESET');
    const loginUrl = canonicalAppUrl(req);
    const delivery = await sendUserNotification({
      pool,
      userId: req.params.id,
      title: 'Password reset by administrator',
      message: 'An administrator reset your RIANA CIMS password. Sign in with the temporary password supplied by your administrator and change it immediately.',
      type: 'warning',
      actionUrl: loginUrl,
      notificationType: 'password_reset',
      email: true,
      sms: true,
      smsMessage: 'RIANA CIMS: An administrator reset your password. Use the temporary password supplied by the administrator and change it after signing in.',
    });
    res.json({ success: true, notification_delivery: delivery });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// METADATA (Departments, Subsidiaries, Industry)
app.get('/api/departments', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM departments');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/subsidiaries', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM subsidiaries ORDER BY subsidiary_name');
    res.json(rows.map(r => ({
      ...r,
      default_escalation_matrix: typeof r.default_escalation_matrix === 'string' ? JSON.parse(r.default_escalation_matrix) : r.default_escalation_matrix,
      equipment_configuration: typeof r.equipment_configuration === 'string' ? JSON.parse(r.equipment_configuration) : r.equipment_configuration,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/subsidiaries/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM subsidiaries WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Subsidiary not found.' });
    const row = rows[0];
    res.json({
      ...row,
      default_escalation_matrix: typeof row.default_escalation_matrix === 'string'
        ? JSON.parse(row.default_escalation_matrix)
        : row.default_escalation_matrix,
      equipment_configuration: typeof row.equipment_configuration === 'string'
        ? JSON.parse(row.equipment_configuration)
        : row.equipment_configuration,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/subsidiaries', requireCapability('subsidiaries.manage'), async (req, res) => {
  try {
    const id = uuidv4();
    const subsidiaryName = String(req.body.subsidiary_name || '').trim();
    if (!subsidiaryName || subsidiaryName.length > 50) return res.status(400).json({ error: 'A valid subsidiary name is required.' });
    await pool.query('INSERT INTO subsidiaries (id, subsidiary_name) VALUES (?, ?)', [id, subsidiaryName]);
    res.status(201).json({ id, subsidiary_name: subsidiaryName });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A subsidiary with this name already exists.' });
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/subsidiaries/:id', requireCapability('subsidiaries.manage'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = allowedEntries(req.body, SUBSIDIARY_FIELDS);
    if (!updates.length) return res.status(400).json({ error: 'No valid subsidiary fields supplied.' });
    const nameUpdate = updates.find(([key]) => key === 'subsidiary_name');
    if (nameUpdate) {
      nameUpdate[1] = String(nameUpdate[1] || '').trim();
      if (!nameUpdate[1] || nameUpdate[1].length > 50) return res.status(400).json({ error: 'A valid subsidiary name is required.' });
    }
    const matrixUpdate = updates.find(([key]) => key === 'default_escalation_matrix');
    if (matrixUpdate) {
      try {
        matrixUpdate[1] = normalizeEscalationMatrixPayload(matrixUpdate[1], isSuperAdmin(req));
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
    }
    const equipmentUpdate = updates.find(([key]) => key === 'equipment_configuration');
    if (equipmentUpdate) {
      if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Only SuperAdmin can configure subsidiary E-handover equipment.' });
      try {
        equipmentUpdate[1] = normalizeEquipmentConfigurationPayload(equipmentUpdate[1]);
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }
    }
    const fields = updates.map(([key]) => `${key} = ?`).join(', ');
    const values = updates.map(([, value]) => sqlValue(value));
    const [result] = await pool.query(`UPDATE subsidiaries SET ${fields} WHERE id = ?`, [...values, id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Subsidiary not found.' });
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A subsidiary with this name already exists.' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/subsidiaries/:id', requireCapability('subsidiaries.manage'), async (req, res) => {
  try {
    const [[usage]] = await pool.query('SELECT COUNT(*) AS user_count FROM user_profiles WHERE subsidiary_id = ?', [req.params.id]);
    if (Number(usage.user_count) > 0) {
      return res.status(409).json({
        error: `This subsidiary has ${usage.user_count} attached user${Number(usage.user_count) === 1 ? '' : 's'}. Reassign them before deleting it.`,
      });
    }
    const [result] = await pool.query('DELETE FROM subsidiaries WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Subsidiary not found.' });
    await auditSecurityEvent(pool, req, 'subsidiary_deleted', { subsidiaryId: req.params.id });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


app.get('/api/industry_classifications', (req, res) => {
  res.json(['Banking', 'Healthcare', 'Retail', 'Education', 'Government', 'Hospitality', 'Telecommunications', 'Transport', 'Other']);
});

// FEEDBACK LINKS
app.get('/api/feedback_links', async (req, res) => {
  try {
    const { client_id } = req.query;
    const values = client_id ? [client_id] : [];
    const where = client_id ? `WHERE ${sqlUuidParamEquals('f.client_id')}` : '';
    const [rows] = await pool.query(`
      SELECT f.*, c.client_name, c.branch AS client_branch, cb.branch_name, cd.department_name,
             (SELECT COUNT(*) FROM client_branches b2 WHERE ${sqlUuidEquals('b2.client_id', 'f.client_id')} AND b2.deleted_at IS NULL) AS branch_count,
             (SELECT COUNT(*) FROM client_departments d2 WHERE ${sqlUuidEquals('d2.client_id', 'f.client_id')} AND d2.deleted_at IS NULL AND (f.branch_id IS NULL OR ${sqlUuidEquals('d2.branch_id', 'f.branch_id')})) AS department_count
      FROM feedback_links f
      LEFT JOIN clients c ON ${sqlUuidEquals('c.id', 'f.client_id')}
      LEFT JOIN client_branches cb ON ${sqlUuidEquals('cb.id', 'f.branch_id')}
      LEFT JOIN client_departments cd ON ${sqlUuidEquals('cd.id', 'f.department_id')}
      ${where}
      ORDER BY f.created_at DESC
    `, values);
    res.json(rows.map(row => ({
      ...row,
      branch_label: scopedBranchLabel(row),
      department_label: scopedDepartmentLabel(row),
      scope_label: scopedLabel(row),
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/feedback_links', requireAnyCapability('clients.manage', 'installations.manage'), async (req, res) => {
  try {
    const id = uuidv4();
    const data = req.body;
    const token = crypto.randomBytes(32).toString('base64url');
    const [installationRows] = data.installation_id
      ? await pool.query('SELECT client_id,branch_id,department_id FROM installations WHERE id = ? LIMIT 1', [data.installation_id])
      : [[]];
    const installation = installationRows[0] || {};
    const scope = await validateClientBranchDepartment({
      clientId: data.client_id || installation.client_id,
      branchId: data.branch_id || installation.branch_id,
      departmentId: data.department_id || installation.department_id,
      allowInactive: true,
    });
    const expiresAt = resolveFeedbackExpiresAt(data);
    await pool.query(
      'INSERT INTO feedback_links (id, client_id, installation_id, branch_id, department_id, unique_token, expires_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, scope.clientId, data.installation_id || null, scope.branchId, scope.departmentId, token, expiresAt, req.user.id],
    );
    const [rows] = await pool.query('SELECT * FROM feedback_links WHERE id = ? LIMIT 1', [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    const status = err.status && err.status < 500 ? err.status : 500;
    console.error('Feedback link creation error:', err);
    res.status(status).json({
      error: status >= 500
        ? 'Unable to generate feedback link. Restart the API server to apply schema updates, then try again.'
        : err.message,
      code: status >= 500 ? 'FEEDBACK_LINK_CREATE_FAILED' : err.code || 'FEEDBACK_LINK_INVALID',
    });
  }
});

app.patch('/api/feedback_links/:id', requireAnyCapability('clients.manage', 'installations.manage'), async (req, res) => {
  try {
    const updates = allowedEntries(req.body, FEEDBACK_LINK_FIELDS);
    if (!updates.length) return res.status(400).json({ error: 'No valid feedback-link fields supplied.' });
    const fields = updates.map(([key]) => `${key} = ?`).join(', ');
    await pool.query(`UPDATE feedback_links SET ${fields} WHERE id = ?`, [...updates.map(([, value]) => sqlValue(value)), req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


app.get('/api/feedback_links/:id/preview', authMiddleware, requireAnyCapability('clients.manage', 'installations.manage'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.id,f.unique_token,f.expires_at,f.is_used,f.email_sent,f.sms_sent,c.client_name,c.contact_person_name,c.contact_email,c.contact_phone,
              c.branch AS client_branch, cb.branch_name, cd.department_name,
              (SELECT COUNT(*) FROM client_branches b2 WHERE ${sqlUuidEquals('b2.client_id', 'f.client_id')} AND b2.deleted_at IS NULL) AS branch_count,
              (SELECT COUNT(*) FROM client_departments d2 WHERE ${sqlUuidEquals('d2.client_id', 'f.client_id')} AND d2.deleted_at IS NULL AND (f.branch_id IS NULL OR ${sqlUuidEquals('d2.branch_id', 'f.branch_id')})) AS department_count
       FROM feedback_links f
       JOIN clients c ON ${sqlUuidEquals('c.id', 'f.client_id')}
       LEFT JOIN client_branches cb ON ${sqlUuidEquals('cb.id', 'f.branch_id')}
       LEFT JOIN client_departments cd ON ${sqlUuidEquals('cd.id', 'f.department_id')}
       WHERE f.id = ? LIMIT 1`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Feedback link not found' });
    res.json({ ...rows[0], preview: buildFeedbackLinkPreview(req, rows[0]) });
  } catch (err) { res.status(500).json({ error: 'Unable to preview feedback link.' }); }
});
app.post('/api/feedback_links/:id/send', authMiddleware, requireAnyCapability('clients.manage', 'installations.manage'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.id,f.unique_token,f.expires_at,c.client_name,c.contact_person_name,c.contact_email,c.contact_phone,
              c.branch AS client_branch, cb.branch_name, cd.department_name,
              (SELECT COUNT(*) FROM client_branches b2 WHERE ${sqlUuidEquals('b2.client_id', 'f.client_id')} AND b2.deleted_at IS NULL) AS branch_count,
              (SELECT COUNT(*) FROM client_departments d2 WHERE ${sqlUuidEquals('d2.client_id', 'f.client_id')} AND d2.deleted_at IS NULL AND (f.branch_id IS NULL OR ${sqlUuidEquals('d2.branch_id', 'f.branch_id')})) AS department_count
       FROM feedback_links f
       JOIN clients c ON ${sqlUuidEquals('c.id', 'f.client_id')}
       LEFT JOIN client_branches cb ON ${sqlUuidEquals('cb.id', 'f.branch_id')}
       LEFT JOIN client_departments cd ON ${sqlUuidEquals('cd.id', 'f.department_id')}
       WHERE f.id = ? LIMIT 1`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Feedback link not found' });
    const feedback = rows[0];
    if (!feedback.contact_email && !feedback.contact_phone) {
      return res.status(400).json({ error: 'The client has no email address or phone number.' });
    }
    const preview = buildFeedbackLinkPreview(req, feedback);
    const feedbackUrl = preview.feedback_url;
    const message = preview.message;
    const deliveries = [];
    if (feedback.contact_email) {
      deliveries.push({ channel: 'email', promise: sendEmail({
        recipientEmail: feedback.contact_email,
        recipientName: feedback.contact_person_name || feedback.client_name,
        notificationType: 'feedback_requested',
        clientName: feedback.client_name,
        requestDescription: message,
        actionUrl: feedbackUrl,
      }) });
    }
    if (feedback.contact_phone) {
      const feedbackMessage = `RIANA: Please rate your installation experience: ${feedbackUrl}`;
      deliveries.push({ channel: 'sms', promise: sendSms({
        phoneNumber: feedback.contact_phone,
        message: feedbackMessage,
      }) });
      if (whatsappConfigured()) {
        deliveries.push({ channel: 'whatsapp', promise: sendWhatsApp({
          phoneNumber: feedback.contact_phone,
          message: feedbackMessage,
          recipientName: feedback.contact_person_name || feedback.client_name,
          serviceName: 'Installation feedback',
          bookingDate: new Date().toLocaleDateString('en-GB'),
          notificationType: 'feedback_requested',
          clientName: feedback.client_name,
        }) });
      }
    }
    const settled = await Promise.allSettled(deliveries.map(delivery => delivery.promise));
    const results = settled.map((result, index) => ({
      channel: deliveries[index].channel,
      success: result.status === 'fulfilled',
      ...(result.status === 'fulfilled' ? { result: result.value } : { error: result.reason?.message || 'Delivery failed' }),
    }));
    const emailSent = results.some(result => result.channel === 'email' && result.success);
    const smsSent = results.some(result => result.channel === 'sms' && result.success);
    await pool.query('UPDATE feedback_links SET email_sent = ?, sms_sent = ? WHERE id = ?', [emailSent, smsSent, feedback.id]);
    const failed = results.filter(result => !result.success);
    await logSuccess(pool, req, { action: 'feedback_link_sent', category: 'notification', module: 'Feedback', entity_type: 'feedback_link', entity_id: feedback.id, description: 'Feedback link delivery was attempted.', metadata: { email_sent: emailSent, sms_sent: smsSent } });
    res.status(failed.length === results.length ? 502 : 200).json({ success: failed.length === 0, email_sent: emailSent, sms_sent: smsSent, deliveries: results, preview });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// INSTALLATION FEEDBACK
app.get('/api/installation_feedback', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT f.*, c.client_name, i.kiosk_type as installation_name
      FROM installation_feedback f
      LEFT JOIN clients c ON ${sqlUuidEquals('f.client_id', 'c.id')}
      LEFT JOIN installations i ON ${sqlUuidEquals('f.installation_id', 'i.id')}
      ORDER BY f.created_at DESC
    `);
    res.json(rows.map(row => ({
      ...row,
      client_comments: row.positive_feedback || row.improvement_suggestions || textFeedbackFromResponses(row.dynamic_responses)[0] || '',
      client_improvement_suggestions: row.improvement_suggestions || '',
      dynamic_responses: typeof row.dynamic_responses === 'string'
        ? (() => { try { return JSON.parse(row.dynamic_responses); } catch { return {}; } })()
        : row.dynamic_responses,
      clients: { client_name: row.client_name },
      installations: { installation_name: row.installation_name }
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/feedback', async (req, res) => {
  try {
    const { installation_id, client_id, submitted_by, dynamic_responses, ...feedbackData } = req.body;
    const id = uuidv4();
    const textResponses = textFeedbackFromResponses(dynamic_responses);
    const positiveFeedback = feedbackData.positive_feedback || feedbackData.comments || textResponses[0] || '';
    const improvementSuggestions = feedbackData.improvement_suggestions || textResponses.slice(1).join('\n\n') || '';
    
    // Support both direct column passing and nested data
    await pool.query(
      `INSERT INTO installation_feedback (
        id, installation_id, client_id, submitted_by, 
        installation_quality_rating, installation_timeliness_rating, installation_communication_rating,
        technician_knowledge_rating, technician_professionalism_rating, technician_helpfulness_rating,
        recommendation_score, overall_satisfaction, positive_feedback, improvement_suggestions,
        dynamic_responses, feedback_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
      [
        id, 
        installation_id, 
        client_id, 
        submitted_by || null,
        feedbackData.installation_quality_rating || feedbackData.quality_of_work || 5, 
        feedbackData.installation_timeliness_rating || feedbackData.timeliness || 5, 
        feedbackData.installation_communication_rating || feedbackData.communication || 5,
        feedbackData.technician_knowledge_rating || 5, 
        feedbackData.technician_professionalism_rating || feedbackData.professionalism || 5, 
        feedbackData.technician_helpfulness_rating || 5,
        normalizedScore(feedbackData.recommendation_score ?? feedbackData.recommend_to_others, 0, 10, 10),
        normalizedScore(feedbackData.overall_satisfaction, 1, 5, 5),
        positiveFeedback, 
        improvementSuggestions,
        JSON.stringify(normalizeFeedbackResponses(dynamic_responses))
      ]
    );
    res.status(201).json({ id, success: true });
  } catch (err) { 
    console.error('Error submitting feedback:', err);
    res.status(500).json({ error: err.message }); 
  }
});

// ANNOUNCEMENTS
app.get('/api/announcements', authMiddleware, async (req, res) => {
  try {
    const { created_by_user_id, user_id } = req.query;
    let query = `
      SELECT a.*, 
             u.first_name as creator_first_name, u.last_name as creator_last_name, u.email as creator_email,
             s.subsidiary_name,
             (SELECT COUNT(*) FROM announcement_reads ar WHERE ar.announcement_id = a.id) AS read_count,
             CASE a.target_audience
               WHEN 'admins' THEN (SELECT COUNT(*) FROM user_profiles WHERE is_active = TRUE AND role = 'Admin')
               WHEN 'teamleads' THEN (SELECT COUNT(*) FROM user_profiles WHERE is_active = TRUE AND role = 'Teamlead')
               WHEN 'technicians' THEN (SELECT COUNT(*) FROM user_profiles WHERE is_active = TRUE AND role = 'User')
               WHEN 'sales' THEN (SELECT COUNT(*) FROM user_profiles WHERE is_active = TRUE AND role = 'Sales')
               ELSE (SELECT COUNT(*) FROM user_profiles WHERE is_active = TRUE)
             END AS total_target,
             EXISTS(SELECT 1 FROM announcement_reads ur WHERE ur.announcement_id = a.id AND ur.user_id = ?) AS is_read
      FROM announcements a
      LEFT JOIN user_profiles u ON a.created_by_user_id = u.id
      LEFT JOIN subsidiaries s ON a.subsidiary_id = s.id
    `;
    const params = [user_id || req.user.id];
    if (created_by_user_id) {
      query += ' WHERE a.created_by_user_id = ?';
      params.push(created_by_user_id);
    } else {
      query += ' WHERE a.is_active = TRUE AND (a.expires_at IS NULL OR a.expires_at > NOW())';
    }
    query += ' ORDER BY a.created_at DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows.map((announcement) => ({
      ...announcement,
      is_read: Boolean(announcement.is_read),
      creator: { first_name: announcement.creator_first_name, last_name: announcement.creator_last_name, email: announcement.creator_email },
      subsidiary: announcement.subsidiary_name ? { subsidiary_name: announcement.subsidiary_name } : null,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/announcements', authMiddleware, requireCapability('announcements.manage'), async (req, res) => {
  try {
    const { title, content, priority, target_audience, subsidiary_id, expires_at } = req.body;
    const id = uuidv4();
    await pool.query(
      'INSERT INTO announcements (id, title, content, priority, target_audience, subsidiary_id, created_by_user_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, content, priority, target_audience || 'all', subsidiary_id, req.user.id, expires_at || null]
    );
    res.status(201).json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/announcements/:id/read', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'INSERT IGNORE INTO announcement_reads (id,announcement_id,user_id) VALUES (?,?,?)',
      [uuidv4(), req.params.id, req.user.id],
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/announcements/:id', authMiddleware, requireCapability('announcements.manage'), async (req, res) => {
  try {
    const { title, content, priority, target_audience, subsidiary_id, expires_at } = req.body;
    await pool.query(
      'UPDATE announcements SET title = ?, content = ?, priority = ?, target_audience = ?, subsidiary_id = ?, expires_at = ? WHERE id = ?',
      [title, content, priority, target_audience, subsidiary_id, expires_at || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/announcements/:id', requireCapability('announcements.manage'), async (req, res) => {
  try {
    const { is_active } = req.body;
    await pool.query('UPDATE announcements SET is_active = ? WHERE id = ?', [is_active, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/announcements/:id', requireCapability('announcements.manage'), async (req, res) => {
  try {
    await pool.query('DELETE FROM announcements WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/announcement_reads/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, u.first_name, u.last_name, u.email, u.role
       FROM announcement_reads r
       JOIN user_profiles u ON r.user_id = u.id
       WHERE r.announcement_id = ?
       ORDER BY r.read_at DESC`,
      [req.params.id]
    );
    res.json(rows.map(row => ({
      ...row,
      user: { first_name: row.first_name, last_name: row.last_name, email: row.email, role: row.role }
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// HANDOVER UPLOADS
app.get('/api/handover_uploads', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT h.*, c.client_name, c.branch AS client_branch, cb.branch_name, cd.department_name,
             i.status AS installation_status, i.remarks AS installation_notes,
             (SELECT COUNT(*) FROM client_branches b2 WHERE ${sqlUuidEquals('b2.client_id', 'h.client_id')} AND b2.deleted_at IS NULL) AS branch_count,
             (SELECT COUNT(*) FROM client_departments d2 WHERE ${sqlUuidEquals('d2.client_id', 'h.client_id')} AND d2.deleted_at IS NULL AND (COALESCE(h.branch_id, i.branch_id) IS NULL OR ${sqlUuidEquals('d2.branch_id', 'COALESCE(h.branch_id, i.branch_id)')})) AS department_count
      FROM handover_uploads h
      LEFT JOIN clients c ON ${sqlUuidEquals('c.id', 'h.client_id')}
      LEFT JOIN installations i ON ${sqlUuidEquals('i.id', 'h.installation_id')}
      LEFT JOIN client_branches cb ON ${sqlUuidEquals('cb.id', 'COALESCE(h.branch_id, i.branch_id)')}
      LEFT JOIN client_departments cd ON ${sqlUuidEquals('cd.id', 'COALESCE(h.department_id, i.department_id)')}
      ORDER BY h.upload_date DESC
    `);
    res.json(rows.map(row => attachSecureHandoverUrls({
      ...row,
      branch: row.branch_name || row.client_branch,
      branch_name: row.branch_name || row.client_branch,
      department_name: row.department_name || null,
      branch_label: scopedBranchLabel(row),
      department_label: scopedDepartmentLabel(row),
      scope_label: scopedLabel(row),
      clients: { client_name: row.client_name, branch: row.branch_name || row.client_branch },
      installations: { status: row.installation_status, remarks: row.installation_notes },
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/handover_uploads', async (req, res) => {
  try {
    const id = uuidv4();
    const data = req.body;
    const storedPath = path.basename(normalizeStoredFileReference(data.file_path));
    const resolved = resolveStoredFile(uploadsDir, storedPath);
    if (!resolved || !fs.existsSync(resolved)) return res.status(400).json({ error: 'Uploaded file does not exist.' });
    const [installations] = data.installation_id
      ? await pool.query('SELECT client_id,branch_id,department_id FROM installations WHERE id = ? LIMIT 1', [data.installation_id])
      : [[]];
    const installation = installations[0] || {};
    const clientId = data.client_id || installation.client_id;
    const scope = await validateClientBranchDepartment({
      clientId,
      branchId: data.branch_id || installation.branch_id,
      departmentId: data.department_id || installation.department_id,
    });
    const versionGroupId = data.version_group_id || uuidv4();
    await pool.query(
      `INSERT INTO handover_uploads
       (id, client_id, installation_id, branch_id, department_id, work_type, change_request_id, version_group_id, version_number, is_latest_version, status, file_name, file_path, file_size, is_signed, notes, uploaded_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, 'uploaded', ?, ?, ?, ?, ?, ?)`,
      [id, scope.clientId, data.installation_id || null, scope.branchId, scope.departmentId, data.work_type || 'installation', data.change_request_id || null, versionGroupId, Number(data.version_number || 1), data.file_name, storedPath, data.file_size, data.is_signed, data.notes, req.user.id]
    );
    if (data.installation_id) {
      await pool.query(
        `UPDATE installations
         SET status = 'completed', completion_date = COALESCE(completion_date, CURDATE()), handover_file_path = ?, handover_status = ?
         WHERE id = ?`,
        [storedPath, data.is_signed ? 'signed' : 'uploaded', data.installation_id],
      );
    }
    res.json({ success: true, id, file_path: storedPath, file_path_label: path.basename(storedPath), ...legacyFileAccessUrls(storedPath) });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// INSTALLATION BUDGETS
app.get('/api/budgets', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM installation_budgets ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/budgets', requireCapability('finances.manage'), async (req, res) => {
  try {
    const { installation_id, total_budget, labor_cost, equipment_cost, transport_cost, miscellaneous_cost, notes, created_by, currency, branch } = req.body;
    const id = uuidv4();
    await pool.query(
      'INSERT INTO installation_budgets (id, installation_id, total_budget, labor_cost, equipment_cost, transport_cost, miscellaneous_cost, notes, created_by, currency, branch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, installation_id, total_budget, labor_cost, equipment_cost, transport_cost, miscellaneous_cost, notes, created_by, currency, branch]
    );
    res.status(201).json({ id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/budgets/:id', requireCapability('finances.manage'), async (req, res) => {
  try {
    const { labor_cost, equipment_cost, transport_cost, miscellaneous_cost, total_budget, notes, currency } = req.body;
    await pool.query(
      'UPDATE installation_budgets SET labor_cost = ?, equipment_cost = ?, transport_cost = ?, miscellaneous_cost = ?, total_budget = ?, notes = ?, currency = ? WHERE id = ?',
      [labor_cost, equipment_cost, transport_cost, miscellaneous_cost, total_budget, notes, currency, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/budgets/:id', requireCapability('finances.manage'), async (req, res) => {
  try {
    await pool.query('DELETE FROM installation_budgets WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// TECHNICIAN PERFORMANCE SCORES
app.get('/api/technician_performance_scores', async (req, res) => {
  try {
    const { period_start, period_end } = req.query;
    let query = `
      SELECT s.*, u.first_name, u.last_name, u.email
      FROM technician_performance_scores s
      LEFT JOIN user_profiles u ON s.technician_id = u.id
    `;
    const params = [];
    if (period_start && period_end) {
      query += ' WHERE s.period_start >= ? AND s.period_end <= ?';
      params.push(period_start, period_end);
    }
    query += ' ORDER BY s.overall_score DESC';
    
    const [rows] = await pool.query(query, params);
    res.json(rows.map(r => ({
      ...r,
      technician: {
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email
      }
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SYSTEM LOGS
app.get('/api/system_logs', requireCapability('reports.view'), async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT l.*, u.email FROM system_logs l LEFT JOIN user_profiles u ON ${sqlUuidEquals('l.user_id', 'u.id')} ORDER BY l.created_at DESC LIMIT 100`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/system_logs', async (req, res) => {
  try {
    const id = uuidv4();
    const data = req.body;
    await pool.query('INSERT INTO system_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)', [id, req.user.id, data.action, data.details]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// COMPANY SETTINGS
app.get('/api/admin/email-configuration', requireCapability('company.manage'), (_req, res) => {
  res.json({ ...smtpStatus(), sms: smsStatus(), whatsapp: whatsappStatus() });
});

app.post('/api/admin/email-configuration/test', requireCapability('company.manage'), async (req, res) => {
  try {
    const action = req.body?.action === 'send' ? 'send' : 'connection';
    if (action === 'connection') return res.json(await verifySmtpConnection());
    const recipientEmail = String(req.body?.recipientEmail || '').trim();
    const delivery = await sendEmail({
      recipientEmail,
      recipientName: 'RIANA CIMS administrator',
      notificationType: 'general',
      requestDescription: `Production SMTP test requested from Company Settings at ${new Date().toISOString()}. No action is required.`,
      deliveryTest: true,
    });
    res.json({ ...smtpStatus(), delivery });
  } catch (error) {
    res.status(502).json({ error: error.message, status: smtpStatus() });
  }
});

app.get('/api/companies', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM company_settings LIMIT 1');
    res.json(rows[0] || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/companies', requireCapability('company.manage'), async (req, res) => {
  try {
    const updates = allowedEntries(req.body, COMPANY_FIELDS);
    if (!updates.length) return res.status(400).json({ error: 'No valid company-setting fields supplied.' });
    const [rows] = await pool.query('SELECT id FROM company_settings LIMIT 1');
    if (rows.length) {
      const id = rows[0].id;
      const fields = updates.map(([key]) => `${key} = ?`).join(', ');
      const values = updates.map(([, value]) => sqlValue(value));
      await pool.query(`UPDATE company_settings SET ${fields} WHERE id = ?`, [...values, id]);
    } else {
      const id = 1;
      const fields = ['id', ...updates.map(([key]) => key)];
      const placeholders = fields.map(() => '?').join(', ');
      const values = [id, ...updates.map(([, value]) => sqlValue(value))];
      await pool.query(`INSERT INTO company_settings (${fields.join(', ')}) VALUES (${placeholders})`, values);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// LATEST FEEDBACK
app.get('/api/installation_feedback/latest', async (req, res) => {
  try {
    const { client_id, installation_id } = req.query;
    const [rows] = await pool.query(
      'SELECT *, positive_feedback AS client_comments, improvement_suggestions AS client_improvement_suggestions FROM installation_feedback WHERE client_id = ? AND installation_id = ? ORDER BY created_at DESC LIMIT 1',
      [client_id, installation_id]
    );
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// INTERNAL FEEDBACK REMOVED - CONSOLIDATED IN LINE 1098

// FEEDBACK QUESTIONS
app.get('/api/feedback_questions', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM feedback_questions WHERE is_active = TRUE ORDER BY order_index ASC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/feedback_questions', requireCapability('company.manage'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM feedback_questions ORDER BY order_index ASC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/feedback_questions', requireCapability('company.manage'), async (req, res) => {
  try {
    const id = uuidv4();
    const data = req.body;
    await pool.query(
      'INSERT INTO feedback_questions (id, question_text, question_type, category, order_index) VALUES (?, ?, ?, ?, ?)',
      [id, data.question_text, data.question_type, data.category, data.order_index]
    );
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/feedback_questions/:id', requireCapability('company.manage'), async (req, res) => {
  try {
    const data = req.body;
    await pool.query(
      'UPDATE feedback_questions SET question_text = ?, question_type = ?, category = ?, order_index = ?, is_active = ? WHERE id = ?',
      [data.question_text, data.question_type, data.category, data.order_index, data.is_active, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/feedback_questions/:id', requireCapability('company.manage'), async (req, res) => {
  try {
    // Soft delete to protect existing feedback relationships
    await pool.query('UPDATE feedback_questions SET is_active = FALSE WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUBLIC ENDPOINTS
app.get('/api/public/company-branding', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT name,logo_path,font_color,primary_color,font_type FROM company_settings ORDER BY id LIMIT 1');
    res.json(rows[0] || { name: 'RIANA CIMS', logo_path: '/Riana_logo.png', primary_color: '#0D8390' });
  } catch (_err) {
    res.json({ name: 'RIANA CIMS', logo_path: '/Riana_logo.png', primary_color: '#0D8390' });
  }
});

app.get('/api/public/feedback-links/:token', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*, (f.expires_at <= NOW()) AS is_expired, GREATEST(TIMESTAMPDIFF(SECOND, NOW(), f.expires_at), 0) AS seconds_until_expiry,
              c.client_name, c.branch AS client_branch, cb.branch_name, cd.department_name,
              (SELECT COUNT(*) FROM client_branches b2 WHERE ${sqlUuidEquals('b2.client_id', 'f.client_id')} AND b2.deleted_at IS NULL) AS branch_count,
              (SELECT COUNT(*) FROM client_departments d2 WHERE ${sqlUuidEquals('d2.client_id', 'f.client_id')} AND d2.deleted_at IS NULL AND (f.branch_id IS NULL OR ${sqlUuidEquals('d2.branch_id', 'f.branch_id')})) AS department_count
       FROM feedback_links f
       JOIN clients c ON ${sqlUuidEquals('f.client_id', 'c.id')}
       LEFT JOIN client_branches cb ON ${sqlUuidEquals('cb.id', 'f.branch_id')}
       LEFT JOIN client_departments cd ON ${sqlUuidEquals('cd.id', 'f.department_id')}
       WHERE f.unique_token = ? LIMIT 1`,
      [req.params.token],
    );
    if (!rows.length) return res.status(404).json({ error: 'Feedback link was not found.', code: 'FEEDBACK_LINK_NOT_FOUND' });
    
    const row = rows[0];
    if (row.is_used) {
      return res.status(409).json({
        error: 'Feedback already reviewed. This one-time feedback link has already been submitted.',
        code: 'FEEDBACK_ALREADY_REVIEWED',
        is_used: true,
        used_at: row.used_at,
      });
    }
    if (row.is_expired) {
      return res.status(410).json({ error: 'This feedback link has expired.', code: 'FEEDBACK_LINK_EXPIRED' });
    }

    const maxAge = Math.max(1000, Number(row.seconds_until_expiry || 0) * 1000);
    res.cookie('riana_feedback_token', req.params.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge,
      path: '/api/public',
    });
    res.json({
      ...row,
      client: {
        client_name: row.client_name,
        branch: scopedBranchLabel(row),
        department_name: scopedDepartmentLabel(row),
        scope_label: scopedLabel(row)
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/public/installation-feedback', async (req, res) => {
  let connection;
  try {
    const id = uuidv4();
    const data = req.body;
    const cookieToken = parseCookies(req.headers.cookie || '').riana_feedback_token;
    const submittedToken = String(data.feedback_token || '').trim();
    const token = cookieToken || submittedToken;
    if (!token) return res.status(401).json({ error: 'A valid feedback session is required.', code: 'FEEDBACK_SESSION_REQUIRED' });
    if (cookieToken && submittedToken && cookieToken !== submittedToken) {
      return res.status(403).json({ error: 'Feedback session does not match this link.', code: 'FEEDBACK_SESSION_MISMATCH' });
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [links] = await connection.query(
      `SELECT f.id,f.client_id,f.installation_id,f.is_used,f.used_at,f.expires_at,
              (f.expires_at <= NOW()) AS is_expired,
              c.client_name,c.contact_person_name,c.contact_email
       FROM feedback_links f
       JOIN clients c ON ${sqlUuidEquals('f.client_id', 'c.id')}
       WHERE f.unique_token = ? LIMIT 1 FOR UPDATE`,
      [token],
    );
    const link = links[0];
    if (!link) {
      await connection.rollback();
      connection.release();
      connection = null;
      return res.status(404).json({ error: 'Feedback link was not found.', code: 'FEEDBACK_LINK_NOT_FOUND' });
    }
    if (link.is_used) {
      await connection.rollback();
      connection.release();
      connection = null;
      return res.status(409).json({
        error: 'Feedback already reviewed. This one-time feedback link has already been submitted.',
        code: 'FEEDBACK_ALREADY_REVIEWED',
        is_used: true,
        used_at: link.used_at,
      });
    }
    if (link.is_expired) {
      await connection.rollback();
      connection.release();
      connection = null;
      return res.status(410).json({ error: 'This feedback link has expired.', code: 'FEEDBACK_LINK_EXPIRED' });
    }
    if (String(link.client_id) !== String(data.client_id) || String(link.installation_id || '') !== String(data.installation_id || '')) {
      await connection.rollback();
      connection.release();
      connection = null;
      return res.status(403).json({ error: 'Feedback link does not match this installation.', code: 'FEEDBACK_LINK_MISMATCH' });
    }
    await connection.query(
      `INSERT INTO installation_feedback (
        id, client_id, installation_id, 
        overall_satisfaction, recommendation_score, 
        positive_feedback, improvement_suggestions, dynamic_responses, feedback_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
      [
        id, 
        data.client_id, 
        data.installation_id, 
        normalizedScore(data.overall_satisfaction, 1, 5, 5),
        normalizedScore(data.recommendation_score, 0, 10, 10),
        textFeedbackFromResponses(data.dynamic_responses)[0] || '',
        textFeedbackFromResponses(data.dynamic_responses).slice(1).join('\n\n') || '',
        JSON.stringify(normalizeFeedbackResponses(data.dynamic_responses))
      ]
    );
    const [used] = await connection.query(
      'UPDATE feedback_links SET is_used = TRUE, used_at = NOW() WHERE id = ? AND is_used = FALSE',
      [link.id],
    );
    if (used.affectedRows !== 1) {
      await connection.rollback();
      connection.release();
      connection = null;
      return res.status(409).json({
        error: 'Feedback already reviewed. This one-time feedback link has already been submitted.',
        code: 'FEEDBACK_ALREADY_REVIEWED',
        is_used: true,
      });
    }
    await connection.commit();
    connection.release();
    connection = null;
    res.clearCookie('riana_feedback_token', { path: '/api/public', sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });

    let thankYouEmailSent = false;
    let thankYouEmailError = null;
    if (link.contact_email) {
      try {
        await sendEmail({
          recipientEmail: link.contact_email,
          recipientName: link.contact_person_name || link.client_name,
          notificationType: 'feedback_thank_you',
          clientName: link.client_name,
          requestDescription: 'Thank you for your feedback, we appreciate.',
          text: `Hello ${link.contact_person_name || link.client_name || 'there'},\n\nThank you for your feedback, we appreciate.\n\nRIANA CIMS`,
        });
        thankYouEmailSent = true;
      } catch (emailError) {
        thankYouEmailError = emailError.message || 'Thank-you email delivery failed';
        console.error('Feedback thank-you email failed:', thankYouEmailError);
      }
    }

    res.json({ success: true, thank_you_email_sent: thankYouEmailSent, thank_you_email_error: thankYouEmailError });
  } catch (err) { 
    if (connection) {
      await connection.rollback().catch(() => {});
      connection.release();
    }
    console.error('Feedback submission error:', err);
    res.status(500).json({ error: 'Unable to submit feedback.', code: 'FEEDBACK_SUBMISSION_FAILED' });
  }
});

app.post('/api/public/feedback-links/:token/use', async (req, res) => {
  try {
    const cookieToken = parseCookies(req.headers.cookie || '').riana_feedback_token;
    if (!cookieToken || cookieToken !== req.params.token) return res.status(403).json({ error: 'Feedback session does not match.' });
    const [rows] = await pool.query(
      'SELECT id,is_used,used_at FROM feedback_links WHERE unique_token = ? AND expires_at > NOW() LIMIT 1',
      [req.params.token],
    );
    if (!rows.length || !rows[0].is_used) return res.status(409).json({ error: 'Feedback has not been submitted.' });
    res.clearCookie('riana_feedback_token', { path: '/api/public', sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
    res.json({ success: true, used_at: rows[0].used_at });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/verify-password', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    const [rows] = await pool.query('SELECT password FROM user_profiles WHERE id = ?', [req.user.id]);
    if (rows.length && await verifyPassword(password, rows[0].password)) {
      return res.json({ success: true });
    }
    res.status(401).json({ error: 'Invalid password' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/db-stats', requireCapability('backup.manage'), async (req, res) => {
  try {
    const tables = ['clients', 'installations', 'client_assignments', 'installation_feedback', 'feedback_links', 'announcements', 'handover_uploads', 'system_logs', 'user_profiles'];
    const stats = {};
    for (const table of tables) {
      const [rows] = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
      stats[table] = rows[0].count;
    }
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/clean-db', (req, res) => {
  res.status(403).json({ error: 'System reset is disabled in production environments.' });
});


// HELP & CHAT
app.post('/api/help/send-documentation', async (req, res) => {
  const requestedEmail = String(req.body.email || req.user.email || '').trim().toLowerCase();
  const accountEmail = String(req.user.email || '').trim().toLowerCase();
  if (!accountEmail || requestedEmail !== accountEmail) {
    return res.status(403).json({ error: 'The support guide can only be sent to your signed-in work email.' });
  }

  try {
    const delivery = await sendEmail({
      recipientEmail: accountEmail,
      recipientName: String(req.body.user_name || accountEmail).slice(0, 120),
      notificationType: 'support_guide',
      requestDescription: 'Your RIANA CIMS support guide is ready. Open Help & Support for role guidance, searchable articles, Developers workflows, report instructions, system requirements, and approved support channels.',
      actionUrl: canonicalAppUrl(req),
    });
    return res.json({ success: true, message: 'Support guide sent to your work email.', provider: delivery.provider });
  } catch (error) {
    console.error(`Support guide delivery failed for user ${req.user.id}: ${error.message}`);
    return res.status(502).json({ error: 'The support guide could not be delivered. Please try again later.' });
  }
});

const buildAuditLogFilters = (query, forcedUserId = null) => {
  const where = [];
  const params = [];
  if (forcedUserId) {
    where.push('a.user_id = ?');
    params.push(forcedUserId);
  } else if (query.user_id) {
    where.push('a.user_id = ?');
    params.push(String(query.user_id));
  }
  for (const [field, column] of [
    ['module', 'a.module'], ['action', 'a.action'], ['entity_type', 'a.entity_type'],
    ['entity_id', 'a.entity_id'], ['status', 'a.status'], ['severity', 'a.severity'], ['ip_address', 'a.ip_address'],
  ]) {
    if (query[field]) {
      where.push(`${column} = ?`);
      params.push(String(query[field]).slice(0, 120));
    }
  }
  if (query.from) {
    where.push('a.created_at >= ?');
    params.push(String(query.from));
  }
  if (query.to) {
    where.push('a.created_at <= ?');
    params.push(String(query.to));
  }
  if (query.search) {
    where.push('(a.action LIKE ? OR a.description LIKE ? OR a.module LIKE ? OR a.entity_id LIKE ?)');
    const term = `%${String(query.search).slice(0, 100)}%`;
    params.push(term, term, term, term);
  }
  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
};

const auditListSelect = `
  SELECT a.id,a.event_uuid,a.user_id,a.action,a.category,a.module,a.entity_type,a.entity_id,a.description,
         a.ip_address,a.device,a.route,a.http_method,a.status,a.severity,a.created_at,
         u.email,u.first_name,u.last_name
  FROM audit_logs a
  LEFT JOIN user_profiles u ON u.id = a.user_id
`;

app.get('/api/admin/audit-logs', authMiddleware, async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      await logDenied(pool, req, { action: 'audit_logs_view_denied', category: 'security', module: 'Audit', description: 'Non-superadmin attempted to view global audit logs.' });
      return res.status(403).json({ error: 'Superadmin access is required.' });
    }
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(10, Number(req.query.limit || 50)));
    const offset = (page - 1) * limit;
    const { whereSql, params } = buildAuditLogFilters(req.query);
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM audit_logs a ${whereSql}`, params);
    const [rows] = await pool.query(`${auditListSelect} ${whereSql} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
    await logSuccess(pool, req, { action: 'audit_logs_viewed', category: 'security', module: 'Audit', description: 'Global audit logs viewed by superadmin.', metadata: sanitizeAuditData(req.query) });
    res.json({ rows, page, limit, total: Number(countRows[0]?.total || 0) });
  } catch (err) {
    res.status(500).json({ error: 'Unable to load audit logs.' });
  }
});

app.get('/api/admin/audit-logs/export', authMiddleware, async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      await logDenied(pool, req, { action: 'audit_logs_export_denied', category: 'security', module: 'Audit', description: 'Non-superadmin attempted to export global audit logs.' });
      return res.status(403).json({ error: 'Superadmin access is required.' });
    }
    const { whereSql, params } = buildAuditLogFilters(req.query);
    const [rows] = await pool.query(`${auditListSelect} ${whereSql} ORDER BY a.created_at DESC LIMIT 5000`, params);
    await logSuccess(pool, req, { action: 'audit_logs_exported', category: 'security', module: 'Audit', severity: 'notice', description: 'Global audit logs exported by superadmin.', metadata: sanitizeAuditData(req.query) });
    const header = ['created_at','user','action','module','entity_type','entity_id','status','severity','ip_address','description'];
    const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const body = rows.map((row) => [
      row.created_at,
      [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || row.user_id || 'System',
      row.action,row.module,row.entity_type,row.entity_id,row.status,row.severity,row.ip_address,row.description,
    ].map(escapeCsv).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="riana-cims-audit-logs.csv"');
    res.send(`${header.join(',')}\n${body}`);
  } catch (err) {
    res.status(500).json({ error: 'Unable to export audit logs.' });
  }
});

app.get('/api/me/activity-logs', authMiddleware, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(10, Number(req.query.limit || 25)));
    const offset = (page - 1) * limit;
    const safeQuery = { ...req.query, ip_address: undefined };
    const { whereSql, params } = buildAuditLogFilters(safeQuery, req.user.id);
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM audit_logs a ${whereSql}`, params);
    const [rows] = await pool.query(
      `SELECT a.id,a.event_uuid,a.action,a.category,a.module,a.entity_type,a.entity_id,a.description,a.device,a.status,a.severity,a.created_at
       FROM audit_logs a ${whereSql} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    res.json({ rows, page, limit, total: Number(countRows[0]?.total || 0) });
  } catch (err) {
    res.status(500).json({ error: 'Unable to load your activity logs.' });
  }
});

const buildAssistantLookupTools = (req) => {
  const canView = (viewCapability, manageCapability = viewCapability.replace('.view', '.manage')) => (
    hasCapability(req.user, viewCapability) || hasCapability(req.user, manageCapability)
  );
  const lookupText = (value) => String(value || '').trim();
  const likeText = (value) => `%${lookupText(value).toLowerCase()}%`;
  const oneOrMany = (rows) => {
    if (!rows?.length) return { status: 'not_found' };
    if (rows.length > 1) return { status: 'multiple' };
    return { status: 'found', record: rows[0] };
  };

  return {
    async getInstallation({ identifier }) {
      if (!canView('installations.view')) return { status: 'unauthorized' };
      const needle = lookupText(identifier).toLowerCase();
      try {
        const rows = await queryInstallations();
        const matches = rows
          .map(formatInstallationRow)
          .filter((row) => [row.id, row.client_name, row.branch_name, row.client_branch, row.branch, row.department_name]
            .some((value) => String(value || '').toLowerCase().includes(needle)))
          .slice(0, 2)
          .map((row) => ({
            id: row.id,
            reference: row.id,
            status: row.status,
            branch: row.branch_name || row.client_branch || row.branch,
            branch_name: row.branch_name || row.client_branch || row.branch,
            client_name: row.client_name,
            updated_at: row.updated_at,
            created_at: row.created_at,
          }));
        return oneOrMany(matches);
      } catch (error) {
        console.error('Assistant installation lookup failed:', error.message);
        return { status: 'error' };
      }
    },

    async getClient({ identifier }) {
      if (!canView('clients.view')) return { status: 'unauthorized' };
      try {
        const [rows] = await pool.query(
          `SELECT id,client_name,branch,contract_type,industry_classification,created_at,updated_at
           FROM clients
           WHERE id = ? OR LOWER(client_name) LIKE ?
           ORDER BY updated_at DESC, created_at DESC
           LIMIT 2`,
          [lookupText(identifier), likeText(identifier)],
        );
        return oneOrMany(rows);
      } catch (error) {
        console.error('Assistant client lookup failed:', error.message);
        return { status: 'error' };
      }
    },

    async getBranch({ identifier }) {
      if (!canView('clients.view')) return { status: 'unauthorized' };
      try {
        const [rows] = await pool.query(
          `SELECT b.id,b.branch_name,b.status,b.updated_at,c.client_name
           FROM client_branches b
           LEFT JOIN clients c ON ${sqlUuidEquals('c.id', 'b.client_id')}
           WHERE b.deleted_at IS NULL AND (b.id = ? OR LOWER(b.branch_name) LIKE ?)
           ORDER BY b.updated_at DESC
           LIMIT 2`,
          [lookupText(identifier), likeText(identifier)],
        );
        return oneOrMany(rows);
      } catch (error) {
        if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) {
          console.error('Assistant branch lookup failed:', error.message);
          return { status: 'error' };
        }
        try {
          const [rows] = await pool.query(
            `SELECT id,branch AS branch_name,client_name,created_at AS updated_at
             FROM clients
             WHERE branch IS NOT NULL AND branch <> '' AND (id = ? OR LOWER(branch) LIKE ?)
             ORDER BY created_at DESC
             LIMIT 2`,
            [lookupText(identifier), likeText(identifier)],
          );
          return oneOrMany(rows);
        } catch (fallbackError) {
          console.error('Assistant branch fallback failed:', fallbackError.message);
          return { status: 'error' };
        }
      }
    },

    async getDepartment({ identifier }) {
      if (!canView('clients.view')) return { status: 'unauthorized' };
      try {
        const [rows] = await pool.query(
          `SELECT d.id,d.department_name,d.status,d.updated_at,b.branch_name,c.client_name
           FROM client_departments d
           LEFT JOIN client_branches b ON ${sqlUuidEquals('b.id', 'd.branch_id')}
           LEFT JOIN clients c ON ${sqlUuidEquals('c.id', 'd.client_id')}
           WHERE d.deleted_at IS NULL AND (d.id = ? OR LOWER(d.department_name) LIKE ?)
           ORDER BY d.updated_at DESC
           LIMIT 2`,
          [lookupText(identifier), likeText(identifier)],
        );
        return oneOrMany(rows);
      } catch (error) {
        if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) return { status: 'not_available' };
        console.error('Assistant department lookup failed:', error.message);
        return { status: 'error' };
      }
    },

    async getChangeRequest({ identifier }) {
      if (!CRMS_ACCESS_ROLES.has(req.user?.role)) return { status: 'unauthorized' };
      const value = lookupText(identifier);
      const like = `%${value}%`;
      try {
        const [rows] = await pool.query(
          `SELECT cr.id,cr.ticket_number AS reference,cr.ticket_number,cr.status,cr.assigned_developer_id,cr.updated_at,cr.created_at,c.client_name
           FROM crms_change_requests cr
           LEFT JOIN clients c ON c.id COLLATE utf8mb4_general_ci = cr.client_id
           WHERE cr.id = ? OR cr.ticket_number = ? OR cr.ticket_number LIKE ?
           ORDER BY cr.updated_at DESC, cr.created_at DESC
           LIMIT 2`,
          [value, value, like],
        );
        if (!rows.length) return { status: 'not_found' };
        if (req.user.role === 'Developer') {
          const visible = rows.filter((row) => String(row.assigned_developer_id || '') === String(req.user.id));
          if (!visible.length) return { status: 'unauthorized' };
          return oneOrMany(visible);
        }
        return oneOrMany(rows);
      } catch (error) {
        if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) return { status: 'not_available' };
        console.error('Assistant change request lookup failed:', error.message);
        return { status: 'error' };
      }
    },

    async getHandover({ identifier }) {
      if (!canView('installations.view') && !hasCapability(req.user, 'files.view')) return { status: 'unauthorized' };
      const value = lookupText(identifier);
      try {
        const [rows] = await pool.query(
          `SELECT h.id,h.id AS reference,h.status,h.upload_date,h.created_at,h.file_name,c.client_name,c.branch AS client_branch,cb.branch_name
           FROM handover_uploads h
           LEFT JOIN clients c ON ${sqlUuidEquals('c.id', 'h.client_id')}
           LEFT JOIN client_branches cb ON ${sqlUuidEquals('cb.id', 'h.branch_id')}
           WHERE h.id = ? OR h.installation_id = ? OR LOWER(h.file_name) LIKE ?
           ORDER BY h.upload_date DESC
           LIMIT 2`,
          [value, value, likeText(value)],
        );
        return oneOrMany(rows.map((row) => ({ ...row, branch: row.branch_name || row.client_branch })));
      } catch (error) {
        if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) return { status: 'not_available' };
        console.error('Assistant handover lookup failed:', error.message);
        return { status: 'error' };
      }
    },

    async getReport() {
      if (!hasCapability(req.user, 'reports.view')) return { status: 'unauthorized' };
      return { status: 'not_available' };
    },
  };
};
app.post('/api/chat/assistant', async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message || message.length > 1000) return res.status(400).json({ error: 'Please enter a message between 1 and 1000 characters.' });
  const requestsInternalDetails = isSensitiveTechnicalRequest(message);

  if (requestsInternalDetails) {
    return res.json({
      topic: 'restricted',
      reply: "I can't provide credentials, source code, internal infrastructure, database details, private endpoints, or deployment configuration.",
      suggestions: [],
    });
  }

  try {
    const context = req.body && typeof req.body.context === 'object' && req.body.context !== null ? req.body.context : null;
    const answer = await getAssistantResponse({
      message,
      role: req.user.role,
      user: req.user,
      context,
      tools: buildAssistantLookupTools(req),
    });
    res.json(answer);
  } catch (error) {
    console.error('Assistant response failed:', error.message);
    res.json({ topic: 'system_error', reply: "I couldn't retrieve that information right now. Please try again.", suggestions: [] });
  }
});

// CHAT SYSTEM - indexed by user so broadcasts stay O(connections for that user)
const chatClients = new Map();

function notifyChatClients(userId, data) {
  const connections = chatClients.get(String(userId));
  if (!connections) return;
  connections.forEach((response) => response.write(`data: ${JSON.stringify(data)}\n\n`));
}

function notifyAllChatClients(data) {
  chatClients.forEach((_connections, userId) => notifyChatClients(userId, data));
}

const getOnlineChatUserCount = () => chatClients.size;

app.get('/api/chat/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  
  const clientId = uuidv4();
  const userId = req.user.id;
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!userId || String(decoded.id) !== String(userId)) throw new Error('User mismatch');
  } catch {
    res.write('event: error\ndata: { "message": "Authentication required" }\n\n');
    return res.end();
  }

  console.log(`[SSE] User ${userId} connected (client: ${clientId})`);
  res.flushHeaders();
  res.write(': connected\n\n');
  const userKey = String(userId);
  const userConnections = chatClients.get(userKey) || new Map();
  userConnections.set(clientId, res);
  chatClients.set(userKey, userConnections);
  notifyAllChatClients({ type: 'presence', userId: userKey, online: true, onlineUserCount: getOnlineChatUserCount() });

  // Set up heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  req.on('close', () => {
    console.log(`[SSE] User ${userId} disconnected (client: ${clientId})`);
    clearInterval(heartbeat);
    userConnections.delete(clientId);
    if (userConnections.size === 0) {
      chatClients.delete(userKey);
      const lastSeenAt = new Date().toISOString();
      pool.query('UPDATE user_profiles SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', [userKey])
        .catch((error) => console.warn('[SSE] Unable to update last seen:', error.message));
      notifyAllChatClients({ type: 'presence', userId: userKey, online: false, lastSeenAt, onlineUserCount: getOnlineChatUserCount() });
    }
  });
});

app.get('/api/chat/users', authMiddleware, async (req, res) => {
  try {
    await markExpiredRingingCalls(req.user.id);
    const [rows] = await pool.query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.designation, u.avatar_url, u.last_seen_at,
             (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id AND m.receiver_id = ? AND m.is_read = FALSE) as unread_count
      FROM user_profiles u
      WHERE u.id != ? AND COALESCE(u.is_active, 1) = 1
      ORDER BY COALESCE(u.first_name, u.email), COALESCE(u.last_name, '')
    `, [req.user.id, req.user.id]);
    res.json(rows.map((row) => ({ ...row, online: chatClients.has(String(row.id)) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/chat/typing', authMiddleware, async (req, res) => {
  try {
    const receiverId = String(req.body?.receiver_id || '').trim();
    if (!receiverId || receiverId === String(req.user.id)) return res.status(400).json({ error: 'Select another active user.' });
    const [recipients] = await pool.query('SELECT id FROM user_profiles WHERE id = ? AND is_active = 1 LIMIT 1', [receiverId]);
    if (!recipients.length) return res.status(404).json({ error: 'Active chat recipient not found.' });
    notifyChatClients(receiverId, {
      type: 'typing',
      userId: String(req.user.id),
      isTyping: req.body?.is_typing === true,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Unable to update typing status.' });
  }
});

const selectChatMessageSql = `
  SELECT m.*,
         s.first_name as sender_first_name, s.last_name as sender_last_name, s.avatar_url as sender_avatar_url,
         r.first_name as receiver_first_name, r.last_name as receiver_last_name, r.avatar_url as receiver_avatar_url,
         rm.content as reply_content, rm.message_kind as reply_message_kind,
         rm.attachment_file_name as reply_attachment_file_name,
         rs.first_name as reply_sender_first_name, rs.last_name as reply_sender_last_name
  FROM messages m
  JOIN user_profiles s ON m.sender_id = s.id
  JOIN user_profiles r ON m.receiver_id = r.id
  LEFT JOIN messages rm ON m.reply_to_message_id = rm.id
  LEFT JOIN user_profiles rs ON rm.sender_id = rs.id
`;


const HOSTED_PLACEHOLDER_LINE_RE = /^[\s\u00a0]*(?:[oO0]|\u039f|\u03bf|\uff2f|\uff4f|\uff10|\u25cb|\u25ef)[\s\u00a0]*$/u;
const stripHostedPlaceholderLines = (value) => String(value || '')
  .replace(/\r\n?/g, '\n')
  .split('\n')
  .filter((line) => !HOSTED_PLACEHOLDER_LINE_RE.test(line))
  .join('\n');
const normalizeChatContent = (value) => stripHostedPlaceholderLines(value)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .trim();
const chatContentHash = (value) => crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');

const sanitizeChatMessageForUser = (message, userId) => {
  const row = { ...message };
  row.is_read = Boolean(row.is_read);
  row.is_edited = Boolean(row.is_edited);
  row.is_deleted_for_everyone = Boolean(row.is_deleted_for_everyone);
  row.content = stripHostedPlaceholderLines(row.content).trim();
  row.reply_content = stripHostedPlaceholderLines(row.reply_content).trim();
  if (row.message_kind === 'call') row.content = '';
  if (row.is_deleted_for_everyone) {
    row.content = '';
    row.attachment_file_name = null;
    row.attachment_file_path = null;
    row.attachment_content_type = null;
    row.attachment_size = null;
    row.reactions = [];
    row.my_reaction = null;
    row.can_edit = false;
    row.can_delete_for_everyone = false;
    return row;
  }
  row.reactions = Array.isArray(row.reactions) ? row.reactions : [];
  const isSender = String(row.sender_id) === String(userId);
  const isUnread = !row.is_read && !row.read_at;
  const isTextLike = !row.message_kind || ['text', 'attachment'].includes(row.message_kind);
  const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
  const withinDeleteWindow = MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MINUTES <= 0
    || (createdAt && Date.now() - createdAt <= MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MINUTES * 60 * 1000);
  row.can_edit = isSender && isUnread && isTextLike;
  row.can_delete_for_everyone = isSender && isTextLike && withinDeleteWindow;
  return row;
};

const attachCallParticipants = async (messages) => {
  const callIds = messages.filter(message => message.message_kind === 'call').map(message => message.id);
  if (!callIds.length) return messages;
  const placeholders = callIds.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT cp.call_id,cp.user_id,cp.status,u.first_name,u.last_name,u.email
     FROM call_participants cp
     JOIN user_profiles u ON u.id = cp.user_id
     WHERE cp.call_id IN (${placeholders})
     ORDER BY cp.created_at ASC`,
    callIds,
  );
  const byCall = new Map();
  for (const row of rows) {
    const list = byCall.get(row.call_id) || [];
    list.push({ user_id: row.user_id, status: row.status, first_name: row.first_name, last_name: row.last_name, email: row.email });
    byCall.set(row.call_id, list);
  }
  return messages.map(message => {
    if (message.message_kind !== 'call') return message;
    const participants = byCall.get(message.id) || [];
    const participantIds = Array.from(new Set([message.sender_id, message.receiver_id, ...participants.map(participant => participant.user_id)].filter(Boolean)));
    return {
      ...message,
      call_participants: participants,
      call_participant_ids: participantIds,
      call_participant_count: participantIds.length,
    };
  });
};

const enrichChatMessages = async (messages, userId) => {
  if (!messages.length) return [];
  const ids = messages.map((message) => message.id);
  const placeholders = ids.map(() => '?').join(',');
  const [reactionRows] = await pool.query(
    `SELECT message_id,reaction_type,COUNT(*) AS count
     FROM message_reactions
     WHERE message_id IN (${placeholders})
     GROUP BY message_id,reaction_type`,
    ids,
  );
  const [myRows] = await pool.query(
    `SELECT message_id,reaction_type
     FROM message_reactions
     WHERE user_id = ? AND message_id IN (${placeholders})`,
    [userId, ...ids],
  );
  const counts = new Map();
  for (const row of reactionRows) {
    const list = counts.get(row.message_id) || [];
    list.push({ reaction_type: row.reaction_type, count: Number(row.count || 0) });
    counts.set(row.message_id, list);
  }
  const own = new Map(myRows.map((row) => [row.message_id, row.reaction_type]));
  const withReactions = messages.map((message) => sanitizeChatMessageForUser({
    ...message,
    reactions: counts.get(message.id) || [],
    my_reaction: own.get(message.id) || null,
  }, userId));
  return attachCallParticipants(withReactions);
};

const loadVisibleChatMessage = async (messageId, userId) => {
  const [rows] = await pool.query(`${selectChatMessageSql}
    WHERE m.id = ?
      AND (m.sender_id = ? OR m.receiver_id = ?)
      AND NOT EXISTS (SELECT 1 FROM message_user_deletions mud WHERE mud.message_id = m.id AND mud.user_id = ?)
    LIMIT 1`, [messageId, userId, userId, userId]);
  const enriched = await enrichChatMessages(rows, userId);
  return enriched[0] || null;
};

const notifyMessageParticipants = (message, payload) => {
  if (!message) return;
  notifyChatClients(message.sender_id, payload);
  notifyChatClients(message.receiver_id, payload);
};

const notifyCallParticipants = async (callId, payload) => {
  const [callRows] = await pool.query('SELECT sender_id,receiver_id FROM messages WHERE id = ? LIMIT 1', [callId]);
  const call = callRows[0];
  if (!call) return;
  const [participantRows] = await pool.query('SELECT user_id FROM call_participants WHERE call_id = ?', [callId]);
  const participantIds = new Set(
    [call.sender_id, call.receiver_id, ...participantRows.map((row) => row.user_id)]
      .filter(Boolean)
      .map((value) => String(value)),
  );
  participantIds.forEach((userId) => notifyChatClients(userId, payload));
};

const loadCallForUser = async (callId, userId) => {
  const [rows] = await pool.query(`${selectChatMessageSql}
    WHERE m.id = ?
      AND m.message_kind = 'call'
      AND (
        m.sender_id = ?
        OR m.receiver_id = ?
        OR EXISTS (SELECT 1 FROM call_participants cp WHERE cp.call_id = m.id AND cp.user_id = ?)
      )
      AND NOT EXISTS (SELECT 1 FROM message_user_deletions mud WHERE mud.message_id = m.id AND mud.user_id = ?)
    LIMIT 1`, [callId, userId, userId, userId, userId]);
  const enriched = await enrichChatMessages(rows, userId);
  return enriched[0] || null;
};

const publishCallUpdate = async (callId, missedNotification = false) => {
  const [callRows] = await pool.query('SELECT sender_id,receiver_id FROM messages WHERE id = ? LIMIT 1', [callId]);
  const call = callRows[0];
  if (!call) return;
  const [participantRows] = await pool.query('SELECT user_id FROM call_participants WHERE call_id = ?', [callId]);
  const participantIds = new Set(
    [call.sender_id, call.receiver_id, ...participantRows.map((row) => row.user_id)]
      .filter(Boolean)
      .map((value) => String(value)),
  );
  for (const userId of participantIds) {
    const userView = await loadCallForUser(callId, userId);
    if (!userView) continue;
    notifyChatClients(userId, { type: 'call_updated', call: userView });
    if (missedNotification && String(userId) !== String(call.sender_id) && userView.call_status === 'missed') {
      notifyChatClients(userId, { type: 'missed_call', call: userView });
    }
  }
};

const markRingingCallMissed = async (callId) => {
  const [result] = await pool.query(
    `UPDATE messages
     SET call_status = 'missed', call_ended_at = COALESCE(call_ended_at, NOW())
     WHERE id = ?
       AND message_kind = 'call'
       AND call_status = 'ringing'
       AND created_at < DATE_SUB(NOW(), INTERVAL ? SECOND)`,
    [callId, CHAT_CALL_RING_TIMEOUT_SECONDS],
  );
  if (!result.affectedRows) return false;
  await pool.query(
    `UPDATE call_participants
     SET status = 'missed', left_at = COALESCE(left_at, NOW()), updated_at = CURRENT_TIMESTAMP
     WHERE call_id = ? AND status IN ('invited','ringing')`,
    [callId],
  );
  await publishCallUpdate(callId, true);
  return true;
};

const markExpiredRingingCalls = async (userId = null) => {
  const params = [CHAT_CALL_RING_TIMEOUT_SECONDS];
  let userFilter = '';
  if (userId) {
    userFilter = ` AND (m.receiver_id = ? OR EXISTS (SELECT 1 FROM call_participants cp WHERE cp.call_id = m.id AND cp.user_id = ?))`;
    params.push(userId, userId);
  }
  const [rows] = await pool.query(
    `SELECT m.id
     FROM messages m
     WHERE m.message_kind = 'call'
       AND m.call_status = 'ringing'
       AND m.created_at < DATE_SUB(NOW(), INTERVAL ? SECOND)
       ${userFilter}
     ORDER BY m.created_at ASC
     LIMIT 50`,
    params,
  );
  for (const row of rows) await markRingingCallMissed(row.id);
};

const scheduleMissedCallCheck = (callId) => {
  const timer = setTimeout(() => {
    markRingingCallMissed(callId).catch((error) => console.error('Missed call timeout failed:', error.message));
  }, CHAT_CALL_RING_TIMEOUT_SECONDS * 1000);
  if (typeof timer.unref === 'function') timer.unref();
};
const userCanAccessMessage = async (messageId, userId) => {
  const [rows] = await pool.query(
    `SELECT m.id,m.sender_id,m.receiver_id,m.message_kind,m.is_deleted_for_everyone
     FROM messages m
     LEFT JOIN call_participants cp ON cp.call_id = m.id AND cp.user_id = ?
     WHERE m.id = ? AND (m.sender_id = ? OR m.receiver_id = ? OR cp.user_id IS NOT NULL)
     LIMIT 1`,
    [userId, messageId, userId, userId],
  );
  return rows[0] || null;
};

app.get('/api/chat/messages/:otherUserId', authMiddleware, async (req, res) => {
  try {
    await markExpiredRingingCalls(req.user.id);
    const otherUserId = String(req.params.otherUserId || '').trim();
    const [recipients] = await pool.query('SELECT id FROM user_profiles WHERE id = ? AND is_active = 1 LIMIT 1', [otherUserId]);
    if (!recipients.length || otherUserId === req.user.id) return res.status(404).json({ error: 'Active chat recipient not found.' });
    const [rows] = await pool.query(`${selectChatMessageSql}
      WHERE (
          (m.sender_id = ? AND m.receiver_id = ?)
          OR (m.sender_id = ? AND m.receiver_id = ?)
          OR (m.message_kind = 'call' AND m.sender_id = ? AND EXISTS (SELECT 1 FROM call_participants cp WHERE cp.call_id = m.id AND cp.user_id = ?))
          OR (m.message_kind = 'call' AND m.sender_id = ? AND EXISTS (SELECT 1 FROM call_participants cp WHERE cp.call_id = m.id AND cp.user_id = ?))
        )
        AND NOT EXISTS (SELECT 1 FROM message_user_deletions mud WHERE mud.message_id = m.id AND mud.user_id = ?)
      ORDER BY m.created_at ASC
      LIMIT 500
    `, [req.user.id, otherUserId, otherUserId, req.user.id, otherUserId, req.user.id, req.user.id, otherUserId, req.user.id]);
    res.json(await enrichChatMessages(rows, req.user.id));
  } catch (err) { res.status(500).json({ error: 'Unable to load messages.' }); }
});

app.get('/api/chat/missed-calls', authMiddleware, async (req, res) => {
  try {
    await markExpiredRingingCalls(req.user.id);
    const [rows] = await pool.query(`${selectChatMessageSql}
      WHERE m.message_kind = 'call'
        AND m.call_status = 'missed'
        AND m.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND (
          m.receiver_id = ?
          OR EXISTS (SELECT 1 FROM call_participants cp WHERE cp.call_id = m.id AND cp.user_id = ? AND cp.status = 'missed')
        )
        AND NOT EXISTS (SELECT 1 FROM message_user_deletions mud WHERE mud.message_id = m.id AND mud.user_id = ?)
        AND NOT EXISTS (SELECT 1 FROM missed_call_dismissals mcd WHERE mcd.call_id = m.id AND mcd.user_id = ?)
      ORDER BY m.created_at DESC
      LIMIT 10`,
      [CHAT_MISSED_CALL_LOOKBACK_DAYS, req.user.id, req.user.id, req.user.id, req.user.id],
    );
    res.json(await enrichChatMessages(rows, req.user.id));
  } catch (err) {
    res.status(500).json({ error: 'Unable to load missed calls.' });
  }
});

app.post('/api/chat/missed-calls/:callId/dismiss', authMiddleware, async (req, res) => {
  try {
    const callId = String(req.params.callId || '').trim();
    const call = await userCanAccessMessage(callId, req.user.id);
    if (!call || call.message_kind !== 'call' || call.call_status !== 'missed') {
      return res.status(404).json({ error: 'Missed call not found.' });
    }
    const isRecipient = String(call.receiver_id) === String(req.user.id);
    const [participantRows] = await pool.query(
      'SELECT 1 FROM call_participants WHERE call_id = ? AND user_id = ? AND status = ? LIMIT 1',
      [callId, req.user.id, 'missed'],
    );
    if (!isRecipient && !participantRows.length) return res.status(403).json({ error: 'You cannot dismiss this call.' });
    await pool.query(
      `INSERT INTO missed_call_dismissals (id,call_id,user_id) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE dismissed_at = CURRENT_TIMESTAMP`,
      [uuidv4(), callId, req.user.id],
    );
    await logSuccess(pool, req, {
      action: 'missed_call_dismissed',
      category: 'chat',
      module: 'Chat',
      entity_type: 'message',
      entity_id: callId,
      description: 'Missed call notification dismissed.',
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Unable to dismiss missed call.' });
  }
});

app.get('/api/chat/attachments/:filename', authMiddleware, async (req, res) => {
  try {
    const filename = normalizeStoredFileReference(req.params.filename);
    if (!filename) return res.status(404).json({ error: 'Attachment not found.' });
    const [rows] = await pool.query(
      `SELECT id,attachment_file_name,attachment_file_path,attachment_content_type,sender_id,receiver_id,is_deleted_for_everyone
       FROM messages WHERE attachment_file_path = ? LIMIT 1`,
      [filename],
    );
    const attachment = rows[0];
    const participant = attachment && (String(attachment.sender_id) === String(req.user.id) || String(attachment.receiver_id) === String(req.user.id));
    if (!participant || attachment.is_deleted_for_everyone) return res.status(404).json({ error: 'Attachment not found.' });
    const [hidden] = await pool.query('SELECT 1 FROM message_user_deletions WHERE message_id = ? AND user_id = ? LIMIT 1', [attachment.id, req.user.id]);
    if (hidden.length) return res.status(404).json({ error: 'Attachment not found.' });
    const resolved = resolveStoredFile(uploadsDir, filename);
    if (!resolved || !fs.existsSync(resolved)) return res.status(404).json({ error: 'Attachment not found.' });
    await logSuccess(pool, req, {
      action: 'chat_attachment_downloaded',
      category: 'data',
      module: 'Chat',
      entity_type: 'message',
      entity_id: attachment.id,
      description: 'Chat attachment accessed.',
      metadata: { download: req.query.download === '1' },
    });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', attachment.attachment_content_type || 'application/octet-stream');
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename="${String(attachment.attachment_file_name || filename).replace(/["\r\n]/g, '')}"`);
    res.sendFile(resolved);
  } catch (err) {
    res.status(500).json({ error: 'Unable to load attachment.' });
  }
});

app.post('/api/chat/messages', authMiddleware, async (req, res) => {
  try {
    const receiverId = String(req.body?.receiver_id || '').trim();
    const content = normalizeChatContent(req.body?.content);
    const replyToMessageId = String(req.body?.reply_to_message_id || '').trim() || null;
    const attachmentPayload = req.body?.attachment && typeof req.body.attachment === 'object' ? req.body.attachment : null;
    if (!receiverId || receiverId === req.user.id) return res.status(400).json({ error: 'Select another active user.' });
    if (content.length > 4000) return res.status(400).json({ error: 'Message cannot exceed 4000 characters.' });
    if (!content && !attachmentPayload) return res.status(400).json({ error: 'Type a message or attach a file.' });
    const [recipients] = await pool.query('SELECT id FROM user_profiles WHERE id = ? AND is_active = 1 LIMIT 1', [receiverId]);
    if (!recipients.length) return res.status(404).json({ error: 'Active chat recipient not found.' });

    if (replyToMessageId) {
      const replyMessage = await userCanAccessMessage(replyToMessageId, req.user.id);
      if (!replyMessage || replyMessage.is_deleted_for_everyone) return res.status(400).json({ error: 'The message being replied to is unavailable.' });
      const replyParticipantIds = new Set([String(replyMessage.sender_id), String(replyMessage.receiver_id)]);
      if (!replyParticipantIds.has(String(receiverId))) return res.status(400).json({ error: 'Replies must stay in the same conversation.' });
    }

    let attachment = null;
    if (attachmentPayload) {
      const { buffer, storedName, contentType } = safeChatAttachmentUpload({
        fileName: attachmentPayload.fileName,
        base64Data: attachmentPayload.base64Data,
      });
      const filePath = resolveStoredFile(uploadsDir, storedName);
      await fsp.writeFile(filePath, buffer, { flag: 'wx', mode: 0o640 });
      attachment = {
        fileName: String(attachmentPayload.fileName || storedName).replace(/[\\/\0]/g, '').slice(0, 255) || storedName,
        filePath: storedName,
        contentType,
        size: buffer.length,
      };
    }

    const id = uuidv4();
    const messageKind = attachment ? 'attachment' : 'text';
    await pool.query(
      `INSERT INTO messages
       (id,sender_id,receiver_id,content,content_hash,message_kind,reply_to_message_id,attachment_file_name,attachment_file_path,attachment_content_type,attachment_size)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, req.user.id, receiverId, content, chatContentHash(content), messageKind, replyToMessageId, attachment?.fileName || null, attachment?.filePath || null, attachment?.contentType || null, attachment?.size || null],
    );
    await pool.query(
      `INSERT INTO message_recipient_status (id,message_id,user_id,delivered_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE delivered_at = COALESCE(delivered_at, VALUES(delivered_at))`,
      [uuidv4(), id, receiverId],
    );
    await logSuccess(pool, req, {
      action: 'message_sent',
      category: 'chat',
      module: 'Chat',
      entity_type: 'message',
      entity_id: id,
      description: 'Chat message sent.',
      metadata: { receiver_id: receiverId, message_kind: messageKind, has_attachment: Boolean(attachment) },
    });

    const ownMessage = await loadVisibleChatMessage(id, req.user.id);
    const recipientMessage = await loadVisibleChatMessage(id, receiverId);
    notifyChatClients(receiverId, { type: 'new_message', message: recipientMessage });
    res.json(ownMessage);
  } catch (err) {
    console.error('Chat message send failed:', err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Unable to send the message.' });
  }
});

app.patch('/api/chat/messages/:messageId/edit', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const messageId = String(req.params.messageId || '').trim();
    const content = normalizeChatContent(req.body?.content);
    if (!content) return res.status(400).json({ error: 'Message content is required.' });
    if (content.length > 4000) return res.status(400).json({ error: 'Message cannot exceed 4000 characters.' });

    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM messages WHERE id = ? FOR UPDATE', [messageId]);
    const message = rows[0];
    if (!message || (String(message.sender_id) !== String(req.user.id) && String(message.receiver_id) !== String(req.user.id))) {
      await connection.rollback();
      await logDenied(pool, req, { action: 'message_edit_denied', category: 'chat', module: 'Chat', entity_type: 'message', entity_id: messageId, description: 'Unauthorized message edit attempt.' });
      return res.status(404).json({ error: 'Message not found.' });
    }
    if (String(message.sender_id) !== String(req.user.id)) {
      await connection.rollback();
      await logDenied(pool, req, { action: 'message_edit_denied', category: 'chat', module: 'Chat', entity_type: 'message', entity_id: messageId, description: 'Non-sender attempted to edit a message.' });
      return res.status(403).json({ error: 'Only the sender can edit this message.' });
    }
    if (message.is_deleted_for_everyone) {
      await connection.rollback();
      return res.status(400).json({ error: 'Deleted messages cannot be edited.' });
    }
    if (message.message_kind === 'call') {
      await connection.rollback();
      return res.status(400).json({ error: 'System-generated call messages cannot be edited.' });
    }
    const [readRows] = await connection.query(
      `SELECT 1 FROM message_recipient_status WHERE message_id = ? AND user_id <> ? AND read_at IS NOT NULL LIMIT 1`,
      [messageId, req.user.id],
    );
    if (message.is_read || message.read_at || readRows.length) {
      await connection.rollback();
      return res.status(409).json({ error: 'This message cannot be edited because it has already been read.' });
    }
    await connection.query(
      'INSERT INTO message_edit_history (id,message_id,edited_by,previous_content,new_content_hash) VALUES (?,?,?,?,?)',
      [uuidv4(), messageId, req.user.id, message.content || '', chatContentHash(content)],
    );
    await connection.query(
      `UPDATE messages
       SET content = ?, content_hash = ?, is_edited = TRUE, edited_at = CURRENT_TIMESTAMP
       WHERE id = ? AND sender_id = ? AND is_deleted_for_everyone = FALSE AND is_read = FALSE AND read_at IS NULL`,
      [content, chatContentHash(content), messageId, req.user.id],
    );
    await logSuccess(connection, req, {
      action: 'message_edited',
      category: 'chat',
      module: 'Chat',
      entity_type: 'message',
      entity_id: messageId,
      description: 'Chat message edited before recipient read it.',
      old_values: { content_hash: chatContentHash(message.content || '') },
      new_values: { content_hash: chatContentHash(content) },
      metadata: { receiver_id: message.receiver_id },
    });
    await connection.commit();

    const senderMessage = await loadVisibleChatMessage(messageId, message.sender_id);
    const receiverMessage = await loadVisibleChatMessage(messageId, message.receiver_id);
    if (senderMessage) notifyChatClients(message.sender_id, { type: 'message_updated', message: senderMessage });
    if (receiverMessage) notifyChatClients(message.receiver_id, { type: 'message_updated', message: receiverMessage });
    res.json(senderMessage);
  } catch (err) {
    await connection.rollback().catch(() => undefined);
    console.error('Chat message edit failed:', err.message);
    res.status(500).json({ error: 'Unable to edit the message.' });
  } finally {
    connection.release();
  }
});

app.put('/api/chat/messages/:messageId/reaction', authMiddleware, async (req, res) => {
  try {
    const messageId = String(req.params.messageId || '').trim();
    const reactionType = String(req.body?.reaction_type || '').trim();
    if (!CHAT_REACTION_TYPES.has(reactionType)) return res.status(400).json({ error: 'Unsupported reaction type.' });
    const message = await userCanAccessMessage(messageId, req.user.id);
    if (!message || message.is_deleted_for_everyone) return res.status(404).json({ error: 'Message not found.' });
    const [existing] = await pool.query('SELECT reaction_type FROM message_reactions WHERE message_id = ? AND user_id = ? LIMIT 1', [messageId, req.user.id]);
    await pool.query(
      `INSERT INTO message_reactions (id,message_id,user_id,reaction_type) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE reaction_type = VALUES(reaction_type), updated_at = CURRENT_TIMESTAMP`,
      [uuidv4(), messageId, req.user.id, reactionType],
    );
    await logSuccess(pool, req, {
      action: existing.length ? 'message_reaction_changed' : 'message_reaction_added',
      category: 'chat',
      module: 'Chat',
      entity_type: 'message',
      entity_id: messageId,
      description: existing.length ? 'Chat message reaction changed.' : 'Chat message reaction added.',
      metadata: { reaction_type: reactionType },
    });
    const senderMessage = await loadVisibleChatMessage(messageId, message.sender_id);
    const receiverMessage = await loadVisibleChatMessage(messageId, message.receiver_id);
    if (senderMessage) notifyChatClients(message.sender_id, { type: 'message_updated', message: senderMessage });
    if (receiverMessage) notifyChatClients(message.receiver_id, { type: 'message_updated', message: receiverMessage });
    res.json(String(message.sender_id) === String(req.user.id) ? senderMessage : receiverMessage);
  } catch (err) {
    res.status(500).json({ error: 'Unable to update reaction.' });
  }
});

app.delete('/api/chat/messages/:messageId/reaction', authMiddleware, async (req, res) => {
  try {
    const messageId = String(req.params.messageId || '').trim();
    const message = await userCanAccessMessage(messageId, req.user.id);
    if (!message) return res.status(404).json({ error: 'Message not found.' });
    await pool.query('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?', [messageId, req.user.id]);
    await logSuccess(pool, req, { action: 'message_reaction_removed', category: 'chat', module: 'Chat', entity_type: 'message', entity_id: messageId, description: 'Chat message reaction removed.' });
    const senderMessage = await loadVisibleChatMessage(messageId, message.sender_id);
    const receiverMessage = await loadVisibleChatMessage(messageId, message.receiver_id);
    if (senderMessage) notifyChatClients(message.sender_id, { type: 'message_updated', message: senderMessage });
    if (receiverMessage) notifyChatClients(message.receiver_id, { type: 'message_updated', message: receiverMessage });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Unable to remove reaction.' });
  }
});

app.post('/api/chat/messages/:messageId/delete-for-me', authMiddleware, async (req, res) => {
  try {
    const messageId = String(req.params.messageId || '').trim();
    const message = await userCanAccessMessage(messageId, req.user.id);
    if (!message) return res.status(404).json({ error: 'Message not found.' });
    await pool.query(
      `INSERT INTO message_user_deletions (id,message_id,user_id) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE deleted_at = CURRENT_TIMESTAMP`,
      [uuidv4(), messageId, req.user.id],
    );
    await logSuccess(pool, req, { action: 'message_deleted_for_me', category: 'chat', module: 'Chat', entity_type: 'message', entity_id: messageId, description: 'Chat message hidden for the current user.' });
    notifyChatClients(req.user.id, { type: 'message_hidden', messageId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Unable to delete the message for you.' });
  }
});

app.post('/api/chat/messages/:messageId/delete-for-everyone', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const messageId = String(req.params.messageId || '').trim();
    const reason = String(req.body?.reason || '').trim().slice(0, 255) || null;
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM messages WHERE id = ? FOR UPDATE', [messageId]);
    const message = rows[0];
    if (!message || (String(message.sender_id) !== String(req.user.id) && String(message.receiver_id) !== String(req.user.id))) {
      await connection.rollback();
      return res.status(404).json({ error: 'Message not found.' });
    }
    const senderOwnsMessage = String(message.sender_id) === String(req.user.id);
    if (!senderOwnsMessage && !isSuperAdmin(req)) {
      await connection.rollback();
      await logDenied(pool, req, { action: 'message_delete_everyone_denied', category: 'chat', module: 'Chat', entity_type: 'message', entity_id: messageId, description: 'Unauthorized delete-for-everyone attempt.' });
      return res.status(403).json({ error: 'Only the sender can delete this message for everyone.' });
    }
    const createdAt = message.created_at ? new Date(message.created_at).getTime() : 0;
    const expired = MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MINUTES > 0 && createdAt && Date.now() - createdAt > MESSAGE_DELETE_FOR_EVERYONE_WINDOW_MINUTES * 60 * 1000;
    if (expired && !isSuperAdmin(req)) {
      await connection.rollback();
      return res.status(409).json({ error: 'This message can no longer be deleted for everyone.' });
    }
    if (message.is_deleted_for_everyone) {
      await connection.rollback();
      return res.status(409).json({ error: 'This message was already deleted for everyone.' });
    }
    await connection.query(
      `UPDATE messages
       SET content = '', is_deleted_for_everyone = TRUE, deleted_for_everyone_at = CURRENT_TIMESTAMP,
           deleted_for_everyone_by = ?, deletion_reason = ?, content_hash = ?
       WHERE id = ?`,
      [req.user.id, reason, chatContentHash(message.content || ''), messageId],
    );
    await connection.query('DELETE FROM message_reactions WHERE message_id = ?', [messageId]);
    await logSuccess(connection, req, {
      action: 'message_deleted_for_everyone',
      category: 'chat',
      module: 'Chat',
      entity_type: 'message',
      entity_id: messageId,
      description: 'Chat message deleted for all participants.',
      severity: 'warning',
      metadata: { sender_id: message.sender_id, receiver_id: message.receiver_id, reason, original_content_hash: chatContentHash(message.content || '') },
    });
    await connection.commit();
    const senderMessage = await loadVisibleChatMessage(messageId, message.sender_id);
    const receiverMessage = await loadVisibleChatMessage(messageId, message.receiver_id);
    if (senderMessage) notifyChatClients(message.sender_id, { type: 'message_updated', message: senderMessage });
    if (receiverMessage) notifyChatClients(message.receiver_id, { type: 'message_updated', message: receiverMessage });
    res.json(String(message.sender_id) === String(req.user.id) ? senderMessage : receiverMessage);
  } catch (err) {
    await connection.rollback().catch(() => undefined);
    res.status(500).json({ error: 'Unable to delete the message for everyone.' });
  } finally {
    connection.release();
  }
});

app.post('/api/chat/calls', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const requestedIds = Array.isArray(req.body?.receiver_ids) ? req.body.receiver_ids : [req.body?.receiver_id];
    const receiverIds = Array.from(new Set(requestedIds.map(value => String(value || '').trim()).filter(id => id && id !== String(req.user.id)))).slice(0, 8);
    const callType = req.body?.call_type === 'video' ? 'video' : 'audio';
    if (!receiverIds.length) return res.status(400).json({ error: 'Select at least one active user.' });
    const placeholders = receiverIds.map(() => '?').join(',');
    const [recipients] = await connection.query(`SELECT id FROM user_profiles WHERE id IN (${placeholders}) AND is_active = 1`, receiverIds);
    const activeRecipientIds = recipients.map(row => String(row.id));
    if (!activeRecipientIds.length) return res.status(404).json({ error: 'Active chat recipient not found.' });
    const primaryReceiverId = activeRecipientIds[0];
    const id = uuidv4();
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO messages (id,sender_id,receiver_id,content,message_kind,call_type,call_status)
       VALUES (?,?,?,?,?,?,?)`,
      [id, req.user.id, primaryReceiverId, activeRecipientIds.length > 1 ? (callType === 'video' ? 'Group video call' : 'Group phone call') : (callType === 'video' ? 'Video call' : 'Phone call'), 'call', callType, 'ringing'],
    );
    await connection.query(
      `INSERT INTO call_participants (id,call_id,user_id,status,joined_at) VALUES (?,?,?,?,NOW())
       ON DUPLICATE KEY UPDATE status=VALUES(status),joined_at=COALESCE(joined_at,VALUES(joined_at))`,
      [uuidv4(), id, req.user.id, 'accepted'],
    );
    for (const receiverId of activeRecipientIds) {
      await connection.query(
        `INSERT INTO call_participants (id,call_id,user_id,status) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE status=VALUES(status),updated_at=CURRENT_TIMESTAMP`,
        [uuidv4(), id, receiverId, 'ringing'],
      );
      await connection.query(
        `INSERT INTO message_recipient_status (id,message_id,user_id,delivered_at) VALUES (?,?,?,CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE delivered_at = COALESCE(delivered_at, VALUES(delivered_at))`,
        [uuidv4(), id, receiverId],
      );
    }
    await connection.commit();
    const [callMessage] = await pool.query(`${selectChatMessageSql} WHERE m.id = ?`, [id]);
    const [enriched] = await enrichChatMessages(callMessage, req.user.id);
    for (const receiverId of activeRecipientIds) {
      const [recipientView] = await enrichChatMessages(callMessage, receiverId);
      notifyChatClients(receiverId, { type: 'incoming_call', call: recipientView });
      notifyChatClients(receiverId, { type: 'new_message', message: recipientView });
    }
    scheduleMissedCallCheck(id);
    res.json(enriched);
  } catch (err) {
    await connection.rollback().catch(() => undefined);
    console.error('Chat call start failed:', err.message);
    res.status(500).json({ error: 'Unable to start the call.' });
  } finally {
    connection.release();
  }
});

app.patch('/api/chat/calls/:callId', authMiddleware, async (req, res) => {
  try {
    const callId = String(req.params.callId || '').trim();
    const status = ['accepted', 'declined', 'ended', 'missed'].includes(req.body?.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: 'Invalid call status.' });
    const call = await userCanAccessMessage(callId, req.user.id);
    if (!call || call.message_kind !== 'call') return res.status(404).json({ error: 'Call not found.' });
    await pool.query(
      `INSERT INTO call_participants (id,call_id,user_id,status,joined_at,left_at) VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE status=VALUES(status),joined_at=COALESCE(joined_at,VALUES(joined_at)),left_at=VALUES(left_at),updated_at=CURRENT_TIMESTAMP`,
      [uuidv4(), callId, req.user.id, status, status === 'accepted' ? new Date() : null, ['declined', 'ended', 'missed'].includes(status) ? new Date() : null],
    );
    const fields = ['call_status = ?'];
    const values = [status];
    if (status === 'accepted') fields.push('call_started_at = COALESCE(call_started_at, NOW())');
    if (['declined', 'ended', 'missed'].includes(status)) fields.push('call_ended_at = COALESCE(call_ended_at, NOW())');
    values.push(callId);
    await pool.query(`UPDATE messages SET ${fields.join(', ')} WHERE id = ? AND message_kind = 'call'`, values);
    const [callMessage] = await pool.query(`${selectChatMessageSql} WHERE m.id = ?`, [callId]);
    const [updated] = await enrichChatMessages(callMessage, req.user.id);
    await publishCallUpdate(callId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Unable to update the call.' });
  }
});

app.post('/api/chat/call-signal', authMiddleware, async (req, res) => {
  try {
    const callId = String(req.body?.call_id || '').trim();
    const receiverId = String(req.body?.receiver_id || '').trim();
    const signalType = String(req.body?.signal_type || '').trim();
    const payload = req.body?.payload;
    if (!callId || !receiverId || !['offer', 'answer', 'ice-candidate'].includes(signalType)) {
      return res.status(400).json({ error: 'Invalid call signal.' });
    }
    const call = await userCanAccessMessage(callId, req.user.id);
    const [recipientRows] = await pool.query(
      `SELECT 1 FROM messages m
       LEFT JOIN call_participants cp ON cp.call_id = m.id AND cp.user_id = ?
       WHERE m.id = ? AND (m.sender_id = ? OR m.receiver_id = ? OR cp.user_id IS NOT NULL) LIMIT 1`,
      [receiverId, callId, receiverId, receiverId],
    );
    if (!call || call.message_kind !== 'call' || !recipientRows.length) {
      return res.status(403).json({ error: 'Call signal recipient is invalid.' });
    }
    const signalId = uuidv4();
    notifyChatClients(receiverId, {
      type: 'call_signal',
      signalId,
      callId,
      senderId: String(req.user.id),
      signalType,
      payload,
    });
    res.json({ success: true, signalId });
  } catch (err) {
    res.status(500).json({ error: 'Unable to send call signal.' });
  }
});

app.patch('/api/chat/messages/:messageId/read', authMiddleware, async (req, res) => {
  try {
    const { messageId } = req.params;
    const [result] = await pool.query(
      'UPDATE messages SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ? AND receiver_id = ?',
      [messageId, req.user.id],
    );
    await pool.query(
      `INSERT INTO message_recipient_status (id,message_id,user_id,read_at,delivered_at) VALUES (?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE read_at = COALESCE(read_at, VALUES(read_at)), delivered_at = COALESCE(delivered_at, VALUES(delivered_at))`,
      [uuidv4(), messageId, req.user.id],
    );
    const [msg] = await pool.query('SELECT sender_id FROM messages WHERE id = ?', [messageId]);
    if (msg.length && result.affectedRows) {
      notifyChatClients(msg[0].sender_id, { type: 'message_read', messageId });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Unable to mark message as read.' }); }
});

app.patch('/api/chat/read-all/:senderId', authMiddleware, async (req, res) => {
  try {
    const { senderId } = req.params;
    const [messagesToRead] = await pool.query(
      'SELECT id FROM messages WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE',
      [senderId, req.user.id],
    );
    await pool.query(
      'UPDATE messages SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE',
      [senderId, req.user.id],
    );
    for (const message of messagesToRead) {
      await pool.query(
        `INSERT INTO message_recipient_status (id,message_id,user_id,read_at,delivered_at) VALUES (?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE read_at = COALESCE(read_at, VALUES(read_at)), delivered_at = COALESCE(delivered_at, VALUES(delivered_at))`,
        [uuidv4(), message.id, req.user.id],
      );
    }
    notifyChatClients(senderId, { type: 'all_read', receiverId: req.user.id });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Unable to mark messages as read.' }); }
});
const cimsDist = path.join(__dirname, '../dist');
app.get('/sw.js', (req, res, next) => {
  const host = String(req.get('host') || '').split(':')[0].toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) return next();

  res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send(`
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(windows.map((client) => client.navigate(client.url)));
  })());
});
`);
});
app.get('/registerSW.js', (req, res, next) => {
  const host = String(req.get('host') || '').split(':')[0].toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) return next();

  res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send('// Local RIANA CIMS: service-worker registration disabled to prevent stale development shells.\n');
});
app.use(express.static(cimsDist, {
  setHeaders: (res, filePath) => {
    const filename = path.basename(filePath).toLowerCase();
    if (['index.html', 'sw.js', 'registersw.js', 'manifest.webmanifest'].includes(filename)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return;
    }
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  const indexPath = path.join(cimsDist, 'index.html');
  if (!fs.existsSync(indexPath)) return res.status(503).json({ error: 'Frontend build is not available. Run npm run build:all.' });
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(indexPath);
});
app.use((error, _req, res, _next) => {
  if (error?.message === 'Origin is not allowed by CORS policy.') {
    return res.status(403).json({ error: 'Origin is not allowed.' });
  }
  if (error?.status === 404 || error?.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
  console.error('Unhandled request error:', error?.message || error);
  res.status(500).json({ error: 'Internal server error.' });
});
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

const startServer = async () => {
  await ensurePrivateUploadRoot(privateFileConfig);
  await initDb();
  await new Promise((resolve, reject) => {
    const server = app.listen(port, resolve);
    server.once('error', reject);
  });
  console.log(`Server running on port ${port}`);
  setTimeout(initBackupSchedule, 2000);
};

startServer().catch((error) => {
  console.error('Server startup failed:', error);
  process.exitCode = 1;
});
