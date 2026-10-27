import {useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Plus,Download,RefreshCw,History,Settings,Search} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Alert,AlertDescription} from '@/components/ui/alert';
import {Checkbox} from '@/components/ui/checkbox';
import {PlanningDateInput} from '@/components/common/PlanningDateInput';
import {apiClient,apiFetch} from '@/integrations/apiClient';
import {can} from '@/security/accessControl';
import type {User} from '@/types';

type Event={id:string;title:string;subsidiary_id:string;branch_id:string|null;activity_type:string;start_utc:string;end_utc:string;time_zone:string;status:string;indicator:string;resource_ids:string[];version:number;series_id?:string};
type Catalog={subsidiaries:Array<{id:string;subsidiary_name:string}>;resources:Array<{id:string;first_name:string;last_name:string;subsidiary_id:string}>;branches:Array<{id:string;branch_name:string;subsidiary_id:string}>};
const control='h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';
function localValue(value:string,zone:string){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function SchedulingWorkspace({user}: {user:User}){
  const client=useQueryClient();const actor=JSON.stringify([user.id,user.role,user.subsidiary_id,user.permissions,user.extra_permissions]);
  const [subsidiary,setSubsidiary]=useState(user.subsidiary_id||'');const [branch,setBranch]=useState('');
  const [from,setFrom]=useState('');const [to,setTo]=useState('');const [technician,setTechnician]=useState('');const [page,setPage]=useState(1);
  const [open,setOpen]=useState(false);const [edit,setEdit]=useState<Event|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [availability,setAvailability]=useState('');
  const [form,setForm]=useState({title:'',activity_type:'installation',start:'',end:'',time_zone:'Africa/Nairobi',resource_ids:[] as string[],status:'scheduled',reason:'',override_reason:'',frequency:'',count:4});
  const [policyOpen,setPolicyOpen]=useState(false);const [rules,setRules]=useState('');const [history,setHistory]=useState<Array<{id:string;reason:string;created_at:string}>|null>(null);
  const submission=useRef<{body:string;key:string}|null>(null);
  const catalog=useQuery<Catalog>({queryKey:['scheduling','catalog',actor],queryFn:()=>apiClient.get('/scheduling/catalog'),retry:false});
  const policy=useQuery<{configuration:{time_zone:string};overrides:Record<string,unknown>;version:number;scope_key:string}>({queryKey:['scheduling','policy',actor,subsidiary,branch],queryFn:()=>apiClient.get(`/scheduling/policy?${new URLSearchParams({...(subsidiary?{subsidiary_id:subsidiary}:{}),...(branch?{branch_id:branch}:{})})}`),enabled:!!catalog.data,retry:false});
  const query=new URLSearchParams({page:String(page),...(subsidiary?{subsidiary_id:subsidiary}:{}),...(branch?{branch_id:branch}:{}),...(from?{from}:{}),...(to?{to}:{}),...(technician?{technician_id:technician}:{}),time_zone:policy.data?.configuration.time_zone||'Africa/Nairobi'});
  const events=useQuery<{rows:Event[];total:number;overdue:number}>({queryKey:['scheduling','events',actor,query.toString()],queryFn:()=>apiClient.get(`/scheduling/events?${query}`),enabled:!!catalog.data,refetchInterval:30000,retry:false});
  const manage=can(user,'assignments.manage');const change=(key:string,value:unknown)=>{setForm(f=>({...f,[key]:value}));setAvailability('');};
  const refresh=()=>client.invalidateQueries({queryKey:['scheduling']});
  function begin(event:Event|null){
    submission.current=null;
    setEdit(event);setError('');setAvailability('');const zone=event?.time_zone||policy.data?.configuration.time_zone||'Africa/Nairobi';
    setForm({title:event?.title||'',activity_type:event?.activity_type||'installation',start:event?localValue(event.start_utc,zone):'',end:event?localValue(event.end_utc,zone):'',time_zone:zone,resource_ids:event?.resource_ids||[],status:event?.status||'scheduled',reason:'',override_reason:'',frequency:'',count:4});
    setOpen(true);
  }
  function payload(){
    const {frequency,count,...body}=form;const data:Record<string,unknown>={...body,subsidiary_id:edit?.subsidiary_id||subsidiary,branch_id:edit?.branch_id||branch||null};
    if(edit){data.version=edit.version;if(form.start===localValue(edit.start_utc,edit.time_zone))delete data.start;if(form.end===localValue(edit.end_utc,edit.time_zone))delete data.end;if(form.time_zone===edit.time_zone)delete data.time_zone;}
    else if(frequency)data.recurrence={frequency,count};
    return data;
  }
  async function save(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{
    const body=JSON.stringify(payload());
    if(submission.current?.body!==body)submission.current={body,key:crypto.randomUUID()};
    await apiFetch(`/scheduling/events${edit?`/${edit.id}`:''}`,{method:edit?'PATCH':'POST',headers:{'Idempotency-Key':submission.current.key},body});
    setOpen(false);await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Unable to save this schedule.');}finally{setBusy(false);}}
  async function exportPage(){const {default:Papa}=await import('papaparse');const csv=Papa.unparse((events.data?.rows||[]).map(e=>({Title:e.title,StartUTC:e.start_utc,EndUTC:e.end_utc,TimeZone:e.time_zone,Status:e.indicator,TechnicianIDs:e.resource_ids.join(';')})),{escapeFormulae:true});const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const link=document.createElement('a');link.href=url;link.download='scheduling-page.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  if(catalog.isError)return <Alert><AlertDescription>Timed scheduling is unavailable. Legacy assignment records remain below.</AlertDescription></Alert>;
  if(!catalog.data)return <p role="status" className="text-sm">Loading scheduling calendar...</p>;
  const resources=catalog.data.resources.filter(r=>r.subsidiary_id===subsidiary);
  return <section aria-label="Timed scheduling" className="space-y-4 border-b pb-6">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">Timed Schedule</h2><div className="flex flex-wrap gap-2">
      <Button variant="outline" size="icon" aria-label="Refresh schedule" onClick={()=>void refresh()}><RefreshCw className="h-4 w-4"/></Button>
      {can(user,'reports.view')&&<Button variant="outline" onClick={()=>void exportPage()}><Download className="mr-2 h-4 w-4"/>Export Page</Button>}
      {(user.role==='SuperAdmin'||can(user,'subsidiaries.manage'))&&<Button variant="outline" disabled={!policy.data} onClick={()=>{setRules(JSON.stringify(policy.data?.overrides||{},null,2));setError('');setPolicyOpen(true);}}><Settings className="mr-2 h-4 w-4"/>Business Calendar</Button>}
      {manage&&<Button disabled={!subsidiary||!policy.data} onClick={()=>begin(null)}><Plus className="mr-2 h-4 w-4"/>Schedule Activity</Button>}
    </div></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div><Label htmlFor="schedule-subsidiary">Subsidiary</Label><select id="schedule-subsidiary" className={control} value={subsidiary} onChange={e=>{setSubsidiary(e.target.value);setBranch('');setTechnician('');setPage(1);}}><option value="">All authorized</option>{catalog.data.subsidiaries.map(s=><option key={s.id} value={s.id}>{s.subsidiary_name}</option>)}</select></div>
      <div><Label htmlFor="schedule-branch">Branch</Label><select id="schedule-branch" className={control} value={branch} onChange={e=>{setBranch(e.target.value);setPage(1);}}><option value="">All branches</option>{catalog.data.branches.filter(b=>b.subsidiary_id===subsidiary).map(b=><option key={b.id} value={b.id}>{b.branch_name}</option>)}</select></div>
      <div><Label htmlFor="schedule-technician">Technician</Label><select id="schedule-technician" className={control} value={technician} onChange={e=>{setTechnician(e.target.value);setPage(1);}}><option value="">All authorized</option>{resources.map(r=><option key={r.id} value={r.id}>{r.first_name} {r.last_name}</option>)}</select></div>
      <div><Label htmlFor="schedule-from">From</Label><Input id="schedule-from" type="date" value={from} onChange={e=>{setFrom(e.target.value);setPage(1);}}/></div>
      <div><Label htmlFor="schedule-to">To</Label><Input id="schedule-to" type="date" value={to} onChange={e=>{setTo(e.target.value);setPage(1);}}/></div>
    </div>
    <div className="flex flex-wrap gap-4 text-sm"><span>Time zone: {policy.data?.configuration.time_zone||'Africa/Nairobi'}</span><span>Activities: {events.data?.total||0}</span><span>Overdue: {events.data?.overdue||0}</span></div>
    {(events.isError||error&&!open&&!policyOpen)&&<Alert variant="destructive"><AlertDescription>{error||'Schedules could not be loaded. Refresh to try again.'}</AlertDescription></Alert>}
    <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead><tr className="border-b text-left"><th className="p-2">Activity</th><th className="p-2">Start</th><th className="p-2">End</th><th className="p-2">Status</th><th className="p-2">Actions</th></tr></thead><tbody>{events.data?.rows.map(e=><tr key={e.id} className="border-b"><td className="max-w-[240px] break-words p-2">{e.title}</td><td className="p-2">{localValue(e.start_utc,e.time_zone).replace('T',' ')}<span className="block text-xs text-muted-foreground">{e.time_zone}</span></td><td className="p-2">{localValue(e.end_utc,e.time_zone).replace('T',' ')}</td><td className="p-2">{e.indicator}</td><td className="p-2"><div className="flex gap-2">{manage&&['scheduled','in_progress'].includes(e.status)&&<Button size="sm" variant="outline" onClick={()=>begin(e)}>Edit / Reschedule</Button>}<Button size="icon" variant="ghost" aria-label={`History for ${e.title}`} onClick={async()=>{try{const result=await apiClient.get(`/scheduling/events/${e.id}/history`);setHistory(result.rows);}catch{setError('Schedule history could not be loaded.');}}}><History className="h-4 w-4"/></Button></div></td></tr>)}</tbody></table></div>
    {!events.isLoading&&!events.data?.rows.length&&<p className="text-sm text-muted-foreground">No scheduled activities in this range.</p>}
    <div className="flex items-center justify-end gap-3"><Button variant="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</Button><span className="text-sm">Page {page}</span><Button variant="outline" disabled={page*100>=(events.data?.total||0)} onClick={()=>setPage(p=>p+1)}>Next</Button></div>
    <Dialog open={open} onOpenChange={value=>!busy&&setOpen(value)}><DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-2xl"><DialogHeader className="shrink-0"><DialogTitle>{edit?'Edit / Reschedule':'Schedule Activity'}</DialogTitle><DialogDescription>{edit?'Update the activity and record a reason.':'New scheduled activity'}</DialogDescription></DialogHeader>
      <form id="schedule-editor" onSubmit={save} className="min-h-0 space-y-4 overflow-y-auto">
        <fieldset disabled={busy} className="min-w-0 space-y-4">
        {error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <div><Label htmlFor="schedule-title">Activity Title</Label><Input id="schedule-title" value={form.title} required maxLength={160} onChange={e=>change('title',e.target.value)}/></div>
        <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="schedule-type">Activity Type</Label><select id="schedule-type" className={control} disabled={!!edit} value={form.activity_type} onChange={e=>change('activity_type',e.target.value)}>{['installation','maintenance','task','follow_up','leave','appointment'].map(t=><option key={t} value={t}>{t.replace('_',' ')}</option>)}</select></div><div><Label htmlFor="schedule-zone">Scheduling Time Zone</Label><Input id="schedule-zone" value={form.time_zone} required onChange={e=>change('time_zone',e.target.value)}/></div></div>
        <div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="schedule-start">Scheduled Start</Label><PlanningDateInput id="schedule-start" type="datetime-local" required timeZone={form.time_zone} value={form.start} onChange={e=>change('start',e.target.value)}/></div><div><Label htmlFor="schedule-end">Scheduled End</Label><PlanningDateInput id="schedule-end" type="datetime-local" required timeZone={form.time_zone} value={form.end} onChange={e=>change('end',e.target.value)}/></div></div>
        <fieldset className="space-y-2"><legend className="text-sm font-medium">Technicians / Resources</legend><div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">{resources.map(r=><label key={r.id} className="flex items-center gap-2 text-sm"><Checkbox checked={form.resource_ids.includes(r.id)} onCheckedChange={checked=>change('resource_ids',checked?[...form.resource_ids,r.id]:form.resource_ids.filter(id=>id!==r.id))}/>{r.first_name} {r.last_name}</label>)}</div></fieldset>
        {!edit?<div className="grid grid-cols-2 gap-3"><div><Label htmlFor="schedule-repeat">Repeat</Label><select id="schedule-repeat" className={control} value={form.frequency} onChange={e=>change('frequency',e.target.value)}><option value="">Once</option>{['daily','weekly','monthly','quarterly','annually'].map(f=><option key={f} value={f}>{f}</option>)}</select></div>{form.frequency&&<div><Label htmlFor="schedule-count">Occurrences</Label><Input id="schedule-count" type="number" min={2} max={100} value={form.count} onChange={e=>change('count',Number(e.target.value))}/></div>}</div>:<><div><Label htmlFor="schedule-status">Status</Label><select id="schedule-status" className={control} value={form.status} onChange={e=>change('status',e.target.value)}>{['scheduled','in_progress','completed','cancelled'].map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}</select></div><div><Label htmlFor="schedule-reason">Change Reason</Label><Textarea id="schedule-reason" required minLength={5} maxLength={500} value={form.reason} onChange={e=>change('reason',e.target.value)}/></div></>}
        {availability&&<p role="status" className="text-sm">{availability}</p>}
        {user.role==='SuperAdmin'&&<div><Label htmlFor="schedule-override">Business Calendar Override Reason (Optional)</Label><Textarea id="schedule-override" minLength={5} maxLength={500} value={form.override_reason} onChange={e=>change('override_reason',e.target.value)}/></div>}
        {edit?.series_id&&<Button type="button" variant="destructive" disabled={busy||form.reason.trim().length<5} onClick={async()=>{if(!window.confirm('Cancel all future scheduled occurrences in this series?'))return;setBusy(true);try{await apiClient.post(`/scheduling/events/${edit.id}/cancel-series`,{version:edit.version,reason:form.reason});setOpen(false);await refresh();}catch(e){setError(e instanceof Error?e.message:'Unable to cancel this series.');}finally{setBusy(false);}}}>Cancel Future Series</Button>}
        </fieldset>
      </form>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t pt-3"><Button type="button" variant="outline" disabled={busy} onClick={async()=>{try{setAvailability('');const result=await apiClient.post('/scheduling/availability',{...payload(),event_id:edit?.id,start:form.start,end:form.end,time_zone:form.time_zone});setAvailability(result.status);}catch(e){setError(e instanceof Error?e.message:'Availability could not be verified.');}}}><Search className="mr-2 h-4 w-4"/>Check Availability</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>setOpen(false)}>Cancel</Button><Button type="submit" form="schedule-editor" disabled={busy}>{busy?'Saving...':'Confirm Schedule'}</Button></div>
    </DialogContent></Dialog>
    <Dialog open={policyOpen} onOpenChange={setPolicyOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Business Calendar</DialogTitle><DialogDescription>{policy.data?.scope_key}</DialogDescription></DialogHeader>{error&&<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<Label htmlFor="schedule-rules">Calendar Rules (JSON)</Label><Textarea id="schedule-rules" className="min-h-64 font-mono text-xs" value={rules} onChange={e=>setRules(e.target.value)}/><Button disabled={busy} onClick={async()=>{setBusy(true);try{await apiClient.put('/scheduling/policy',{scope_key:policy.data?.scope_key,version:policy.data?.version,configuration:JSON.parse(rules)});setPolicyOpen(false);await refresh();}catch(e){setError(e instanceof Error?e.message:'Unable to save the policy.');}finally{setBusy(false);}}}>Save Calendar</Button></DialogContent></Dialog>
    <Dialog open={history!==null} onOpenChange={value=>!value&&setHistory(null)}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Schedule History</DialogTitle><DialogDescription>Recorded changes</DialogDescription></DialogHeader>{history?.map(h=><div key={h.id} className="border-b py-2"><p className="break-words text-sm">{h.reason}</p><time className="text-xs text-muted-foreground">{h.created_at}</time></div>)}</DialogContent></Dialog>
  </section>;
}
