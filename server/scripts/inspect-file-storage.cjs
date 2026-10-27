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

const legacyUploadsRoot = path.resolve(__dirname, '../uploads');

const normalizeLegacyUploadReference = (reference) => {
  const raw = String(reference || '').replace(/\\/g, '/').trim();
  if (!raw || raw.includes('\0') || raw.includes('..')) return '';
  const parts = raw.split('/').filter(Boolean);
  const filename = parts.length === 1
    ? parts[0]
    : (parts.length === 2 && parts[0] === 'uploads' ? parts[1] : '');
  if (!filename || filename !== path.basename(filename)) return '';
  return filename;
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
    const [legacyHandoverRows] = await connection.query('SELECT id,file_path,file_name,file_size FROM handover_uploads ORDER BY upload_date DESC');
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

    const missingLegacyHandovers = [];
    const legacyHandoverSizeMismatches = [];
    for (const row of legacyHandoverRows) {
      const filename = normalizeLegacyUploadReference(row.file_path);
      if (!filename) {
        missingLegacyHandovers.push({ id: row.id, file_name: row.file_name, file_path: row.file_path, reason: 'invalid_reference' });
        continue;
      }
      const absolute = path.join(legacyUploadsRoot, filename);
      const stat = await fsp.stat(absolute).catch(() => null);
      if (!stat) {
        missingLegacyHandovers.push({ id: row.id, file_name: row.file_name, file_path: filename, reason: 'missing_file' });
        continue;
      }
      if (row.file_size && Number(row.file_size) !== Number(stat.size)) {
        legacyHandoverSizeMismatches.push({ id: row.id, file_name: row.file_name, file_path: filename, expected_size: Number(row.file_size), actual_size: stat.size });
      }
    }

    const physicalFiles = await walk(root);
    const orphanPhysicalFiles = physicalFiles
      .filter((absolute) => !absolute.includes(`${path.sep}temporary${path.sep}`) && !dbPaths.has(path.resolve(absolute)))
      .map((absolute) => path.relative(root, absolute).replace(/\\/g, '/'));
    const disk = await getDiskUsage(config);

    console.log(JSON.stringify({
      root,
      legacyUploadsRoot,
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
        legacyHandoverRows: legacyHandoverRows.length,
        missingLegacyHandovers: missingLegacyHandovers.length,
        legacyHandoverSizeMismatches: legacyHandoverSizeMismatches.length,
      },
      storageUsedLabel: formatBytes(physicalFiles.reduce((sum, absolute) => sum + fs.statSync(absolute).size, 0)),
      missingFiles,
      orphanPhysicalFiles: orphanPhysicalFiles.slice(0, 200),
      checksumMismatches,
      missingLegacyHandovers: missingLegacyHandovers.slice(0, 200),
      legacyHandoverSizeMismatches: legacyHandoverSizeMismatches.slice(0, 200),
    }, null, 2));
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error(`File storage inspection failed: ${error.message}`);
  process.exitCode = 1;
});
