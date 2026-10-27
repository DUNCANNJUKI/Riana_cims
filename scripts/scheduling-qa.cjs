const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');const assert=require('node:assert/strict');
const {chromium}=require('playwright');
async function main(){
  const root=path.resolve(__dirname,'..'),fixture=path.join(root,'tmp/scheduling-qa'),evidence=await fs.mkdtemp(path.join(os.tmpdir(),'cims-scheduling-qa-'));
  await fs.mkdir(fixture,{recursive:true});
  await fs.writeFile(path.join(fixture,'index.html'),'<!doctype html><html><head><title>Scheduling QA</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tmp/scheduling-qa/main.tsx"></script></body></html>');
  await fs.writeFile(path.join(fixture,'main.tsx'),`
    import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {SchedulingWorkspace} from '../../src/components/calendar/SchedulingWorkspace';import {PlanningDateInput} from '../../src/components/common/PlanningDateInput';import '../../src/index.css';
    function Fixture(){const [date,setDate]=React.useState('');return <main className="mx-auto max-w-6xl space-y-4 p-4"><h1>Scheduling QA</h1><label>Deadline<PlanningDateInput aria-label="Deadline" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Actual Date<input aria-label="Actual Date" type="date"/></label><SchedulingWorkspace user={{id:'admin',role:'SuperAdmin'} as any}/></main>}
    createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Fixture/></QueryClientProvider>);
  `);
  const {createServer}=await import('vite');const server=await createServer({root,server:{host:'127.0.0.1',port:0,watch:{ignored:['**/release/**','**/CRMS/dist/**','**/hosting/**']}},logLevel:'error'});await server.listen();
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2001-01-01T00:00Z')});
    let rows=[],first=true,clockFailure=false,serverNow='2030-12-31T20:59:30Z';const submissions=[];
    await page.route('**/api/**',async route=>{
      const request=route.request(),p=new URL(request.url()).pathname;let data={};
      if(p==='/api/time')return route.fulfill({status:clockFailure?503:200,contentType:'application/json',body:JSON.stringify({now:serverNow,time_zone:'Africa/Nairobi'})});
      if(p.endsWith('/catalog'))data={subsidiaries:[{id:'a',subsidiary_name:'MAREZI'}],resources:[{id:'tech',first_name:'QA',last_name:'Technician',subsidiary_id:'a'}],branches:[]};
      else if(p.endsWith('/policy'))data={scope_key:'subsidiary:a',version:1,configuration:{time_zone:'Africa/Nairobi'},overrides:{}};
      else if(p.endsWith('/availability'))data={status:'No recorded conflict'};
      else if(p.endsWith('/history'))data={rows:[{id:'history',reason:'Client requested a later visit',created_at:'2031-01-01T00:00Z'}]};
      else if(request.method()==='GET')data={rows,total:rows.length,overdue:0};
      else{
        const body=request.postDataJSON();submissions.push({method:request.method(),key:request.headers()['idempotency-key'],body});
        if(first){first=false;return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:'SCHEDULE_RESOURCE_CONFLICT',error:'A selected technician is already booked for this interval.'})});}
        const old=rows[0];rows=[{...old,id:'event',title:body.title,subsidiary_id:'a',branch_id:null,activity_type:body.activity_type||'installation',start_utc:body.start?new Date(body.start+'+03:00').toISOString():old.start_utc,end_utc:body.end?new Date(body.end+'+03:00').toISOString():old.end_utc,time_zone:'Africa/Nairobi',status:body.status||'scheduled',indicator:body.status||'scheduled',resource_ids:body.resource_ids,version:old?old.version+1:1}];data={ids:['event'],version:rows[0].version};
      }
      await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    });
    for(const [name,width,height] of [['desktop',1366,900],['mobile-dark',390,844]]){
      rows=[];first=true;clockFailure=false;serverNow='2030-12-31T20:59:30Z';submissions.length=0;
      await page.clock.setSystemTime(new Date('2001-01-01T00:00Z'));await page.setViewportSize({width,height});await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tmp/scheduling-qa/index.html`);
      if(name.includes('dark'))await page.evaluate(()=>document.documentElement.classList.add('dark'));
      assert.equal(await page.title(),'Scheduling QA');await page.getByRole('heading',{name:'Timed Schedule',exact:true}).waitFor();
      const deadline=page.getByLabel('Deadline',{exact:true});await page.waitForFunction(()=>document.querySelector('[aria-label="Deadline"]')?.getAttribute('min')==='2030-12-31');
      await deadline.fill('2000-01-01');assert.equal(await deadline.inputValue(),'');await page.getByLabel('Actual Date',{exact:true}).fill('2000-01-01');
      await page.getByLabel('Subsidiary',{exact:true}).selectOption('a');await page.getByRole('button',{name:'Schedule Activity',exact:true}).click();
      await page.getByLabel('Activity Title',{exact:true}).fill('Scheduled installation');await page.getByLabel('Scheduled Start',{exact:true}).fill('2031-01-01T09:00');await page.getByLabel('Scheduled End',{exact:true}).fill('2031-01-01T10:00');await page.getByRole('checkbox',{name:'QA Technician',exact:true}).click();
      await page.getByRole('button',{name:'Confirm Schedule',exact:true}).click();await page.getByRole('alert').getByText('A selected technician is already booked for this interval.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Activity Title',{exact:true}).inputValue(),'Scheduled installation');
      const box=await page.getByRole('dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);await page.screenshot({path:path.join(evidence,`${name}-persistent-conflict.png`)});
      await page.getByRole('button',{name:'Confirm Schedule',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(submissions[0].key,submissions[1].key);
      await page.getByRole('button',{name:'Edit / Reschedule',exact:true}).click();await page.getByLabel('Change Reason',{exact:true}).fill('Client requested a later visit');await page.getByLabel('Scheduled Start',{exact:true}).fill('2031-01-01T10:30');await page.getByLabel('Scheduled End',{exact:true}).fill('2031-01-01T11:30');
      await page.getByRole('button',{name:'Check Availability',exact:true}).click();await page.getByText('No recorded conflict',{exact:true}).waitFor();await page.getByRole('button',{name:'Confirm Schedule',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(submissions.at(-1).body.version,1);
      const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export Page',exact:true}).click();assert.equal((await downloadPromise).suggestedFilename(),'scheduling-page.csv');
      rows[0]={...rows[0],start_utc:'2020-01-01T06:00:00Z',end_utc:'2020-01-01T07:00:00Z',status:'in_progress',indicator:'overdue'};
      await page.getByRole('button',{name:'Refresh schedule',exact:true}).click();
      await page.getByRole('cell',{name:'overdue',exact:true}).waitFor();await page.getByRole('button',{name:'Edit / Reschedule',exact:true}).click();
      await page.getByLabel('Status',{exact:true}).selectOption('completed');await page.getByLabel('Change Reason',{exact:true}).fill('Verified actual completion');await page.getByRole('button',{name:'Confirm Schedule',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(submissions.at(-1).body.start,undefined);assert.equal(submissions.at(-1).body.status,'completed');
      await page.clock.fastForward(40000);await page.waitForFunction(()=>document.querySelector('[aria-label="Deadline"]')?.getAttribute('min')==='2031-01-01');
      await page.clock.setSystemTime(new Date('2099-01-01T00:00Z'));assert.equal(await deadline.getAttribute('min'),'2031-01-01');
      clockFailure=true;await page.evaluate(async()=>{const {refreshServerClock}=await import('/src/utils/serverClock.ts');await refreshServerClock();});assert.equal(await deadline.isDisabled(),true);await page.getByRole('alert').getByText('Scheduling time could not be verified. Reconnect and try again.',{exact:true}).waitFor();
      clockFailure=false;serverNow='2030-12-31T21:01:00Z';await page.evaluate(async()=>{const {refreshServerClock}=await import('/src/utils/serverClock.ts');await refreshServerClock();});assert.equal(await deadline.isDisabled(),false);
      assert.equal(await page.locator('vite-error-overlay').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:path.join(evidence,`${name}-schedule.png`)});
    }
    assert.deepEqual(errors,[]);console.log(JSON.stringify({browser:'Playwright (Browser plugin unavailable)',viewports:['1366x900','390x844 dark'],serverClock:true,deviceClockManipulationIgnored:true,midnightRollover:true,persistentConflict:true,idempotentRetry:true,rescheduleVersion:true,availability:true,csv:true,offlineFailsClosed:true,errors,evidence},null,2));
  }finally{await browser.close();await server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
