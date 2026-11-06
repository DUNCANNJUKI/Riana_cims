const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const mysql = require('mysql2');

const backupsDir = path.join(__dirname, '../backups');
let lastRun = null;

const quoteIdentifier = (value) => `\`${String(value).replaceAll('`', '``')}\``;
const write = (stream, value) => new Promise((resolve, reject) => {
  if (stream.backupError) return reject(stream.backupError);
  stream.write(value, (error) => error ? reject(error) : resolve());
});

const finish = (stream) => new Promise((resolve, reject) => {
  if (stream.backupError) return reject(stream.backupError);
  stream.once('finish', async () => {
    if (!stream.closed) await new Promise((closed) => stream.once('close', closed));
    resolve();
  });
  stream.once('error', reject);
  stream.end();
});

const closeStream = async (stream) => {
  if (!stream) return;
  if (!stream.destroyed) stream.destroy();
  if (!stream.closed) await new Promise((resolve) => stream.once('close', resolve));
};

const removeFile = (filePath) => {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* best effort cleanup */ }
};

const safeError = (error) => {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
    ? ` (${error.code})`
    : '';
  return new Error(`Database backup failed${code}`);
};

function validateBackupFile(filePath, fileSystem = fs) {
  const prefix = fileSystem.readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).slice(0, 4096);
  if (!prefix.includes('RIANA CIMS automatic database backup') || !prefix.includes('CREATE TABLE')) {
    throw new Error('Backup file did not contain the expected SQL header and schema');
  }
  return true;
}

async function createDatabaseBackup(pool, options = {}) {
  const fileSystem = options.fileSystem || fs;
  const directory = options.directory || backupsDir;
  const databaseName = options.databaseName || process.env.DATABASE_NAME || 'riana_cims';
  const safeDatabaseName = String(databaseName).replace(/[^A-Za-z0-9_-]/g, '_');
  const now = options.now ? options.now() : new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
  const fileName = `backup_${safeDatabaseName}_${timestamp}_${randomBytes(4).toString('hex')}.sql`;
  const finalPath = path.join(directory, fileName);
  const temporaryPath = path.join(directory, `.${fileName}.${randomBytes(8).toString('hex')}.tmp`);
  let connection;
  let stream;
  let transactionStarted = false;

  lastRun = { status: 'running', startedAt: new Date().toISOString(), fileName };
  try {
    fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 });
    connection = await pool.getConnection();
    stream = fileSystem.createWriteStream(temporaryPath, { encoding: 'utf8', flags: 'wx', mode: 0o600 });
    stream.on('error', (error) => { stream.backupError = error; });
    await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    transactionStarted = true;
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

    if (tables.length === 0) throw new Error('Backup contains no database tables');
    await write(stream, '\nSET UNIQUE_CHECKS=1;\nSET FOREIGN_KEY_CHECKS=1;\n');
    await finish(stream);

    validateBackupFile(temporaryPath, fileSystem);
    const stats = fileSystem.statSync(temporaryPath);
    if (stats.size < 100) throw new Error('Backup output was unexpectedly empty');
    await connection.query('COMMIT');
    transactionStarted = false;
    fileSystem.linkSync(temporaryPath, finalPath);
    fileSystem.unlinkSync(temporaryPath);
    lastRun = {
      status: 'success', startedAt: lastRun.startedAt, completedAt: new Date().toISOString(),
      fileName, size: stats.size, tableCount: tables.length,
    };
    return lastRun;
  } catch (error) {
    if (transactionStarted) {
      try { await connection.query('ROLLBACK'); } catch { /* transaction may already have ended */ }
    }
    await closeStream(stream);
    try { fileSystem.unlinkSync(temporaryPath); } catch { /* temp file may not exist */ }
    lastRun = {
      status: 'failed', startedAt: lastRun?.startedAt, completedAt: new Date().toISOString(),
      fileName, error: safeError(error).message,
    };
    throw safeError(error);
  } finally {
    connection?.release();
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

module.exports = {
  backupsDir, createDatabaseBackup, validateBackupFile, listBackups, pruneBackups,
  getLastRun: () => lastRun,
};
