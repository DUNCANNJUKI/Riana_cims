const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function permitsWebAssembly(header) {
  if (!header) return false;
  return header.split(',').every((policy) => {
    const directives = policy.split(';').map((part) => part.trim().split(/\s+/));
    const scripts = directives.find(([name]) => name === 'script-src') || directives.find(([name]) => name === 'default-src');
    return scripts?.includes("'wasm-unsafe-eval'") && !scripts.includes("'unsafe-eval'");
  });
}

function validAsset(file, bytes, type) {
  if (bytes.length !== file.size || createHash('sha256').update(bytes).digest('hex') !== file.sha256) return false;
  if (file.name.endsWith('.wasm')) return type === 'application/wasm' && bytes.subarray(0, 8).equals(Buffer.from('0061736d01000000', 'hex'));
  if (file.name.endsWith('.tflite')) return bytes.subarray(4, 8).toString() === 'TFL3';
  return ['application/javascript', 'text/javascript'].includes(type) && !/^\s*</.test(bytes.toString('utf8', 0, 100));
}

async function verifyCommunicationRuntime(origin, expectedRelease, expectedManifest) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) throw new Error('HTTPS origin required');
  const checks = [];
  const get = (pathname) => fetch(new URL(pathname, base.origin), { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(45000) });
  const check = async (name, action) => {
    try { checks.push({ check: name, ok: Boolean(await action()) }); }
    catch { checks.push({ check: name, ok: false }); }
  };
  await check('document_webassembly_policy', async () => {
    const response = await get('/');
    const ok = response.ok && permitsWebAssembly(response.headers.get('content-security-policy'));
    await response.body?.cancel();
    return ok;
  });
  await check('api_release', async () => {
    const response = await get('/api/health');
    const body = await response.json();
    return response.ok && body.status === 'ok' && (!expectedRelease || body.release === expectedRelease);
  });
  let manifest;
  await check('runtime_manifest', async () => {
    const response = await get('/call-background-runtime.json');
    const value = await response.json();
    const names = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'selfie_segmenter_landscape.tflite'];
    if (!response.ok || !/^[a-f0-9]{20}$/.test(value.revision) || value.assetPath !== `mediapipe/wasm/runtime-${value.revision}` || !Array.isArray(value.files) || value.files.length !== names.length) return false;
    if (!names.every((name) => value.files.some((file) => file.name === name && Number.isSafeInteger(file.size) && file.size > 0 && file.size < 32 * 1024 * 1024 && /^[a-f0-9]{64}$/.test(file.sha256)))) return false;
    if (expectedManifest && JSON.stringify(value) !== JSON.stringify(expectedManifest)) return false;
    manifest = value;
    return true;
  });
  if (manifest) {
    await Promise.all(manifest.files.map((file) => check(file.name, async () => {
      const response = await get(`/${manifest.assetPath}/${file.name}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      return response.ok && validAsset(file, bytes, String(response.headers.get('content-type') || '').split(';')[0]);
    })));
  }
  return { ready: checks.every(({ ok }) => ok), origin: base.origin, checks };
}

if (require.main === module) {
  Promise.resolve().then(async () => {
    const args = process.argv.slice(2);
    if (![2, 4].includes(args.length) || args[0] !== '--origin' || (args.length === 4 && (args[2] !== '--release' || !/^[a-f0-9]{40}$/i.test(args[3])))) throw new Error('invalid arguments');
    const manifestFile = path.join(__dirname, '../../dist/call-background-runtime.json');
    const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : undefined;
    const result = await verifyCommunicationRuntime(args[1], args[3], manifest);
    console.log(JSON.stringify(result, null, 2));
    if (!result.ready) process.exitCode = 1;
  }).catch(() => {
    console.error('Communication runtime verification could not complete. Check the origin, release and connectivity.');
    process.exitCode = 1;
  });
}

module.exports = { permitsWebAssembly, validAsset, verifyCommunicationRuntime };
