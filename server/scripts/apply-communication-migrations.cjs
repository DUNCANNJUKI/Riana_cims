const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const pool = require('../db');

const migrationIds = [
  '20261031_communication_backend_foundation',
  '20261104_communication_meeting_state',
];

const splitSqlStatements = (sql) => {
  const statements = [];
  let delimiter = ';';
  let current = '';
  for (const rawLine of sql.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^DELIMITER\s+/i.test(line)) {
      delimiter = line.replace(/^DELIMITER\s+/i, '').trim() || ';';
      continue;
    }
    current += `${rawLine}\n`;
    if (current.trimEnd().endsWith(delimiter)) {
      const trimmed = current.trimEnd();
      const statement = trimmed.slice(0, -delimiter.length).trim();
      if (statement) statements.push(statement);
      current = '';
    }
  }
  const trailing = current.trim();
  if (trailing) statements.push(trailing);
  return statements;
};

async function run() {
  if (String(process.env.COMMUNICATION_MIGRATION_BACKUP_VERIFIED || '').toLowerCase() !== 'true') {
    throw new Error('A verified pre-migration database backup is required.');
  }
  const migrationDirectory = path.join(__dirname, '../migrations');
  const [tableRows] = await pool.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'
       AND TABLE_NAME IN ('migration_history','messages','user_profiles','call_participants')`,
  );
  const existingTables = new Set(tableRows.map(({ TABLE_NAME }) => TABLE_NAME));
  const missingTables = ['migration_history', 'messages', 'user_profiles', 'call_participants']
    .filter((table) => !existingTables.has(table));
  if (missingTables.length) {
    throw new Error(`Communication migration prerequisites are missing: ${missingTables.join(', ')}.`);
  }

  const [historyRows] = await pool.query(
    'SELECT migration_id FROM migration_history WHERE migration_id IN (?,?)',
    migrationIds,
  );
  const applied = new Set(historyRows.map(({ migration_id }) => migration_id));
  const results = [];
  for (const migrationId of migrationIds) {
    if (applied.has(migrationId)) {
      results.push({ migrationId, status: 'already_applied' });
      continue;
    }
    const filePath = path.join(migrationDirectory, `${migrationId}.sql`);
    if (!fs.existsSync(filePath)) throw new Error(`Required communication migration is missing: ${migrationId}.`);
    for (const statement of splitSqlStatements(fs.readFileSync(filePath, 'utf8'))) {
      await pool.query(statement);
    }
    results.push({ migrationId, status: 'applied' });
  }
  console.log(JSON.stringify({ migrations: results }, null, 2));
}

run()
  .catch((error) => {
    console.error(`Communication migration failed: ${error.code || error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
