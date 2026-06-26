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
const { createChallenge, verifyChallenge } = require('./utils/twoFactor');
const { sendEmail, sendSms, sendWelcomeCredentials } = require('./services/notifications');
const { sendUserNotification, sendUsersNotification } = require('./services/notificationDispatcher');
const { createDatabaseBackup, listBackups, pruneBackups, getLastRun } = require('./services/databaseBackup');
const { hashPassword, verifyPassword, verifyAndUpgradePassword } = require('./security/passwords');
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
const port = process.env.VITE_API_PORT || 3001;
const JWT_SECRET = resolveJwtSecret();

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
  .map((value) => String(value || '').trim())
  .filter(Boolean);

const allowedEntries = (body, allowedFields) => Object.entries(body || {}).filter(([key]) => allowedFields.has(key));
const sqlValue = (value) => typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
const CLIENT_FIELDS = new Set(['client_name','industry_classification','current_vendor','tags','contact_person_name','contact_person_department','contact_email','contact_phone','account_manager_id','subsidiary_id','department_id','branch','start_date','contract_type']);
const INSTALLATION_FIELDS = new Set(['client_id','branch','kiosk_type','kiosk_count','counter_count','counter_names','led_count','led_names','service_points','ups_count','speakers','screen_with_size','media_controllers','tablets','digital_signage_system','staff_trained','amplifiers','hdmis','splitters','handover_file_path','account_manager_id','assigned_technician_id','hardware_technician_id','software_technician_id','status','remarks','assigned_date','completion_date','scheduled_end_date','extension_reason','escalation_matrix','waiting_reason']);
const ASSIGNMENT_FIELDS = new Set(['client_id','installation_id','hardware_technician_id','software_technician_id','installation_start_date','scheduled_end_date','status','progress_percentage','notes','branch']);
const SUBSIDIARY_FIELDS = new Set(['subsidiary_name','default_escalation_matrix']);
const FEEDBACK_LINK_FIELDS = new Set(['client_id','installation_id','expires_at','is_used']);
const COMPANY_FIELDS = new Set(['name','logo_path','contract_types','font_color','primary_color','backup_schedule','backup_day','backup_time']);
const SYSTEM_ROLES = new Set(['SuperAdmin', 'Admin', 'Developer', 'Teamlead', 'Sales', 'User']);
const PRIVILEGED_ROLES = new Set(['SuperAdmin', 'Admin']);
const CRMS_ACCESS_ROLES = new Set(['SuperAdmin', 'Admin', 'Teamlead', 'Developer', 'Sales']);
const isSuperAdmin = (req) => req.user?.role === 'SuperAdmin';
const isAdminOrSuperAdmin = (req) => req.user?.role === 'SuperAdmin' || req.user?.role === 'Admin';
const userCanManageTargetRole = (req, targetRole) => isSuperAdmin(req) || !PRIVILEGED_ROLES.has(targetRole);
const USER_MODULE_ROLES_SQL = `
  COALESCE((
    SELECT GROUP_CONCAT(CONCAT(umr.module_id, ':', r.code) SEPARATOR ',')
    FROM user_module_roles umr
    JOIN roles r ON r.id = umr.role_id
    WHERE umr.user_id = u.id
  ), '') AS module_roles
`;

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

const storedFileIsRegistered = async (filename) => {
  const safeFilename = normalizeStoredFileReference(filename);
  if (!safeFilename) return false;
  const compatiblePaths = [safeFilename, `uploads/${safeFilename}`, `/uploads/${safeFilename}`];
  const [handoverRows] = await pool.query('SELECT id FROM handover_uploads WHERE file_path IN (?, ?, ?) LIMIT 1', compatiblePaths);
  if (handoverRows.length) return true;
  const [companyRows] = await pool.query('SELECT id FROM company_settings WHERE logo_path IN (?, ?, ?) LIMIT 1', compatiblePaths);
  return companyRows.length > 0;
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
app.use('/api', cors(buildCorsOptions()));
app.use(express.json({ limit: '15mb' }));
app.use(createSensitiveRateLimiter({ limit: 20, windowMs: 5 * 60 * 1000 }));
app.use('/api', createGlobalApiPolicy(authMiddleware));
app.use('/uploads', authMiddleware, authorizeStoredFile, express.static(uploadsDir, {
  fallthrough: false,
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (path.extname(filePath).toLowerCase() === '.pdf') res.setHeader('Content-Disposition', 'attachment');
  },
}));
app.use('/api/crms', createCrmsRouter({ pool, jwtSecret: JWT_SECRET }));

