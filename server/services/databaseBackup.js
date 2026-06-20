const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');

const backupsDir = path.join(__dirname, '../backups');
let lastRun = null;

const quoteIdentifier = (value) => `\`${String(value).replaceAll('`', '``')}\``;
const write = (stream, value) => new Promise((resolve, reject) => {
  if (stream.write(value)) return resolve();
  stream.once('drain', resolve);
  stream.once('error', reject);
});

const finish = (stream) => new Promise((resolve, reject) => {
  stream.once('finish', resolve);
  stream.once('error', reject);
  stream.end();
});

const removeFile = (filePath) => {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* best effort cleanup */ }
};

async function createDatabaseBackup(pool) {
  fs.mkdirSync(backupsDir, { recursive: true });
  const databaseName = process.env.DATABASE_NAME || 'riana_cims';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
  const fileName = `backup_${databaseName}_${timestamp}.sql`;
  const finalPath = path.join(backupsDir, fileName);
  const temporaryPath = `${finalPath}.tmp`;
  const stream = fs.createWriteStream(temporaryPath, { encoding: 'utf8', flags: 'wx' });
  const connection = await pool.getConnection();

  lastRun = { status: 'running', startedAt: new Date().toISOString(), fileName };
  try {
    await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    const [tables] = await connection.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
      [databaseName],
    );

    await write(stream, [
      '-- RIANA CIMS automatic database backup',
      `-- Database: ${databaseName}`,
      `-- Created: ${new Date().toISOString()}`,
      'SET NAMES utf8mb4;',
      'SET FOREIGN_KEY_CHECKS=0;',
      'SET UNIQUE_CHECKS=0;',
      '',
    ].join('\n'));

    for (const { TABLE_NAME: tableName } of tables) {
      const table = quoteIdentifier(tableName);
      const [[createRow]] = await connection.query(`SHOW CREATE TABLE ${table}`);
      const createSql = createRow['Create Table'];
      await write(stream, `\n-- Table ${table}\nDROP TABLE IF EXISTS ${table};\n${createSql};\n`);

      const [rows, fields] = await connection.query(`SELECT * FROM ${table}`);
      if (rows.length === 0) continue;
      const columns = fields.map((field) => quoteIdentifier(field.name)).join(',');
      for (let index = 0; index < rows.length; index += 250) {
        const values = rows.slice(index, index + 250).map((row) =>
          `(${fields.map((field) => mysql.escape(row[field.name])).join(',')})`,
        );
        await write(stream, `INSERT INTO ${table} (${columns}) VALUES\n${values.join(',\n')};\n`);
      }
    }

    await write(stream, '\nSET UNIQUE_CHECKS=1;\nSET FOREIGN_KEY_CHECKS=1;\n');
    await connection.query('COMMIT');
    await finish(stream);

    const stats = fs.statSync(temporaryPath);
    if (stats.size < 100) throw new Error('Backup output was unexpectedly empty');
    fs.renameSync(temporaryPath, finalPath);
    lastRun = {
      status: 'success', startedAt: lastRun.startedAt, completedAt: new Date().toISOString(),
      fileName, size: stats.size, tableCount: tables.length,
    };
    return lastRun;
  } catch (error) {
    try { await connection.query('ROLLBACK'); } catch { /* transaction may not have started */ }
    stream.destroy();
    removeFile(temporaryPath);
    removeFile(finalPath);
    lastRun = {
      status: 'failed', startedAt: lastRun?.startedAt, completedAt: new Date().toISOString(),
      fileName, error: error.message,
    };
    throw error;
  } finally {
    connection.release();
  }
}

function listBackups() {
  fs.mkdirSync(backupsDir, { recursive: true });
  return fs.readdirSync(backupsDir)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => {
      const stats = fs.statSync(path.join(backupsDir, name));
      return { name, size: stats.size, created_at: stats.mtime };
    })
    .filter((backup) => backup.size > 0)
    .sort((a, b) => b.created_at - a.created_at);
}

function pruneBackups(retentionDays = Number(process.env.BACKUP_RETENTION_DAYS || 30)) {
  const cutoff = Date.now() - retentionDays * 86400000;
  for (const backup of listBackups()) {
    if (new Date(backup.created_at).getTime() < cutoff) removeFile(path.join(backupsDir, backup.name));
  }
}

module.exports = { backupsDir, createDatabaseBackup, listBackups, pruneBackups, getLastRun: () => lastRun };
