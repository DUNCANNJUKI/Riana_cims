const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'Truehost');
const requiredDirectories = ['app', 'database', 'domain_root', 'public_html'];
const requiredFiles = [
  'app/.env.example',
  'app/dist/index.html',
  'app/package-lock.json',
  'app/package.json',
  'app/passenger_app.js',
  'app/server/index.js',
  'database/riana_cims_host.sql',
  'domain_root/.htaccess',
  'public_html/index.html',
  'BUILD_INFO.json',
  'FILE_MANIFEST.sha256',
  'TRUEHOST_DEPLOYMENT.md',
];
const forbiddenSegments = new Set(['.env.local', '.runtime', 'node_modules', 'backups']);
const productionMarkers = ['http://localhost:8081/api', 'react/jsx-dev-runtime'];
const bcryptHashPattern = /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/;

const fail = (message) => { throw new Error(message); };
const normalizedPath = (relative) => path.join(output, ...relative.split('/'));
const fileHash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const listFiles = (directory) => {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolute));
    else files.push(absolute);
  }
  return files;
};

if (!fs.existsSync(output)) fail('Truehost output is missing. Run npm run build:truehost.');
for (const directory of requiredDirectories) {
  if (!fs.statSync(normalizedPath(directory), { throwIfNoEntry: false })?.isDirectory()) fail(`Required directory is missing: ${directory}`);
}
for (const file of requiredFiles) {
  if (!fs.statSync(normalizedPath(file), { throwIfNoEntry: false })?.isFile()) fail(`Required file is missing: ${file}`);
}
const buildInfo = JSON.parse(fs.readFileSync(normalizedPath('BUILD_INFO.json'), 'utf8'));
const liveUpdates = buildInfo.liveDatabaseUpdates;
if (!Array.isArray(liveUpdates) || !liveUpdates.length) fail('BUILD_INFO.json must list at least one live database update.');
for (const update of liveUpdates) {
  if (!/^\d{8}_[a-z0-9_]+$/.test(update.migrationId || '')) fail(`Invalid live migration ID: ${update.migrationId}`);
  if (!/^\d{8}_[a-z0-9_]+\.sql$/.test(update.sourceFile || '')) fail(`Invalid live migration source: ${update.sourceFile}`);
  if (!/^LIVE_DB_UPDATE_\d{8}\.sql$/.test(update.packageFile || '')) fail(`Invalid packaged live update: ${update.packageFile}`);
  const packagedUpdate = normalizedPath(update.packageFile);
  if (!fs.statSync(packagedUpdate, { throwIfNoEntry: false })?.isFile()) fail(`Required live database update is missing: ${update.packageFile}`);
  const sourceUpdate = path.join(root, 'hosting', 'Mysql_host', 'live_updates', update.sourceFile);
  const sourceMigration = path.join(root, 'server', 'migrations', update.sourceFile);
  if (!fs.statSync(sourceUpdate, { throwIfNoEntry: false })?.isFile()) fail(`Live database update source is missing: ${update.sourceFile}`);
  if (!fs.statSync(sourceMigration, { throwIfNoEntry: false })?.isFile()) fail(`Matching server migration is missing: ${update.sourceFile}`);
  if (fileHash(packagedUpdate) !== fileHash(sourceUpdate)) fail(`Packaged live update is stale: ${update.packageFile}`);
  const migrationSql = fs.readFileSync(sourceMigration, 'utf8');
  const liveSql = fs.readFileSync(packagedUpdate, 'utf8');
  if (!liveSql.includes(update.migrationId)) fail(`Live update does not record migration ${update.migrationId}.`);
  for (const match of migrationSql.matchAll(/ALTER\s+TABLE\s+`?([a-z0-9_]+)`?[\s\S]*?ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+`?([a-z0-9_]+)`?\s+([a-z]+(?:\([^)]*\))?)/gi)) {
    const [, table, column, type] = match;
    const escapedType = type.replace(/[()]/g, '\\$&');
    const intent = new RegExp('ALTER\\s+TABLE\\s+`?' + table + '`?[\\s\\S]*?ADD\\s+COLUMN(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+`?' + column + '`?\\s+' + escapedType, 'i');
    if (!intent.test(liveSql)) fail(`Live update is not aligned with ${table}.${column} (${type}).`);
  }
}

