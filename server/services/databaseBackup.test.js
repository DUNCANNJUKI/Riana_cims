const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createDatabaseBackup, getLastRun, validateBackupFile } = require('./databaseBackup');

const fixedDate = new Date('2026-11-06T09:30:00.000Z');

function createPool({ failAt } = {}) {
  const calls = [];
  const connection = {
    async query(sql) {
      calls.push(sql);
      if (sql === failAt) {
        const error = new Error('Sensitive database connection detail');
        error.code = 'ER_TEST_FAILURE';
        throw error;
      }
      if (sql.startsWith('SELECT TABLE_NAME')) return [[{ TABLE_NAME: 'users' }], []];
      if (sql.startsWith('SHOW CREATE TABLE')) {
        return [[{ 'Create Table': 'CREATE TABLE `users` (`id` int NOT NULL)' }], []];
      }
      if (sql.startsWith('SELECT * FROM')) return [[{ id: 1 }], [{ name: 'id' }]];
      return [[], []];
    },
    release() { calls.push('RELEASE'); },
  };
  return { calls, getConnection: async () => connection };
}

async function withTempDirectory(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'riana-backup-test-'));
  try { await run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test('creates and validates a backup in a missing directory without exposing database errors', async () => {
  await withTempDirectory(async (root) => {
    const directory = path.join(root, 'new', 'backups');
    const pool = createPool();
    const result = await createDatabaseBackup(pool, {
      directory, databaseName: 'riana/test', now: () => fixedDate,
    });
    const filePath = path.join(directory, result.fileName);

    assert.equal(result.status, 'success');
    assert.equal(result.tableCount, 1);
    assert.match(result.fileName, /^backup_riana_test_/);
    assert.equal(validateBackupFile(filePath), true);
    assert.equal(fs.readdirSync(directory).filter((name) => name.endsWith('.tmp')).length, 0);
    if (process.platform !== 'win32') assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
    assert.ok(pool.calls.includes('COMMIT'));
    assert.ok(pool.calls.includes('RELEASE'));
  });
});

test('rejects a backup directory that is a file and never starts a database transaction', async () => {
  await withTempDirectory(async (root) => {
    const blockedPath = path.join(root, 'not-a-directory');
    fs.writeFileSync(blockedPath, 'preserve');
    const pool = createPool();

    await assert.rejects(
      createDatabaseBackup(pool, { directory: blockedPath }),
      (error) => ['ENOTDIR', 'EEXIST'].some((code) => error.message === `Database backup failed (${code})`),
    );
    assert.deepEqual(pool.calls, []);
    assert.equal(fs.readFileSync(blockedPath, 'utf8'), 'preserve');
  });
});

test('reports a permission failure without leaking filesystem paths or opening the database', async () => {
  const pool = createPool();
  const fileSystem = Object.create(fs);
  fileSystem.mkdirSync = () => {
    const error = new Error('permission denied at a sensitive path');
    error.code = 'EACCES';
    throw error;
  };

  await assert.rejects(
    createDatabaseBackup(pool, { directory: 'private-backup-location', fileSystem }),
    (error) => error.message === 'Database backup failed (EACCES)',
  );
  assert.deepEqual(pool.calls, []);
  assert.equal(getLastRun().error.includes('sensitive path'), false);
});

test('removes an interrupted temporary backup and preserves the previous valid backup', async () => {
  await withTempDirectory(async (directory) => {
    const previousBackup = path.join(directory, 'known-good.sql');
    fs.writeFileSync(previousBackup, '-- RIANA CIMS automatic database backup\nCREATE TABLE `old` (`id` int);');
    const pool = createPool({ failAt: 'SHOW CREATE TABLE `users`' });

    await assert.rejects(
      createDatabaseBackup(pool, { directory, now: () => fixedDate }),
      (error) => error.message === 'Database backup failed (ER_TEST_FAILURE)',
    );
    assert.equal(fs.readFileSync(previousBackup, 'utf8').includes('CREATE TABLE'), true);
    assert.deepEqual(fs.readdirSync(directory), ['known-good.sql']);
    assert.equal(getLastRun().status, 'failed');
    assert.equal(getLastRun().error.includes('Sensitive database'), false);
    assert.ok(pool.calls.includes('ROLLBACK'));
    assert.ok(pool.calls.includes('RELEASE'));
  });
});

test('rejects a backup that lacks the expected schema marker', async () => {
  await withTempDirectory(async (directory) => {
    const invalidPath = path.join(directory, 'invalid.sql');
    fs.writeFileSync(invalidPath, '-- RIANA CIMS automatic database backup\nSELECT 1;');
    assert.throws(() => validateBackupFile(invalidPath), /expected SQL header and schema/);
  });
});

test('does not replace a previous final backup if atomic publication fails', async () => {
  await withTempDirectory(async (directory) => {
    const pool = createPool();
    const fileSystem = Object.create(fs);
    fileSystem.linkSync = () => {
      const error = new Error('sensitive filesystem path');
      error.code = 'EACCES';
      throw error;
    };
    await assert.rejects(
      createDatabaseBackup(pool, { directory, now: () => fixedDate, fileSystem }),
      (error) => error.message === 'Database backup failed (EACCES)',
    );
    assert.deepEqual(fs.readdirSync(directory), []);
    assert.ok(pool.calls.includes('COMMIT'));
    assert.equal(getLastRun().status, 'failed');
  });
});
