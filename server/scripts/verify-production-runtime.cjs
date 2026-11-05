const http = require('node:http');

const expectedRelease = String(process.env.APP_RELEASE || '').trim();
if (!/^[a-f0-9]{40}$/i.test(expectedRelease)) {
  throw new Error('APP_RELEASE must contain the deployed Git commit SHA.');
}

const request = (pathname, onResponse) => new Promise((resolve, reject) => {
  const req = http.get({ hostname: '127.0.0.1', port: 8081, path: pathname, timeout: 5000 }, (res) => {
    onResponse(res).then(resolve, reject);
  });
  req.on('timeout', () => req.destroy(new Error(`${pathname} timed out.`)));
  req.on('error', reject);
});

const readJson = async (res) => {
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  let health;
  let lastHealthError = 'health endpoint did not report the expected release';
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      health = await request('/api/health', async (res) => ({ status: res.statusCode, body: await readJson(res) }));
      if (health.status === 200 && health.body.status === 'ok' && health.body.release === expectedRelease) break;
      lastHealthError = `HTTP ${health.status}, release ${health.body.release || 'missing'}`;
      health = null;
    } catch (error) {
      lastHealthError = error.message;
    }
    if (attempt < 14) await pause(2000);
  }
  if (!health) throw new Error(`API health/release check failed: ${lastHealthError}.`);

  const icon = await request('/api/public/company-pwa-icon/192.png', async (res) => {
    const chunks = [];
    for await (const chunk of res) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    return { status: res.statusCode, type: String(res.headers['content-type'] || '').split(';')[0], signature: buffer.subarray(0, 8) };
  });
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (icon.status !== 200 || icon.type !== 'image/png' || !icon.signature.equals(pngSignature)) {
    throw new Error(`Public PWA icon check failed: HTTP ${icon.status}, type ${icon.type || 'missing'}.`);
  }

  console.log(JSON.stringify({ api: 'healthy', release: health.body.release, pwaIcon: 'valid PNG' }));
}

run().catch((error) => {
  console.error(`Production runtime verification failed: ${error.message}`);
  process.exitCode = 1;
});
