const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const surfaces = require('./responsiveness-surfaces.json');
const fixtures = require('./responsiveness-fixtures.cjs');

const origin = process.env.RESPONSIVE_QA_ORIGIN || 'http://127.0.0.1:8090';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) throw new Error('The fixture harness must target localhost.');
const phase = process.argv.find(a => a.startsWith('--phase='))?.split('=')[1] || 'after';
const requested = process.argv.find(a => a.startsWith('--surfaces='))?.split('=')[1]?.split(',');
const widths = (process.argv.find(a => a.startsWith('--widths='))?.split('=')[1] || '320,360,375,390,414,430,600,768,820,1024,1280,1366,1440,1920').split(',').map(Number);
const selected = surfaces.filter(s => !requested || requested.includes(s.id));
const fixtureState = process.argv.find(a => a.startsWith('--state='))?.split('=')[1] || 'populated';
const tabWidths = (process.argv.find(a => a.startsWith('--tab-widths='))?.split('=')[1] || '320').split(',').map(Number);
const checkInteractions = process.argv.includes('--interactions');
const output = path.resolve('docs/evidence/responsiveness-20261121', phase);
fs.mkdirSync(output, { recursive: true });
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>RIANA CIMS responsive audit fixtures</title></head><body><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/scripts/qa/responsiveness-harness.tsx"></script></body></html>';

async function inspect(page) {
  return page.evaluate(() => {
    const width = innerWidth;
    const visible = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const clippedByScrollParent = e => {
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (['auto','scroll'].includes(s.overflowX)) return true;
      }
      return false;
    };
    const escaped = [...document.querySelectorAll('button,input,select,textarea,h1,h2,h3,[role="tablist"],[role="dialog"],[role="alertdialog"]')]
      .filter(visible).filter(e => { const r = e.getBoundingClientRect(); return (r.x < -1 || r.right > width + 1) && !clippedByScrollParent(e); })
      .slice(0,12).map(e => ({ tag: e.tagName, text: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0,90), class: typeof e.className === 'string' ? e.className : '', x: Math.round(e.getBoundingClientRect().x), right: Math.round(e.getBoundingClientRect().right) }));
    const dialogs = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].filter(visible).map(e => { const r=e.getBoundingClientRect();return { top:r.top, bottom:r.bottom, width:r.width, fits:r.top>=-1&&r.bottom<=innerHeight+1, scrollable:e.scrollHeight>e.clientHeight, scrollHeight:e.scrollHeight }; });
    const main = document.querySelector('main.cims-content');
    const mobileCellOverflow = [...document.querySelectorAll('[data-mobile-layout="cards"] table')]
      .filter(table => getComputedStyle(table).display === 'block')
      .flatMap(table => [...table.querySelectorAll('.cims-table-value')])
      .filter(e => e.scrollWidth > e.clientWidth + 1)
      .slice(0, 10).map(e => e.textContent.trim().slice(0, 100));
    const popups = [...document.querySelectorAll('[data-radix-popper-content-wrapper]')].filter(visible).map(e=>{const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,right:r.right,fits:r.top>=-1&&r.bottom<=innerHeight+1&&r.right<=innerWidth+1};});
    return { pageOverflow: document.documentElement.scrollWidth > width + 1, mainOverflow: !!main && main.scrollWidth > main.clientWidth + 1, mobileCellOverflow, escaped, dialogs, popups, ready: window.__responsiveQA?.ready, error: window.__responsiveQA?.error, text: document.body.innerText.slice(0,160) };
  });
}

