const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function prepareCallBackgroundAssets(root) {
  const sdk = path.join(root, 'node_modules/@mediapipe/tasks-vision');
  const names = ['vision_wasm_internal.js', 'vision_wasm_internal.wasm'];
  const assets = names.map((name) => ({ name, bytes: fs.readFileSync(path.join(sdk, 'wasm', name)) }));
  assets.push({ name: 'selfie_segmenter_landscape.tflite', bytes: fs.readFileSync(path.join(root, 'public/models/selfie_segmenter_landscape.tflite')) });
  const hash = createHash('sha256').update(fs.readFileSync(path.join(sdk, 'vision_bundle.mjs')));
  for (const asset of assets) hash.update(asset.name).update(asset.bytes);
  const revision = hash.digest('hex').slice(0, 20);
  const assetPath = `mediapipe/wasm/runtime-${revision}`;
  const destination = path.join(root, 'public', assetPath);
  fs.mkdirSync(destination, { recursive: true });
  for (const asset of assets) {
    const target = path.join(destination, asset.name);
    if (!fs.existsSync(target) || !fs.readFileSync(target).equals(asset.bytes)) fs.writeFileSync(target, asset.bytes);
  }
  // Keep legacy URLs current for existing clients; new bundles use the immutable namespace.
  for (const asset of assets.filter(({ name }) => name.endsWith('.js') || name.endsWith('.wasm'))) {
    fs.writeFileSync(path.join(root, 'public/mediapipe/wasm', asset.name), asset.bytes);
  }
  const manifest = { revision, assetPath, files: assets.map(({ name, bytes }) => ({ name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })) };
  fs.writeFileSync(path.join(root, 'public/call-background-runtime.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

module.exports = { prepareCallBackgroundAssets };
