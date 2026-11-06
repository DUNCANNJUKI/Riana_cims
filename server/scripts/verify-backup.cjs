const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const pool = require('../db');
const { backupsDir, createDatabaseBackup, validateBackupFile } = require('../services/databaseBackup');

async function verifyBackup() {
  const result = await createDatabaseBackup(pool);
  const filePath = path.join(backupsDir, result.fileName);
  validateBackupFile(filePath);
  console.log(JSON.stringify({ verified: true, ...result }, null, 2));
}

verifyBackup()
  .catch((error) => {
    console.error(`Backup verification failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
