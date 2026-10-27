const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {ZipArchive} = require('archiver');

const root = path.resolve(__dirname,'..');
const createdAt = new Date();
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).formatToParts(createdAt).map((part) => [part.type, part.value]));
const releaseId = `RIANA-CIMS-CLOUD-PATCH-${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}-EAT`;
const output = path.join(root,'release',releaseId);
const denied = new Set(['node_modules','uploads','private_uploads','backups','.runtime','.git','.aws','.codex']);
const hash = (file)=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=[];
function copyTree(source,destination){
  fs.mkdirSync(destination,{recursive:true});
  for(const entry of fs.readdirSync(source,{withFileTypes:true})){
    if(denied.has(entry.name) || entry.name.startsWith('.env') || /\.test\.(js|ts)$|\.(pem|key|log|bak)$/i.test(entry.name))continue;
    if(entry.isSymbolicLink())continue;
    const from=path.join(source,entry.name);const to=path.join(destination,entry.name);
    if(entry.isDirectory())copyTree(from,to);else if(entry.isFile())fs.copyFileSync(from,to);
  }
}
function inventory(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())inventory(file);else files.push({path:path.relative(output,file).replace(/\\/g,'/'),bytes:fs.statSync(file).size,sha256:hash(file)});
  }
}
async function main(){
  if(!output.startsWith(root+path.sep))throw new Error('Unsafe patch output path.');
  for(const input of ['dist/index.html','CRMS/dist/index.html','server/package-lock.json'])if(!fs.existsSync(path.join(root,input)))throw new Error(`Build input missing: ${input}`);
  fs.mkdirSync(output);
  const app=path.join(output,'node_app');
  copyTree(path.join(root,'server'),path.join(app,'server'));
  copyTree(path.join(root,'dist'),path.join(app,'dist'));
  copyTree(path.join(root,'CRMS/dist'),path.join(app,'CRMS/dist'));
  copyTree(path.join(root,'dist'),path.join(output,'web_root'));
  copyTree(path.join(root,'CRMS/dist'),path.join(output,'web_root','developers'));
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'server/package.json'),'utf8'));
  pkg.main='server/index.js';pkg.scripts={start:'node server/index.js'};
  fs.writeFileSync(path.join(app,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  fs.copyFileSync(path.join(root,'server/package-lock.json'),path.join(app,'package-lock.json'));
  const preflight=fs.readFileSync(path.join(root,'hosting/Mysql_host/patch_components/20261014_inventory_patch_preflight.sql'),'utf8');
  const hardware=fs.readFileSync(path.join(root,'server/migrations/20261012_hardware_inventory.sql'),'utf8').split(/\r?\n/).filter((line)=>!line.startsWith('ALTER TABLE user_profiles MODIFY role ')).join('\n');
  const requirements=fs.readFileSync(path.join(root,'server/migrations/20261014_equipment_serial_requirements.sql'),'utf8');
  const hybrid=fs.readFileSync(path.join(root,'server/migrations/20261015_hybrid_equipment.sql'),'utf8');
  const operations=fs.readFileSync(path.join(root,'server/migrations/20261016_inventory_operations.sql'),'utf8');
  const scheduling=fs.readFileSync(path.join(root,'server/migrations/20261016_scheduling.sql'),'utf8');
  const missedCallCompatibility=fs.readFileSync(path.join(root,'server/migrations/20261016_missed_call_dismissals_compatibility.sql'),'utf8');
  const sql=[preflight,'\n-- Serialized hardware schema; existing data and counters are retained.\n',hardware,'\n-- All equipment, including kiosks, is optional unless configured per subsidiary.\n',requirements,`\nCREATE TABLE IF NOT EXISTS migration_history (migration_id VARCHAR(100) PRIMARY KEY, description VARCHAR(255) NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);\nINSERT INTO migration_history (migration_id,description) VALUES ('20261012_hardware_inventory','Serialized hardware schema'),('20261014_equipment_serial_requirements','Configurable subsidiary serial requirements') ON DUPLICATE KEY UPDATE description=VALUES(description);\n`].join('');
  fs.writeFileSync(path.join(output,'LIVE_DB_UPDATE.sql'),`-- Release: ${releaseId}\n-- Created UTC: ${createdAt.toISOString()}\n\n${sql}\n-- Hybrid equipment storage, retaining all built-in installation values.\n${hybrid}\nINSERT INTO migration_history (migration_id,description) VALUES ('20261015_hybrid_equipment','Hybrid configurable equipment quantities') ON DUPLICATE KEY UPDATE description=VALUES(description);\n\n${operations}\nINSERT INTO migration_history (migration_id,description) VALUES ('20261016_inventory_operations','Variant dependency safety and handover identity lookup') ON DUPLICATE KEY UPDATE description=VALUES(description);\n`);
  const guide=`# Cloud Inventory Patch - 14 October 2026\n\nThis is an overlay of the current tested workspace, not a database replacement. It includes CIMS, Developers, API and dependency manifests. No secrets, accounts, live uploads, backups or node_modules are included.\n\n1. Back up the live database, application and external upload folders. Retain the current runtime environment and application entrypoint.\n2. Confirm Node.js 20.19+, 22.13+ or 24 and native canvas/sharp platform support. On the shown live layout, retain riana_private_file_uploads and riana_private_uploads as external storage. Set PRIVATE_UPLOAD_ROOT and LEGACY_UPLOAD_ROOT to those existing server folders; do not substitute example paths for live paths. Legacy server/uploads symlinks must be retained.\n3. Run LIVE_DB_UPDATE_20261014.sql against the EXISTING live database. The preflight stops on incompatible parent keys or missing base/private-file tables. Never import a clean-install database over live data. Existing serial requirements are preserved; no kiosk requirement is seeded.\n4. Overlay node_app into the existing Node application root. Overlay web_root into rianacims.name.ng (the shown domain document root). Do not replace .env, uploads symlinks, riana_private_file_uploads or riana_private_uploads; do not delete old hashed assets during the overlay.\n5. Run npm ci --omit=dev at the Node application root. Enable HARDWARE_INVENTORY_ENABLED=true after SQL succeeds, then restart the existing cloud application via its hosting panel/process manager.\n6. Verify /api/health, login, subsidiary-specific requirement toggles, serial allocation and QR-linked item history. QR labels open a public, redacted verification history; full inventory details still require login and inventory scope. Generate production labels on the HTTPS cloud origin. Existing local-origin QR prints should be regenerated for cloud use.\n7. For browser cache refresh, reload the app to install the new service worker. Clear only RIANA caches/service-worker registration if needed; retain login credentials and other browser/site storage.\n\nRollback: restore the prior application and dependency lockfiles and process environment; retain new tables, issued serials, inventory history and uploads. Do not run hardware rollback/drop SQL after records exist. No remote deployment or SQL execution was performed by creation of this package.\n`;
  const deployment = guide
    .replace('Enable HARDWARE_INVENTORY_ENABLED=true after SQL succeeds', 'Enable HARDWARE_INVENTORY_ENABLED=true and SCHEDULING_ENABLED=true only after SQL succeeds')
    .replace('# Cloud Inventory Patch - 14 October 2026', `# ${releaseId}\n\nTimestamp: ${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} EAT (Africa/Nairobi).\n\nUse this single consolidated ZIP instead of earlier cloud patch archives. Do not combine releases.\n\nPackage: node_app is the Node application overlay; web_root is the domain document-root overlay; LIVE_DB_UPDATE.sql is the only SQL entrypoint. MANIFEST.json records file checksums. Preserve existing .htaccess/Passenger directives and the hosting startup wrapper; no routing replacement is included.`)
    .replaceAll('LIVE_DB_UPDATE_20261014.sql','LIVE_DB_UPDATE.sql')
    .replace('The preflight stops on incompatible parent keys or missing base/private-file tables.', 'The preflight stops on incompatible parent keys, missing base/private-file tables or missing assignment hierarchy fields. Stop on errors; do not use --force or additionally run individual hardware migrations. DDL is not transactionally reversible.');
  fs.appendFileSync(path.join(output,'LIVE_DB_UPDATE.sql'),`\n-- Additive scheduling; no historical date conversions.\n${scheduling}\nINSERT INTO migration_history (migration_id,description) VALUES ('20261016_scheduling','Scoped scheduling, calendars and durable in-app reminders') ON DUPLICATE KEY UPDATE description=VALUES(description);\n\n-- Legacy chat schema compatibility; preserves all existing chat rows.\n${missedCallCompatibility}\n`);
  fs.writeFileSync(path.join(output,'DEPLOYMENT.md'),deployment+'\nScheduling: read SCHEDULING.md before enabling the feature flag. Verify /api/time, time zones, scoped calendar access and overlapping booking rejection. Keep server and database clocks synchronized through the host time service. Current automated reminders are in-app only; email/SMS scheduling jobs are not enabled.\n\nProduction upload paths: retain the existing external folders. Set PRIVATE_UPLOAD_ROOT to the live riana_private_file_uploads folder and LEGACY_UPLOAD_ROOT to the live riana_private_uploads folder (use the actual absolute cPanel paths). Do not place either folder under web_root or node_app. A 404 for /uploads/<file> means the historical file is absent from LEGACY_UPLOAD_ROOT or its database reference no longer matches; restore that exact file from the external upload backup rather than copying it into the public web root.\n');
  fs.copyFileSync(path.join(root,'docs/CLOUD_INVENTORY_PATCH.md'),path.join(output,'CHANGE_NOTES.md'));
  fs.copyFileSync(path.join(root,'docs/SERIAL_ASSIGNMENT_ACCESS.md'),path.join(output,'SERIAL_ASSIGNMENT_ACCESS.md'));
  fs.copyFileSync(path.join(root,'docs/HYBRID_EQUIPMENT.md'),path.join(output,'HYBRID_EQUIPMENT.md'));
  fs.copyFileSync(path.join(root,'docs/INVENTORY_OPERATIONS.md'),path.join(output,'INVENTORY_OPERATIONS.md'));
  fs.copyFileSync(path.join(root,'docs/RELEASE_QA_20261016.md'),path.join(output,'RELEASE_QA.md'));
  fs.copyFileSync(path.join(root,'docs/SCHEDULING.md'),path.join(output,'SCHEDULING.md'));
  inventory(output);
  if(files.some((f)=>/(^|\/)(uploads|private_uploads|backups|node_modules|\.env)(\/|$)/.test(f.path)))throw new Error('Runtime data entered the package.');
  fs.writeFileSync(path.join(output,'MANIFEST.json'),JSON.stringify({releaseId,createdAt:createdAt.toISOString(),timezone:'Africa/Nairobi',sqlFile:'LIVE_DB_UPDATE.sql',files},null,2)+'\n');
  const zip=output+'.zip';
  await new Promise((resolve,reject)=>{const stream=fs.createWriteStream(zip,{flags:'wx'});const archive=new ZipArchive({zlib:{level:9}});stream.on('close',resolve);stream.on('error',reject);archive.on('error',reject);archive.on('warning',reject);archive.pipe(stream);archive.directory(output,false);archive.finalize();});
  fs.writeFileSync(zip+'.sha256',`${hash(zip)}  ${path.basename(zip)}\n`);
  console.log(JSON.stringify({releaseId,directory:output,patch:zip,sql:path.join(output,'LIVE_DB_UPDATE.sql'),fileCount:files.length,uploadDirectoriesIncluded:false},null,2));
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
