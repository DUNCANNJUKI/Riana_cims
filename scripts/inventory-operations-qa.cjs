const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const {chromium}=require('playwright');const {stocktakeResult}=require('../server/services/stocktake');
async function main(){
  const root=path.resolve(__dirname,'..');const fixture=path.join(root,'tmp/inventory-operations-qa');const evidence=await fs.mkdtemp(path.join(os.tmpdir(),'cims-inventory-operations-'));
  const png=await require('../server/node_modules/sharp')({create:{width:64,height:64,channels:3,background:'#147d92'}}).png().toBuffer();
  await fs.mkdir(fixture,{recursive:true});
  await fs.writeFile(path.join(fixture,'index.html'),'<!doctype html><html><head><title>Inventory Operations QA</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tmp/inventory-operations-qa/main.tsx"></script></body></html>');
  await fs.writeFile(path.join(fixture,'main.tsx'),`
    import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider,useQuery} from '@tanstack/react-query';
    import {VariantManager} from '../../src/components/inventory/VariantManager';import {StocktakeDialog,StocktakeSummary} from '../../src/components/inventory/StocktakeDialog';
    import {FileList} from '../../src/components/files/FileComponents';import {PlanningDateInput} from '../../src/components/common/PlanningDateInput';
    import {authorizedFileUrl} from '../../src/integrations/filesApi';import {hardwareGet} from '../../src/components/inventory/hardwareApi';import '../../src/index.css';
    localStorage.setItem('riana-auth-token','fixture-token');
    const file={id:1,originalName:'Signed Handover page 1.png',mimeType:'image/png',fileSize:123,category:'handover_attachment',status:'active',viewUrl:'/api/files/1/view',downloadUrl:'/api/files/1/download'};
    function Fixture(){const [open,setOpen]=React.useState(false);const [result,setResult]=React.useState();const [date,setDate]=React.useState('');const catalog=useQuery({queryKey:['hardware','qaCatalog'],queryFn:()=>hardwareGet('/catalog')});return <main className="max-w-5xl p-4 mx-auto space-y-4"><h1>Inventory Operations QA</h1><FileList files={[file as any]}/><label>Scheduled Date<PlanningDateInput type="date" aria-label="Scheduled Date" value={date} onChange={(e)=>setDate(e.target.value)}/></label><label>Historical Date<input type="date" aria-label="Historical Date"/></label><p data-testid="resolved-url">{authorizedFileUrl(file.viewUrl)}</p>{catalog.data&&<><VariantManager variants={catalog.data.variants}/><button onClick={()=>setOpen(true)}>Stocktake</button><StocktakeDialog user={{id:'admin',role:'SuperAdmin'} as any} catalog={catalog.data} open={open} onOpenChange={setOpen} onComplete={setResult as any}/></>}{result&&<section><h2>Saved stocktake</h2><StocktakeSummary result={result as any} download/></section>}</main>}
    createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Fixture/></QueryClientProvider>);
  `);
  const {createServer}=await import('vite');const server=await createServer({root,server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
  const base=`http://127.0.0.1:${server.httpServer.address().port}`;const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(30000);const errors=[];page.on('pageerror',(e)=>errors.push(e.message));page.on('dialog',(dialog)=>dialog.accept());
    let variants=[];let firstImage=true;let stale=true;let imageRequests=0;const actions=[];
    const assets=[{id:'a',serial_number:'MRZ-MC-M1-26-1001',status:'Available',updated_at:'one'},{id:'b',serial_number:'MRZ-MC-M1-26-1002',status:'Faulty',updated_at:'one'}];
    await page.route('**/api/**',async(route)=>{
      const request=route.request();const url=new URL(request.url());let data={};
      if(url.pathname==='/api/time')return route.fulfill({contentType:'application/json',body:JSON.stringify({now:new Date().toISOString(),time_zone:'Africa/Nairobi'})});
      assert.ok(!url.pathname.startsWith('/api/api/'));
      if(url.pathname.startsWith('/api/files/')){
        assert.equal(request.headers().authorization,'Bearer fixture-token');imageRequests++;
        if(firstImage){firstImage=false;return route.fulfill({status:404,contentType:'application/json',body:'{"error":"Fixture retry"}'});}
        return route.fulfill({status:200,contentType:'image/png',body:png});
      }
      if(url.pathname.endsWith('/catalog'))data={variants,subsidiaries:[{id:'sub',subsidiary_name:'MAREZI'}],locations:[{id:'warehouse',subsidiary_id:'sub',name:'Warehouse'}]};
      else{
        const b=request.postDataJSON();const action=url.pathname.split('/').pop();actions.push(action);
        if(action==='variant_create'){variants.push({...b,id:'new',dependency_count:0});data={id:'new'};}
        if(action==='variant_update')variants=variants.map((v)=>v.id===b.variant_id?{...v,...b}:v);
        if(action==='variant_delete')variants=variants.filter((v)=>v.id!==b.variant_id);
        if(action==='reconcile-preview')data=stocktakeResult(assets,b.observed_ids);
        if(action==='reconcile'){
          if(stale){stale=false;return route.fulfill({status:409,contentType:'application/json',body:'{"error":"Stock changed after preview. Preview the count again before applying."}'});}
          assert.equal(b.confirm_missing,true);assert.equal(b.snapshot,stocktakeResult(assets,b.observed_ids).snapshot);data={id:'count',...stocktakeResult(assets,b.observed_ids)};
        }
      }
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    });
    for(const [name,width,height] of [['desktop',1366,900],['mobile',390,844]]){
      variants=[{id:'used',family:'QMS',variant:'C',nickname:'Wave',description:'Dependent model',retired:0,dependency_count:1}];firstImage=true;stale=true;
      await page.setViewportSize({width,height});await page.goto(`${base}/tmp/inventory-operations-qa/index.html`);
      assert.equal(await page.title(),'Inventory Operations QA');await page.getByRole('heading',{name:'Inventory Operations QA',exact:true}).waitFor();
      await page.getByRole('button',{name:'Retry Signed Handover page 1.png',exact:true}).click();
      const image=page.getByAltText('Signed Handover page 1.png',{exact:true});await image.waitFor();assert.equal(await image.evaluate((el)=>el.complete && el.naturalWidth>0),true);
      assert.equal(await page.getByTestId('resolved-url').innerText(),'/api/files/1/view');
      await page.getByRole('button',{name:'View Signed Handover page 1.png',exact:true}).click();await page.getByRole('dialog').getByAltText('Signed Handover page 1.png').waitFor();await page.keyboard.press('Escape');
      const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download Signed Handover page 1.png',exact:true}).click();assert.equal((await downloadPromise).suggestedFilename(),'Signed Handover page 1.png');
      const scheduled=page.getByLabel('Scheduled Date',{exact:true});assert.ok(await scheduled.getAttribute('min'));await scheduled.fill('2000-01-01');assert.equal(await scheduled.inputValue(),'');
      await page.getByLabel('Historical Date',{exact:true}).fill('2000-01-01');assert.equal(await page.getByLabel('Historical Date',{exact:true}).inputValue(),'2000-01-01');
      await page.screenshot({path:path.join(evidence,`${name}-documents-dates.png`)});
      console.log(`${name}: private document and date checks passed`);
      await page.getByRole('button',{name:'Variants',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Edit variant Wave',exact:true}).isDisabled(),true);
      await page.getByRole('button',{name:'Add Variant',exact:true}).click();
      for(const [field,value] of [['Family Code','NET'],['Variant Code','R'],['Variant Name','Router'],['Description','Network router']])await page.getByLabel(field,{exact:true}).fill(value);
      await page.getByRole('button',{name:'Save Variant',exact:true}).click();await page.getByRole('button',{name:'Edit variant Router',exact:true}).click();await page.getByLabel('Variant Name',{exact:true}).fill('RouterPlus');await page.getByRole('button',{name:'Save Variant',exact:true}).click();
      await page.getByRole('button',{name:'Delete variant RouterPlus',exact:true}).click();await page.getByRole('button',{name:'Edit variant RouterPlus',exact:true}).waitFor({state:'hidden'});await page.keyboard.press('Escape');
      console.log(`${name}: variant checks passed`);
      await page.getByRole('button',{name:'Stocktake',exact:true}).click();await page.getByLabel('Stocktake Location',{exact:true}).selectOption('warehouse');await page.getByLabel('Observed Serials / Manufacturer Serials / Asset IDs',{exact:true}).fill('MRZ-MC-M1-26-1001');
      assert.equal(await page.getByRole('button',{name:'Apply Stocktake',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'Preview Count',exact:true}).click();await page.getByText('Confirm 1 items are physically missing',{exact:true}).waitFor();
      await page.getByText('Confirm 1 items are physically missing',{exact:true}).click();await page.getByRole('button',{name:'Apply Stocktake',exact:true}).click();await page.getByRole('alert').filter({hasText:'Stock changed after preview'}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Apply Stocktake',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'Preview Count',exact:true}).click();await page.getByText('Confirm 1 items are physically missing',{exact:true}).click();
      const bounds=await page.getByRole('dialog').boundingBox();assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width+1);
      assert.equal(await page.getByRole('dialog').evaluate((el)=>el.scrollWidth<=el.clientWidth+1),true,'Stocktake dialog must not overflow horizontally');
      await page.screenshot({path:path.join(evidence,`${name}-stocktake-preview.png`)});await page.getByRole('button',{name:'Apply Stocktake',exact:true}).click();await page.getByRole('heading',{name:'Saved stocktake',exact:true}).waitFor();
      const csvPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export Results',exact:true}).click();assert.equal((await csvPromise).suggestedFilename(),'stocktake-results.csv');
      assert.equal(await page.locator('vite-error-overlay').count(),0);
    }
    assert.deepEqual(errors,[]);assert.ok(imageRequests>=6);console.log(JSON.stringify({viewports:['1366x900','390x844'],authenticatedImages:true,retry:true,privatePreviewAndDownload:true,pastScheduleBlocked:true,historicalDatesPreserved:true,variantCrud:true,dependencyControls:true,stocktakePreviewAndConfirmation:true,stalePreviewRejected:true,csvExport:true,errors,evidence},null,2));
  }finally{await browser.close();await server.close();}
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
