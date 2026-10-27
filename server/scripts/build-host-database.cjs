const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const pool = require('../db');

const outputDirectory = path.join(__dirname, '../../hosting/Mysql_host');
const outputFile = path.join(outputDirectory, 'riana_cims_host.sql');
const safeSeedTables = new Set([
  'company_settings',
  'departments',
  'subsidiaries',
  'feedback_questions',
  'modules',
  'roles',
  'permissions',
  'role_permissions',
  'security_settings',
  'migration_history',
]);
const bootstrapSuperAdminId = '00000000-0000-4000-8000-000000000001';
const bootstrapSuperAdminEmail = 'superadmin@riana.co';
const preserveSuperAdmin = /^(?:1|true|yes)$/i.test(String(process.env.HOST_EXPORT_PRESERVE_SUPERADMIN || ''));
const bcryptHashPattern = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const normalizeCreateTableForSharedHost = (statement) => String(statement)
  // Older shared-host MySQL releases reject function defaults on VARCHAR.
  // The API generates every operational UUID before inserting the record.
  .replace(/(\b(?:var)?char\(36\)\s+NOT NULL)\s+DEFAULT\s+\(?uuid\(\)\)?/gi, '$1')
  // The API also supplies feedback_date explicitly on every feedback insert.
  .replace(/(`feedback_date`\s+date\s+NOT NULL)\s+DEFAULT\s+\(?curdate\(\)\)?/gi, '$1');

