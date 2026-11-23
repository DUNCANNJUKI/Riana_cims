import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@crms/lib/apiRequest';
import { Button } from '@crms/components/ui/button';
import { Input } from '@crms/components/ui/input';
import { useToast } from '@crms/hooks/use-toast';

type Module = { id: string; name: string; is_active: boolean | number; sort_order: number; version: number };
type Catalogue = { modules: Module[]; canManage: boolean };

export function AffectedModulesPicker({ value, onChange, historical = [] }: { value: string[]; onChange: (modules: string[]) => void; historical?: string[] }) {
  const id = useId();
  const client = useQueryClient();
  const { toast } = useToast();
  const [newName, setNewName] = useState('');
  const query = useQuery<Catalogue>({ queryKey: ['affected-module-catalogue'], queryFn: async () => (await apiRequest('/api/crms/affected-modules', { cache: 'no-store' })).json(), staleTime: 0, refetchOnWindowFocus: true });
  const save = useMutation({
    mutationFn: async (module: { id?: string; name: string; is_active: boolean; sort_order: number; version?: number }) => {
      const { id: moduleId, ...data } = module;
      return (await apiRequest(`/api/crms/affected-modules${moduleId ? `/${encodeURIComponent(moduleId)}` : ''}`, { method: moduleId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })).json();
    },
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['affected-module-catalogue'] }); toast({ title: 'Shared module catalogue updated' }); },
    onError: error => { toast({ title: 'Module could not be saved', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' }); void query.refetch(); },
  });
  const modules = query.data?.modules || [];
  const options = [...new Set([...modules.filter(m => m.is_active).map(m => m.name), ...historical, ...value])];
  return <div className="min-w-0 space-y-3">
    {query.isLoading && <p role="status" className="text-sm text-muted-foreground">Loading shared modules…</p>}
    {query.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">Module catalogue unavailable. Existing selections are retained.<Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>Retry</Button></div>}
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {options.map((name, index) => <label key={name} htmlFor={`${id}-${index}`} className="flex min-w-0 items-start gap-2 rounded-md border p-2 text-sm">
        <input id={`${id}-${index}`} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-primary" checked={value.includes(name)} onChange={() => onChange(value.includes(name) ? value.filter(m => m !== name) : [...value, name])} />
        <span className="min-w-0 [overflow-wrap:anywhere]">{name}{!modules.some(m => m.is_active && m.name === name) && <span className="block text-xs text-muted-foreground">Existing selection</span>}</span>
      </label>)}
    </div>
    {!query.data?.canManage && !query.error && <p className="text-xs text-muted-foreground">Shared options are maintained by SuperAdmin or Developer Lead.</p>}
    {query.data?.canManage && <details className="min-w-0 rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Manage shared modules</summary>
      <p className="my-3 text-xs text-muted-foreground">Add, rename, order or retire options for everyone. Lower order numbers appear first. Existing requests keep their recorded names.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input aria-label="New module name" maxLength={100} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Module name" className="min-w-0" />
        <Button type="button" disabled={save.isPending || !newName.trim()} onClick={async () => { try { await save.mutateAsync({ name: newName, is_active: true, sort_order: Math.min(10000, Math.max(0, ...modules.map(m => m.sort_order)) + 10) }); setNewName(''); } catch { /* Mutation displays the error. */ } }}>Add Module</Button>
      </div>
      <div className="mt-3 space-y-3">{modules.map(module => <ModuleEditor key={`${module.id}-${module.version}`} module={module} disabled={save.isPending} save={data => save.mutate(data)} />)}</div>
    </details>}
  </div>;
}

function ModuleEditor({ module, disabled, save }: { module: Module; disabled: boolean; save: (module: Module & { is_active: boolean }) => void }) {
  const [name, setName] = useState(module.name), [order, setOrder] = useState(String(module.sort_order));
  return <div className="min-w-0 space-y-2 rounded-md border p-2">
    <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_5rem]">
      <label className="min-w-0 space-y-1"><span className="text-xs text-muted-foreground">Name</span><Input aria-label={`Name for ${module.name}`} maxLength={100} value={name} onChange={e => setName(e.target.value)} className="min-w-0" /></label>
      <label className="min-w-0 space-y-1"><span className="text-xs text-muted-foreground">Order</span><Input aria-label={`Order for ${module.name}`} type="number" min={0} max={10000} value={order} onChange={e => setOrder(e.target.value)} className="min-w-0" /></label>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" aria-label={`Save ${module.name}`} variant="outline" size="sm" disabled={disabled || !name.trim() || !/^\d+$/.test(order) || Number(order) > 10000} onClick={() => save({ ...module, name, sort_order: Number(order), is_active: Boolean(module.is_active) })}>Save</Button>
      <Button type="button" aria-label={`${module.is_active ? 'Retire' : 'Reactivate'} ${module.name}`} variant="ghost" size="sm" disabled={disabled} onClick={() => save({ ...module, is_active: !module.is_active })}>{module.is_active ? 'Retire' : 'Reactivate'}</Button>
    </div>
  </div>;
}
