const {chromium}=require('playwright');
const fs=require('fs'),assert=require('assert/strict');
const fixtures=require('./responsiveness-fixtures.cjs');
const origin='http://127.0.0.1:8090';
fs.mkdirSync('.runtime',{recursive:true});
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Module catalogue QA</title></head><body><div id="root"></div><script type="module">import R from "/@react-refresh";R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/scripts/qa/responsiveness-harness.tsx"></script></body></html>';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1107,height:700},reducedMotion:'reduce'}),page=await context.newPage();
  page.setDefaultTimeout(15000);
  const errors=[],writes=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
  let modules=fixtures.fixture(origin+'/api/crms/affected-modules').modules;
  const request={...fixtures.request,change_description:'Change call button to implement automated calling, client routing, acknowledgement and reporting with '+ 'LongUnbrokenReference'.repeat(14),modules_affected:['Reporting','Legacy Custom Module']};
  await page.addInitScript(data=>{window.__responsiveFixtures=data},{user:fixtures.user,client:fixtures.client,installation:fixtures.installation});
  await page.route('**/__responsive-audit?**',r=>r.fulfill({contentType:'text/html',body:html}));
  await page.route('**/api/**',r=>{
   const req=r.request(),p=new URL(req.url()).pathname,role=new URL(page.url()).searchParams.get('role')||'SuperAdmin';let body=fixtures.fixture(req.url());
   if(p==='/api/auth/me')body={user:{...fixtures.user,role,module_roles:{cims:role,crms:role}}};
   if(p==='/api/crms/change_requests')body=[request];
   if(p==='/api/crms/change_requests/qa-request'){body=request;if(req.method()==='PATCH'){const data=req.postDataJSON();writes.push(data);Object.assign(request,data);body=request;}}
   if(p.startsWith('/api/crms/affected-modules')){
    if(req.method()==='GET')body={modules,canManage:['SuperAdmin','Teamlead'].includes(role)};
    else{const data=req.postDataJSON();writes.push({catalogue:true,...data});const id=p.split('/')[4];if(req.method()==='POST')modules.push({id:'new-module',...data,version:1});else modules=modules.map(m=>m.id===id?{...m,...data,version:m.version+1}:m);body={success:true};}
   }
   return r.fulfill({contentType:req.url().includes('/stream')?'text/event-stream':'application/json',body:req.url().includes('/stream')?': fixture\n\n':JSON.stringify(body)});
  });
  await page.goto(origin+'/__responsive-audit?surface=developer-requests');
  await page.getByRole('table',{name:'Change requests'}).waitFor();
  for(const width of [320,390,600,768,820,1024,1107,1366,1920]){
   await page.setViewportSize({width,height:700});await page.waitForTimeout(230);
   const result=await page.locator('tbody tr').first().locator('td').nth(2).evaluate(cell=>{const p=cell.querySelector('p'),r=cell.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(p);return {wrap:getComputedStyle(p).whiteSpace,inside:[...range.getClientRects()].every(t=>t.left>=r.left-1&&t.right<=r.right+1&&t.bottom<=r.bottom+1),pageOverflow:document.documentElement.scrollWidth>innerWidth};});
   assert.equal(result.wrap,'normal');assert.ok(result.inside);assert.equal(result.pageOverflow,false);checks.push({screen:'long request description',width,...result});
   if(width===1107)await page.screenshot({path:'.runtime/request-overlap-fixed-1107.png'});
  }
  await page.goto(origin+'/__responsive-audit?surface=developer-new-request&role=SuperAdmin');
  await page.getByText('Manage shared modules',{exact:true}).click();
  await page.getByRole('textbox',{name:'New module name'}).fill('Client Portal');await page.getByRole('button',{name:'Add Module',exact:true}).click();await page.getByLabel('Client Portal',{exact:true}).waitFor();
  await page.getByRole('textbox',{name:'Name for Reporting',exact:true}).fill('Standard Reporting');await page.getByRole('button',{name:'Save Reporting',exact:true}).click();await page.getByLabel('Standard Reporting',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Retire Standard Reporting',exact:true}).click();await page.getByRole('button',{name:'Reactivate Standard Reporting',exact:true}).waitFor();assert.equal(await page.getByLabel('Standard Reporting',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Reactivate Standard Reporting',exact:true}).click();await page.getByLabel('Standard Reporting',{exact:true}).waitFor();
  for(const width of [320,390,768,1107,1920]){await page.setViewportSize({width,height:700});await page.waitForTimeout(220);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);checks.push({screen:'expanded catalogue management',width,overflow:false});}
  await page.setViewportSize({width:320,height:568});await page.getByRole('textbox',{name:'New module name'}).scrollIntoViewIfNeeded();await page.screenshot({path:'.runtime/module-catalog-mobile.png'});
  await page.goto(origin+'/__responsive-audit?surface=developer-request-detail&role=Teamlead');await page.getByRole('button',{name:'Edit',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Edit Change Request'});
  await page.setViewportSize({width:320,height:480});await dialog.getByText('Manage shared modules',{exact:true}).click();const bounds=await dialog.evaluate(e=>{const r=e.getBoundingClientRect();return {fits:r.top>=-1&&r.bottom<=innerHeight+1,overflow:e.scrollWidth>e.clientWidth+1};});assert.equal(bounds.fits,true);assert.equal(bounds.overflow,false);await dialog.getByText('Manage shared modules',{exact:true}).click();await dialog.getByLabel('Client Portal',{exact:true}).check();assert.ok(await dialog.getByRole('checkbox',{name:/^Reporting/}).isChecked());await dialog.getByRole('button',{name:'Save Changes',exact:true}).click();await dialog.waitFor({state:'hidden'});
  const edit=writes.find(w=>w.modules_affected);assert.deepEqual(Object.keys(edit).sort(),['modules_affected','priority']);assert.ok(edit.modules_affected.includes('Legacy Custom Module'));assert.ok(edit.modules_affected.includes('Client Portal'));
  await page.goto(origin+'/__responsive-audit?surface=developer-new-request&role=Developer');await page.getByLabel('Client Portal',{exact:true}).waitFor();assert.equal(await page.getByText('Manage shared modules',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,interactions:['Shared create/rename/retire/reactivate','Cross-page catalogue persistence','Developer Lead edits only priority and affected modules','Historical names retained','Developer cannot manage catalogue'],errors},null,2));
  fs.writeFileSync('.runtime/module-catalog-browser-results.json',JSON.stringify({checks,writes,errors},null,2));await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
