#!/usr/bin/env node

const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { hashPassword } = require('../security/passwords');

const email = String(process.env.SUPERADMIN_EMAIL || 'superadmin@riana.co').trim().toLowerCase();
const password = process.env.SUPERADMIN_PASSWORD;

if (!password) {
  console.error('SUPERADMIN_PASSWORD is required.');
  process.exit(1);
}

async function upsertModuleRole(userId, moduleId, roleCode) {
  await pool.query(
    `INSERT INTO user_module_roles (user_id,module_id,role_id,granted_by)
     VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE role_id=VALUES(role_id),granted_by=VALUES(granted_by),granted_at=CURRENT_TIMESTAMP`,
    [userId, moduleId, `${moduleId}:${roleCode}`, userId],
  );
}

async function main() {
  const passwordHash = await hashPassword(password);
  const [existing] = await pool.query('SELECT id FROM user_profiles WHERE LOWER(email)=LOWER(?) LIMIT 1', [email]);
  const id = existing[0]?.id || uuidv4();

  await pool.query(`
    INSERT IGNORE INTO roles (id,module_id,code,name) VALUES
      ('cims:SuperAdmin','cims','SuperAdmin','Super Administrator'),
      ('crms:SuperAdmin','crms','SuperAdmin','Super Administrator')
  `);
  await pool.query("INSERT IGNORE INTO role_permissions (role_id,permission_id) SELECT 'cims:SuperAdmin',id FROM permissions WHERE module_id='cims'");
  await pool.query("INSERT IGNORE INTO role_permissions (role_id,permission_id) SELECT 'crms:SuperAdmin',id FROM permissions WHERE module_id='crms'");

  if (existing.length) {
    await pool.query(
      `UPDATE user_profiles
       SET password=?,role='SuperAdmin',designation='SuperAdmin',first_name=COALESCE(first_name,'Super'),last_name=COALESCE(last_name,'Admin'),
           first_login=FALSE,is_active=TRUE,session_version=session_version+1
       WHERE id=?`,
      [passwordHash, id],
    );
  } else {
    await pool.query(
      `INSERT INTO user_profiles
       (id,email,password,role,designation,first_name,last_name,first_login,is_active)
       VALUES (?,?,?,?,?,?,?,FALSE,TRUE)`,
      [id, email, passwordHash, 'SuperAdmin', 'SuperAdmin', 'Super', 'Admin'],
    );
  }

  await upsertModuleRole(id, 'cims', 'SuperAdmin');
  await upsertModuleRole(id, 'crms', 'SuperAdmin');
  console.log(`SuperAdmin ready: ${email}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => undefined);
  });
