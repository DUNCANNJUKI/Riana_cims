import {useEffect,useState} from 'react';
import {Download} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Label} from '@/components/ui/label';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Alert,AlertDescription} from '@/components/ui/alert';
import {Table,TableBody,TableHead,TableHeader,TableRow,TableCell} from '@/components/ui/table';
import {hardwarePost,assetIdFromScan,type HardwareCatalog} from './hardwareApi';
import {HardwareSelect} from './HardwareSelect';
import {QrScanner} from './QrScanner';
import type {User} from '@/types';
export type StocktakeResult={id?:string;snapshot?:string;expected_count?:number;matched:string[];missing:string[];unexpected:string[];details?:Record<string,Array<{id:string;serial_number?:string;manufacturer_serial?:string;status?:string}>>};
export function StocktakeSummary({result,download=false}:{result:StocktakeResult;download?:boolean}){
  const rows=['matched','missing','unexpected'].flatMap((kind)=>(result.details?.[kind] || result[kind as 'matched'].map((id)=>({id,serial_number:id}))).map((item)=>({kind,...item})));
  const exportCsv=async()=>{
    const {default:Papa}=await import('papaparse');const blob=new Blob([Papa.unparse(rows,{escapeFormulae:true})],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='stocktake-results.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <div className="min-w-0 space-y-3"><dl className="grid grid-cols-3 gap-2">{(['matched','missing','unexpected'] as const).map((kind)=><div key={kind}><dt className="capitalize text-sm">{kind}</dt><dd className="text-lg font-semibold">{result[kind].length}</dd></div>)}</dl>
    <div className="max-h-64 min-w-0 max-w-full overflow-auto"><Table><TableHeader><TableRow><TableHead>Result</TableHead><TableHead>Serial / Identity</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{rows.map((row)=><TableRow key={`${row.kind}-${row.id}`}><TableCell className="capitalize">{row.kind}</TableCell><TableCell className="break-all">{row.serial_number || row.manufacturer_serial || row.id}</TableCell><TableCell>{'status' in row?row.status:''}</TableCell></TableRow>)}</TableBody></Table></div>
    {download && <Button variant="outline" onClick={()=>void exportCsv()}><Download className="mr-2 h-4 w-4"/>Export Results</Button>}
  </div>;
}
export function StocktakeDialog({open,onOpenChange,user,catalog,onComplete}:{open:boolean;onOpenChange:(open:boolean)=>void;user:User;catalog?:HardwareCatalog;onComplete:(result:StocktakeResult)=>void}){
  const [sub,setSub]=useState('');const [location,setLocation]=useState('');const [text,setText]=useState('');const [preview,setPreview]=useState<StocktakeResult|null>(null);const [confirmed,setConfirmed]=useState(false);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{if(open){setSub(user.subsidiary_id || catalog?.subsidiaries[0]?.id || '');setLocation('');setText('');setPreview(null);setConfirmed(false);setError('');}},[open]);
  const invalidate=()=>{setPreview(null);setConfirmed(false);setError('');};
  const submit=async(apply=false)=>{
    setBusy(true);setError('');try{
      const observed_ids=text.split(/[\r\n,]+/).map((item)=>assetIdFromScan(item.trim())).filter(Boolean);
      const result=await hardwarePost(apply?'/reconcile':'/reconcile-preview',{subsidiary_id:sub,location_id:location,observed_ids,...(apply?{snapshot:preview?.snapshot,confirm_missing:confirmed}:{})});
      if(apply){onComplete(result);onOpenChange(false);}else {setPreview(result);setConfirmed(false);}
    }catch(e){setError((e as Error).message);if(apply){setPreview(null);setConfirmed(false);}}finally{setBusy(false);}
  };
  return <Dialog open={open} onOpenChange={(v)=>{if(!busy)onOpenChange(v);}}><DialogContent className="flex max-h-[90dvh] w-[calc(100vw-2rem)] max-w-3xl flex-col overflow-hidden sm:w-full [&>*]:min-w-0"><DialogHeader className="shrink-0"><DialogTitle>Physical Stocktake</DialogTitle><DialogDescription>Location count and reconciliation</DialogDescription></DialogHeader>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
    <HardwareSelect label="Owning Subsidiary" value={sub} onChange={(v)=>{setSub(v);setLocation('');invalidate();}} options={(catalog?.subsidiaries || []).map((s)=>({value:s.id,label:s.subsidiary_name}))}/>
    <HardwareSelect label="Stocktake Location" value={location} onChange={(v)=>{setLocation(v);invalidate();}} options={(catalog?.locations || []).filter((l)=>l.subsidiary_id===sub).map((l)=>({value:l.id,label:l.name}))}/>
    <Label htmlFor="stocktake-observed">Observed Serials / Manufacturer Serials / Asset IDs</Label><textarea id="stocktake-observed" className="min-h-28 w-full rounded-md border bg-background p-2" value={text} onChange={(e)=>{setText(e.target.value);invalidate();}} disabled={busy}/>
    <QrScanner onScan={(id)=>{setText((previous)=>`${previous}\n${id}`);invalidate();}}/>
    {preview && <><StocktakeSummary result={preview}/>{preview.missing.length>0 && <label className="flex items-center gap-2"><Checkbox checked={confirmed} onCheckedChange={(v)=>setConfirmed(v===true)}/>Confirm {preview.missing.length} items are physically missing</label>}</>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    </div>
    <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:justify-end"><Button variant="outline" disabled={busy} onClick={()=>onOpenChange(false)}>Cancel</Button><Button variant="outline" disabled={busy || !location} onClick={()=>void submit()}>Preview Count</Button><Button className="col-span-2" disabled={busy || !preview || (preview.missing.length>0 && !confirmed)} onClick={()=>void submit(true)}>Apply Stocktake</Button></div>
  </DialogContent></Dialog>;
}