const topDirectories = fs.readdirSync(output, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
if (topDirectories.join(',') !== requiredDirectories.slice().sort().join(',')) {
  fail(`Unexpected top-level folder layout: ${topDirectories.join(', ')}`);
}

const allFiles = listFiles(output);
const allowedRuntimePackageFiles = new Set(buildInfo.packagedCompanyLogo ? [buildInfo.packagedCompanyLogo] : []);
if (buildInfo.packagedCompanyLogo && !fs.statSync(normalizedPath(buildInfo.packagedCompanyLogo), { throwIfNoEntry: false })?.isFile()) {
  fail(`Packaged company logo is missing: ${buildInfo.packagedCompanyLogo}`);
}
for (const file of allFiles) {
  const relativePath = path.relative(output, file).split(path.sep).join('/');
  const segments = relativePath.split('/');
  if (segments.some((segment) => forbiddenSegments.has(segment))) fail(`Forbidden runtime content was packaged: ${relativePath}`);
  if (segments.includes('uploads') && !allowedRuntimePackageFiles.has(relativePath)) fail(`Forbidden runtime upload was packaged: ${relativePath}`);
}

const htaccess = fs.readFileSync(normalizedPath('domain_root/.htaccess'), 'utf8');
if (!htaccess.includes('Required placeholder for CloudLinux Node.js Selector')) {
  fail('Domain-root .htaccess is missing the CloudLinux placeholder marker.');
}
if (/PassengerAppRoot|PassengerNodejs/i.test(htaccess)) {
  fail('Domain-root .htaccess must not hardcode Passenger paths; cPanel manages those directives.');
}

const manifestLines = fs.readFileSync(normalizedPath('FILE_MANIFEST.sha256'), 'utf8').trim().split(/\r?\n/);
const manifestedPaths = new Set();
for (const line of manifestLines) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  if (!match) fail(`Invalid manifest line: ${line}`);
  const target = normalizedPath(match[2]);
  if (!fs.existsSync(target)) fail(`Manifest target is missing: ${match[2]}`);
  if (fileHash(target) !== match[1]) fail(`Manifest hash mismatch: ${match[2]}`);
  if (manifestedPaths.has(match[2])) fail(`Duplicate manifest target: ${match[2]}`);
  manifestedPaths.add(match[2]);
}
const expectedManifestPaths = allFiles
  .filter((file) => path.basename(file) !== 'FILE_MANIFEST.sha256')
  .map((file) => path.relative(output, file).split(path.sep).join('/'));
for (const relative of expectedManifestPaths) {
  if (!manifestedPaths.has(relative)) fail(`File is not covered by the manifest: ${relative}`);
}
if (manifestedPaths.size !== expectedManifestPaths.length) fail('Manifest contains unexpected entries.');