async function run() {
  const database = process.env.DATABASE_NAME || 'riana_cims';
  let preservedSuperAdmin = null;
  if (preserveSuperAdmin) {
    const [superAdminRows] = await pool.query(
      `SELECT id,email,first_name,last_name,role,designation,first_login,is_active,password,
              two_factor_enabled,two_factor_method,session_version
       FROM user_profiles
       WHERE LOWER(email)=LOWER(?)
       LIMIT 1`,
      [bootstrapSuperAdminEmail],
    );
    preservedSuperAdmin = superAdminRows[0] || null;
    if (!preservedSuperAdmin) throw new Error(`SuperAdmin account not found: ${bootstrapSuperAdminEmail}`);
    if (!preservedSuperAdmin.is_active) throw new Error('The preserved SuperAdmin account must be active.');
    if (!bcryptHashPattern.test(String(preservedSuperAdmin.password || ''))) {
      throw new Error('The preserved SuperAdmin account does not contain a valid bcrypt password hash.');
    }
  }
  const migrationsDirectory = path.join(__dirname, '../migrations');
  const [migrationRows] = await pool.query('SELECT migration_id FROM migration_history');
  const appliedMigrations = new Set(migrationRows.map(({ migration_id }) => migration_id));
  const pendingMigrationFiles = fs.readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith('.sql') && !file.endsWith('.rollback.sql') && !appliedMigrations.has(path.basename(file, '.sql')))
    .sort();
  const [tables] = await pool.query(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`);
  const credentialNotice = preserveSuperAdmin
    ? '-- Sanitized reference data plus one active bcrypt-hashed SuperAdmin account; keep this SQL private.'
    : '-- Complete schema with sanitized reference data; no credentials or customer records.';
  const parts = ['-- RIANA CIMS MySQL hosting database', `-- Generated ${new Date().toISOString()}`, credentialNotice, 'SET NAMES utf8mb4;', 'SET FOREIGN_KEY_CHECKS = 0;', `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, `USE \`${database}\`;`, ''];
  for (const { TABLE_NAME: table } of tables) {
    const [creationRows] = await pool.query(`SHOW CREATE TABLE \`${table}\``);
    const createTable = normalizeCreateTableForSharedHost(creationRows[0]['Create Table']);
    parts.push(`DROP TABLE IF EXISTS \`${table}\`;`, `${createTable};`, '');
    if (!safeSeedTables.has(table)) continue;
    const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
    for (const row of rows) {
      if (table === 'subsidiaries') row.default_escalation_matrix = null;
      const columns = Object.keys(row).map((column) => `\`${column}\``).join(', ');
      const values = Object.values(row).map((value) => pool.escape(value)).join(', ');
      parts.push(`INSERT INTO \`${table}\` (${columns}) VALUES (${values});`);
    }
    if (rows.length) parts.push('');
  }
  for (const file of pendingMigrationFiles) {
    parts.push(`-- Pending idempotent migration: ${file}`, fs.readFileSync(path.join(migrationsDirectory, file), 'utf8').trim(), '');
  }
  const exportedSuperAdminId = preservedSuperAdmin?.id || bootstrapSuperAdminId;
  if (preservedSuperAdmin) {
    const columns = [
      'id', 'email', 'first_name', 'last_name', 'role', 'designation', 'first_login', 'is_active',
      'password', 'two_factor_enabled', 'two_factor_method', 'session_version',
    ];
    const quotedColumns = columns.map((column) => `\`${column}\``).join(',');
    const values = columns.map((column) => pool.escape(preservedSuperAdmin[column])).join(',');
    parts.push(
      '-- PRESERVED_SUPERADMIN_ACTIVE_BCRYPT: private deployment credential; never publish this SQL.',
      `INSERT INTO \`user_profiles\` (${quotedColumns}) VALUES (${values}) ON DUPLICATE KEY UPDATE \`first_name\`=VALUES(\`first_name\`),\`last_name\`=VALUES(\`last_name\`),\`role\`='SuperAdmin',\`designation\`='SuperAdmin',\`first_login\`=VALUES(\`first_login\`),\`is_active\`=1,\`password\`=VALUES(\`password\`),\`two_factor_enabled\`=VALUES(\`two_factor_enabled\`),\`two_factor_method\`=VALUES(\`two_factor_method\`),\`session_version\`=VALUES(\`session_version\`);`,
      '',
    );
  } else {
    parts.push(
      '-- Inactive bootstrap principal: it has no password and cannot sign in until explicitly activated.',
      '-- Set a private SUPERADMIN_PASSWORD during the one-time deployment bootstrap; never distribute a default password.',
      `INSERT INTO \`user_profiles\` (\`id\`,\`email\`,\`first_name\`,\`last_name\`,\`role\`,\`designation\`,\`first_login\`,\`is_active\`,\`password\`) VALUES (${pool.escape(bootstrapSuperAdminId)},${pool.escape(bootstrapSuperAdminEmail)},'Super','Admin','SuperAdmin','SuperAdmin',1,0,NULL) ON DUPLICATE KEY UPDATE \`role\`='SuperAdmin',\`designation\`='SuperAdmin';`,
      '',
    );
  }
  parts.push(
    `INSERT INTO \`user_module_roles\` (\`user_id\`,\`module_id\`,\`role_id\`,\`granted_by\`) VALUES (${pool.escape(exportedSuperAdminId)},'cims','cims:SuperAdmin',NULL),(${pool.escape(exportedSuperAdminId)},'crms','crms:SuperAdmin',NULL) ON DUPLICATE KEY UPDATE \`role_id\`=VALUES(\`role_id\`);`,
    '',
  );
  parts.push('SET FOREIGN_KEY_CHECKS = 1;', '');
  const output = parts.join('\n');
  if (/\bDEFAULT\s+\(?uuid\(\)\)?/i.test(output) || /`feedback_date`[^\n]*\bDEFAULT\s+\(?curdate\(\)\)?/i.test(output)) {
    throw new Error('Host export still contains a function default unsupported by older MySQL releases.');
  }
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(outputFile, output, 'utf8');
  console.log(JSON.stringify({
    outputFile,
    tables: tables.length,
    seededTables: [...safeSeedTables],
    pendingMigrations: pendingMigrationFiles,
    superAdminMode: preserveSuperAdmin ? 'active-bcrypt-preserved' : 'inactive-passwordless-bootstrap',
  }, null, 2));
}

run().catch((error) => { console.error(`Host database export failed: ${error.message}`); process.exitCode = 1; }).finally(() => pool.end());
