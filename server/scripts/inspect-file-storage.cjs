const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });

const {
  checksumFile,
  formatBytes,
  getDiskUsage,
  getPrivateFileConfig,
  resolvePrivatePath,
} = require('../services/privateFileStorage');

const walk = async (root) => {
  const files = [];
  const visit = async (directory) => {
    const entries = await fsp.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else files.push(absolute);
    }
  };
  await visit(root);
  return files;
};

async function run() {
  const config = getPrivateFileConfig();
  const root = path.resolve(config.uploadRoot);
  const connection = await mysql.createConnection({
    host: process.env.DATABASE_HOST || '127.0.0.1',
    port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'riana_cims',
  });
  try {
    const [fileRows] = await connection.query(`
      SELECT id,relative_path,status,checksum_sha256,file_size
      FROM uploaded_files
      WHERE status IN ('active','processing','failed','quarantined','deleted')
    `);
    const [variantRows] = await connection.query('SELECT file_id,relative_path,file_size FROM uploaded_file_variants');
    const dbPaths = new Map();
    for (const row of [...fileRows, ...variantRows]) dbPaths.set(path.resolve(root, row.relative_path), row);

    const missingFiles = [];
    const checksumMismatches = [];
    for (const row of fileRows) {
      const absolute = resolvePrivatePath(row.relative_path, config);
      const stat = await fsp.stat(absolute).catch(() => null);
      if (!stat) {
        missingFiles.push({ id: row.id, relative_path: row.relative_path, status: row.status });
        continue;
      }
      if (row.checksum_sha256 && row.status === 'active') {
        const checksum = await checksumFile(absolute);
        if (checksum !== row.checksum_sha256) checksumMismatches.push({ id: row.id, relative_path: row.relative_path });
      }
    }

    const physicalFiles = await walk(root);
    const orphanPhysicalFiles = physicalFiles
      .filter((absolute) => !absolute.includes(`${path.sep}temporary${path.sep}`) && !dbPaths.has(path.resolve(absolute)))
      .map((absolute) => path.relative(root, absolute).replace(/\\/g, '/'));
    const disk = await getDiskUsage(config);

    console.log(JSON.stringify({
      root,
      disk: {
        total: disk.totalBytes,
        free: disk.freeBytes,
        usedPercent: disk.usedPercent,
      },
      counts: {
        databaseFiles: fileRows.length,
        variants: variantRows.length,
        physicalFiles: physicalFiles.length,
        missingFiles: missingFiles.length,
        orphanPhysicalFiles: orphanPhysicalFiles.length,
        checksumMismatches: checksumMismatches.length,
      },
      storageUsedLabel: formatBytes(physicalFiles.reduce((sum, absolute) => sum + fs.statSync(absolute).size, 0)),
      missingFiles,
      orphanPhysicalFiles: orphanPhysicalFiles.slice(0, 200),
      checksumMismatches,
    }, null, 2));
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`File storage inspection failed: ${error.message}`);
  process.exitCode = 1;
});
