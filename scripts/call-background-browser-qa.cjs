const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { prepareCallBackgroundAssets } = require('./call-background-assets.cjs');
const { securityHeaders } = require('../server/security/apiSecurity');

const root = path.resolve(__dirname, '..');
const artifactBase = path.resolve(process.env.RIANA_QA_ARTIFACTS || os.tmpdir());
fs.mkdirSync(artifactBase, { recursive: true });
const directory = fs.mkdtempSync(path.join(artifactBase, 'riana-background-browser-'));
const runtime = prepareCallBackgroundAssets(root);

async function run() {
  const entry = `
import { createCallVideoBackground, createRotatedVideoTrack } from ${JSON.stringify(path.join(root, 'src/utils/callVideoBackground.ts').replace(/\\/g, '/'))};
import { callBackgroundErrorMessage } from ${JSON.stringify(path.join(root, 'src/utils/callBackgroundError.ts').replace(/\\/g, '/'))};
let camera, processor, timer, first, second, sender, cameraNumber = 0;
const status = document.querySelector('#status');
const preview = document.querySelector('#preview');
const remote = document.querySelector('#remote');
const audio = new AudioContext();
const destination = audio.createMediaStreamDestination();
const oscillator = audio.createOscillator();
const gain = audio.createGain(); gain.gain.value = 0;
oscillator.connect(gain).connect(destination); oscillator.start();
const audioTrack = destination.stream.getAudioTracks()[0];
function capture() {
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
  const context = canvas.getContext('2d'); let frame = 0;
  const paint = () => { context.fillStyle = cameraNumber % 2 ? '#00a050' : '#1040d0'; context.fillRect(0,0,320,180); context.fillStyle = 'white'; context.fillRect((frame++ * 3) % 300,70,20,30); };
  paint(); timer = setInterval(paint, 40);
  camera = canvas.captureStream(25).getVideoTracks()[0];
}
capture();
const stream = new MediaStream([camera, audioTrack]); preview.srcObject = stream;
window.qa = { cameraState: () => camera.readyState, audioState: () => audioTrack.readyState, track: () => stream.getVideoTracks()[0].getSettings(), stats: async () => [...(await second.getStats()).values()].filter(s => s.type === 'inbound-rtp' && s.kind === 'video').map(s => ({ framesDecoded:s.framesDecoded, bytesReceived:s.bytesReceived })), pixel: () => { const c=document.createElement('canvas'); c.width=320;c.height=180;const x=c.getContext('2d');x.drawImage(preview,0,0,320,180);return [...x.getImageData(10,10,1,1).data]; } };
async function apply(effect, rotation=0) {
  const next = effect === 'none' ? (rotation ? await createRotatedVideoTrack(camera,rotation,true) : {track:camera,stop(){}}) : await createCallVideoBackground(camera,effect,rotation,true);
  if (sender) await sender.replaceTrack(next.track);
  const old = stream.getVideoTracks()[0]; stream.removeTrack(old); stream.addTrack(next.track);
  processor?.stop(); processor=next; preview.srcObject=new MediaStream(stream.getTracks());
}
async function connect() {
  first=new RTCPeerConnection(); second=new RTCPeerConnection();
  first.onicecandidate=event=>{if(event.candidate)second.addIceCandidate(event.candidate)};
  second.onicecandidate=event=>{if(event.candidate)first.addIceCandidate(event.candidate)};
  const received = new MediaStream();
  second.ontrack=event=>{received.addTrack(event.track);remote.srcObject=received};
  sender=first.addTrack(camera,stream);first.addTrack(audioTrack,stream);
  await first.setLocalDescription(await first.createOffer());await second.setRemoteDescription(first.localDescription);
  await second.setLocalDescription(await second.createAnswer());await first.setRemoteDescription(second.localDescription);
}
const custom='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#dd1144"/></svg>');
for (const [id,effect] of [['blur','blur'],['preset','riana-office'],['custom',custom],['off','none']]) document.querySelector('#'+id).onclick=async()=>{status.textContent='loading';try{await apply(effect);status.textContent=id+' ready'}catch(error){status.textContent=callBackgroundErrorMessage(error)}};
document.querySelector('#rotate').onclick=async()=>{status.textContent='loading';try{await apply('blur',90);status.textContent='rotate ready'}catch(error){status.textContent=callBackgroundErrorMessage(error)}};
document.querySelector('#switch').onclick=async()=>{status.textContent='loading';try{const previous=camera;clearInterval(timer);cameraNumber++;capture();await apply('blur');previous.stop();status.textContent='switch ready'}catch(error){status.textContent=callBackgroundErrorMessage(error)}};
window.qa.stop=()=>{processor?.stop();camera.stop();audioTrack.stop();clearInterval(timer);first?.close();second?.close();oscillator.stop();audio.close();status.textContent='stopped'};
connect().then(()=>{status.textContent='camera ready'}).catch(error=>{status.textContent=error.message});
`;
  fs.writeFileSync(path.join(directory, 'entry.js'), entry);
  fs.writeFileSync(path.join(directory, 'index.html'), `<!doctype html><html><head><title>RIANA background pipeline QA</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font:16px system-ui;background:#101c28;color:white;margin:0;padding:16px}main{max-width:900px;margin:auto}section{display:flex;flex-wrap:wrap;gap:12px}video{width:100%;aspect-ratio:16/9;background:#000}figure{flex:1 1 280px;margin:0;min-width:0}button{min-height:44px;padding:10px;margin:4px}#status{min-height:48px}</style></head><body><main><h1>Background pipeline verification</h1><p>Synthetic camera and silent audio; no account or physical device.</p><section><figure><video id="preview" autoplay muted playsinline></video><figcaption>Local processed video</figcaption></figure><figure><video id="remote" autoplay muted playsinline></video><figcaption>Loopback WebRTC receiver</figcaption></figure></section><p id="status">initializing</p><section>${['blur','preset','custom','off','rotate','switch'].map(id=>`<button id="${id}">${id}</button>`).join('')}</section></main><script type="module" src="/entry.js"></script></body></html>`);
  const { build } = await import('vite');
  await build({ configFile: false, root: directory, publicDir: false, logLevel: 'error', define: { 'import.meta.env.CALL_BACKGROUND_ASSET_PATH': JSON.stringify(runtime.assetPath) }, build: { outDir: path.join(directory, 'dist') } });
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.json': 'application/json', '.tflite': 'application/octet-stream' };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    securityHeaders({ path: url.pathname }, res, () => {});
    if (url.pathname === '/favicon.ico') { res.writeHead(204).end();return; }
    if (url.searchParams.has('blocked')) res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:");
    let relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const base = /^(mediapipe|models|call-backgrounds)\//.test(relative) ? path.join(root, 'public') : path.join(directory, 'dist');
    const target = path.resolve(base, relative);
    if (!target.startsWith(base + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404).end();return; }
    res.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream');
    fs.createReadStream(target).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
    const url = `http://127.0.0.1:${server.address().port}`;
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const consoleErrors = []; page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    const response = await page.goto(url);
    assert.equal(response.status(), 200);
    assert.equal(await page.title(), 'RIANA background pipeline QA');
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'camera ready' && document.querySelector('#remote').readyState >= 2);
    for (const id of ['blur', 'preset', 'custom', 'off', 'rotate', 'switch']) {
      const before = await page.evaluate(() => window.qa.stats().then(rows => rows[0]?.framesDecoded || 0));
      await page.locator('#'+id).click();
      await page.waitForFunction(id => document.querySelector('#status').textContent === id+' ready', id, { timeout: 60000 });
      await page.waitForFunction(before => window.qa.stats().then(rows=>rows.some(row=>row.framesDecoded>before+2)), before);
      assert.equal(await page.evaluate(() => window.qa.cameraState()), 'live');
      assert.equal(await page.evaluate(() => window.qa.audioState()), 'live');
      if (id === 'custom') {
        await page.waitForFunction(() => window.qa.pixel()[0] > 170 && window.qa.pixel()[1] < 70, undefined, { timeout: 15000 });
        await page.screenshot({ path: path.join(directory, 'custom-desktop.png') });
      }
      if (id === 'rotate') assert.equal(await page.evaluate(() => window.qa.track().width < window.qa.track().height), true);
      console.log(JSON.stringify({ interaction: id, passed: true }));
    }
    assert.deepEqual(errors, []);
    const expectedSdkMessages = consoleErrors.filter(message => message === 'INFO: Created TensorFlow Lite XNNPACK delegate for CPU.' || (message.includes('https://odml.pa.googleapis.com/v1/log') && /content security policy/i.test(message)));
    assert.deepEqual(consoleErrors.filter(message => !expectedSdkMessages.includes(message)), []);
    console.log(JSON.stringify({ appConsoleErrors: 0, explainedSdkMessages: expectedSdkMessages.length, note: 'SDK CPU initialization logs and blocked optional telemetry; connect-src remains self-only.' }));
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(directory, 'mobile.png') });
    await page.evaluate(() => window.qa.stop());
    await page.goto(url+'/?blocked');
    await page.locator('#blur').click();
    await page.waitForFunction(() => /site security policy/.test(document.querySelector('#status').textContent));
    assert.equal(await page.evaluate(() => window.qa.cameraState()), 'live');
    assert.equal(await page.evaluate(() => window.qa.audioState()), 'live');
    await page.screenshot({ path: path.join(directory, 'blocked-policy.png') });
    await page.evaluate(() => window.qa.stop());
    console.log(JSON.stringify({ blockedPolicyFallback: 'passed', evidence: directory, runtimeRevision: runtime.revision }));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}
run().catch(error => { console.error(error); console.error(`Evidence directory: ${directory}`); process.exitCode=1; });
