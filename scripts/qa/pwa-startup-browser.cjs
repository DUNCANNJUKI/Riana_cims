const assert = require('node:assert/strict');
const { mkdtemp } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { chromium } = require('playwright');

// Startup uses system fonts and the held module can keep document.fonts.ready pending.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';

const shell = '#riana-startup';
const entry = /\/(?:src\/main\.tsx|assets\/index-[^/]+\.js)(?:\?.*)?$/;
const colors = { light: 'rgb(239, 247, 250)', dark: 'rgb(16, 29, 41)' };

async function assertLoader(page, selector, theme) {
  const loader = page.locator(selector);
  await loader.waitFor();
  return loader.evaluate(async (element, background) => {
    const mark = element.querySelector('img');
    await mark.decode();
    const logo = mark.getBoundingClientRect();
    return {
      logoCentered: Math.abs(logo.x + logo.width / 2 - innerWidth / 2) < 4
        && Math.abs(logo.y + logo.height / 2 - innerHeight / 2) < 4,
      backgroundMatches: getComputedStyle(element).backgroundColor === background,
      progressWidth: element.querySelector('[role="progressbar"]').getBoundingClientRect().width,
      animation: getComputedStyle(mark).animationName,
    };
  }, colors[theme]);
}

async function inspectStartup(browser, url, label, screenshots) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block',
  });
  await context.addInitScript(() => {
    if (!localStorage.getItem('theme')) localStorage.setItem('theme', 'dark');
    window.startupPhases = [];
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains('riana-loader')) {
            window.startupPhases.push(node.id || 'react');
            if (!node.id) window.startupReactArtwork = node.cloneNode(true);
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  let resume;
  const gate = new Promise(resolve => { resume = resolve; });
  await page.route(entry, async route => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto(url, { waitUntil: 'commit' });
    assert.deepEqual(await assertLoader(page, shell, 'dark'), {
      logoCentered: true, backgroundMatches: true, progressWidth: 180, animation: 'none',
    });
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#101d29');
    const markSource = await page.locator(`${shell} img`).getAttribute('src');
    assert.ok(await page.locator(`${shell} img`).evaluate(img => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(img, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      return data.some((red, index) => index % 4 === 0 && data[index + 3] > 240 && data[index + 2] - red > 80);
    }), 'Startup mark must contain the original cyan artwork');
    await page.screenshot({ path: join(screenshots, `${label}-mobile-dark.png`) });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const light = await assertLoader(page, shell, 'light');
    assert.equal(light.logoCentered, true);
    assert.equal(light.backgroundMatches, true);
    assert.equal(light.animation, 'riana-startup-turn');
    await page.screenshot({ path: join(screenshots, `${label}-desktop-light.png`) });
    await page.evaluate(() => localStorage.setItem('theme', 'light'));
    resume();
    await page.locator(shell).waitFor({ state: 'detached' });
    await page.locator('input[type="email"]').waitFor();
    assert.match(await page.title(), /RIANA/);
    assert.ok(await page.evaluate(() => window.startupPhases.includes('react')), 'React loader should take over the document splash');
    assert.deepEqual(errors, []);
    const reactArtwork = await page.evaluate(() => {
      const artwork = window.startupReactArtwork;
      artwork.id = 'riana-startup-qa';
      document.body.append(artwork);
      return { mark: artwork.querySelector('img').src, nodes: artwork.querySelectorAll('svg circle').length };
    });
    assert.equal(reactArtwork.mark, markSource);
    assert.equal(reactArtwork.nodes, 10);
    assert.equal((await assertLoader(page, '#riana-startup-qa', 'light')).logoCentered, true);
    await page.screenshot({ path: join(screenshots, `${label}-react-light.png`) });
    await page.locator('#riana-startup-qa').evaluate(artwork => artwork.remove());

    await page.reload();
    await page.locator('input[type="email"]').waitFor();
    assert.equal(await page.locator('html').getAttribute('class') || '', '');

    await page.unroute(entry);
    await page.route(entry, route => route.abort());
    await page.reload();
    await page.getByRole('status').filter({ hasText: 'could not start' }).waitFor();
    await page.unroute(entry);
    await page.getByRole('button', { name: 'Retry startup' }).click();
    await page.locator('input[type="email"]').waitFor();
    console.log(`${label}: cold and warm startup, theme, reduced motion, bundle failure and retry passed`);
  } finally {
    resume();
    await context.close();
  }
}

async function inspectPwa(url) {
  const profile = await mkdtemp(join(tmpdir(), 'riana-pwa-profile-'));
  const context = await chromium.launchPersistentContext(profile, { channel: 'chrome', headless: true });
  try {
    const page = await context.newPage();
    await page.goto(url);
    await page.locator('input[type="email"]').waitFor();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    assert.deepEqual(installabilityErrors, []);
    let installed = false;
    try {
      await cdp.send('PWA.install', { manifestId: url, installUrlOrBundleUrl: url });
      installed = true;
      console.log('production: Chrome registered the PWA in a fresh test profile');
    } catch (error) {
      console.log(`Chrome install command unavailable: ${error.message}`);
    }
    const result = await page.evaluate(async () => {
      const manifest = await (await fetch('/manifest.webmanifest')).json();
      const files = [...manifest.icons.map(icon => icon.src), '/pwa/startup.js'];
      return {
        colors: [manifest.background_color, manifest.theme_color],
        icons: manifest.icons.map(icon => [icon.sizes, icon.purpose]),
        cached: await Promise.all(files.map(async file => Boolean(await caches.match(file, { ignoreSearch: true })))),
      };
    });
    assert.deepEqual(result.colors, ['#eff7fa', '#eff7fa']);
    assert.deepEqual(result.icons, [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]);
    // Workbox stores revisioned URLs in precache.
    assert.ok(result.cached.every(Boolean));
    await page.evaluate(() => localStorage.setItem('theme', 'dark'));
    await context.setOffline(true);
    if (installed) {
      const [appPage] = await Promise.all([
        context.waitForEvent('page', { timeout: 15000 }),
        cdp.send('PWA.launch', { manifestId: url }),
      ]);
      await appPage.locator('input[type="email"]').waitFor();
      assert.match(await appPage.locator('html').getAttribute('class') || '', /dark/);
      await appPage.close();
      console.log('production: installed Chrome PWA launched offline in dark theme');
    }
    await page.close();
    const offline = await context.newPage();
    await offline.goto(url);
    await offline.locator('input[type="email"]').waitFor();
    assert.match(await offline.locator('html').getAttribute('class') || '', /dark/);
    assert.ok(await offline.evaluate(() => Boolean(navigator.serviceWorker.controller)));
    console.log('production: fresh Chromium installability, precache and offline cold startup passed');
  } finally {
    await context.close();
  }
}

async function run() {
  const [dev, prod] = process.argv.slice(2);
  assert.ok(dev && prod, 'Usage: node scripts/qa/pwa-startup-browser.cjs <dev-url> <built-preview-url>');
  const screenshots = await mkdtemp(join(tmpdir(), 'riana-startup-'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    await inspectStartup(browser, dev, 'dev', screenshots);
    await inspectStartup(browser, prod, 'production', screenshots);
    await inspectPwa(prod);
    console.log(`Screenshots: ${screenshots}`);
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
