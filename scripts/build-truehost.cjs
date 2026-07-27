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
const liveUpdatesDirectory = path.join(root, 'hosting', 'Mysql_host', 'live_updates');
const migrationsDirectory = path.join(root, 'server', 'migrations');
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

function discoverLiveUpdates() {
  requirePath(liveUpdatesDirectory, 'Live database updates directory');
  const dateCounts = new Map();
  const updates = fs.readdirSync(liveUpdatesDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((sourceFile) => {
      const migrationId = path.basename(sourceFile, '.sql');
      const match = /^(\d{8})_[a-z0-9_]+$/.exec(migrationId);
      if (!match) throw new Error(`Invalid live database update filename: ${sourceFile}`);
      const date = match[1];
      dateCounts.set(date, (dateCounts.get(date) || 0) + 1);
      return { migrationId, sourceFile, sourcePath: path.join(liveUpdatesDirectory, sourceFile), migrationPath: path.join(migrationsDirectory, sourceFile), packageFile: `LIVE_DB_UPDATE_${date}.sql` };
    });
  if (!updates.length) throw new Error('At least one live database update is required.');
  for (const update of updates) {
    if (dateCounts.get(update.migrationId.slice(0, 8)) > 1) {
      throw new Error(`Multiple live database updates share date ${update.migrationId.slice(0, 8)}; use distinct migration dates.`);
    }
    requirePath(update.migrationPath, `Source migration for ${update.migrationId}`);
    const migrationSql = fs.readFileSync(update.migrationPath, 'utf8');
    const liveSql = fs.readFileSync(update.sourcePath, 'utf8');
    if (!liveSql.includes(update.migrationId)) {
      throw new Error(`Live database update does not record migration ${update.migrationId}.`);
    }
    for (const match of migrationSql.matchAll(/ALTER\s+TABLE\s+`?([a-z0-9_]+)`?[\s\S]*?ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+`?([a-z0-9_]+)`?\s+([a-z]+(?:\([^)]*\))?)/gi)) {
      const [, table, column, type] = match;
      const escapedType = type.replace(/[()]/g, '\\$&');
      const intent = new RegExp('ALTER\\s+TABLE\\s+`?' + table + '`?[\\s\\S]*?ADD\\s+COLUMN(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+`?' + column + '`?\\s+' + escapedType, 'i');
      if (!intent.test(liveSql)) {
        throw new Error(`Live database update ${update.sourceFile} is not aligned with ${table}.${column} (${type}).`);
      }
    }
  }
  return updates;
}

const liveUpdates = discoverLiveUpdates();

for (const target of [output, application, domainRoot, publicHtml, database]) assertInsideRoot(target);
requirePath(path.join(root, 'dist', 'index.html'), 'CIMS production build');
requirePath(path.join(root, 'CRMS', 'dist', 'index.html'), 'Developers production build');
requirePath(path.join(root, 'hosting', 'Mysql_host', 'riana_cims_host.sql'), 'Sanitized host database');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(application, { recursive: true });
fs.mkdirSync(domainRoot, { recursive: true });
fs.mkdirSync(publicHtml, { recursive: true });
fs.mkdirSync(database, { recursive: true });

copyDirectory(path.join(root, 'dist'), path.join(application, 'dist'));
copyDirectory(path.join(root, 'dist'), publicHtml);
copyDirectory(path.join(root, 'CRMS', 'dist'), path.join(application, 'CRMS', 'dist'));
copyDirectory(path.join(root, 'server'), path.join(application, 'server'), serverFilter);
fs.copyFileSync(path.join(root, 'README.md'), path.join(application, 'README.md'));

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
for (const update of liveUpdates) fs.copyFileSync(update.sourcePath, path.join(output, update.packageFile));

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
PRIVATE_UPLOAD_ROOT=/home/CPANEL_USER/riana_private_uploads
MAX_IMAGE_UPLOAD_MB=8
MAX_DOCUMENT_UPLOAD_MB=20
MAX_MESSAGE_ATTACHMENT_MB=10
FILE_RETENTION_DAYS=30
FILE_BACKUP_ROOT=/home/CPANEL_USER/riana_private_file_backups

SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=notifications@qsys-ea.com
SMTP_PASSWORD=REPLACE_WITH_OUTLOOK_APP_PASSWORD
# SMTP_PASS is accepted as a backward-compatible alias; configure only one password variable.
SMTP_FROM_EMAIL=notifications@qsys-ea.com
SMTP_FROM_NAME=QSYS Notifications
# Alternatively: SMTP_FROM="QSYS Notifications <notifications@qsys-ea.com>"
SMTP_MAX_CONNECTIONS=3
SMTP_MAX_MESSAGES=50
SMTP_RATE_LIMIT=5
SMTP_RETRY_ATTEMPTS=3
SMTP_RETRY_BASE_DELAY_MS=500

AFRICASTALKING_USERNAME=QSYS
AFRICASTALKING_API_KEY=REPLACE_WITH_AFRICAS_TALKING_API_KEY
AFRICASTALKING_SMS_URL=https://api.africastalking.com/version1/messaging
AFRICASTALKING_BALANCE_URL=https://api.africastalking.com/version1/user
SMS_SENDER_ID=Q-SYS

ENABLE_WHATSAPP_NOTIFICATIONS=true
BEEM_WHATSAPP_API_URL=https://apichatcore.beem.africa/v1/chat-send
BEEM_WHATSAPP_USER_ID=REPLACE_WITH_BEEM_USER_ID
BEEM_WHATSAPP_AUTHORIZATION=Basic REPLACE_WITH_BEEM_BASIC_TOKEN
BEEM_WHATSAPP_TEMPLATE_ID=479
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
const liveUpdateFiles = liveUpdates.map(({ packageFile }) => `\`${packageFile}\``).join(', ');
const liveUpdateDescription = liveUpdates.length === 1
  ? 'The update is idempotent, preserves all rows, and records itself in migration_history.'
  : 'Apply the updates in the listed order. Each update is idempotent, preserves existing rows, and records itself in migration_history.';

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
4. Upload \`app/\` as mapped above. Copy \`app/.env.example\` to \`app/.env.local\`; replace every placeholder. Generate a unique JWT secret of at least 48 random characters. Set \`PRIVATE_UPLOAD_ROOT=/home/lxvtrfta/riana_private_uploads\` and \`FILE_BACKUP_ROOT=/home/lxvtrfta/riana_private_file_backups\`, or equivalent private directories owned by the cPanel user and outside \`public_html\`, \`dist\`, \`build\`, and the uploaded app package. Configure Outlook SMTP with \`SMTP_HOST=smtp-mail.outlook.com\`, \`SMTP_PORT=587\`, \`SMTP_SECURE=false\`, \`SMTP_USER=notifications@qsys-ea.com\`, \`SMTP_FROM_EMAIL=notifications@qsys-ea.com\`, and the private app password in \`SMTP_PASSWORD\`. Configure Africa's Talking using \`AFRICASTALKING_USERNAME\`, \`AFRICASTALKING_API_KEY\`, \`AFRICASTALKING_SMS_URL\`, \`AFRICASTALKING_BALANCE_URL\`, and \`SMS_SENDER_ID=Q-SYS\`. Configure Beem WhatsApp using \`ENABLE_WHATSAPP_NOTIFICATIONS\`, \`BEEM_WHATSAPP_API_URL\`, \`BEEM_WHATSAPP_USER_ID\`, \`BEEM_WHATSAPP_AUTHORIZATION\`, and \`BEEM_WHATSAPP_TEMPLATE_ID\`. Confirm \`CIMS_LOGIN_URL=https://rianacims.name.ng/\` and \`CORS_ALLOWED_ORIGINS=https://rianacims.name.ng\` are present in either that file or the cPanel Node environment. Existing cPanel setups may use \`DB_PASS\`; it is accepted as the database-password alias.
5. In **Setup Node.js App**, keep Node.js **24.15.0**, **Production**, application root \`rianacims.name.ng/app\`, root application URL, and startup file \`passenger_app.js\` exactly as shown.
6. Click **Run NPM Install**. It must complete without errors. Do not upload a local \`node_modules\` folder.
7. Create writable private directories \`/home/lxvtrfta/riana_private_uploads\`, \`/home/lxvtrfta/riana_private_file_backups\`, \`app/server/uploads\`, and \`app/server/backups\`; keep every runtime upload, backup, and log directory outside \`public_html\`. The app will create private upload subfolders on startup when \`PRIVATE_UPLOAD_ROOT\` is set and writable.
8. Activate the bootstrap SuperAdmin once: temporarily add \`SUPERADMIN_EMAIL\` (default \`${bootstrapSuperAdminEmail}\`) and a unique \`SUPERADMIN_PASSWORD\` in the Node app environment. The password must be 14+ characters with upper-case, lower-case, number, and symbol characters. In the application terminal run \`npm run admin:ensure-superadmin\`. Immediately remove both temporary variables before the final restart. This prevents later restarts from resetting the account password.
9. Use **Restart** in **Setup Node.js App**, then open \`https://rianacims.name.ng/api/health\`. It must return \`{"status":"ok",...,"corsPolicy":"same-origin-host-v1"}\`; if the marker is absent, Passenger is still serving the previous backend. Then sign in and change/verify the SuperAdmin password, verify the dashboard, Developers workspace, reports, uploads, email, SMS, and WhatsApp.

If E-Handover preview or download reports a missing file after an update, run \`node server/scripts/inspect-file-storage.cjs\` in the hosted app terminal and check \`counts.missingLegacyHandovers\`. Restore the matching \`app/server/uploads\` backup, or re-upload the signed handover documents listed in \`missingLegacyHandovers\`.

The imported database always contains one inactive, passwordless SuperAdmin bootstrap principal. It cannot authenticate until step 8 securely activates it. No universal/default password exists in this package.

## Update or rollback

For an existing live database, first back up the database, then select it in phpMyAdmin and import ${liveUpdateFiles} before uploading or restarting the new application. ${liveUpdateDescription} Do not import the clean-install riana_cims_host.sql over a live database.

The live updater does not query \`information_schema\`, because restricted cPanel database users may receive MySQL error \`#1044\`. It also avoids \`ADD COLUMN IF NOT EXISTS\`, because older shared-host MySQL builds may reject that syntax with \`#1064\`. Instead it guards the plain \`ALTER TABLE ... ADD COLUMN\` with the application-owned \`migration_history\` table and verifies the result with \`SHOW COLUMNS\`, so it can be safely retried with ordinary privileges on the selected application database.

Before an update, back up the database and the current \`app\` folder. Preserve the production \`.env.local\`, uploads, backups, and any Truehost-managed \`.htaccess\`. Upload the new app files, run NPM Install, restart, and execute the smoke tests. To roll back, restore the previous app folder and its matching database backup.

## Security checks

- Force HTTPS; the production session cookie is Secure, HttpOnly, and SameSite=Strict.
- Publish exactly one DMARC TXT record at \`_dmarc.rianacims.name.ng\`; multiple policies invalidate DMARC evaluation.
- Never expose \`.env.local\`, SQL, backups, logs, or uploads in \`public_html\`; keep \`PRIVATE_UPLOAD_ROOT\` and \`FILE_BACKUP_ROOT\` private to the cPanel account.
- Store the SMTP mailbox password only in the private Node environment; never add it to an upload archive or public file.
- Restrict the database user to the application database and rotate credentials after staff changes.
- Keep the SuperAdmin bootstrap variables only for the one activation restart.
- Compare uploaded files with \`FILE_MANIFEST.sha256\` when diagnosing corruption.
`;
const deploymentGuide = deploymentGuideTemplate
  .replace('No live credentials, customer records, uploads, logs, runtime secrets, or backups are included.', credentialPackagingStatement)
  .replace(/^8\. Activate the bootstrap SuperAdmin once:.*$/m, superAdminDeploymentStep)
  .replace('The imported database always contains one inactive, passwordless SuperAdmin bootstrap principal. It cannot authenticate until step 8 securely activates it. No universal/default password exists in this package.', superAdminImportStatement)
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
  liveDatabaseUpdates: liveUpdates.map(({ migrationId, sourceFile, packageFile }) => ({ migrationId, sourceFile, packageFile })),
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
