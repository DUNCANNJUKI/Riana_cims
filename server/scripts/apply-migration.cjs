const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

async function run() {
  const migrationPath = path.join(__dirname, '../migrations/20260621_security_foundation.sql');
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST || '127.0.0.1',
    port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'riana_cims',
    multipleStatements: true,
  });
  try {
    await connection.query(fs.readFileSync(migrationPath, 'utf8'));
    const [[result]] = await connection.query(`
      SELECT
        (SELECT COUNT(*) FROM modules) modules,
        (SELECT COUNT(*) FROM roles) roles,
        (SELECT COUNT(*) FROM permissions) permissions,
        (SELECT COUNT(*) FROM user_module_roles) grants
    `);
    console.log(JSON.stringify({ migration: '20260621_security_foundation', applied: true, ...result }));
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
});