async function runSurface(browser, surface) {
  const context = await browser.newContext({ viewport:{width:widths[0],height:900}, reducedMotion:'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const errors = []; const unknown = new Set(); const writes = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(data => { window.__responsiveFixtures=data; localStorage.setItem('theme','light'); }, { user: fixtures.user, client: fixtures.client, installation: fixtures.installation });
  await page.route('**/__responsive-audit?**', r => r.fulfill({ contentType:'text/html', body:html }));
  await page.route('**/api/**', r => {
    const request = r.request();
    if (request.method() !== 'GET' && request.method() !== 'OPTIONS') writes.push({ path:new URL(request.url()).pathname, method:request.method() });
    const body = fixtures.fixture(request.url(), fixtureState);
    if (Array.isArray(body) && body.length === 0) unknown.add(new URL(request.url()).pathname);
    // Event streams are fixture-only and never connect to live signaling.
    if (request.url().includes('/stream')) return r.fulfill({ status:200, contentType:'text/event-stream', body:': fixture stream\n\n' });
    return r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(body) });
  });
  const checks = [];
  const interactions = [];
  try {
    await page.goto(`${origin}/__responsive-audit?surface=${surface.id}`, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => window.__responsiveQA?.ready, { timeout:20000 });
    await page.waitForFunction(() => window.__responsiveQA?.error || window.__responsiveQA?.pending() === 0, { timeout:15000 });
    // Let effects that use the existing non-query data hooks finish their fixture fetches.
    await page.waitForTimeout(300);
    if (checkInteractions) {
      await page.setViewportSize({width:320,height:900});
      if (surface.id === 'developer-requests') {
        const search = page.getByPlaceholder(/Search/).first();
        await search.fill('no-matching-synthetic-request');
        await page.getByText('No requests found', {exact:true}).waitFor();
        await search.fill('');
        await page.getByRole('button', {name:/Sort ticket numbers/}).click();
        await page.getByRole('button', {name:'Request actions', exact:true}).first().click();
        await page.getByRole('menuitem', {name:'View Details'}).waitFor();
        await page.keyboard.press('Escape');
        interactions.push('Mobile search, clear, ticket sort and request actions');
      }
      if (surface.id === 'developer-client-requests') {
        const search = page.getByPlaceholder('Search by ticket, client, rep...');
        await search.fill('no-matching-synthetic-request');
        await page.getByText('No change requests match your criteria.', {exact:true}).waitFor();
        await search.fill('');
        await page.getByRole('link', {name:/CR-2026/}).first().waitFor();
        interactions.push('Mobile client request search and clear');
      }
      if (surface.id === 'developer-users') {
        await page.getByRole('button', {name:'User actions', exact:true}).first().click();
        await page.getByRole('menuitem', {name:'Edit Details'}).waitFor();
        await page.keyboard.press('Escape');
        interactions.push('Mobile user actions menu');
      }
    }
    for (const width of widths) {
      await page.setViewportSize({width,height:900});
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.waitForTimeout(220);
      const result = await inspect(page);
      checks.push({width,height:900,state:'default',...result});
      if ([320,1280].includes(width)||result.mainOverflow) await page.screenshot({path:path.join(output,`${surface.id}-${width}.png`),fullPage:false});
    }
    if (surface.tabs && !checks[0].error) {
      for (const tabWidth of tabWidths) {
      await page.setViewportSize({width:tabWidth,height:568});
      const tabs = await page.getByRole('tab').all();
      const labels = await Promise.all(tabs.map(t=>t.textContent()));
      for (let i=0;i<labels.length;i++) {
        const tab = page.getByRole('tab').nth(i);
        if (await tab.isDisabled()) continue;
        await tab.click();
        await page.waitForFunction(() => window.__responsiveQA?.error || window.__responsiveQA?.pending()===0, {timeout:10000});
        await page.waitForTimeout(100);
        checks.push({width:tabWidth,height:568,state:`tab:${labels[i]?.trim()}`, ...await inspect(page)});
        const table = page.locator('table').filter({visible:true}).first();
        if (await table.count()) await table.scrollIntoViewIfNeeded();
        await page.screenshot({path:path.join(output,`${surface.id}-tab-${i}-${tabWidth}.png`),fullPage:false});
      }
      }
    }
    if (!checks[0].error) {
      await page.setViewportSize({width:844,height:390});
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      checks.push({width:844,height:390,state:'landscape-short',...await inspect(page)});
      await page.setViewportSize({width:320,height:480});
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      checks.push({width:320,height:480,state:'portrait-short',...await inspect(page)});
    }
  } catch (error) { errors.push(error.message); }
  await context.close();
  const result = {surface:surface.id,file:surface.file,checks,interactions,errors,fixtureRequests:[...unknown],interceptedWrites:writes};
  fs.writeFileSync(path.join(output,`${surface.id}.json`),JSON.stringify(result,null,2));
  const defects=checks.filter(c=>c.pageOverflow||c.mainOverflow||c.mobileCellOverflow.length||c.escaped.length||c.dialogs.some(d=>!d.fits)||c.error);
  console.log(JSON.stringify({surface:surface.id,checks:checks.length,defects:defects.map(c=>({width:c.width,height:c.height,state:c.state,mainOverflow:c.mainOverflow,pageOverflow:c.pageOverflow,escaped:c.escaped,error:c.error,dialogs:c.dialogs.filter(d=>!d.fits)})),errors}));
  return result;
}

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets']});
  const results=[];
  try {
    const queue=[...selected];
    await Promise.all(Array.from({length:2},async()=>{let surface;while((surface=queue.shift()))results.push(await runSurface(browser,surface));}));
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
  console.log('Completed',results.length,'surfaces;',results.reduce((n,r)=>n+r.checks.length,0),'viewport/state checks.');
  if(results.some(r=>r.errors.length||r.checks.some(c=>c.error||c.pageOverflow||c.mainOverflow||c.mobileCellOverflow.length||c.escaped.length||c.dialogs.some(d=>!d.fits))))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
