const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const http = require('node:http');
const { permitsWebAssembly, validAsset, verifyCommunicationRuntime } = require('../scripts/verify-communication-runtime.cjs');

test('every enforced policy must narrowly permit WebAssembly', () => {
  assert.equal(permitsWebAssembly("default-src 'self'; script-src 'self' 'wasm-unsafe-eval'"), true);
  assert.equal(permitsWebAssembly("default-src 'self' 'wasm-unsafe-eval'"), true);
  for (const policy of [null, "script-src 'self'", "script-src 'self' 'unsafe-eval'", "script-src 'self' 'wasm-unsafe-eval', script-src 'self'", "default-src 'self' 'wasm-unsafe-eval'; script-src 'self'"]) assert.equal(permitsWebAssembly(policy), false);
});

test('runtime validation rejects HTML fallbacks, wrong MIME types and mismatched versions', () => {
  const bytes = Buffer.from('0061736d01000000', 'hex');
  const file = { name: 'runtime.wasm', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  assert.equal(validAsset(file, bytes, 'application/wasm'), true);
  assert.equal(validAsset(file, bytes, 'text/html'), false);
  assert.equal(validAsset(file, Buffer.from('<html>fallback</html>'), 'application/wasm'), false);
  assert.equal(validAsset(file, Buffer.alloc(bytes.length), 'application/wasm'), false);
});

test('public release verification rejects proxy CSP, stale releases and corrupt assets over HTTP', async (t) => {
  const release = 'a'.repeat(40);
  const revision = 'b'.repeat(20);
  const files = new Map([
    ['vision_wasm_internal.js', Buffer.from('console.log("runtime")')],
    ['vision_wasm_internal.wasm', Buffer.from('0061736d01000000', 'hex')],
    ['selfie_segmenter_landscape.tflite', Buffer.from('0000000054464c33', 'hex')],
  ]);
  const manifest = { revision, assetPath: `mediapipe/wasm/runtime-${revision}`, files: [...files].map(([name, bytes]) => ({ name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })) };
  let mode = 'ready';
  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.setHeader('Content-Security-Policy', mode === 'proxy' ? ["script-src 'self' 'wasm-unsafe-eval'", "script-src 'self'"] : "script-src 'self' 'wasm-unsafe-eval'");
      res.end('<html>release</html>');
    } else if (req.url === '/api/health') {
      res.end(JSON.stringify({ status: 'ok', release: mode === 'stale' ? 'unversioned' : release }));
    } else if (req.url === '/call-background-runtime.json') {
      res.end(JSON.stringify(manifest));
    } else {
      const name = req.url.split('/').at(-1);
      const bytes = files.get(name);
      if (!bytes) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', name.endsWith('.js') ? 'application/javascript' : name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
      res.end(mode === 'corrupt' ? Buffer.from('<html>fallback</html>') : bytes);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await verifyCommunicationRuntime(origin, release, manifest)).ready, true);
  for (const failure of ['proxy', 'stale', 'corrupt']) {
    mode = failure;
    assert.equal((await verifyCommunicationRuntime(origin, release, manifest)).ready, false, failure);
  }
});
