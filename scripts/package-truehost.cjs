const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ZipArchive } = require('archiver');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'Truehost');
const output = path.join(root, 'Truehost-packages');

const assertInsideRoot = (target) => {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe package output path: ${target}`);
  }
};

const requireFile = (relative) => {
  const target = path.join(source, relative);
  if (!fs.statSync(target, { throwIfNoEntry: false })?.isFile()) throw new Error(`Truehost package input is missing: ${relative}`);
  return target;
};

const requireDirectory = (relative) => {
  const target = path.join(source, relative);
  if (!fs.statSync(target, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`Truehost package input is missing: ${relative}`);
  return target;
};

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const zipDirectory = (directory, destination) => new Promise((resolve, reject) => {
  const stream = fs.createWriteStream(destination, { flags: 'wx' });
  const archive = new ZipArchive({ zlib: { level: 9 } });
  stream.on('close', resolve);
  stream.on('error', reject);
  archive.on('warning', reject);
  archive.on('error', reject);
  archive.pipe(stream);
  archive.directory(directory, false);
  archive.finalize();
});

async function run() {
  assertInsideRoot(output);
  requireFile('BUILD_INFO.json');
  const environment = fs.readFileSync(requireFile('app/.env.example'), 'utf8');
  if (!environment.includes('SMTP_HOST=mail.rianacims.name.ng') || environment.includes('BREVO_')) {
    throw new Error('Refusing to package stale email-provider configuration.');
  }

  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });

  const archives = [
    ['domain_root.zip', requireDirectory('domain_root')],
    ['public_html.zip', requireDirectory('public_html')],
    ['node_app.zip', requireDirectory('app')],
    ['database_private.zip', requireDirectory('database')],
  ];
  for (const [name, directory] of archives) await zipDirectory(directory, path.join(output, name));

  const metadata = ['BUILD_INFO.json', 'FILE_MANIFEST.sha256', 'TRUEHOST_DEPLOYMENT.md'];
  for (const name of metadata) fs.copyFileSync(requireFile(name), path.join(output, name));

  const packagedFiles = [...archives.map(([name]) => name), ...metadata];
  const checksums = packagedFiles.map((name) => `${sha256(path.join(output, name))}  ${name}`).join('\n');
  fs.writeFileSync(path.join(output, 'PACKAGE_SHA256.txt'), `${checksums}\n`, 'utf8');

  console.log(JSON.stringify({
    output,
    archives: Object.fromEntries(archives.map(([name]) => [name, fs.statSync(path.join(output, name)).size])),
    checksumEntries: packagedFiles.length,
  }, null, 2));
}

run().catch((error) => {
  console.error(`Truehost archive packaging failed: ${error.message}`);
  process.exitCode = 1;
});
