const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'Truehost');
const application = path.join(output, 'app');
const domainRoot = path.join(output, 'domain_root');
const publicHtml = path.join(output, 'public_html');
const database = path.join(output, 'database');
const bootstrapSuperAdminId = '00000000-0000-4000-8000-000000000001';
const bootstrapSuperAdminEmail = 'superadmin@riana.co';
const preserveSuperAdmin = /^(?:1|true|yes)$/i.test(String(process.env.HOST_EXPORT_PRESERVE_SUPERADMIN || ''));
const bcryptHashPattern = /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/;

const assertInsideRoot = (target) => {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe Truehost output path: ${target}`);
  }
};

const requirePath = (target, description) => {
  if (!fs.existsSync(target)) throw new Error(`${description} is missing: ${target}`);
};

const copyDirectory = (source, target, filter) => {
  requirePath(source, 'Build input');
  fs.cpSync(source, target, { recursive: true, filter });
};

const serverFilter = (source) => {
  const name = path.basename(source);
  if (['node_modules', 'backups', 'uploads', '.runtime'].includes(name)) return false;
  if (/\.test\.js$/i.test(name)) return false;
  return true;
};

const hashFile = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

const listFiles = (directory) => {
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else files.push(absolute);
    }
  };
  walk(directory);
  return files.sort((left, right) => left.localeCompare(right));
};

for (const target of [output, application, domainRoot, publicHtml, database]) assertInsideRoot(target);
requirePath(path.join(root, 'dist', 'index.html'), 'CIMS production build');
requirePath(path.join(root, 'CRMS', 'dist', 'index.html'), 'Developers production build');
requirePath(path.join(root, 'hosting', 'Mysql_host', 'riana_cims_host.sql'), 'Sanitized host database');
requirePath(path.join(root, 'hosting', 'Mysql_host', 'live_updates', '20260705_subsidiary_handover_equipment.sql'), 'Live database update');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(application, { recursive: true });
fs.mkdirSync(domainRoot, { recursive: true });
fs.mkdirSync(publicHtml, { recursive: true });
fs.mkdirSync(database, { recursive: true });

copyDirectory(path.join(root, 'dist'), path.join(application, 'dist'));
copyDirectory(path.join(root, 'dist'), publicHtml);
copyDirectory(path.join(root, 'CRMS', 'dist'), path.join(application, 'CRMS', 'dist'));
copyDirectory(path.join(root, 'server'), path.join(application, 'server'), serverFilter);
copyDirectory(path.join(root, 'docs'), path.join(application, 'docs'));

fs.copyFileSync(path.join(root, 'server', 'package-lock.json'), path.join(application, 'package-lock.json'));
const hostSql = fs.readFileSync(path.join(root, 'hosting', 'Mysql_host', 'riana_cims_host.sql'), 'utf8');
const truehostSql = hostSql
  .replace(/^CREATE DATABASE IF NOT EXISTS .*?;\r?\n/im, '')
  .replace(/^USE `[^`]+`;\r?\n/im, '')
  .replace(
    '-- Complete schema with sanitized reference data; no credentials or customer records.',
    '-- Complete schema with sanitized reference data and one inactive, passwordless SuperAdmin bootstrap principal.',
  );
fs.writeFileSync(path.join(database, 'riana_cims_host.sql'), truehostSql, 'utf8');
fs.copyFileSync(
  path.join(root, 'hosting', 'Mysql_host', 'live_updates', '20260705_subsidiary_handover_equipment.sql'),
  path.join(output, 'LIVE_DB_UPDATE_20260705.sql'),
);

const serverPackage = JSON.parse(fs.readFileSync(path.join(root, 'server', 'package.json'), 'utf8'));
const applicationPackage = {
  ...serverPackage,
  main: 'server/index.js',
  scripts: {
    start: 'node server/index.js',
    'admin:ensure-superadmin': 'node server/scripts/ensure-superadmin.cjs',
    'security:init': 'node server/scripts/ensure-runtime-secret.cjs',
  },
};
delete applicationPackage.devDependencies;
fs.writeFileSync(path.join(application, 'package.json'), `${JSON.stringify(applicationPackage, null, 2)}\n`);

const envTemplate = `# RIANA CIMS Truehost production environment
# Copy to .env.local in this app folder and replace every REPLACE_... placeholder.
# The Passenger adapter also accepts cPanel DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD/DB_PASS aliases.
NODE_ENV=production
# Passenger supplies PORT. Only define it in cPanel if Truehost explicitly requires it.
# PORT=8081

DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_NAME=CPANEL_USER_riana_cims
DATABASE_USER=CPANEL_USER_riana_user
DATABASE_PASSWORD=REPLACE_WITH_A_STRONG_DATABASE_PASSWORD
DATABASE_POOL_SIZE=20
DATABASE_POOL_IDLE=10

JWT_SECRET=REPLACE_WITH_AT_LEAST_48_RANDOM_CHARACTERS
BCRYPT_ROUNDS=12
CIMS_LOGIN_URL=https://rianacims.name.ng/
CORS_ALLOWED_ORIGINS=https://rianacims.name.ng
BACKUP_TIMEZONE=Africa/Nairobi
BACKUP_RETENTION_DAYS=30

SMTP_HOST=mail.rianacims.name.ng
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=info@rianacims.name.ng
SMTP_PASSWORD=REPLACE_WITH_EMAIL_ACCOUNT_PASSWORD
# SMTP_PASS is accepted as a backward-compatible alias; configure only one password variable.
SMTP_FROM_EMAIL=info@rianacims.name.ng
SMTP_FROM_NAME=RIANA CIMS
# Alternatively: SMTP_FROM="RIANA CIMS <info@rianacims.name.ng>"
SMTP_MAX_CONNECTIONS=3
SMTP_MAX_MESSAGES=50
SMTP_RATE_LIMIT=5
SMTP_RETRY_ATTEMPTS=3
SMTP_RETRY_BASE_DELAY_MS=500

B_TEXTMAN_API_KEY=REPLACE_WITH_B_TEXTMAN_API_KEY
B_TEXTMAN_API_URL=https://your-approved-sms-gateway.example
B_TEXTMAN_SEND_PATH=send-sms
B_TEXTMAN_BALANCE_PATH=balance
SMS_SENDER_ID=RIANA
NOTIFICATION_PROVIDER_TIMEOUT_MS=10000
TWO_FACTOR_DELIVERY_WEBHOOK=

# Do not store SUPERADMIN_PASSWORD here after bootstrap. Follow TRUEHOST_DEPLOYMENT.md.
`;
fs.writeFileSync(path.join(application, '.env.example'), envTemplate);

fs.writeFileSync(path.join(application, 'passenger_app.js'), `const databaseAliases = {
  DATABASE_HOST: ['DB_HOST'],
  DATABASE_PORT: ['DB_PORT'],
  DATABASE_NAME: ['DB_NAME'],
  DATABASE_USER: ['DB_USER'],
  DATABASE_PASSWORD: ['DB_PASSWORD', 'DB_PASS'],
};

for (const [canonical, cpanelAliases] of Object.entries(databaseAliases)) {
  const configuredAlias = cpanelAliases.find((alias) => process.env[alias] !== undefined && process.env[alias] !== '');
  if (!process.env[canonical] && configuredAlias) {
    process.env[canonical] = process.env[configuredAlias];
  }
}

require('./server/index.js');
`);
fs.writeFileSync(path.join(domainRoot, '.htaccess'), `# Required placeholder for CloudLinux Node.js Selector.
# cPanel will add and maintain the Passenger directives when the application starts.
`);
fs.writeFileSync(path.join(application, 'ecosystem.config.cjs'), `module.exports = {
  apps: [{
    name: 'riana-cims',
    cwd: __dirname,
    script: 'server/index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '750M',
    env_production: { NODE_ENV: 'production', PORT: 8081 },
  }],
};
`);

fs.writeFileSync(path.join(output, 'passenger.htaccess.example'), `# Reference only. Truehost Setup Node.js App normally manages these directives.
# Replace CPANEL_USER only if Truehost support asks you to install the directives manually.
PassengerAppRoot /home/CPANEL_USER/rianacims.name.ng/app
PassengerBaseURI /
PassengerAppType node
PassengerStartupFile passenger_app.js
PassengerNodejs /home/CPANEL_USER/nodevenv/rianacims.name.ng/app/24/bin/node
`);

const credentialPackagingStatement = preserveSuperAdmin
  ? 'The database package contains one active SuperAdmin account with its bcrypt password hash. Treat the SQL and database archive as secrets; neither is included in public_html or the Node application.'
  : 'No live credentials, customer records, uploads, logs, runtime secrets, or backups are included.';
const superAdminDeploymentStep = preserveSuperAdmin
  ? '8. The imported database already contains the active SuperAdmin and its bcrypt password hash. Do not add SUPERADMIN_PASSWORD to cPanel and do not run admin:ensure-superadmin unless you intentionally want to rotate the password.'
  : '8. Activate the bootstrap SuperAdmin once: temporarily add SUPERADMIN_EMAIL (default superadmin@riana.co) and a unique SUPERADMIN_PASSWORD in the Node app environment. The password must be 14+ characters with upper-case, lower-case, number, and symbol characters. In the application terminal run npm run admin:ensure-superadmin. Immediately remove both temporary variables before the final restart.';
const superAdminImportStatement = preserveSuperAdmin
  ? 'The imported database contains one active SuperAdmin with the preserved bcrypt password hash and CIMS/CRMS SuperAdmin grants. The original plaintext password is never written to this package.'
  : 'The imported database contains one inactive, passwordless SuperAdmin bootstrap principal. It cannot authenticate until step 8 securely activates it. No universal/default password exists in this package.';
const superAdminSecurityCheck = preserveSuperAdmin
  ? '- Keep the database SQL/archive private because it contains the preserved bcrypt credential hash.'
  : '- Keep the SuperAdmin bootstrap variables only for the one activation restart.';

const deploymentGuideTemplate = `# RIANA CIMS - Truehost deployment

This package is aligned to the cPanel configuration shown for **rianacims.name.ng**:

- Node.js: **24.15.0**
- Mode: **Production**
- Application root: **rianacims.name.ng/app**
- Application URL: **https://rianacims.name.ng/**
- Startup file: **passenger_app.js**

No live credentials, customer records, uploads, logs, runtime secrets, or backups are included.

## Folder mapping

- Upload \`Truehost/domain_root/.htaccess\` to \`/home/lxvtrfta/rianacims.name.ng/.htaccess\` before starting the app. CloudLinux requires this file to exist and will maintain its Passenger directives.
- Upload the **contents** of \`Truehost/app/\` into \`/home/<CPANEL_USER>/rianacims.name.ng/app/\`.
- Upload the **contents** of \`Truehost/public_html/\` into the domain's \`public_html/\` only when the Truehost domain document root uses that folder. The Node application already serves the same build from \`app/dist/\`.
- Import \`Truehost/database/riana_cims_host.sql\` into the selected cPanel MySQL database.

Do not upload the \`database\` folder, \`.env.local\`, or any SQL file to \`public_html\`.

## Clean installation

1. In cPanel, create a MySQL database and user, grant that user **ALL PRIVILEGES** on only this database, and note the cPanel-prefixed names.
2. In phpMyAdmin select that database, then import \`database/riana_cims_host.sql\`. The SQL intentionally does not create or switch databases and avoids function-based UUID/DATE defaults that older shared-host MySQL releases reject.
3. Upload \`domain_root/.htaccess\` to \`/home/lxvtrfta/rianacims.name.ng/.htaccess\` before using **Start App**. Ensure the filename remains exactly \`.htaccess\`; do not place it inside \`app\` or \`public_html\`.
4. Upload \`app/\` as mapped above. Copy \`app/.env.example\` to \`app/.env.local\`; replace every placeholder. Generate a unique JWT secret of at least 48 random characters. Configure \`SMTP_PASSWORD\` with the private mailbox password for \`info@rianacims.name.ng\`; keep \`SMTP_HOST=mail.rianacims.name.ng\`, \`SMTP_PORT=465\`, and \`SMTP_SECURE=true\`. Configure \`B_TEXTMAN_API_KEY\`, \`B_TEXTMAN_API_URL\`, \`B_TEXTMAN_SEND_PATH\`, and \`SMS_SENDER_ID\` with the same working values used by the approved SMS gateway. Confirm \`CIMS_LOGIN_URL=https://rianacims.name.ng/\` and \`CORS_ALLOWED_ORIGINS=https://rianacims.name.ng\` are present in either that file or the cPanel Node environment. Existing cPanel setups may use \`DB_PASS\`; it is accepted as the database-password alias.
5. In **Setup Node.js App**, keep Node.js **24.15.0**, **Production**, application root \`rianacims.name.ng/app\`, root application URL, and startup file \`passenger_app.js\` exactly as shown.
6. Click **Run NPM Install**. It must complete without errors. Do not upload a local \`node_modules\` folder.
7. Create writable private directories \`app/server/uploads\` and \`app/server/backups\`; keep them outside \`public_html\`.
8. Activate the bootstrap SuperAdmin once: temporarily add \`SUPERADMIN_EMAIL\` (default \`${bootstrapSuperAdminEmail}\`) and a unique \`SUPERADMIN_PASSWORD\` in the Node app environment. The password must be 14+ characters with upper-case, lower-case, number, and symbol characters. In the application terminal run \`npm run admin:ensure-superadmin\`. Immediately remove both temporary variables before the final restart. This prevents later restarts from resetting the account password.
9. Use **Restart** in **Setup Node.js App**, then open \`https://rianacims.name.ng/api/health\`. It must return \`{"status":"ok",...,"corsPolicy":"same-origin-host-v1"}\`; if the marker is absent, Passenger is still serving the previous backend. Then sign in and change/verify the SuperAdmin password, verify the dashboard, Developers workspace, reports, uploads, email, and SMS.

The imported database always contains one inactive, passwordless SuperAdmin bootstrap principal. It cannot authenticate until step 7 securely activates it. No universal/default password exists in this package.

## Update or rollback

For an existing live database, first back up the database, then select it in phpMyAdmin and import LIVE_DB_UPDATE_20260705.sql before uploading or restarting the new application. The update is idempotent, adds only the nullable subsidiary equipment-configuration column, preserves all rows, and records itself in migration_history. Do not import the clean-install riana_cims_host.sql over a live database.

Before an update, back up the database and the current \`app\` folder. Preserve the production \`.env.local\`, uploads, backups, and any Truehost-managed \`.htaccess\`. Upload the new app files, run NPM Install, restart, and execute the smoke tests. To roll back, restore the previous app folder and its matching database backup.

## Security checks

- Force HTTPS; the production session cookie is Secure, HttpOnly, and SameSite=Strict.
- Publish exactly one DMARC TXT record at \`_dmarc.rianacims.name.ng\`; multiple policies invalidate DMARC evaluation.
- Never expose \`.env.local\`, SQL, backups, logs, or uploads in \`public_html\`.
- Store the SMTP mailbox password only in the private Node environment; never add it to an upload archive or public file.
- Restrict the database user to the application database and rotate credentials after staff changes.
- Keep the SuperAdmin bootstrap variables only for the one activation restart.
- Compare uploaded files with \`FILE_MANIFEST.sha256\` when diagnosing corruption.
`;
const deploymentGuide = deploymentGuideTemplate
  .replace('No live credentials, customer records, uploads, logs, runtime secrets, or backups are included.', credentialPackagingStatement)
  .replace(/^8\. Activate the bootstrap SuperAdmin once:.*$/m, superAdminDeploymentStep)
  .replace('The imported database always contains one inactive, passwordless SuperAdmin bootstrap principal. It cannot authenticate until step 7 securely activates it. No universal/default password exists in this package.', superAdminImportStatement)
  .replace('- Keep the SuperAdmin bootstrap variables only for the one activation restart.', superAdminSecurityCheck);
fs.writeFileSync(path.join(output, 'TRUEHOST_DEPLOYMENT.md'), deploymentGuide);

let commit = null;
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
} catch {}
const buildInfo = {
  generatedAt: new Date().toISOString(),
  commit,
  truehostNodeVersion: '24.15.0',
  supportedNodeVersion: '>=20',
  applicationRoot: 'rianacims.name.ng/app',
  documentRoot: '/home/lxvtrfta/rianacims.name.ng',
  htaccessFile: 'domain_root/.htaccess',
  applicationUrl: 'https://rianacims.name.ng/',
  startupFile: 'passenger_app.js',
  databaseFile: 'database/riana_cims_host.sql',
  databaseContainsLiveRecords: preserveSuperAdmin,
  databaseContainsLiveOperationalRecords: false,
  bootstrapSuperAdmin: {
    email: bootstrapSuperAdminEmail,
    active: preserveSuperAdmin,
    passwordPresent: preserveSuperAdmin,
    passwordStorage: preserveSuperAdmin ? 'bcrypt-hash-only' : 'none',
  },
};
fs.writeFileSync(path.join(output, 'BUILD_INFO.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);

const sql = fs.readFileSync(path.join(database, 'riana_cims_host.sql'), 'utf8');
if (/^\s*(CREATE\s+DATABASE|USE\s+`)/im.test(sql)) {
  throw new Error('Truehost database must import into the database selected in cPanel.');
}
if (!sql.includes(bootstrapSuperAdminEmail)) {
  throw new Error('Truehost database is missing the SuperAdmin principal.');
}
if (preserveSuperAdmin) {
  if (!sql.includes('PRESERVED_SUPERADMIN_ACTIVE_BCRYPT') || !bcryptHashPattern.test(sql)) {
    throw new Error('The preserved SuperAdmin bcrypt credential is missing from the private database export.');
  }
} else {
  if (!sql.includes(bootstrapSuperAdminId) || !/VALUES\s*\([^;]*'SuperAdmin'\s*,\s*'SuperAdmin'\s*,\s*1\s*,\s*0\s*,\s*NULL\)/i.test(sql)) {
    throw new Error('The SuperAdmin bootstrap principal must remain inactive and passwordless.');
  }
}
if (!/CREATE\s+TABLE\s+`?user_profiles`?/i.test(sql) || !/CREATE\s+TABLE\s+`?user_permissions`?/i.test(sql)) {
  throw new Error('Truehost database is missing required enterprise access-control tables.');
}

const forbiddenNames = new Set(['.env.local', '.runtime', 'node_modules', 'backups', 'uploads']);
for (const file of listFiles(output)) {
  const segments = path.relative(output, file).split(path.sep);
  if (segments.some((segment) => forbiddenNames.has(segment))) {
    throw new Error(`Forbidden runtime content was packaged: ${path.relative(output, file)}`);
  }
}

const manifestFiles = listFiles(output).filter((file) => path.basename(file) !== 'FILE_MANIFEST.sha256');
const manifest = manifestFiles.map((file) => {
  const relative = path.relative(output, file).split(path.sep).join('/');
  return `${hashFile(file)}  ${relative}`;
}).join('\n');
fs.writeFileSync(path.join(output, 'FILE_MANIFEST.sha256'), `${manifest}\n`);

console.log(JSON.stringify({
  output,
  files: listFiles(output).length,
  databaseBytes: fs.statSync(path.join(database, 'riana_cims_host.sql')).size,
  applicationEntry: 'app/passenger_app.js',
  bootstrapSuperAdmin: preserveSuperAdmin
    ? `${bootstrapSuperAdminEmail} (active, bcrypt hash preserved in private SQL)`
    : `${bootstrapSuperAdminEmail} (inactive, passwordless until activation)`,
  commit,
}, null, 2));