const preserveSuperAdmin = Boolean(buildInfo.bootstrapSuperAdmin?.active && buildInfo.bootstrapSuperAdmin?.passwordPresent);
const sql = fs.readFileSync(normalizedPath('database/riana_cims_host.sql'), 'utf8');
if (/^\s*(CREATE\s+DATABASE|USE\s+`)/im.test(sql)) fail('SQL must import into the database selected in cPanel.');
if (/\bDEFAULT\s+\(?uuid\(\)\)?/i.test(sql)) fail('SQL contains a UUID function default unsupported by older shared-host MySQL releases.');
if (/`feedback_date`[^\n]*\bDEFAULT\s+\(?curdate\(\)\)?/i.test(sql)) fail('SQL contains a DATE function default unsupported by older shared-host MySQL releases.');
if ((sql.match(/INSERT\s+INTO\s+`user_profiles`/gi) || []).length !== 1) fail('SQL must contain exactly one user bootstrap statement.');
if (preserveSuperAdmin) {
  if (!sql.includes('PRESERVED_SUPERADMIN_ACTIVE_BCRYPT') || !bcryptHashPattern.test(sql)) {
    fail('Preserved SuperAdmin bcrypt credential is missing from the private SQL export.');
  }
} else if (!/'superadmin@riana\.co'.*'SuperAdmin'.*1,0,NULL/i.test(sql)) {
  fail('SuperAdmin bootstrap must remain inactive and passwordless.');
}

const packagedServer = fs.readFileSync(normalizedPath('app/server/index.js'), 'utf8');
if (!packagedServer.includes("corsPolicy: 'same-origin-host-v1'")) {
  fail('Packaged API is missing the production CORS policy deployment marker.');
}
const passengerEntry = fs.readFileSync(normalizedPath('app/passenger_app.js'), 'utf8');
for (const alias of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_PASS']) {
  if (!passengerEntry.includes(alias)) fail(`Passenger entry is missing the cPanel database alias: ${alias}`);
}
const packagedEnvironment = fs.readFileSync(normalizedPath('app/.env.example'), 'utf8');
for (const marker of [
  'SMTP_HOST=smtp-mail.outlook.com',
  'SMTP_PORT=587',
  'SMTP_SECURE=false',
  'SMTP_USER=notifications@qsys-ea.com',
  'SMTP_FROM_EMAIL=notifications@qsys-ea.com',
  'AFRICASTALKING_USERNAME=QSYS',
  'AFRICASTALKING_SMS_URL=https://api.africastalking.com/version1/messaging',
  'SMS_SENDER_ID=Q-SYS',
  'BEEM_WHATSAPP_API_URL=https://apichatcore.beem.africa/v1/chat-send',
  'BEEM_WHATSAPP_TEMPLATE_ID=479',
  'PRIVATE_UPLOAD_ROOT=/home/CPANEL_USER/riana_private_uploads',
  'FILE_BACKUP_ROOT=/home/CPANEL_USER/riana_private_file_backups',
]) {
  if (!packagedEnvironment.includes(marker)) fail(`Packaged notification/private-storage configuration is missing: ${marker}`);
}
if (packagedEnvironment.includes('BREVO_') || packagedEnvironment.includes('B_TEXTMAN_')) fail('Packaged environment still contains a retired notification provider configuration.');
const deploymentGuide = fs.readFileSync(normalizedPath('TRUEHOST_DEPLOYMENT.md'), 'utf8');
for (const marker of ['PRIVATE_UPLOAD_ROOT=/home/lxvtrfta/riana_private_uploads', 'FILE_BACKUP_ROOT=/home/lxvtrfta/riana_private_file_backups']) {
  if (!deploymentGuide.includes(marker)) fail(`Deployment guide is missing private storage configuration: ${marker}`);
}
const packagedDatabaseConfig = fs.readFileSync(normalizedPath('app/server/db.js'), 'utf8');
if (!packagedDatabaseConfig.includes("'DATABASE_PASSWORD', 'DB_PASSWORD', 'DB_PASS'")) {
  fail('Packaged database configuration does not support the Truehost DB_PASS alias.');
}

if (fileHash(normalizedPath('app/dist/index.html')) !== fileHash(normalizedPath('public_html/index.html'))) {
  fail('app/dist and public_html do not contain the same frontend build.');
}
for (const file of allFiles.filter((candidate) => candidate.endsWith('.js') && candidate.includes(`${path.sep}dist${path.sep}`))) {
  const content = fs.readFileSync(file, 'utf8');
  const marker = productionMarkers.find((candidate) => content.includes(candidate));
  if (marker) fail(`Production marker "${marker}" found in ${path.relative(output, file)}.`);
}

const lock = JSON.parse(fs.readFileSync(normalizedPath('app/package-lock.json'), 'utf8'));
const versions = {
  express: lock.packages?.['node_modules/express']?.version,
  nodemailer: lock.packages?.['node_modules/nodemailer']?.version,
  pathToRegexp: lock.packages?.['node_modules/path-to-regexp']?.version,
  uuid: lock.packages?.['node_modules/uuid']?.version,
};
if (versions.express !== '4.22.2' || versions.nodemailer !== '9.0.3' || versions.pathToRegexp !== '0.1.13' || versions.uuid !== '11.1.1') {
  fail(`Unexpected production dependency versions: ${JSON.stringify(versions)}`);
}

console.log(JSON.stringify({
  output,
  files: allFiles.length,
  manifestEntries: manifestLines.length,
  folders: topDirectories,
  htaccess: 'domain_root/.htaccess (CloudLinux-managed placeholder)',
  superAdmin: preserveSuperAdmin ? 'active with bcrypt hash preserved in private SQL' : 'inactive and passwordless until one-time activation',
  productionDependencies: versions,
}, null, 2));
