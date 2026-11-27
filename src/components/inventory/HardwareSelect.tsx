import {Label} from '@/components/ui/label';
import { EquipmentIcon } from './EquipmentIcon';
import type { EquipmentIconKind } from '@/utils/equipmentImages';
const controlClass='flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors hover:border-primary/30 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:bg-muted/60 disabled:opacity-60';
export function HardwareSelect({
  label,
  value,
  onChange,
  options,
  empty = "Select",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; icon?: EquipmentIconKind }>;
  empty?: string;
  required?: boolean;
}) {
  const id = `hardware-${label.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
  const icon = options.find((option) => option.value === value)?.icon;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex min-w-0 items-center gap-2">
        <EquipmentIcon kind={icon} />
        <select
          id={id}
          data-tour={label === "Hardware Report" ? "inventory-report" : undefined}
          className={`${controlClass} min-w-0`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        >
          <option value="">{empty}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
