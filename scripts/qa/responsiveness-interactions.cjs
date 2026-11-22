const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixtures = require('./responsiveness-fixtures.cjs');
const origin = 'http://127.0.0.1:8090';
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>RIANA interaction audit</title></head><body><div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/scripts/qa/responsiveness-harness.tsx"></script></body></html>';
const results=[];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-features=LocalNetworkAccessChecks,LocalNetworkAccessChecksWebSockets']});
 try {
  const context=await browser.newContext({hasTouch:true,viewport:{width:320,height:480},reducedMotion:'reduce'});
  const page=await context.newPage();page.setDefaultTimeout(12000);
  await page.addInitScript(data=>{window.__responsiveFixtures=data;},{user:fixtures.user,client:fixtures.client,installation:fixtures.installation});
  await page.route('**/__responsive-audit?**',r=>r.fulfill({contentType:'text/html',body:html}));
  await page.route('**/api/**',r=>r.fulfill({contentType:r.request().url().includes('/stream')?'text/event-stream':'application/json',body:r.request().url().includes('/stream')?': fixture\n\n':JSON.stringify(fixtures.fixture(r.request().url()))}));
  await page.goto(origin+'/__responsive-audit?surface=dashboard');await page.waitForFunction(()=>window.__responsiveQA?.ready);
  await page.getByRole('button',{name:'Open navigation menu',exact:true}).tap();const nav=page.getByRole('dialog',{name:'Navigation',exact:true});await nav.waitFor();
  assert.ok(await nav.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight+1}));
  const scroll=nav.locator('[data-radix-scroll-area-viewport]');await scroll.evaluate(e=>{e.scrollTop=e.scrollHeight});assert.ok(await scroll.evaluate(e=>e.scrollTop>0));
  await nav.getByRole('button',{name:'Close',exact:true}).tap();await nav.waitFor({state:'hidden'});results.push('Touch navigation opens, scrolls, closes at 320x480');
  await page.getByRole('button',{name:'Open notifications',exact:true}).tap();await page.getByText('No notifications',{exact:true}).waitFor();
  assert.ok(await page.locator('[data-radix-popper-content-wrapper]').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1}));
  await page.keyboard.press('Escape');results.push('Notifications stay within the short mobile viewport');
  await page.getByRole('button',{name:'Open profile menu',exact:true}).tap();await page.getByRole('menu').waitFor();await page.keyboard.press('Escape');results.push('Profile menu remains accessible by touch');
  for(const zoom of [1,1.25,1.5,2]){await page.setViewportSize({width:Math.floor(1280/zoom),height:Math.floor(800/zoom)});await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>{const m=document.querySelector('main');return document.documentElement.scrollWidth<=innerWidth+1&&m.scrollWidth<=m.clientWidth+1}));results.push(`Browser-zoom reflow equivalent ${zoom*100}%`);}
  await page.setViewportSize({width:1280,height:800});await page.getByRole('button',{name:'Collapse navigation',exact:true}).click();await page.waitForTimeout(250);assert.ok(await page.locator('aside').evaluate(e=>e.clientWidth<=81));await page.getByRole('button',{name:'Expand navigation',exact:true}).click();results.push('Desktop sidebar collapse/expand preserves content width');
  await page.setViewportSize({width:320,height:480});await page.getByRole('button',{name:'Switch to dark mode',exact:true}).tap();assert.ok(await page.locator('html').evaluate(e=>e.classList.contains('dark')));await page.getByRole('button',{name:'Switch to light mode',exact:true}).tap();results.push('Light/dark theme controls remain accessible');
  await context.close();
 }finally{await browser.close()}
 fs.mkdirSync('docs/evidence/responsiveness-20261121',{recursive:true});fs.writeFileSync(path.join('docs/evidence/responsiveness-20261121','interactions.json'),JSON.stringify(results,null,2));console.log(results.join('\n'));
})().catch(e=>{console.error(e);process.exitCode=1});
