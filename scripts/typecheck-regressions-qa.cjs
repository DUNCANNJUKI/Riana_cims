const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

async function main(){
  const root=path.resolve(__dirname,'..');
  const fixture=path.join(root,'tmp/typecheck-regressions-qa');
  const evidence=await fs.mkdtemp(path.join(os.tmpdir(),'cims-typecheck-regressions-'));
  await fs.mkdir(fixture,{recursive:true});
  await fs.writeFile(path.join(fixture,'index.html'),'<!doctype html><html><head><title>Finance Regression QA</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tmp/typecheck-regressions-qa/main.tsx"></script></body></html>');
  await fs.writeFile(path.join(fixture,'main.tsx'),`
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {FinancesModule} from '../../src/components/finances/FinancesModule';
    import {TooltipProvider} from '../../src/components/ui/tooltip';
    import {Toaster} from '../../src/components/ui/toaster';import '../../src/index.css';
    createRoot(document.getElementById('root')!).render(<TooltipProvider><main className="p-4"><FinancesModule user={{id:'qa-admin',role:'SuperAdmin'} as any}/></main><Toaster/></TooltipProvider>);
  `);
  const {createServer}=await import('vite');
  const server=await createServer({root,server:{host:'127.0.0.1',port:0,watch:{ignored:['**/release/**','**/CRMS/dist/**','**/hosting/**']}},logLevel:'error'});
  await server.listen();
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',(e)=>errors.push(e.message));
    let budget;const updates=[];
    await page.route('**/api/**',async(route)=>{
      const request=route.request();const url=new URL(request.url());let data=[];
      if(url.pathname==='/api/budgets/budget' && request.method()==='PUT'){
        const body=request.postDataJSON();updates.push(body);budget={...budget,...body};data=budget;
      }else if(url.pathname==='/api/budgets')data=[budget];
      else if(url.pathname==='/api/installations')data=[{id:'installation',client_id:'client'}];
      else if(url.pathname==='/api/clients')data=[{id:'client',client_name:'QA Client',branch:'Main'}];
      else if(url.pathname==='/api/companies')data={company_name:'QA Company'};
      await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    });
    const url=`http://127.0.0.1:${server.httpServer.address().port}/tmp/typecheck-regressions-qa/index.html`;
    for(const [width,height] of [[1366,900],[390,844]]){
      budget={id:'budget',installation_id:'installation',labor_cost:100,equipment_cost:200,transport_cost:10,miscellaneous_cost:5,total_budget:315,notes:'Currency regression',currency:'USD',created_at:new Date().toISOString()};
      await page.setViewportSize({width,height});await page.goto(url);
      assert.equal(await page.title(),'Finance Regression QA');
      await page.getByText('Grand Total (USD)',{exact:true}).waitFor();
      await page.locator('tbody tr').first().getByRole('button').first().click();
      const dialog=page.getByRole('dialog');
      await dialog.getByRole('heading',{name:'Edit Installation Budget',exact:true}).waitFor();
      await dialog.getByRole('combobox').click();
      await page.getByRole('option',{name:'EUR (Euro)',exact:true}).click();
      const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width+1);
      await page.screenshot({path:path.join(evidence,`finance-${width}-currency-edit.png`)});
      await dialog.getByRole('button',{name:'Update Budget',exact:true}).click();
      await page.getByText('Grand Total (EUR)',{exact:true}).waitFor();
      assert.equal(updates.at(-1).currency,'EUR');assert.equal(updates.at(-1).total_budget,315);
      await page.reload();await page.getByText('Grand Total (EUR)',{exact:true}).waitFor();
      assert.equal(await page.locator('vite-error-overlay').count(),0);
    }
    const rtc=await page.evaluate(async()=>{
      const sender=new RTCPeerConnection({iceServers:[]});const receiver=new RTCPeerConnection({iceServers:[]});
      try{
        sender.createDataChannel('state-regression');const offer=await sender.createOffer();await sender.setLocalDescription(offer);
        const before=receiver.signalingState;await receiver.setRemoteDescription(offer);const after=receiver.signalingState;
        const answer=await receiver.createAnswer();await receiver.setLocalDescription(answer);await sender.setRemoteDescription(answer);
        return {before,after,senderFinal:sender.signalingState,receiverFinal:receiver.signalingState};
      }finally{sender.close();receiver.close();}
    });
    assert.deepEqual(rtc,{before:'stable',after:'have-remote-offer',senderFinal:'stable',receiverFinal:'stable'});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({fixtureOnly:true,financeCurrencyEditSaveReload:true,financeViewports:[1366,390],rtcNativeOfferAnswerState:rtc,realCallTransportTested:false,errors,evidence},null,2));
  }finally{await browser.close();await server.close();}
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
