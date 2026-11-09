const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const pool = require('../db');

const migrationIds = [
  '20260710_profile_avatar_chat_messages',
  '20260710_chat_audit_logging',
  '20260710_calls_feedback_contact_performance',
  '20261030_installation_feedback_rating_nullability',
  '20261031_communication_backend_foundation',
  '20261101_totp_recovery_and_preferences',
  '20261102_technician_installation_budgets',
  '20261104_communication_meeting_state',
  '20261107_call_recordings',
  '20261110_client_change_requests_portal',
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
  await pool.query(`CREATE TABLE IF NOT EXISTS migration_history (
    migration_id VARCHAR(100) NOT NULL PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const migrationDirectory = path.join(__dirname, '../migrations');
  const [tableRows] = await pool.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'
       AND TABLE_NAME IN ('migration_history','messages','user_profiles')`,
  );
  const existingTables = new Set(tableRows.map(({ TABLE_NAME }) => TABLE_NAME));
  const missingTables = ['migration_history', 'messages', 'user_profiles']
    .filter((table) => !existingTables.has(table));
  if (missingTables.length) {
    throw new Error(`Communication migration prerequisites are missing: ${missingTables.join(', ')}.`);
  }

  const [historyRows] = await pool.query(
    `SELECT migration_id FROM migration_history WHERE migration_id IN (${migrationIds.map(() => '?').join(',')})`,
    migrationIds,
  );
  const applied = new Set(historyRows.map(({ migration_id }) => migration_id));
  if (!applied.has('20260710_calls_feedback_contact_performance')) {
    const requiredTables = ['clients', 'feedback_links', 'installation_feedback'];
    const [prerequisiteRows] = await pool.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' AND TABLE_NAME IN (${requiredTables.map(() => '?').join(',')})`,
      requiredTables,
    );
    const availableTables = new Set(prerequisiteRows.map(({ TABLE_NAME }) => TABLE_NAME));
    const missing = requiredTables.filter((table) => !availableTables.has(table));
    if (missing.length) throw new Error(`Call migration prerequisites are missing: ${missing.join(', ')}.`);

    const requiredIndexColumns = {
      messages: ['created_at'],
      feedback_links: ['client_id', 'installation_id', 'is_used', 'expires_at', 'unique_token'],
      installation_feedback: ['client_id', 'installation_id', 'created_at'],
      clients: ['client_name', 'branch'],
      user_profiles: ['is_active', 'role', 'created_at'],
    };
    for (const [table, columns] of Object.entries(requiredIndexColumns)) {
      const [rows] = await pool.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME IN (${columns.map(() => '?').join(',')})`,
        [table, ...columns],
      );
      const availableColumns = new Set(rows.map(({ COLUMN_NAME }) => COLUMN_NAME));
      const missingColumns = columns.filter((column) => !availableColumns.has(column));
      if (missingColumns.length) throw new Error(`Call migration requires ${table} columns: ${missingColumns.join(', ')}.`);
    }
  }

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

  const [verifiedHistoryRows] = await pool.query(
    `SELECT migration_id FROM migration_history WHERE migration_id IN (${migrationIds.map(() => '?').join(',')})`,
    migrationIds,
  );
  const verifiedHistory = new Set(verifiedHistoryRows.map(({ migration_id }) => migration_id));
  const missingHistory = migrationIds.filter((migrationId) => !verifiedHistory.has(migrationId));
  if (missingHistory.length) throw new Error(`Communication migration history is incomplete: ${missingHistory.join(', ')}.`);

  const requiredTables = ['call_device_sessions', 'call_meeting_state', 'call_recordings', 'message_reactions', 'message_recipient_status'];
  const [tableRowsAfter] = await pool.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'
       AND TABLE_NAME IN (${requiredTables.map(() => '?').join(',')})`,
    requiredTables,
  );
  const verifiedTables = new Set(tableRowsAfter.map(({ TABLE_NAME }) => TABLE_NAME));
  const missingTablesAfter = requiredTables.filter((table) => !verifiedTables.has(table));
  if (missingTablesAfter.length) throw new Error(`Communication migration tables are missing: ${missingTablesAfter.join(', ')}.`);

  const requiredColumns = {
    messages: ['message_kind', 'call_type', 'call_status', 'call_started_at', 'call_ended_at', 'reply_to_message_id'],
    call_participants: ['status', 'joined_at', 'left_at', 'hand_raised', 'hand_raised_at', 'audio_enabled', 'video_enabled', 'screen_sharing'],
    call_device_sessions: ['call_id', 'user_id', 'device_id', 'status', 'accepted_at', 'resolved_at', 'last_seen_at'],
    message_recipient_status: ['message_id', 'user_id', 'delivered_at', 'read_at'],
  };
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME IN (${columns.map(() => '?').join(',')})`,
      [table, ...columns],
    );
    const verifiedColumns = new Set(rows.map(({ COLUMN_NAME }) => COLUMN_NAME));
    const missingColumns = columns.filter((column) => !verifiedColumns.has(column));
    if (missingColumns.length) throw new Error(`Communication migration columns are missing from ${table}: ${missingColumns.join(', ')}.`);
  }

  const [[participantStatusColumn]] = await pool.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='call_participants' AND COLUMN_NAME='status' LIMIT 1`,
  );
  const participantStatusType = String(participantStatusColumn?.COLUMN_TYPE || '').toLowerCase();
  const requiredTerminalStatuses = ['cancelled', 'expired', 'failed'];
  const missingStatuses = requiredTerminalStatuses.filter((status) => !participantStatusType.includes(`'${status}'`));
  if (missingStatuses.length) throw new Error(`Communication participant statuses are missing: ${missingStatuses.join(', ')}.`);

  console.log(JSON.stringify({ migrations: results, verified: { history: migrationIds, tables: requiredTables, columns: requiredColumns, participantStatuses: requiredTerminalStatuses } }, null, 2));
}

run()
  .catch((error) => {
    console.error(`Communication migration failed: ${error.code || error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
