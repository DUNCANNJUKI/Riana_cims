const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const createCrmsRouter = require('./routes/crms');
const { createChallenge, verifyChallenge } = require('./utils/twoFactor');
const { sendEmail, sendSms, sendWelcomeCredentials } = require('./services/notifications');
const { sendUserNotification, sendUsersNotification } = require('./services/notificationDispatcher');
const { createDatabaseBackup, listBackups, pruneBackups, getLastRun } = require('./services/databaseBackup');

const app = express();
const port = process.env.VITE_API_PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod';

const normalizedScore = (value, minimum, maximum, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  const score = Number(value);
  return Number.isFinite(score) && score >= minimum && score <= maximum ? score : fallback;
};

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use('/api/crms', createCrmsRouter({ pool, jwtSecret: JWT_SECRET }));

// File Upload & Handover Metadata
app.post('/api/upload', async (req, res) => {
  try {
    const { fileName, base64Data, client_id, installation_id, uploaded_by_user_id, is_signed, notes } = req.body;
    if (!fileName || !base64Data) return res.status(400).json({ error: 'Missing file data' });
    
    // Save file
    const buffer = Buffer.from(base64Data, 'base64');
    const finalFileName = `${Date.now()}_${fileName}`;
    const filePath = path.join(uploadsDir, finalFileName);
    fs.writeFileSync(filePath, buffer);
    
    // If metadata provided, also save to DB
    let handoverId = null;
    if (client_id && installation_id) {
      handoverId = uuidv4();
      await pool.query(
        'INSERT INTO handover_uploads (id, client_id, installation_id, file_name, file_path, file_size, is_signed, notes, uploaded_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [handoverId, client_id, installation_id, fileName, finalFileName, buffer.length, is_signed === 'true' || is_signed === true, notes || '', uploaded_by_user_id]
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
    res.status(500).json({ error: err.message }); 
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
      role ENUM('Admin', 'Developer', 'Teamlead', 'Sales', 'User') NOT NULL,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
      FOREIGN KEY (subsidiary_id) REFERENCES subsidiaries(id) ON DELETE SET NULL
    )`);

    await pool.query("ALTER TABLE user_profiles MODIFY role ENUM('Admin','Developer','Teamlead','Sales','User') NOT NULL");
    await pool.query(`ALTER TABLE user_profiles
      ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS two_factor_method ENUM('email','sms','call') NOT NULL DEFAULT 'email',
      ADD COLUMN IF NOT EXISTS two_factor_phone VARCHAR(30) NULL`);
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

    // Patch: Ensure all users are active so they show up in chat
    await pool.query('UPDATE user_profiles SET is_active = 1 WHERE is_active IS NULL');
    
    console.log('Database initialization complete');
  } catch (err) {
    console.error('Database initialization failed:', err);
  }
};

initDb();

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
app.get('/api/files/:filename', (req, res) => {
  const filePath = path.join(uploadsDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
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

app.get('/api/admin/backup-schedule', async (req, res) => {
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

app.post('/api/admin/backup-schedule', async (req, res) => {
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
    res.json({ success: true, schedule: finalSchedule, day, time });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/backups', async (req, res) => {
  try {
    res.json(listBackups());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/backup-status', async (_req, res) => {
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

app.post('/api/admin/backup', async (req, res) => {
  try {
    const result = await createDatabaseBackup(pool);
    pruneBackups();
    res.json({ success: true, message: 'Database backup created successfully', ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DASHBOARD STATS
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const { userId, role } = req.query;
    const isRegularUser = role !== 'Admin' && role !== 'Teamlead';

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
  return result;
};

const issueCimsSession = (res, user) => {
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ user: safeUser(user), token });
};

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const [rows] = await pool.query('SELECT * FROM user_profiles WHERE LOWER(email) = ?', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    
    const user = rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'This user account is inactive.' });
    if (user.password !== password) {
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
    const [rows] = await pool.query('SELECT * FROM user_profiles WHERE id = ? AND is_active = TRUE', [challenge.user_id]);
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

app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const [rows] = await pool.query(`
      SELECT u.*, d.department_name, s.subsidiary_name
      FROM user_profiles u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN subsidiaries s ON u.subsidiary_id = s.id
      WHERE u.id = ?
    `, [decoded.id]);

    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    console.log(`Auth/me for ${decoded.email}: first_login=${rows[0].first_login}`);
    res.json({ user: safeUser(rows[0]) });
  } catch (err) { res.status(401).json({ error: 'Invalid token' }); }
});

app.get('/api/user_profiles', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id,u.email,u.role,u.designation,u.department_id,u.subsidiary_id,u.phone_number,
        u.first_name,u.last_name,u.first_login,u.is_active,u.two_factor_enabled,u.two_factor_method,
        u.two_factor_phone,u.created_at,d.department_name,s.subsidiary_name
      FROM user_profiles u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN subsidiaries s ON u.subsidiary_id = s.id
      ORDER BY u.created_at DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/auth/password', authMiddleware, async (req, res) => {
  try {
    const password = String(req.body.password || '');
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    await pool.query('UPDATE user_profiles SET password = ?, first_login = FALSE WHERE id = ?', [password, req.user.id]);
    const loginUrl = process.env.CIMS_LOGIN_URL || `${req.protocol}://${req.get('host')}/`;
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
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log(`Clearing first_login for user ID: ${decoded.id}`);
    const [result] = await pool.query('UPDATE user_profiles SET first_login = 0 WHERE id = ?', [decoded.id]);
    console.log(`Update result: ${JSON.stringify(result)}`);
    res.json({ success: true });
  } catch (err) { 
    console.error('Error in first-login PATCH:', err);
    res.status(500).json({ error: err.message }); 
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
      [id, data.client_name, data.industry_classification, data.current_vendor, JSON.stringify(data.tags || []), data.contact_person_name, data.contact_person_department, data.contact_email, data.contact_phone, data.account_manager_id, data.subsidiary_id, data.department_id, data.branch, data.added_by_user_id, data.start_date, data.contract_type]
    );
    res.json({ id, ...data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const fields = Object.keys(body).map(k => `${k} = ?`).join(', ');
    const values = Object.values(body).map(v => typeof v === 'object' ? JSON.stringify(v) : v);
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
    const data = req.body;
    const fields = ['id', ...Object.keys(data)];
    const placeholders = fields.map(() => '?').join(', ');
    const values = [id, ...Object.values(data).map(v => typeof v === 'object' ? JSON.stringify(v) : v)];
    await pool.query(`INSERT INTO installations (${fields.join(', ')}) VALUES (${placeholders})`, values);
    res.json({ id, ...data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/installations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const fields = Object.keys(body).map(k => `${k} = ?`).join(', ');
    const values = Object.values(body).map(v => typeof v === 'object' ? JSON.stringify(v) : v);
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
    const data = req.body;
    const fields = ['id', ...Object.keys(data)];
    const placeholders = fields.map(() => '?').join(', ');
    await pool.query(`INSERT INTO client_assignments (${fields.join(', ')}) VALUES (${placeholders})`, [id, ...Object.values(data)]);
    const [clients] = await pool.query('SELECT client_name,branch FROM clients WHERE id = ? LIMIT 1', [data.client_id]);
    const client = clients[0] || {};
    const clientLabel = `${client.client_name || 'a client'}${data.branch || client.branch ? ` - ${data.branch || client.branch}` : ''}`;
    const loginUrl = process.env.CIMS_LOGIN_URL || `${req.protocol}://${req.get('host')}/`;
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
    const fields = Object.keys(req.body).map(k => `${k} = ?`).join(', ');
    if (!fields) return res.status(400).json({ error: 'No assignment fields supplied' });
    await pool.query(`UPDATE client_assignments SET ${fields} WHERE id = ?`, [...Object.values(req.body), req.params.id]);
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
      const loginUrl = process.env.CIMS_LOGIN_URL || `${req.protocol}://${req.get('host')}/`;
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
    if (users.length) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [users[0].id]);
      await pool.query(
        'INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL 30 MINUTE))',
        [uuidv4(), users[0].id, tokenHash],
      );
      const loginUrl = `${(process.env.CIMS_LOGIN_URL || `${req.protocol}://${req.get('host')}/`).replace(/\/+$/, '')}/`;
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
        smsMessage: `RIANA CIMS password reset requested. Open the link sent to your email. It expires in 30 minutes.`,
      });
    }
    res.json({ success: true, message: 'If the account exists, password reset instructions have been sent.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    if (!token) return res.status(400).json({ error: 'Reset token is required.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [tokens] = await pool.query(
      `SELECT id,user_id FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1`,
      [tokenHash],
    );
    if (!tokens.length) return res.status(400).json({ error: 'This password reset link is invalid or has expired.' });
    await pool.query('UPDATE user_profiles SET password = ?, first_login = FALSE WHERE id = ?', [password, tokens[0].user_id]);
    await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [tokens[0].user_id]);
    const loginUrl = process.env.CIMS_LOGIN_URL || `${req.protocol}://${req.get('host')}/`;
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/user_profiles/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id,u.email,u.role,u.designation,u.department_id,u.subsidiary_id,u.phone_number,
        u.first_name,u.last_name,u.first_login,u.is_active,u.two_factor_enabled,u.two_factor_method,
        u.two_factor_phone,u.created_at,d.department_name,s.subsidiary_name
      FROM user_profiles u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN subsidiaries s ON u.subsidiary_id = s.id
      WHERE u.id = ?
    `, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/user_profiles', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can create users.' });
    const id = uuidv4();
    const data = req.body;
    const email = String(data.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@riana\.co$/i.test(email)) return res.status(400).json({ error: 'New users must use a @riana.co email address.' });
    const allowedRoles = new Set(['Admin', 'Developer', 'Teamlead', 'Sales', 'User']);
    if (!allowedRoles.has(data.role)) return res.status(400).json({ error: 'Invalid user role.' });
    const password = String(data.password || '');
    if (password.length < 8) return res.status(400).json({ error: 'Temporary password must be at least 8 characters.' });
    await pool.query(
      `INSERT INTO user_profiles
       (id,email,password,role,designation,department_id,subsidiary_id,phone_number,first_name,last_name,first_login,is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,TRUE,TRUE)`,
      [id,email,password,data.role,data.designation || null,data.department_id || null,data.subsidiary_id || null,data.phone_number || null,data.first_name || null,data.last_name || null],
    );
    const loginUrl = process.env.CIMS_LOGIN_URL || `${req.protocol}://${req.hostname}:8090/`;
    const welcomeDelivery = await sendWelcomeCredentials({
      email, phoneNumber: data.phone_number, name: `${data.first_name || ''} ${data.last_name || ''}`.trim(), password, loginUrl,
    });
    const inAppDelivery = await sendUserNotification({
      pool,
      userId: id,
      title: 'Welcome to RIANA CIMS',
      message: 'Your RIANA CIMS account is ready. Change your temporary password when you first sign in.',
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
    if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can update users.' });
    const allowedFields = new Set(['email','role','designation','department_id','subsidiary_id','phone_number','first_name','last_name','is_active','two_factor_enabled','two_factor_method','two_factor_phone']);
    const updates = Object.entries(req.body).filter(([key]) => allowedFields.has(key));
    if (!updates.length) return res.status(400).json({ error: 'No valid user fields supplied.' });
    const emailUpdate = updates.find(([key]) => key === 'email');
    if (emailUpdate) {
      emailUpdate[1] = String(emailUpdate[1] || '').trim().toLowerCase();
      if (!/^[^\s@]+@riana\.co$/i.test(emailUpdate[1])) return res.status(400).json({ error: 'Users must use a @riana.co email address.' });
    }
    const fields = updates.map(([key]) => `${key} = ?`).join(', ');
    await pool.query(`UPDATE user_profiles SET ${fields} WHERE id = ?`, [...updates.map(([, value]) => value), req.params.id]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A user with this email already exists.' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/user_profiles/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can delete users.' });
    await pool.query('DELETE FROM user_profiles WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/user_profiles/:id/password', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Only Admin can reset user passwords.' });
    const password = String(req.body.password || '');
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    await pool.query('UPDATE user_profiles SET password = ?, first_login = TRUE WHERE id = ?', [password, req.params.id]);
    const loginUrl = process.env.CIMS_LOGIN_URL || `${req.protocol}://${req.get('host')}/`;
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

app.post('/api/subsidiaries', async (req, res) => {
  try {
    const id = uuidv4();
    const { subsidiary_name } = req.body;
    await pool.query('INSERT INTO subsidiaries (id, subsidiary_name) VALUES (?, ?)', [id, subsidiary_name]);
    res.status(201).json({ id, subsidiary_name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/subsidiaries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = Object.keys(req.body).map(k => `${k} = ?`).join(', ');
    const values = Object.values(req.body).map(v => typeof v === 'object' ? JSON.stringify(v) : v);
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

app.post('/api/feedback_links', async (req, res) => {
  try {
    const id = uuidv4();
    const data = req.body;
    const token = Math.random().toString(36).substr(2, 10);
    await pool.query('INSERT INTO feedback_links (id, client_id, installation_id, unique_token, expires_at, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)', [id, data.client_id, data.installation_id, token, data.expires_at, data.created_by_user_id]);
    res.json({ id, unique_token: token });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/feedback_links/:id', async (req, res) => {
  try {
    const fields = Object.keys(req.body).map(k => `${k} = ?`).join(', ');
    await pool.query(`UPDATE feedback_links SET ${fields} WHERE id = ?`, [...Object.values(req.body), req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/feedback_links/:id/send', authMiddleware, async (req, res) => {
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
    const baseUrl = (process.env.CIMS_LOGIN_URL || `${req.protocol}://${req.get('host')}/`).replace(/\/+$/, '');
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
      clients: { client_name: row.client_name },
      installations: { installation_name: row.installation_name }
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/feedback', async (req, res) => {
  try {
    const { installation_id, client_id, submitted_by, dynamic_responses, ...feedbackData } = req.body;
    const id = uuidv4();
    
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
        feedbackData.positive_feedback || feedbackData.comments || '', 
        feedbackData.improvement_suggestions || '',
        JSON.stringify(dynamic_responses || {})
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
    if (!['Admin', 'Teamlead'].includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions.' });
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

app.put('/api/announcements/:id', authMiddleware, async (req, res) => {
  try {
    const { title, content, priority, target_audience, subsidiary_id, expires_at } = req.body;
    await pool.query(
      'UPDATE announcements SET title = ?, content = ?, priority = ?, target_audience = ?, subsidiary_id = ?, expires_at = ? WHERE id = ?',
      [title, content, priority, target_audience, subsidiary_id, expires_at || null, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/announcements/:id', async (req, res) => {
  try {
    const { is_active } = req.body;
    await pool.query('UPDATE announcements SET is_active = ? WHERE id = ?', [is_active, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/announcements/:id', async (req, res) => {
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
    await pool.query('INSERT INTO handover_uploads (id, client_id, installation_id, file_name, file_path, file_size, is_signed, notes, uploaded_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, data.client_id, data.installation_id, data.file_name, data.file_path, data.file_size, data.is_signed, data.notes, data.uploaded_by_user_id]);
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
app.get('/api/system_logs', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT l.*, u.email FROM system_logs l LEFT JOIN user_profiles u ON l.user_id = u.id ORDER BY l.created_at DESC LIMIT 100');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/system_logs', async (req, res) => {
  try {
    const id = uuidv4();
    const data = req.body;
    await pool.query('INSERT INTO system_logs (id, user_id, action, details) VALUES (?, ?, ?, ?)', [id, data.user_id, data.action, data.details]);
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

app.put('/api/companies', async (req, res) => {
  try {
    const data = req.body;
    const [rows] = await pool.query('SELECT id FROM company_settings LIMIT 1');
    if (rows.length) {
      const id = rows[0].id;
      const fields = Object.keys(data).filter(k => k !== 'id').map(k => `${k} = ?`).join(', ');
      const values = Object.keys(data).filter(k => k !== 'id').map(k => typeof data[k] === 'object' ? JSON.stringify(data[k]) : data[k]);
      await pool.query(`UPDATE company_settings SET ${fields} WHERE id = ?`, [...values, id]);
    } else {
      const id = 1;
      const fields = ['id', ...Object.keys(data)];
      const placeholders = fields.map(() => '?').join(', ');
      const values = [id, ...Object.values(data).map(v => typeof v === 'object' ? JSON.stringify(v) : v)];
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

app.get('/api/admin/feedback_questions', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM feedback_questions ORDER BY order_index ASC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/feedback_questions', async (req, res) => {
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

app.put('/api/feedback_questions/:id', async (req, res) => {
  try {
    const data = req.body;
    await pool.query(
      'UPDATE feedback_questions SET question_text = ?, question_type = ?, category = ?, order_index = ?, is_active = ? WHERE id = ?',
      [data.question_text, data.question_type, data.category, data.order_index, data.is_active, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/feedback_questions/:id', async (req, res) => {
  try {
    // Soft delete to protect existing feedback relationships
    await pool.query('UPDATE feedback_questions SET is_active = FALSE WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUBLIC ENDPOINTS
app.get('/api/public/feedback-links/:token', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT f.*, c.client_name, c.branch FROM feedback_links f JOIN clients c ON f.client_id = c.id WHERE f.unique_token = ? AND f.is_used = FALSE', [req.params.token]);
    if (!rows.length) return res.status(404).json({ error: 'Valid link not found' });
    
    const row = rows[0];
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
  try {
    const id = uuidv4();
    const data = req.body;
    
    // Support both old and new data structures
    await pool.query(
      `INSERT INTO installation_feedback (
        id, client_id, installation_id, 
        overall_satisfaction, recommendation_score, 
        dynamic_responses
      ) VALUES (?, ?, ?, ?, ?, ?)`, 
      [
        id, 
        data.client_id, 
        data.installation_id, 
        normalizedScore(data.overall_satisfaction, 1, 5, 5),
        normalizedScore(data.recommendation_score, 0, 10, 10),
        JSON.stringify(data.dynamic_responses || {})
      ]
    );
    res.json({ success: true });
  } catch (err) { 
    console.error('Feedback submission error:', err);
    res.status(500).json({ error: err.message }); 
  }
});

app.post('/api/public/feedback-links/:token/use', async (req, res) => {
  try {
    await pool.query('UPDATE feedback_links SET is_used = TRUE, used_at = NOW() WHERE unique_token = ?', [req.params.token]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/verify-password', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    const [rows] = await pool.query('SELECT password FROM user_profiles WHERE id = ?', [req.user.id]);
    if (rows.length && rows[0].password === password) {
      return res.json({ success: true });
    }
    res.status(401).json({ error: 'Invalid password' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/db-stats', async (req, res) => {
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
  } else if (msg.includes('welcome') || msg.includes('new user') || msg.includes('register') || msg.includes('onboard')) {
    reply = "Admins create users with an @riana.co email address and a temporary password. The system sends the username, temporary password, and CIMS login URL by welcome email and—when a phone number is supplied—SMS. The user must replace the temporary password on first login.";
  } else if (msg.includes('developer') || msg.includes('sales') || msg.includes('crms')) {
    reply = "Developers is part of the unified CIMS app. Admin, Teamlead, Developer, and Sales users enter it with the same account and database session. Sales users can review and approve change requests; Developers work on assigned requests.";
  } else if (msg.includes('notification') || msg.includes('announcement') || msg.includes('sound')) {
    reply = "New assignments and notifications play a chime, while new announcements use a distinct announcement sound. Opening the notification bell can also enable system notifications when your browser supports them.";
  } else if (msg.includes('pwa') || msg.includes('offline') || msg.includes('install app')) {
    reply = "RIANA CIMS is installable as a PWA. App assets are cached for faster repeat visits, online/offline status is detected automatically, and authenticated API data always stays network-only to prevent one user’s data being exposed to another user on a shared device.";
  } else if (msg.includes('report') || msg.includes('logo') || msg.includes('branding')) {
    reply = "You can generate PDF and CSV reports in the 'Reports' section. We've recently fixed the logo visibility, so the RIANA logo now appears clearly on the blue headers of all reports (Performance, Budget, E-Handover, etc.).";
  } else if (msg.includes('client')) {
    reply = "In the 'Clients' module, you can manage client profiles, contact information, and branches. You can also generate unique feedback links for clients to rate installation quality.";
  } else if (msg.includes('installation') || msg.includes('assign')) {
    reply = "Installations can be tracked and assigned to technicians in the 'Assign' and 'Installations' modules. You can monitor progress, add equipment details, and upload handover documents.";
  } else if (msg.includes('calendar') || msg.includes('workload')) {
    reply = "The 'Workload Calendar' allows Admins and Teamleads to see technician assignments across a timeline, helping to manage team capacity and installation schedules effectively.";
  } else if (msg.includes('password') || msg.includes('login') || msg.includes('security')) {
    reply = "New accounts must use an @riana.co email address. Welcome email and SMS include the username, temporary password, and login URL, and the user is forced to set a new password on first login. Password changes require at least 8 characters.";
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

const developersDist = path.join(__dirname, '../CRMS/dist');
app.use('/developers', express.static(developersDist));
app.get('/developers/*', (_req, res) => res.sendFile(path.join(developersDist, 'index.html')));

const cimsDist = path.join(__dirname, '../dist');
app.use(express.static(cimsDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
  const indexPath = path.join(cimsDist, 'index.html');
  if (!fs.existsSync(indexPath)) return res.status(503).json({ error: 'Frontend build is not available. Run npm run build:all.' });
  res.sendFile(indexPath);
});
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  setTimeout(initBackupSchedule, 2000);
});
