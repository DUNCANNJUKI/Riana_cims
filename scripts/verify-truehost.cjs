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
const forbiddenSegments = new Set(['.env.local', '.runtime', 'node_modules', 'backups', 'uploads']);
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

const topDirectories = fs.readdirSync(output, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
if (topDirectories.join(',') !== requiredDirectories.slice().sort().join(',')) {
  fail(`Unexpected top-level folder layout: ${topDirectories.join(', ')}`);
}

const allFiles = listFiles(output);
for (const file of allFiles) {
  const segments = path.relative(output, file).split(path.sep);
  if (segments.some((segment) => forbiddenSegments.has(segment))) fail(`Forbidden runtime content was packaged: ${path.relative(output, file)}`);
}

const htaccess = fs.readFileSync(normalizedPath('domain_root/.htaccess'), 'utf8');
if (!htaccess.includes('Required placeholder for CloudLinux Node.js Selector')) {
  fail('Domain-root .htaccess is missing the CloudLinux placeholder marker.');
}
if (/PassengerAppRoot|PassengerNodejs/i.test(htaccess)) {
  fail('Domain-root .htaccess must not hardcode Passenger paths; cPanel manages those directives.');
}

const manifestLines = fs.readFileSync(normalizedPath('FILE_MANIFEST.sha256'), 'utf8').trim().split(/\r?\n/);
for (const line of manifestLines) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  if (!match) fail(`Invalid manifest line: ${line}`);
  const target = normalizedPath(match[2]);
  if (!fs.existsSync(target)) fail(`Manifest target is missing: ${match[2]}`);
  if (fileHash(target) !== match[1]) fail(`Manifest hash mismatch: ${match[2]}`);
}

const buildInfo = JSON.parse(fs.readFileSync(normalizedPath('BUILD_INFO.json'), 'utf8'));
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
  'SMTP_HOST=mail.rianacims.name.ng',
  'SMTP_PORT=465',
  'SMTP_SECURE=true',
  'SMTP_USER=info@rianacims.name.ng',
  'SMTP_FROM_EMAIL=info@rianacims.name.ng',
]) {
  if (!packagedEnvironment.includes(marker)) fail(`Packaged SMTP configuration is missing: ${marker}`);
}
if (packagedEnvironment.includes('BREVO_')) fail('Packaged environment still contains the retired Brevo provider configuration.');
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
