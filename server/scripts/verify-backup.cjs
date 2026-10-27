const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const pool = require('../db');
const { backupsDir, createDatabaseBackup } = require('../services/databaseBackup');

async function verifyBackup() {
  const result = await createDatabaseBackup(pool);
  const filePath = path.join(backupsDir, result.fileName);
  const prefix = fs.readFileSync(filePath, { encoding: 'utf8', flag: 'r' }).slice(0, 4096);
  if (!prefix.includes('RIANA CIMS automatic database backup') || !prefix.includes('CREATE TABLE')) {
    throw new Error('Backup file did not contain the expected SQL header and schema');
  }
  console.log(JSON.stringify({ verified: true, ...result }, null, 2));
}

verifyBackup()
  .catch((error) => {
    console.error(`Backup verification failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