// File Upload & Handover Metadata
app.post('/api/upload', async (req, res) => {
  try {
    const { fileName, base64Data, client_id, installation_id, is_signed, notes } = req.body;
    if (!fileName || !base64Data) return res.status(400).json({ error: 'Missing file data' });
    const { buffer, storedName: finalFileName } = safeUpload({ fileName, base64Data });
    const filePath = resolveStoredFile(uploadsDir, finalFileName);
    await fsp.writeFile(filePath, buffer, { flag: 'wx', mode: 0o640 });
    
    // If metadata provided, also save to DB
    let handoverId = null;
    if (client_id && installation_id) {
      handoverId = uuidv4();
      await pool.query(
        'INSERT INTO handover_uploads (id, client_id, installation_id, file_name, file_path, file_size, is_signed, notes, uploaded_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [handoverId, client_id, installation_id, fileName, finalFileName, buffer.length, is_signed === 'true' || is_signed === true, notes || '', req.user.id]
      );
    }
    
    res.json({ 
      success: true, 
      filePath: finalFileName,
      id: handoverId,
      file_path: finalFileName,
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
      default_escalation_matrix JSON
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
      role ENUM('SuperAdmin', 'Admin', 'Developer', 'Teamlead', 'Sales', 'User') NOT NULL,
      designation VARCHAR(100),
      department_id VARCHAR(36),
      subsidiary_id VARCHAR(36),
      phone_number VARCHAR(20),
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      first_login BOOLEAN DEFAULT TRUE,
      is_active BOOLEAN DEFAULT TRUE,
      two_factor_enabled BOOLEAN DEFAULT FALSE,
      two_factor_method ENUM('email', 'sms', 'call') DEFAULT 'email',
      two_factor_phone VARCHAR(30),
      session_version INT UNSIGNED NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
      FOREIGN KEY (subsidiary_id) REFERENCES subsidiaries(id) ON DELETE SET NULL
    )`);

    await pool.query("ALTER TABLE user_profiles MODIFY role ENUM('SuperAdmin','Admin','Developer','Teamlead','Sales','User') NOT NULL");
    await pool.query(`ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS two_factor_method ENUM('email','sms','call') NOT NULL DEFAULT 'email',
      ADD COLUMN IF NOT EXISTS two_factor_phone VARCHAR(30) NULL,
      ADD COLUMN IF NOT EXISTS session_version INT UNSIGNED NOT NULL DEFAULT 0`);
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
      INDEX idx_password_reset_active (user_id,used_at,expires_at),
      FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
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
      INDEX idx_crms_notifications_user_read (user_id,\`read\`),
      FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
    )`);

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

    // Installations
    await pool.query(`CREATE TABLE IF NOT EXISTS installations (
      id VARCHAR(36) PRIMARY KEY,
      client_id VARCHAR(36) NOT NULL,
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
      media_controllers INT DEFAULT 0,
      tablets INT DEFAULT 0,
      digital_signage_system INT DEFAULT 0,
      staff_trained INT DEFAULT 0,
      amplifiers INT DEFAULT 0,
      hdmis INT DEFAULT 0,
      splitters INT DEFAULT 0,
      handover_file_path VARCHAR(512),
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
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (account_manager_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_technician_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
      FOREIGN KEY (hardware_technician_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
      FOREIGN KEY (software_technician_id) REFERENCES user_profiles(id) ON DELETE SET NULL
    )`);

    // Client Assignments
    await pool.query(`CREATE TABLE IF NOT EXISTS client_assignments (
      id VARCHAR(36) PRIMARY KEY,
      client_id VARCHAR(36) NOT NULL,
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
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE SET NULL,
      FOREIGN KEY (hardware_technician_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
      FOREIGN KEY (software_technician_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
    )`);

    // Ensure installation_id column exists on pre-existing databases
    try {
      await pool.query('ALTER TABLE client_assignments ADD COLUMN installation_id VARCHAR(36)');
    } catch (e) {
      // Ignore - column already exists
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
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE SET NULL,
      FOREIGN KEY (submitted_by) REFERENCES user_profiles(id) ON DELETE SET NULL
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
      installation_id VARCHAR(36),
      unique_token VARCHAR(100) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      is_used BOOLEAN DEFAULT FALSE,
      used_at TIMESTAMP,
      email_sent BOOLEAN DEFAULT FALSE,
      sms_sent BOOLEAN DEFAULT FALSE,
      created_by_user_id VARCHAR(36),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
    )`);

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
      FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
      UNIQUE(announcement_id, user_id)
    )`);

    // Handover Uploads
    await pool.query(`CREATE TABLE IF NOT EXISTS handover_uploads (
      id VARCHAR(36) PRIMARY KEY,
      client_id VARCHAR(36) NOT NULL,
      installation_id VARCHAR(36),
      file_name VARCHAR(255) NOT NULL,
      file_path VARCHAR(512) NOT NULL,
      file_size BIGINT,
      upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_signed BOOLEAN DEFAULT FALSE,
      notes TEXT,
      uploaded_by_user_id VARCHAR(36),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE SET NULL,
      FOREIGN KEY (uploaded_by_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
    )`);

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

    // Messages for user-to-user chat
    await pool.query(`CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(36) PRIMARY KEY,
      sender_id VARCHAR(36) NOT NULL,
      receiver_id VARCHAR(36) NOT NULL,
      content TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      read_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES user_profiles(id) ON DELETE CASCADE
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
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

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
    const [rows] = await pool.query(`SELECT * FROM handover_uploads${where} ORDER BY upload_date DESC`, values);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Unable to load uploaded documents.' });
  }
});

app.get('/api/download', async (req, res) => {
  try {
    const filename = normalizeStoredFileReference(req.query.path);
    const filePath = resolveStoredFile(uploadsDir, filename);
    if (!filePath || !fs.existsSync(filePath) || !(await storedFileIsRegistered(filename))) {
      return res.status(404).json({ error: 'File not found.' });
    }
    const disposition = req.query.disposition === 'inline' ? 'inline' : 'attachment';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${disposition}; filename="${path.basename(filename).replace(/["\r\n]/g, '')}"`);
    res.sendFile(filePath);
  } catch {
    res.status(500).json({ error: 'Unable to download file.' });
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

app.get('/api/admin/backup-schedule', requireRole('SuperAdmin'), async (req, res) => {
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

app.post('/api/admin/backup-schedule', requireRole('SuperAdmin'), async (req, res) => {
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

app.get('/api/admin/backups', requireRole('SuperAdmin'), async (req, res) => {
  try {
    res.json(listBackups());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/backup-status', requireRole('SuperAdmin'), async (_req, res) => {
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

app.post('/api/admin/backup', requireRole('SuperAdmin'), async (req, res) => {
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
    const { userId, role } = req.query;
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
  return result;
};

const issueCimsSession = (res, user) => {
  const sessionVersion = Number(user.session_version || 0);
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role, sv: sessionVersion }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
  res.cookie('riana_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
  res.json({ user: safeUser(user), token });
};

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const [rows] = await pool.query(`SELECT u.*, ${USER_MODULE_ROLES_SQL} FROM user_profiles u WHERE LOWER(u.email) = ?`, [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    
    const user = rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'This user account is inactive.' });
    if (!(await verifyAndUpgradePassword(pool, user, password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.two_factor_enabled) {
      const challenge = await createChallenge(pool, user, JWT_SECRET);
      return res.json({ requiresTwoFactor: true, ...challenge });
    }

    issueCimsSession(res, user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/verify-2fa', async (req, res) => {
  try {
    const challenge = await verifyChallenge(pool, req.body.challengeId, req.body.code, JWT_SECRET);
    if (!challenge) return res.status(401).json({ error: 'Invalid or expired verification code.' });
    const [rows] = await pool.query(`SELECT u.*, ${USER_MODULE_ROLES_SQL} FROM user_profiles u WHERE u.id = ? AND u.is_active = TRUE`, [challenge.user_id]);
    if (!rows.length) return res.status(403).json({ error: 'User account is unavailable.' });
    issueCimsSession(res, rows[0]);
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
    const phone = String(req.body.phone || '').trim() || null;
    if (enabled && method !== 'email' && !phone) {
      return res.status(400).json({ error: 'A phone number is required for SMS or call verification.' });
    }
    await pool.query(
      'UPDATE user_profiles SET two_factor_enabled=?,two_factor_method=?,two_factor_phone=? WHERE id=?',
      [enabled, method, phone, req.user.id],
    );
    res.json({ success: true, enabled, method, phone });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.*, d.department_name, s.subsidiary_name, ${USER_MODULE_ROLES_SQL}
      FROM user_profiles u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN subsidiaries s ON u.subsidiary_id = s.id
      WHERE u.id = ?
    `, [req.user.id]);

    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: safeUser(rows[0]) });
  } catch (err) { res.status(500).json({ error: 'Unable to load the current user.' }); }
});

app.get('/api/user_profiles', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id,u.email,u.role,u.designation,u.department_id,u.subsidiary_id,u.phone_number,
        u.first_name,u.last_name,u.first_login,u.is_active,u.two_factor_enabled,u.two_factor_method,
        u.two_factor_phone,u.created_at,d.department_name,s.subsidiary_name, ${USER_MODULE_ROLES_SQL}
      FROM user_profiles u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN subsidiaries s ON u.subsidiary_id = s.id
      ORDER BY u.created_at DESC
    `);
    res.json(rows.map((row) => ({ ...row, module_roles: normalizeModuleRoles(row.module_roles) })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/auth/password', authMiddleware, async (req, res) => {
  try {
    const password = String(req.body.password || '');
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const passwordHash = await hashPassword(password);
    await pool.query('UPDATE user_profiles SET password = ?, first_login = FALSE, session_version = session_version + 1 WHERE id = ?', [passwordHash, req.user.id]);
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
      ...r,
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
      ...r,
      tags: typeof r.tags === 'string' ? JSON.parse(r.tags) : r.tags,
      departments: { department_name: r.department_name },
      subsidiaries: { subsidiary_name: r.subsidiary_name },
      user_profiles: { first_name: r.added_by_first, last_name: r.added_by_last }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clients', async (req, res) => {
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

app.put('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = allowedEntries(req.body, CLIENT_FIELDS);
    if (!updates.length) return res.status(400).json({ error: 'No valid client fields supplied.' });
    const fields = updates.map(([key]) => `${key} = ?`).join(', ');
    const values = updates.map(([, value]) => sqlValue(value));
    await pool.query(`UPDATE clients SET ${fields} WHERE id = ?`, [...values, id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/clients/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM clients WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// INSTALLATIONS
app.get('/api/installations', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT i.*, c.client_name, c.contact_person_name, c.branch as client_branch
      FROM installations i
      LEFT JOIN clients c ON i.client_id = c.id
      ORDER BY i.created_at DESC
    `);
    res.json(rows.map(r => ({
      ...r,
      clients: { client_name: r.client_name, contact_person_name: r.contact_person_name, branch: r.client_branch },
      escalation_matrix: typeof r.escalation_matrix === 'string' ? JSON.parse(r.escalation_matrix) : r.escalation_matrix,
      led_names: typeof r.led_names === 'string' ? JSON.parse(r.led_names) : r.led_names
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/installations/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT i.*, c.client_name, c.contact_person_name, c.branch as client_branch
      FROM installations i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.id = ?
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Installation not found' });
    const r = rows[0];
    res.json({
      ...r,
      clients: { client_name: r.client_name, contact_person_name: r.contact_person_name, branch: r.client_branch },
      escalation_matrix: typeof r.escalation_matrix === 'string' ? JSON.parse(r.escalation_matrix) : r.escalation_matrix,
      led_names: typeof r.led_names === 'string' ? JSON.parse(r.led_names) : r.led_names
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/installations', async (req, res) => {
  try {
    const id = uuidv4();
    const updates = allowedEntries(req.body, INSTALLATION_FIELDS);
    if (!updates.some(([key]) => key === 'client_id')) return res.status(400).json({ error: 'client_id is required.' });
    const fields = ['id', ...updates.map(([key]) => key)];
    const placeholders = fields.map(() => '?').join(', ');
    const values = [id, ...updates.map(([, value]) => sqlValue(value))];
    await pool.query(`INSERT INTO installations (${fields.join(', ')}) VALUES (${placeholders})`, values);
    res.json({ id, ...Object.fromEntries(updates) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/installations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = allowedEntries(req.body, INSTALLATION_FIELDS);
    if (!updates.length) return res.status(400).json({ error: 'No valid installation fields supplied.' });
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
      SELECT a.*, c.client_name, c.branch as client_branch, 
             ht.first_name as ht_f, ht.last_name as ht_l, 
             st.first_name as st_f, st.last_name as st_l, 
             i.status as installation_status
      FROM client_assignments a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN installations i ON a.installation_id = i.id
      LEFT JOIN user_profiles ht ON a.hardware_technician_id = ht.id
      LEFT JOIN user_profiles st ON a.software_technician_id = st.id
      INNER JOIN (
        SELECT client_id, MAX(created_at) as max_created
        FROM client_assignments
        GROUP BY client_id
      ) latest ON a.client_id = latest.client_id AND a.created_at = latest.max_created
      ORDER BY a.created_at DESC
    `);
    res.json(rows.map(r => ({
      ...r,
      status: r.installation_status || r.status,
      client_name: r.client_name,
      branch: r.branch || r.client_branch,
      clients: { client_name: r.client_name, branch: r.branch || r.client_branch },
      hardware_tech: { first_name: r.ht_f, last_name: r.ht_l },
      software_tech: { first_name: r.st_f, last_name: r.st_l }
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/client_assignments/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.*, c.client_name, c.branch, ht.first_name as ht_f, ht.last_name as ht_l, st.first_name as st_f, st.last_name as st_l
      FROM client_assignments a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN user_profiles ht ON a.hardware_technician_id = ht.id
      LEFT JOIN user_profiles st ON a.software_technician_id = st.id
      WHERE a.id = ?
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Assignment not found' });
    const r = rows[0];
    res.json({
      ...r,
      client_name: r.client_name,
      clients: { client_name: r.client_name, branch: r.branch },
      hardware_tech: { first_name: r.ht_f, last_name: r.ht_l },
      software_tech: { first_name: r.st_f, last_name: r.st_l }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/client_assignments', async (req, res) => {
  try {
    const id = uuidv4();
    const data = { ...req.body, assigned_by_user_id: req.user.id };
    const updates = allowedEntries(data, new Set([...ASSIGNMENT_FIELDS, 'assigned_by_user_id']));
    const fields = ['id', ...updates.map(([key]) => key)];
    const placeholders = fields.map(() => '?').join(', ');
    await pool.query(`INSERT INTO client_assignments (${fields.join(', ')}) VALUES (${placeholders})`, [id, ...updates.map(([, value]) => sqlValue(value))]);
    const [clients] = await pool.query('SELECT client_name,branch FROM clients WHERE id = ? LIMIT 1', [data.client_id]);
    const client = clients[0] || {};
    const clientLabel = `${client.client_name || 'a client'}${data.branch || client.branch ? ` - ${data.branch || client.branch}` : ''}`;
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
    res.json({ id, ...data, notification_delivery: notificationDelivery });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/client_assignments/:id', async (req, res) => {
  try {
    const [beforeRows] = await pool.query('SELECT * FROM client_assignments WHERE id = ? LIMIT 1', [req.params.id]);
    if (!beforeRows.length) return res.status(404).json({ error: 'Assignment not found' });
    const before = beforeRows[0];
    const updates = allowedEntries(req.body, ASSIGNMENT_FIELDS);
    if (!updates.length) return res.status(400).json({ error: 'No valid assignment fields supplied' });
    const fields = updates.map(([key]) => `${key} = ?`).join(', ');
    await pool.query(`UPDATE client_assignments SET ${fields} WHERE id = ?`, [...updates.map(([, value]) => sqlValue(value)), req.params.id]);
    const [afterRows] = await pool.query(
      `SELECT a.*,c.client_name,c.branch AS client_branch FROM client_assignments a
       LEFT JOIN clients c ON c.id = a.client_id WHERE a.id = ? LIMIT 1`,
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
      const clientLabel = `${after.client_name || 'a client'}${after.branch || after.client_branch ? ` - ${after.branch || after.client_branch}` : ''}`;
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
      SELECT u.id,u.email,u.role,u.designation,u.department_id,u.subsidiary_id,u.phone_number,
        u.first_name,u.last_name,u.first_login,u.is_active,u.two_factor_enabled,u.two_factor_method,
        u.two_factor_phone,u.created_at,d.department_name,s.subsidiary_name, ${USER_MODULE_ROLES_SQL}
      FROM user_profiles u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN subsidiaries s ON u.subsidiary_id = s.id
      WHERE u.id = ?
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ ...rows[0], module_roles: normalizeModuleRoles(rows[0].module_roles) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/user_profiles', authMiddleware, async (req, res) => {
  try {
    if (!isAdminOrSuperAdmin(req)) return res.status(403).json({ error: 'Only Admin or SuperAdmin can create users.' });
    const id = uuidv4();
    const data = req.body;
    const email = String(data.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@riana\.co$/i.test(email)) return res.status(400).json({ error: 'New users must use a @riana.co email address.' });
    if (!SYSTEM_ROLES.has(data.role)) return res.status(400).json({ error: 'Invalid user role.' });
    if (!userCanManageTargetRole(req, data.role)) return res.status(403).json({ error: 'Only SuperAdmin can create Admin or SuperAdmin users.' });
    const passwordHash = await hashPassword(crypto.randomBytes(32).toString('base64url'));
    await pool.query(
      `INSERT INTO user_profiles
       (id,email,password,role,designation,department_id,subsidiary_id,phone_number,first_name,last_name,first_login,is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,TRUE,TRUE)`,
      [id,email,passwordHash,data.role,data.designation || null,data.department_id || null,data.subsidiary_id || null,data.phone_number || null,data.first_name || null,data.last_name || null],
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
    const welcomeDelivery = await sendWelcomeCredentials({
      email, phoneNumber: data.phone_number, name: `${data.first_name || ''} ${data.last_name || ''}`.trim(), loginUrl, setupUrl,
    });
    const inAppDelivery = await sendUserNotification({
      pool,
      userId: id,
      title: 'Welcome to RIANA CIMS',
      message: 'Your RIANA CIMS account is ready. Use the secure setup link sent to you within 30 minutes.',
      type: 'success',
      actionUrl: loginUrl,
      notificationType: 'welcome',
      email: false,
      sms: false,
    });
    res.status(201).json({ id, ...data, email, first_login: true, welcome_delivery: welcomeDelivery, in_app_notification: inAppDelivery });
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
    if (updates.length) {
      const revokesSessions = updates.some(([key]) => key === 'role' || key === 'is_active');
      const fields = `${updates.map(([key]) => `${key} = ?`).join(', ')}${revokesSessions ? ', session_version = session_version + 1' : ''}`;
      await pool.query(`UPDATE user_profiles SET ${fields} WHERE id = ?`, [...updates.map(([, value]) => value), req.params.id]);
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

app.delete('/api/user_profiles/:id', authMiddleware, async (req, res) => {
  try {
    if (!isSuperAdmin(req)) return res.status(403).json({ error: 'Only SuperAdmin can delete users.' });
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
      default_escalation_matrix: typeof r.default_escalation_matrix === 'string' ? JSON.parse(r.default_escalation_matrix) : r.default_escalation_matrix
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/subsidiaries', requireRole('Admin'), async (req, res) => {
  try {
    const id = uuidv4();
    const { subsidiary_name } = req.body;
    await pool.query('INSERT INTO subsidiaries (id, subsidiary_name) VALUES (?, ?)', [id, subsidiary_name]);
    res.status(201).json({ id, subsidiary_name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/subsidiaries/:id', requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = allowedEntries(req.body, SUBSIDIARY_FIELDS);
    if (!updates.length) return res.status(400).json({ error: 'No valid subsidiary fields supplied.' });
    const fields = updates.map(([key]) => `${key} = ?`).join(', ');
    const values = updates.map(([, value]) => sqlValue(value));
    await pool.query(`UPDATE subsidiaries SET ${fields} WHERE id = ?`, [...values, id]);
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
    const query = client_id ? 'SELECT * FROM feedback_links WHERE client_id = ?' : 'SELECT * FROM feedback_links';
    const [rows] = await pool.query(query, client_id ? [client_id] : []);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/feedback_links', requireRole('SuperAdmin', 'Admin', 'Teamlead'), async (req, res) => {
  try {
    const id = uuidv4();
    const data = req.body;
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query(
      'INSERT INTO feedback_links (id, client_id, installation_id, unique_token, expires_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, data.client_id, data.installation_id || null, token, data.expires_at, req.user.id],
    );
    const [rows] = await pool.query('SELECT * FROM feedback_links WHERE id = ? LIMIT 1', [id]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/feedback_links/:id', requireRole('SuperAdmin', 'Admin', 'Teamlead'), async (req, res) => {
  try {
    const updates = allowedEntries(req.body, FEEDBACK_LINK_FIELDS);
    if (!updates.length) return res.status(400).json({ error: 'No valid feedback-link fields supplied.' });
    const fields = updates.map(([key]) => `${key} = ?`).join(', ');
    await pool.query(`UPDATE feedback_links SET ${fields} WHERE id = ?`, [...updates.map(([, value]) => sqlValue(value)), req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/feedback_links/:id/send', authMiddleware, requireRole('SuperAdmin', 'Admin', 'Teamlead'), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.id,f.unique_token,f.expires_at,c.client_name,c.contact_person_name,c.contact_email,c.contact_phone
       FROM feedback_links f JOIN clients c ON c.id = f.client_id WHERE f.id = ? LIMIT 1`,
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Feedback link not found' });
    const feedback = rows[0];
    if (!feedback.contact_email && !feedback.contact_phone) {
      return res.status(400).json({ error: 'The client has no email address or phone number.' });
    }
    const baseUrl = canonicalAppUrl(req).replace(/\/+$/, '');
    const feedbackUrl = `${baseUrl}/feedback/${encodeURIComponent(feedback.unique_token)}`;
    const message = `Please share your feedback about the RIANA installation for ${feedback.client_name}. The link expires on ${new Date(feedback.expires_at).toLocaleDateString('en-KE')}.`;
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
      deliveries.push({ channel: 'sms', promise: sendSms({
        phoneNumber: feedback.contact_phone,
        message: `RIANA: Please rate your installation experience: ${feedbackUrl}`,
      }) });
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
    res.status(failed.length === results.length ? 502 : 200).json({ success: failed.length === 0, email_sent: emailSent, sms_sent: smsSent, deliveries: results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// INSTALLATION FEEDBACK
app.get('/api/installation_feedback', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT f.*, c.client_name, i.kiosk_type as installation_name
      FROM installation_feedback f
      LEFT JOIN clients c ON f.client_id = c.id
      LEFT JOIN installations i ON f.installation_id = i.id
      ORDER BY f.created_at DESC
    `);
    res.json(rows.map(row => ({
      ...row,
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
        dynamic_responses
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

app.post('/api/announcements', authMiddleware, async (req, res) => {
  try {
    if (!['SuperAdmin', 'Admin', 'Teamlead'].includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions.' });
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

app.put('/api/announcements/:id', authMiddleware, requireRole('Admin', 'Teamlead'), async (req, res) => {
  try {
    const { title, content, priority, target_audience, subsidiary_id, expires_at } = req.body;
    await pool.query(
      'UPDATE announcements SET title = ?, content = ?, priority = ?, target_audience = ?, subsidiary_id = ?, expires_at = ? WHERE id = ?',
      [title, content, priority, target_audience, subsidiary_id, expires_at || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/announcements/:id', requireRole('Admin', 'Teamlead'), async (req, res) => {
  try {
    const { is_active } = req.body;
    await pool.query('UPDATE announcements SET is_active = ? WHERE id = ?', [is_active, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/announcements/:id', requireRole('Admin', 'Teamlead'), async (req, res) => {
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
    const [rows] = await pool.query('SELECT * FROM handover_uploads ORDER BY upload_date DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/handover_uploads', async (req, res) => {
  try {
    const id = uuidv4();
    const data = req.body;
    const resolved = resolveStoredFile(uploadsDir, data.file_path);
    if (!resolved || !fs.existsSync(resolved)) return res.status(400).json({ error: 'Uploaded file does not exist.' });
    await pool.query('INSERT INTO handover_uploads (id, client_id, installation_id, file_name, file_path, file_size, is_signed, notes, uploaded_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, data.client_id, data.installation_id, data.file_name, path.basename(data.file_path), data.file_size, data.is_signed, data.notes, req.user.id]);
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// INSTALLATION BUDGETS
app.get('/api/budgets', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM installation_budgets ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/budgets', async (req, res) => {
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

app.put('/api/budgets/:id', async (req, res) => {
  try {
    const { labor_cost, equipment_cost, transport_cost, miscellaneous_cost, total_budget, notes, currency } = req.body;
    await pool.query(
      'UPDATE installation_budgets SET labor_cost = ?, equipment_cost = ?, transport_cost = ?, miscellaneous_cost = ?, total_budget = ?, notes = ?, currency = ? WHERE id = ?',
      [labor_cost, equipment_cost, transport_cost, miscellaneous_cost, total_budget, notes, currency, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/budgets/:id', async (req, res) => {
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
app.get('/api/system_logs', requireRole('Admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT l.*, u.email FROM system_logs l LEFT JOIN user_profiles u ON l.user_id = u.id ORDER BY l.created_at DESC LIMIT 100');
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
app.get('/api/companies', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM company_settings LIMIT 1');
    res.json(rows[0] || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/companies', requireRole('SuperAdmin'), async (req, res) => {
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
      'SELECT * FROM installation_feedback WHERE client_id = ? AND installation_id = ? ORDER BY created_at DESC LIMIT 1',
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

app.get('/api/admin/feedback_questions', requireRole('Admin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM feedback_questions ORDER BY order_index ASC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/feedback_questions', requireRole('Admin'), async (req, res) => {
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

app.put('/api/feedback_questions/:id', requireRole('Admin'), async (req, res) => {
  try {
    const data = req.body;
    await pool.query(
      'UPDATE feedback_questions SET question_text = ?, question_type = ?, category = ?, order_index = ?, is_active = ? WHERE id = ?',
      [data.question_text, data.question_type, data.category, data.order_index, data.is_active, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/feedback_questions/:id', requireRole('Admin'), async (req, res) => {
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
      `SELECT f.*,c.client_name,c.branch FROM feedback_links f
       JOIN clients c ON f.client_id = c.id
       WHERE f.unique_token = ? AND f.is_used = FALSE AND f.expires_at > NOW() LIMIT 1`,
      [req.params.token],
    );
    if (!rows.length) return res.status(404).json({ error: 'Valid link not found' });
    
    const row = rows[0];
    const maxAge = Math.max(1, new Date(row.expires_at).getTime() - Date.now());
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
        branch: row.branch
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/public/installation-feedback', async (req, res) => {
  let connection;
  try {
    const id = uuidv4();
    const data = req.body;
    const token = parseCookies(req.headers.cookie || '').riana_feedback_token;
    if (!token) return res.status(401).json({ error: 'A valid feedback session is required.' });
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [links] = await connection.query(
      `SELECT id,client_id,installation_id FROM feedback_links
       WHERE unique_token = ? AND is_used = FALSE AND expires_at > NOW() LIMIT 1 FOR UPDATE`,
      [token],
    );
    const link = links[0];
    if (!link || String(link.client_id) !== String(data.client_id) || String(link.installation_id || '') !== String(data.installation_id || '')) {
      await connection.rollback();
      connection.release();
      connection = null;
      return res.status(403).json({ error: 'Feedback link is invalid, expired, or does not match this installation.' });
    }
    await connection.query(
      `INSERT INTO installation_feedback (
        id, client_id, installation_id, 
        overall_satisfaction, recommendation_score, 
        positive_feedback, improvement_suggestions, dynamic_responses
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
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
    if (used.affectedRows !== 1) throw new Error('Feedback link was already consumed.');
    await connection.commit();
    connection.release();
    connection = null;
    res.json({ success: true });
  } catch (err) { 
    if (connection) {
      await connection.rollback().catch(() => {});
      connection.release();
    }
    console.error('Feedback submission error:', err);
    res.status(500).json({ error: 'Unable to submit feedback.' });
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

app.get('/api/admin/db-stats', requireRole('SuperAdmin'), async (req, res) => {
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
  const { email, user_name } = req.body;
  console.log(`Mocking sending documentation to ${email} for ${user_name}`);
  res.json({ success: true, message: 'Documentation sent successfully (mock)' });
});

app.post('/api/chat/assistant', async (req, res) => {
  const { message } = req.body;
  const msg = (message || '').toLowerCase();
  
  let reply = "I'm the RIANA CIMS Assistant. I can help with onboarding, Developers and Sales workflows, clients, installations, announcements, notifications, PWA installation, reports, or system navigation. What would you like to do?";

  if (msg.includes('optimus')) {
    reply = "RIANA OPTIMUS is available from the sidebar under External Systems. It remains an external service, while the Developers workspace opens inside CIMS using your current RIANA session.";
  } else if (msg.includes('superadmin') || msg.includes('backup') || msg.includes('company setting') || msg.includes('extra role') || msg.includes('module role')) {
    reply = "SuperAdmin is the platform-wide RIANA CIMS authority across CIMS and Developers/CRMS. The system self-repairs intended SuperAdmin account records on startup, keeps CIMS and CRMS SuperAdmin module grants aligned, and restricts backups, company settings, user deletion, Admin/SuperAdmin changes, and extra Developers workspace grants to SuperAdmin.";
  } else if (msg.includes('welcome') || msg.includes('new user') || msg.includes('register') || msg.includes('onboard') || msg.includes('user management')) {
    reply = "User management is centralized in the main CIMS Users module. SuperAdmin can create Admin/SuperAdmin accounts, delete users, and grant extra Developers workspace roles; Admin users can create and maintain non-privileged operational users. New accounts must use an @riana.co email address and receive setup email/SMS notifications with the system URL where delivery channels are configured.";
  } else if (msg.includes('developer') || msg.includes('sales') || msg.includes('crms')) {
    reply = "Developers is part of the unified CIMS app. SuperAdmin, Admin, Teamlead, Developer, and Sales roles can enter it with the same account and database session. Sales can create requests and receive approval-awaiting email alerts; assigned developers receive in-app, email, and SMS notifications with the request link and system URL.";
  } else if (msg.includes('notification') || msg.includes('announcement') || msg.includes('sound')) {
    reply = "New assignments, approval requests, password resets, and workflow updates create in-app notifications and can dispatch email/SMS with the relevant system URL. New assignments and notifications play a chime, while announcements use a distinct announcement sound.";
  } else if (msg.includes('pwa') || msg.includes('offline') || msg.includes('install app')) {
    reply = "RIANA CIMS is installable as a PWA. App assets are cached for faster repeat visits, online/offline status is detected automatically, and authenticated API data always stays network-only to prevent one user’s data being exposed to another user on a shared device.";
  } else if (msg.includes('report') || msg.includes('logo') || msg.includes('branding')) {
    reply = "You can generate PDF and CSV reports in the Reports section. Document headers use a logo-matched teal brand color, keep the RIANA logo inside a reserved aspect-ratio-safe slot, and avoid duplicate or floating logo images across Budget, Performance, E-Handover, and Developers documents.";
  } else if (msg.includes('client')) {
    reply = "In the 'Clients' module, you can manage client profiles, contact information, and branches. You can also generate unique feedback links for clients to rate installation quality.";
  } else if (msg.includes('installation') || msg.includes('assign')) {
    reply = "Installations can be tracked and assigned to technicians in the 'Assign' and 'Installations' modules. You can monitor progress, add equipment details, and upload handover documents.";
  } else if (msg.includes('calendar') || msg.includes('workload')) {
    reply = "The 'Workload Calendar' allows Admins and Teamleads to see technician assignments across a timeline, helping to manage team capacity and installation schedules effectively.";
  } else if (msg.includes('password') || msg.includes('login') || msg.includes('security')) {
    reply = "New accounts must use an @riana.co email address. Welcome messages and password reset requests send secure setup/reset links by email and SMS where configured. If a reset request uses an unknown active email, the system returns a user-not-found error instead of issuing a token.";
  } else if (msg.includes('hi') || msg.includes('hello') || msg.includes('hey')) {
    reply = "Hello! I'm your RIANA CIMS Assistant. Ask me about onboarding, Developers or Sales access, notifications, announcements, PWA installation, clients, installations, reports, or OPTIMUS.";
  } else if (msg.includes('help') || msg.includes('support')) {
    reply = "The 'Help & Support' section contains documentation and system guides. I can also answer specific questions about managing installations or generating reports.";
  }

  res.json({ reply });
});

// CHAT SYSTEM - indexed by user so broadcasts stay O(connections for that user)
const chatClients = new Map();

app.get('/api/chat/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const clientId = uuidv4();
  const userId = req.query.userId;
  const token = req.query.token;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!userId || String(decoded.id) !== String(userId)) throw new Error('User mismatch');
  } catch {
    res.write('event: error\ndata: { "message": "Authentication required" }\n\n');
    return res.end();
  }

  console.log(`[SSE] User ${userId} connected (client: ${clientId})`);
  const userKey = String(userId);
  const userConnections = chatClients.get(userKey) || new Map();
  userConnections.set(clientId, res);
  chatClients.set(userKey, userConnections);

  // Set up heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  req.on('close', () => {
    console.log(`[SSE] User ${userId} disconnected (client: ${clientId})`);
    clearInterval(heartbeat);
    userConnections.delete(clientId);
    if (userConnections.size === 0) chatClients.delete(userKey);
  });
});

const notifyChatClients = (userId, data) => {
  console.log(`[Chat] Notifying user ${userId}:`, data.type);
  const connections = chatClients.get(String(userId));
  if (!connections) return;
  connections.forEach((response) => response.write(`data: ${JSON.stringify(data)}\n\n`));
  console.log(`[Chat] Broadcast to ${connections.size} connections for user ${userId}`);
};

app.get('/api/chat/users', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.designation,
             (SELECT COUNT(*) FROM messages m WHERE m.sender_id = u.id AND m.receiver_id = ? AND m.is_read = FALSE) as unread_count
      FROM user_profiles u 
      WHERE u.id != ? AND u.is_active = 1
    `, [req.user.id, req.user.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/chat/messages/:otherUserId', authMiddleware, async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const [rows] = await pool.query(`
      SELECT m.*, 
             s.first_name as sender_first_name, s.last_name as sender_last_name,
             r.first_name as receiver_first_name, r.last_name as receiver_last_name
      FROM messages m
      JOIN user_profiles s ON m.sender_id = s.id
      JOIN user_profiles r ON m.receiver_id = r.id
      WHERE (m.sender_id = ? AND m.receiver_id = ?) 
         OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.created_at ASC
    `, [req.user.id, otherUserId, otherUserId, req.user.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/chat/messages', authMiddleware, async (req, res) => {
  try {
    const { receiver_id, content } = req.body;
    const id = uuidv4();
    
    await pool.query('INSERT INTO messages (id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)', 
      [id, req.user.id, receiver_id, content]);
    
    const [newMessage] = await pool.query(`
      SELECT m.*, s.first_name as sender_first_name, s.last_name as sender_last_name
      FROM messages m
      JOIN user_profiles s ON m.sender_id = s.id
      WHERE m.id = ?
    `, [id]);

    notifyChatClients(receiver_id, { type: 'new_message', message: newMessage[0] });
    
    res.json(newMessage[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/chat/messages/:messageId/read', authMiddleware, async (req, res) => {
  try {
    const { messageId } = req.params;
    await pool.query('UPDATE messages SET is_read = TRUE, read_at = CURRENT_TIMESTAMP WHERE id = ? AND receiver_id = ?', 
      [messageId, req.user.id]);
    
    const [msg] = await pool.query('SELECT sender_id FROM messages WHERE id = ?', [messageId]);
    if (msg.length) {
      notifyChatClients(msg[0].sender_id, { type: 'message_read', messageId });
    }
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/chat/read-all/:senderId', authMiddleware, async (req, res) => {
  try {
    const { senderId } = req.params;
    await pool.query('UPDATE messages SET is_read = TRUE, read_at = CURRENT_TIMESTAMP WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE', 
      [senderId, req.user.id]);
    
    notifyChatClients(senderId, { type: 'all_read', receiverId: req.user.id });
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
