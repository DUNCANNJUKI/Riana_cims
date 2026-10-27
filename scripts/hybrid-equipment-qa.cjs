const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

async function main(){
  const root=path.resolve(__dirname,'..');
  const fixture=path.join(root,'tmp/hybrid-equipment-qa');
  const evidence=await fs.mkdtemp(path.join(os.tmpdir(),'cims-hybrid-equipment-'));
  await fs.mkdir(fixture,{recursive:true});
  await fs.writeFile(path.join(fixture,'index.html'),'<!doctype html><html><head><title>Hybrid Equipment QA</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/tmp/hybrid-equipment-qa/main.tsx"></script></body></html>');
  await fs.writeFile(path.join(fixture,'main.tsx'),`
    import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {SubsidiaryEscalationManager} from '../../src/components/company/SubsidiaryEscalationManager';
    import {InstallationsModule} from '../../src/components/installations/InstallationsModule';
    import {EquipmentRequirements} from '../../src/components/inventory/EquipmentRequirements';
    import {HardwareInventoryModule} from '../../src/components/inventory/HardwareInventoryModule';
    import {TooltipProvider} from '../../src/components/ui/tooltip';import {Toaster} from '../../src/components/ui/toaster';import '../../src/index.css';
    const user={id:'admin',role:'SuperAdmin',subsidiary_id:'sub',permissions:[]};
    function Fixture(){const [view,setView]=React.useState('configuration');return <main className="p-3"><nav className="flex gap-2 mb-4">{['configuration','installations','requirements','inventory'].map((item)=><button key={item} onClick={()=>setView(item)}>{item}</button>)}</nav>{view==='configuration'?<SubsidiaryEscalationManager user={user as any}/>:view==='installations'?<InstallationsModule user={user as any}/>:view==='requirements'?<EquipmentRequirements user={user as any}/>:<HardwareInventoryModule user={user as any}/>}<Toaster/></main>}
    createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><TooltipProvider><Fixture/></TooltipProvider></QueryClientProvider>);
  `);
  const {createServer}=await import('vite');
  const server=await createServer({root,server:{host:'127.0.0.1',port:0},logLevel:'error'});
  await server.listen();
  const base=`http://127.0.0.1:${server.httpServer.address().port}`;
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();const errors=[];page.on('pageerror',(e)=>errors.push(e.message));
    const subsidiary={id:'sub',subsidiary_name:'MAREZI',equipment_configuration:null,default_escalation_matrix:null};
    let installation={id:'installation',client_id:'client',branch_id:'branch',kiosk_type:'Queue Management',status:'in_progress',kiosk_count:0,led_count:0,counter_count:0,service_points:0,media_controllers:0,equipment_quantities:{},handover_status:'pending'};
    let rejectSave=false;let configurationWrites=0;let required=false;let savedSelection;
    const custom=()=>subsidiary.equipment_configuration?.find((item)=>item.field.startsWith('custom_'));
    await page.route('**/api/**',async(route)=>{
      const request=route.request();const url=new URL(request.url());const p=url.pathname;let data=[];
      if(p==='/api/time')return route.fulfill({contentType:'application/json',body:JSON.stringify({now:new Date().toISOString(),time_zone:'Africa/Nairobi'})});
      if(p==='/api/scheduling/policy')return route.fulfill({contentType:'application/json',body:JSON.stringify({configuration:{time_zone:'Africa/Nairobi'}})});
      if(p==='/api/subsidiaries/sub' && request.method()==='PATCH'){
        if(rejectSave){rejectSave=false;return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Fixture validation failed; correct the configuration.'})});}
        const body=request.postDataJSON();assert.deepEqual(Object.keys(body),['equipment_configuration']);
        Object.assign(subsidiary,body);configurationWrites++;data={success:true};
      }else if(p==='/api/subsidiaries')data=[subsidiary];
      else if(p==='/api/installations/installation' && request.method()==='PATCH'){
        const body=request.postDataJSON();savedSelection=body.hardware_selection;installation={...installation,...body};data={success:true};
      }else if(p==='/api/installations')data=[installation];
      else if(p==='/api/clients')data=[{id:'client',client_name:'Test Client',branch:'Main',subsidiary_id:'sub'}];
      else if(p==='/api/clients/client/branches')data=[{id:'branch',client_id:'client',branch_name:'Main',status:'active'}];
      else if(p==='/api/hardware/equipment_requirement') {required=request.postDataJSON().serial_required;data={success:true};}
      else if(p==='/api/hardware/equipment-requirements')data={subsidiaries:[{id:'sub',subsidiary_name:'MAREZI',can_edit:true,equipment:(subsidiary.equipment_configuration || []).filter((item)=>!['kiosk_type','screen_with_size','staff_trained'].includes(item.field)).map((item)=>({...item,serial_required:item.field===custom()?.field && required,model_numbers:[]}))}]};
      else if(p==='/api/hardware/catalog')data={variants:[],models:[{id:'model',model_number:'Core-26-M1',family:'MC',model_year:2026,approval_status:'Approved',equipment_field:custom()?.field}],equipment_fields:[{field:'kiosk_count',label:'Kiosks'}],equipment_fields_by_subsidiary:{sub:[{field:custom()?.field,label:custom()?.label}]},subsidiaries:[subsidiary],locations:[],clients:[],installations:[],technicians:[],statuses:[],conditions:[],policy:{}};
      else if(p==='/api/hardware/assets')data={total:1,rows:[{id:'asset',model_id:'model',model_number:'Core-26-M1',serial_number:'MRZ-MC-M1-26-1001',equipment_field:custom()?.field,status:'Available',selectable:true}]};
      else if(p==='/api/hardware/installations/installation')data={rows:[]};
      else if(p==='/api/hardware/summary')data={total:1,counts:{},pending:0};
      else if(p==='/api/hardware/alerts')data={rules:[],low_stock:[],assets:[]};
      else if(p==='/api/files')data={data:[]};
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    });
    for(const [name,width,height] of [['desktop',1366,900],['mobile',390,844]]){
      subsidiary.equipment_configuration=null;required=false;
      installation={...installation,kiosk_type:'Queue Management',equipment_quantities:{}};
      await page.setViewportSize({width,height});await page.goto(`${base}/tmp/hybrid-equipment-qa/index.html`);
      assert.equal(await page.title(),'Hybrid Equipment QA');
      await page.getByRole('button',{name:'Edit',exact:true}).click();
      await page.getByRole('tab',{name:'E-Handover Equipment',exact:true}).click();
      await page.getByLabel('New equipment name',{exact:true}).fill('Network Routers');
      await page.locator('#new-equipment-status').fill('Connected');
      await page.getByRole('button',{name:'Add New Type',exact:true}).click();
      const input=page.locator('input[id^="equipment-label-custom_"]');
      await input.fill('Managed Routers');
      await page.locator('#equipment-label-counter_count').fill('Self Service Kiosks');
      await page.locator('#equipment-label-kiosk_type').fill('Installation Category');
      await page.locator('#equipment-label-screen_with_size').fill('Display Specification');
      await page.getByRole('button',{name:'Remove UPS Units',exact:true}).click();
      await page.getByRole('button',{name:'Move Managed Routers up',exact:true}).click();
      rejectSave=true;
      await page.getByRole('button',{name:'Save Configuration',exact:true}).click();
      await page.getByRole('alert').filter({hasText:'Fixture validation failed'}).waitFor();
      assert.equal(await input.inputValue(),'Managed Routers');
      await page.getByRole('button',{name:'Save Configuration',exact:true}).click();
      await page.getByRole('dialog').waitFor({state:'hidden'});
      assert.ok(custom());const field=custom().field;
      await page.getByRole('button',{name:'Edit',exact:true}).click();
      await page.getByRole('tab',{name:'E-Handover Equipment',exact:true}).click();
      assert.equal(await page.locator(`#equipment-label-${field}`).inputValue(),'Managed Routers');
      const box=await page.getByRole('dialog').boundingBox();assert.ok(box.y>=0 && box.y+box.height<=height+1);
      await page.screenshot({path:path.join(evidence,`${name}-custom-editor.png`)});
      await page.getByRole('button',{name:'Cancel',exact:true}).click();
      await page.getByRole('button',{name:'installations',exact:true}).click();
      await page.getByRole('button',{name:'Open actions menu'}).first().click();
      await page.getByRole('menuitem',{name:'Edit Installation',exact:true}).click();
      const quantity=page.getByLabel('Managed Routers',{exact:true});await quantity.fill('2');
      assert.equal(await page.getByLabel('Self Service Kiosks',{exact:true}).count(),1);
      assert.equal(await page.getByLabel('Installation Category *',{exact:true}).count(),1);
      assert.equal(await page.getByLabel('Display Specification',{exact:true}).count(),1);
      assert.equal(await page.locator('#ups_count').count(),0);
      assert.deepEqual(await page.locator('[data-equipment-field]').evaluateAll((nodes)=>nodes.map((node)=>node.getAttribute('data-equipment-field'))),subsidiary.equipment_configuration.map((item)=>item.field));
      await page.getByLabel('LED Displays',{exact:true}).fill('2');
      await page.getByLabel('LED Displays 1 name',{exact:true}).fill('Reception Display');
      await page.getByLabel('LED Displays 2 name',{exact:true}).fill('Service Display');
      await page.getByRole('button',{name:/Managed Routers.*0\/2/}).click();
      await page.getByRole('button',{name:'Select MRZ-MC-M1-26-1001',exact:true}).click();
      await page.getByText('Physical devices match the selected serials',{exact:true}).click();
      await page.getByRole('button',{name:'Save Changes',exact:true}).click();
      await page.getByRole('heading',{name:'Installation Details',exact:true}).waitFor();
      assert.equal(installation.equipment_quantities[field],2);assert.equal(savedSelection.assets[0].equipment_field,field);
      assert.deepEqual(installation.led_names,['Reception Display','Service Display']);
      const rows=await page.evaluate(async({installation,configuration})=>{
        const {buildHandoverEquipmentRows}=await import('/src/utils/equipmentConfiguration.ts');return buildHandoverEquipmentRows(installation,configuration);
      },{installation,configuration:subsidiary.equipment_configuration});
      const row=rows.find((item)=>item.field===field);assert.equal(row.displayValue,'2');assert.equal(row.label,'Managed Routers');assert.equal(row.status,'Connected');
      assert.deepEqual(rows.map((item)=>item.field),subsidiary.equipment_configuration.map((item)=>item.field));
      assert.equal(rows.find((item)=>item.field==='kiosk_type').label,'Installation Category');
      await page.keyboard.press('Escape');
      subsidiary.equipment_configuration=subsidiary.equipment_configuration.filter((item)=>item.field!=='kiosk_type');
      installation.kiosk_type='';
      await page.getByRole('button',{name:'configuration',exact:true}).click();
      await page.getByRole('button',{name:'installations',exact:true}).click();
      await page.getByRole('button',{name:'Open actions menu'}).first().click();
      await page.getByRole('menuitem',{name:'Edit Installation',exact:true}).click();
      assert.equal(await page.locator('#kiosk_type').count(),0);
      await page.getByRole('button',{name:'Save Changes',exact:true}).click();
      await page.getByRole('heading',{name:'Installation Details',exact:true}).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('button',{name:'requirements',exact:true}).click();
      await page.getByRole('checkbox',{name:'Serial required for Managed Routers in MAREZI',exact:true}).click();assert.equal(required,true);
      await page.screenshot({path:path.join(evidence,`${name}-inventory-requirements.png`)});
      await page.getByRole('button',{name:'inventory',exact:true}).click();
      await page.getByRole('button',{name:'Generate Serials',exact:true}).click();
      await page.getByLabel('Installation Equipment Item',{exact:true}).selectOption(field);
      assert.equal(await page.getByLabel('Installation Equipment Item',{exact:true}).inputValue(),field);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('vite-error-overlay').count(),0);
    }
    assert.deepEqual(errors,[]);assert.equal(configurationWrites,2);
    console.log(JSON.stringify({fixtureOnly:true,viewports:['1366x900','390x844'],customCreateEditReopen:true,persistentErrors:true,installationQuantities:true,serialSelection:true,handoverRows:true,inventoryRequirements:true,errors,evidence},null,2));
  }finally{await browser.close();await server.close();}
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
