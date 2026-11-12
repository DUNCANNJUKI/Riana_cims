const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const bash = process.platform === 'win32'
  ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
  : 'bash';
const shellPath = (value) => value.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`);
const quote = (value) => `'${value.replace(/'/g, `'"'"'`)}'`;
const release = 'a'.repeat(40);

function simulate(t, failure = '', options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'riana-deploy-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const trace = path.join(directory, 'trace');
  const script = `
    export DEPLOY_APP_DIR=${quote(shellPath(directory))}
    export DEPLOY_PM2_BIN=pm2 DEPLOY_PM2_MODE=${quote(options.mode || 'user')}
    export TRACE=${quote(shellPath(trace))} FAIL_STAGE=${quote(failure)}
    npm() { echo install >> "$TRACE"; [[ "$FAIL_STAGE" != install ]]; }
    node() {
      case "$1" in
        *verify-backup*) stage=backup ;;
        *apply-communication*) stage=migrate; [[ "$COMMUNICATION_MIGRATION_BACKUP_VERIFIED" == true ]] || return 19 ;;
        *verify-passkey-readiness*) stage=passkeys; [[ "$NODE_ENV" == production ]] || return 23 ;;
        *verify-production-runtime*) stage=health; [[ "$APP_RELEASE" == ${quote(release)} ]] || return 20 ;;
        *) return 21 ;;
      esac
      echo "$stage" >> "$TRACE"
      [[ "$FAIL_STAGE" != "$stage" ]]
    }
    pm2() {
      echo "pm2 $*" >> "$TRACE"
      if [[ "$1" == describe ]]; then return ${options.absent ? '1' : '0'}; fi
      [[ "$FAIL_STAGE" != "$1" ]]
    }
    id() { [[ "$1" == -u ]] || return 24; echo ${options.rootLogin ? '0' : '1000'}; }
    sudo() { ${options.rootLogin ? 'return 25;' : '[[ "$1" == -n ]] || return 22; shift; "$@";'} }
    source ${quote(shellPath(path.join(root, 'server/scripts/deploy-production.sh')))} ${quote(options.release || release)}
  `;
  const result = spawnSync(bash, ['--noprofile', '--norc', '-c', script], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  return {
    ...result,
    steps: fs.existsSync(trace) ? fs.readFileSync(trace, 'utf8').trim().split(/\r?\n/) : [],
    marker: fs.existsSync(path.join(directory, '.runtime', 'app-release'))
      ? fs.readFileSync(path.join(directory, '.runtime', 'app-release'), 'utf8').trim() : null,
  };
}

test('deployment requires a commit identity before touching dependencies or data', (t) => {
  const result = simulate(t, '', { release: 'production' });
  assert.notEqual(result.status, 0);
  assert.deepEqual(result.steps, []);
});

for (const stage of ['install', 'backup', 'migrate', 'passkeys', 'restart', 'health', 'save']) {
  test(`deployment stops on ${stage} failure and never claims success`, (t) => {
    const result = simulate(t, stage);
    assert.notEqual(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /Deployment verified/);
    if (stage === 'install') assert.deepEqual(result.steps, ['install']);
    if (stage === 'backup') assert.deepEqual(result.steps, ['install', 'backup']);
    if (stage === 'migrate') assert.deepEqual(result.steps, ['install', 'backup', 'migrate']);
    if (stage === 'passkeys') {
      assert.deepEqual(result.steps, ['install', 'backup', 'migrate', 'passkeys']);
      assert.equal(result.marker, null);
    }
    if (stage === 'restart') assert.ok(!result.steps.includes('health'));
    if (stage === 'health') assert.ok(!result.steps.some((step) => step.startsWith('pm2 save')));
    assert.ok(!result.steps.some((step) => step.startsWith('pm2 start ')));
  });
}

for (const mode of ['root', 'user']) {
  test(`deployment uses one ${mode} PM2 owner and verifies before saving`, (t) => {
    const result = simulate(t, '', { mode });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.steps, [
      'install', 'backup', 'migrate', 'passkeys', 'pm2 describe riana-cims',
      'pm2 restart ecosystem.config.cjs --only riana-cims --env production --update-env',
      'health', 'pm2 save',
    ]);
    assert.equal(result.marker, release);
    assert.match(result.stdout, /Deployment verified/);
  });
}

test('deployment starts an absent managed API without an unmanaged listener fallback', (t) => {
  const result = simulate(t, '', { absent: true });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.steps.includes('pm2 start ecosystem.config.cjs --only riana-cims --env production'));
  assert.ok(!result.steps.some((step) => step.startsWith('pm2 restart ')));
});

test('deployment logged in as root invokes the existing PM2 owner without sudo', (t) => {
  const result = simulate(t, '', { mode: 'root', rootLogin: true });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.steps.includes('pm2 restart ecosystem.config.cjs --only riana-cims --env production --update-env'));
});

test('production release marker reaches ecosystem configuration without sudo environment propagation', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'riana-ecosystem-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.copyFileSync(path.join(root, 'ecosystem.config.cjs'), path.join(directory, 'ecosystem.config.cjs'));
  fs.mkdirSync(path.join(directory, '.runtime'));
  fs.writeFileSync(path.join(directory, '.runtime', 'app-release'), `${release}\n`);
  const config = require(path.join(directory, 'ecosystem.config.cjs'));
  assert.equal(config.apps.find((app) => app.name === 'riana-cims').env_production.APP_RELEASE, release);
});

test('API manifest declares every external production import', () => {
  const { isBuiltin } = require('node:module');
  const declared = require('../server/package.json').dependencies;
  const missing = new Set();
  function scan(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'tmp', 'backups', 'uploads', 'private_uploads', '.runtime', 'tests'].includes(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(absolute);
      else if (/\.(?:c?js|mjs)$/.test(entry.name) && !entry.name.includes('.test.')) {
        for (const match of fs.readFileSync(absolute, 'utf8').matchAll(/(?:require\(|import\()\s*['"]([^.'"][^'"]*)/g)) {
          const imported = match[1];
          const packageName = imported.startsWith('@') ? imported.split('/').slice(0, 2).join('/') : imported.split('/')[0];
          if (!isBuiltin(imported) && !declared[packageName]) missing.add(packageName);
        }
      }
    }
  }
  scan(path.join(root, 'server'));
  assert.deepEqual([...missing].sort(), []);
});
