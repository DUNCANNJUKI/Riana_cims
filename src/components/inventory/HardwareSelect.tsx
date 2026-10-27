import {Label} from '@/components/ui/label';
const controlClass='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50';
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
  options: Array<{ value: string; label: string }>;
  empty?: string;
  required?: boolean;
}) {
  const id = `hardware-${label.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        data-tour={label === "Hardware Report" ? "inventory-report" : undefined}
        className={controlClass}
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
  );
}
