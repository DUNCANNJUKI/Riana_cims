const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepareCallBackgroundAssets } = require('./call-background-assets.cjs');

test('runtime and model updates receive separate immutable URLs and replace stale legacy files', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'riana-background-assets-'));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('riana-background-assets-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const sdk = path.join(root, 'node_modules/@mediapipe/tasks-vision');
  fs.mkdirSync(path.join(sdk, 'wasm'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/models'), { recursive: true });
  fs.writeFileSync(path.join(sdk, 'vision_bundle.mjs'), 'export const version = 1');
  for (const name of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm']) fs.writeFileSync(path.join(sdk, 'wasm', name), `original ${name}`);
  const model = path.join(root, 'public/models/selfie_segmenter_landscape.tflite');
  fs.writeFileSync(model, 'model one');
  const first = prepareCallBackgroundAssets(root);
  assert.deepEqual(prepareCallBackgroundAssets(root), first);
  fs.writeFileSync(path.join(sdk, 'wasm/vision_wasm_internal.js'), 'runtime two');
  const second = prepareCallBackgroundAssets(root);
  assert.notEqual(first.assetPath, second.assetPath);
  assert.equal(fs.readFileSync(path.join(root, 'public', first.assetPath, 'vision_wasm_internal.js'), 'utf8'), 'original vision_wasm_internal.js');
  assert.equal(fs.readFileSync(path.join(root, 'public/mediapipe/wasm/vision_wasm_internal.js'), 'utf8'), 'runtime two');
  fs.writeFileSync(model, 'model two');
  assert.notEqual(prepareCallBackgroundAssets(root).assetPath, second.assetPath);
});
