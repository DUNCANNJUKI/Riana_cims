import { Fragment } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { HandoverEquipmentItem, Installation } from '@/types';
import { equipmentQuantity, isCustomEquipment } from '@/utils/equipmentConfiguration';

const legacyTypeOptions = ['Interactive Touch', 'Queue Management', 'Digital Signage System', 'Self Service'];

export function InstallationEquipmentFields({ items, value, onChange }: {
  items: HandoverEquipmentItem[];
  value: Partial<Installation>;
  onChange: (value: Partial<Installation>) => void;
}) {
  const setQuantity = (item: HandoverEquipmentItem, raw: string) => {
    const count = Math.max(0, Math.min(10000, Math.trunc(Number(raw) || 0)));
    if (isCustomEquipment(item.field)) {
      const quantities = typeof value.equipment_quantities === 'string'
        ? JSON.parse(value.equipment_quantities) : value.equipment_quantities || {};
      onChange({ ...value, equipment_quantities: { ...quantities, [item.field]: count } });
      return;
    }
    const next = { ...value, [item.field]: count };
    // These stable sources retain their existing per-device naming workflows.
    const namesKey = item.field === 'led_count' ? 'led_names' : item.field === 'counter_count' ? 'counter_names' : null;
    if (namesKey) {
      const names = Array.isArray(value[namesKey]) ? value[namesKey] as string[] : [];
      next[namesKey] = Array.from({ length: count }, (_, index) => names[index] || `${item.label} ${index + 1}`);
    }
    onChange(next);
  };
  return <>{items.map((item) => {
    const textValue = String(value[item.field as keyof Installation] || '');
    const isType = item.field === 'kiosk_type';
    const isText = isType || item.field === 'screen_with_size';
    return <Fragment key={item.field}>
      <div className="min-w-0 space-y-2" data-equipment-field={item.field}>
        <Label htmlFor={item.field} className="break-words">{item.label}{isType ? ' *' : ''}</Label>
        {isType ? <Select value={textValue} onValueChange={(selected) => onChange({ ...value, [item.field]: selected })}>
          <SelectTrigger id={item.field}><SelectValue placeholder={item.label} /></SelectTrigger>
          <SelectContent>{Array.from(new Set([...legacyTypeOptions, ...(textValue ? [textValue] : [])])).map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
        </Select> : isText ? <Input id={item.field} value={textValue} onChange={(event) => onChange({ ...value, [item.field]: event.target.value })} /> :
          <Input id={item.field} type="number" min={0} max={10000} step={1} value={equipmentQuantity(value, item.field) || ''} placeholder="0" onChange={(event) => setQuantity(item, event.target.value)} />}
      </div>
      {item.field === 'led_count' && equipmentQuantity(value, item.field) > 0 && <div className="col-span-1 space-y-3 border-t pt-3 md:col-span-3">
        <Label className="font-semibold">{item.label} Names</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
          {Array.from({ length: equipmentQuantity(value, item.field) }, (_, index) => <Input
            key={index} aria-label={`${item.label} ${index + 1} name`}
            value={(Array.isArray(value.led_names) ? value.led_names[index] : '') || ''}
            placeholder={`${item.label} ${index + 1}`}
            onChange={(event) => { const names = Array.isArray(value.led_names) ? [...value.led_names] : []; names[index] = event.target.value; onChange({ ...value, led_names: names }); }}
          />)}
        </div>
      </div>}
    </Fragment>;
  })}</>;
}
