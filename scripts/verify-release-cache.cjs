const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('**/cache-qa-check', (route) => route.fulfill({
      contentType:'text/html',body:'<!doctype html><title>Cache QA</title><h1>Cache release validation</h1>',
    }));
    await page.goto('http://localhost:8090/cache-qa-check');
    const result = await page.evaluate(async () => {
      await caches.open('riana-test-stale');
      await caches.open('workbox-precache-test-stale');
      await caches.open('unrelated-cache-test');
      localStorage.setItem('qa-session-sentinel','preserved');
      localStorage.setItem('riana-app-cache-release','previous-release');
      const {clearReleaseCaches} = await import('/src/utils/releaseCache.ts');
      const first = await clearReleaseCaches();
      const keys = await caches.keys();
      const second = await clearReleaseCaches();
      return {
        firstCleanup:first,secondCleanup:second,
        staleRianaRemoved:!keys.includes('riana-test-stale'),
        staleWorkboxRemoved:!keys.includes('workbox-precache-test-stale'),
        unrelatedRetained:keys.includes('unrelated-cache-test'),
        storageRetained:localStorage.getItem('qa-session-sentinel')==='preserved',
        release:localStorage.getItem('riana-app-cache-release'),
      };
    });
    assert.equal(result.firstCleanup,true);
    assert.equal(result.secondCleanup,false);
    for(const key of ['staleRianaRemoved','staleWorkboxRemoved','unrelatedRetained','storageRetained'])assert.equal(result[key],true,key);
      assert.equal(result.release,'scheduling-20261016-4');
    console.log(JSON.stringify({isolatedBrowserContext:true,...result},null,2));
  } finally { await browser.close(); }
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
