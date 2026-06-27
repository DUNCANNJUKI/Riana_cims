const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

async function run() {
  const migrationsDirectory = path.join(__dirname, '../migrations');
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST || '127.0.0.1',
    port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'riana_cims',
    multipleStatements: true,
  });
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS migration_history (
      migration_id VARCHAR(100) PRIMARY KEY,
      description VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const migrationFiles = fs.readdirSync(migrationsDirectory)
      .filter((file) => file.endsWith('.sql') && !file.endsWith('.rollback.sql'))
      .sort();
    const appliedMigrations = [];
    const skippedMigrations = [];
    for (const file of migrationFiles) {
      const migrationId = path.basename(file, '.sql');
      const [existing] = await connection.query('SELECT migration_id FROM migration_history WHERE migration_id=? LIMIT 1', [migrationId]);
      if (existing.length) {
        skippedMigrations.push(migrationId);
        continue;
      }
      await connection.query(fs.readFileSync(path.join(migrationsDirectory, file), 'utf8'));
      await connection.query(
        'INSERT INTO migration_history (migration_id,description) VALUES (?,?) ON DUPLICATE KEY UPDATE description=VALUES(description)',
        [migrationId, `Applied from ${file}`],
      );
      appliedMigrations.push(migrationId);
    }
    const [[result]] = await connection.query(`
      SELECT
        (SELECT COUNT(*) FROM modules) modules,
        (SELECT COUNT(*) FROM roles) roles,
        (SELECT COUNT(*) FROM permissions) permissions,
        (SELECT COUNT(*) FROM user_module_roles) grants,
        (SELECT COUNT(*) FROM user_permissions) direct_grants
    `);
    console.log(JSON.stringify({ appliedMigrations, skippedMigrations, ...result }));
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
});
