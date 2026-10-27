const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

async function verify() {
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST || '127.0.0.1',
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    port: Number(process.env.DATABASE_PORT || 3306),
    database: process.env.DATABASE_NAME || 'riana_cims',
  });

  try {
    const [[database]] = await connection.query('SELECT DATABASE() AS active_database');
    const [[roleColumn]] = await connection.query(`
      SELECT COLUMN_TYPE AS column_type
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'role'
    `);
    if (!roleColumn?.column_type?.includes("'Sales'") || !roleColumn?.column_type?.includes("'Finance'") || !roleColumn?.column_type?.includes("'Management'")) {
      throw new Error('Unified user role enum does not include Sales, Finance, and Management');
    }
    const [tables] = await connection.query(`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND (TABLE_NAME IN ('clients','user_profiles','modules','roles','permissions','role_permissions','user_module_roles','user_permissions','security_settings','security_audit_events') OR TABLE_NAME LIKE 'crms\\_%')
      ORDER BY TABLE_NAME
    `);
    const requiredTables = [
      'clients',
      'user_profiles',
      'crms_change_requests',
      'crms_audit_logs',
      'crms_documents',
      'crms_notifications',
      'crms_client_links',
      'crms_user_links',
      'modules',
      'roles',
      'permissions',
      'role_permissions',
      'user_module_roles',
      'user_permissions',
      'security_settings',
      'security_audit_events',
    ];
    const existingTables = new Set(tables.map(({ TABLE_NAME }) => TABLE_NAME));
    const missingTables = requiredTables.filter((table) => !existingTables.has(table));
    if (missingTables.length > 0) {
      throw new Error(`Unified database is incomplete. Missing: ${missingTables.join(', ')}`);
    }

    const [[counts]] = await connection.query(`
      SELECT
        (SELECT COUNT(*) FROM clients) AS clients,
        (SELECT COUNT(*) FROM user_profiles) AS users,
        (SELECT COUNT(*) FROM user_profiles WHERE role = 'Sales') AS sales_users,
        (SELECT COUNT(*) FROM crms_change_requests) AS change_requests,
        (SELECT COUNT(*) FROM crms_audit_logs) AS audit_logs,
        (SELECT COUNT(*) FROM crms_documents) AS documents,
        (SELECT COUNT(*) FROM crms_notifications) AS notifications,
        (SELECT COUNT(*) FROM crms_client_links) AS client_links,
        (SELECT COUNT(*) FROM crms_user_links) AS user_links
        ,(SELECT COUNT(*) FROM modules) AS modules
        ,(SELECT COUNT(*) FROM roles) AS module_roles
        ,(SELECT COUNT(*) FROM user_module_roles) AS module_grants
    `);
    const [[orphans]] = await connection.query(`
      SELECT
        (SELECT COUNT(*)
          FROM crms_change_requests r
          LEFT JOIN clients c ON c.id COLLATE utf8mb4_general_ci = r.client_id
          WHERE r.client_id IS NOT NULL AND c.id IS NULL) AS orphan_clients,
        (SELECT COUNT(*)
          FROM crms_change_requests r
          LEFT JOIN user_profiles u ON u.id COLLATE utf8mb4_general_ci = r.assigned_developer_id
          WHERE r.assigned_developer_id IS NOT NULL AND u.id IS NULL) AS orphan_assignees
    `);

    console.log(JSON.stringify({
      unified: true,
      active_database: database.active_database,
      tables: [...existingTables],
      counts,
      role_enum: roleColumn.column_type,
      orphans,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

verify().catch((error) => {
  console.error(`Unified database verification failed: ${error.message}`);
  process.exitCode = 1;
});
