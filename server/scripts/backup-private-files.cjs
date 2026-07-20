const { spawn } = require('node:child_process');
const fsp = require('node:fs/promises');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const { getPrivateFileConfig } = require('../services/privateFileStorage');

const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

async function run() {
  const config = getPrivateFileConfig();
  const root = path.resolve(config.uploadRoot);
  const backupRoot = path.resolve(process.env.FILE_BACKUP_ROOT || path.join(root, '..', 'file_backups'));
  await fsp.mkdir(backupRoot, { recursive: true, mode: 0o750 });
  const archive = path.join(backupRoot, `private_uploads_${timestamp()}.tar.gz`);
  const child = spawn('tar', ['-czf', archive, '-C', path.dirname(root), path.basename(root)], { stdio: 'inherit' });
  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  if (exitCode !== 0) throw new Error(`tar exited with code ${exitCode}`);
  console.log(JSON.stringify({ archive, root }));
}

run().catch((error) => {
  console.error(`Private upload backup failed: ${error.message}`);
  process.exitCode = 1;
});
