const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const pool = require('../db');

const requestedIndexes = [
  ['user_profiles', 'idx_users_active_role', ['is_active', 'role']],
  ['clients', 'idx_clients_name_branch', ['client_name', 'branch']],
  ['installations', 'idx_installations_client_created', ['client_id', 'created_at']],
  ['client_assignments', 'idx_assignments_client_created', ['client_id', 'created_at']],
  ['client_assignments', 'idx_assignments_hardware_status', ['hardware_technician_id', 'status']],
  ['client_assignments', 'idx_assignments_software_status', ['software_technician_id', 'status']],
  ['installation_feedback', 'idx_feedback_client_install_created', ['client_id', 'installation_id', 'created_at']],
  ['feedback_links', 'idx_feedback_links_client_expiry', ['client_id', 'expires_at']],
  ['announcements', 'idx_announcements_active_expiry', ['is_active', 'expires_at']],
  ['announcement_reads', 'idx_announcement_reads_lookup', ['announcement_id', 'user_id']],
  ['system_logs', 'idx_system_logs_user_created', ['user_id', 'created_at']],
  ['messages', 'idx_messages_inbox', ['receiver_id', 'is_read', 'created_at']],
  ['messages', 'idx_messages_thread', ['sender_id', 'receiver_id', 'created_at']],
  ['crms_notifications', 'idx_crms_notifications_inbox', ['user_id', 'read', 'created_at']],
  ['password_reset_tokens', 'idx_password_reset_lookup', ['token_hash', 'used_at', 'expires_at']],
];

async function run() {
  const [tables] = await pool.query(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`);
  const tableNames = new Set(tables.map((row) => row.TABLE_NAME));
  const created = [];
  const skipped = [];
  for (const [table, name, columns] of requestedIndexes) {
    if (!tableNames.has(table)) continue;
    const [available] = await pool.query(`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [table]);
    const columnNames = new Set(available.map((row) => row.COLUMN_NAME));
    if (!columns.every((column) => columnNames.has(column))) continue;
    const [existing] = await pool.query(`SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`, [table, name]);
    if (existing.length) { skipped.push(`${table}.${name}`); continue; }
    const quotedColumns = columns.map((column) => `\`${column}\``).join(', ');
    await pool.query(`CREATE INDEX \`${name}\` ON \`${table}\` (${quotedColumns})`);
    created.push(`${table}.${name}`);
  }
  for (const table of tableNames) await pool.query(`ANALYZE TABLE \`${table}\``);
  console.log(JSON.stringify({ database: process.env.DATABASE_NAME, created, skipped, analyzedTables: tableNames.size }, null, 2));
}

run().catch((error) => { console.error(`Database optimization failed: ${error.message}`); process.exitCode = 1; }).finally(() => pool.end());
