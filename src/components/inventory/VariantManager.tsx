import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Plus,Pencil,Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Checkbox} from '@/components/ui/checkbox';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Alert,AlertDescription} from '@/components/ui/alert';
import {hardwarePost,type HardwareCatalog} from './hardwareApi';
type Variant=HardwareCatalog['variants'][number];
export function VariantManager({variants}:{variants:Variant[]}){
  const [open,setOpen]=useState(false);const [editing,setEditing]=useState<Partial<Variant>|null>(null);
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const client=useQueryClient();
  const save=async(remove=false,item=editing)=>{
    if(!item)return;
    if(remove && !window.confirm(`Delete variant ${item.nickname}?`))return;
    setBusy(true);setError('');
    try{await hardwarePost(`/variant_${remove?'delete':item.id?'update':'create'}`,{...item,variant_id:item.id,retired:Boolean(item.retired)});await client.invalidateQueries({queryKey:['hardware']});setEditing(null);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  return <><Button variant="outline" onClick={()=>{setError('');setOpen(true);}}>Variants</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-3xl grid-cols-[minmax(0,1fr)] overflow-auto sm:w-full [&>*]:min-w-0"><DialogHeader><DialogTitle>Hardware Variants</DialogTitle><DialogDescription>Variant register</DialogDescription></DialogHeader>
      <Button className="justify-self-start" disabled={busy} onClick={()=>setEditing({family:'',variant:'',nickname:'',description:'',retired:0})}><Plus className="mr-2 h-4 w-4"/>Add Variant</Button>
      <div className="divide-y">{variants.map((v)=><div key={v.id} className="flex items-center gap-2 py-2"><div className="min-w-0 flex-1"><p className="break-words font-medium">{v.family}-{v.variant} / {v.nickname}</p><p className="break-words text-sm text-muted-foreground">{v.description}</p><p className="text-xs">Dependencies: {v.dependency_count || 0}</p></div>
        <Button size="icon" variant="ghost" aria-label={`Edit variant ${v.nickname}`} title={v.dependency_count?'Saved dependencies prevent changes':'Edit variant'} disabled={busy || !!v.dependency_count} onClick={()=>setEditing({...v})}><Pencil className="h-4 w-4"/></Button>
        <Button size="icon" variant="ghost" aria-label={`Delete variant ${v.nickname}`} title={v.dependency_count?'Saved dependencies prevent deletion':'Delete variant'} disabled={busy || !!v.dependency_count} onClick={()=>void save(true,v)}><Trash2 className="h-4 w-4"/></Button>
      </div>)}</div>
      {editing && <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">{(['family','variant','nickname','description'] as const).map((field)=><div key={field}><Label htmlFor={`variant-${field}`}>{({family:'Family Code',variant:'Variant Code',nickname:'Variant Name',description:'Description'})[field]}</Label><Input id={`variant-${field}`} value={editing[field] || ''} maxLength={{family:8,variant:4,nickname:50,description:150}[field]} onChange={(e)=>setEditing({...editing,[field]:e.target.value})}/></div>)}
        <label className="flex items-center gap-2"><Checkbox checked={!!editing.retired} onCheckedChange={(v)=>setEditing({...editing,retired:v?1:0})}/>Retired</label>
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setEditing(null)}>Cancel Edit</Button><Button disabled={busy} onClick={()=>void save()}>Save Variant</Button></div>
      </div>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    </DialogContent></Dialog>
  </>;
}
