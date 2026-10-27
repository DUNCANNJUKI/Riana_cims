import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type InventorySummary = {
  total: number;
  pending: number;
  counts: Record<string, number>;
  status_totals?: Record<string, number>;
};

export function InventoryReportSummary({ data, onSelect, canExport }: {
  data: InventorySummary;
  onSelect: (report: string) => void;
  canExport: boolean;
}) {
  const totals = data.status_totals || data.counts;
  const sum = (...statuses: string[]) => statuses.reduce((n, s) => n + (totals[s] || 0), 0);
  const rows: Array<[string, number, string]> = [
    ['Registered', data.total, ''],
    ['In stock', sum('Available', 'Reserved', 'Returned'), 'in_stock'],
    ['Out / issued', sum('Assigned', 'Installed', 'In Transit'), 'out'],
    ['Faulty', sum('Faulty'), 'Faulty'],
    ['Maintenance', sum('Under Maintenance'), 'Under Maintenance'],
    ['Returned', sum('Returned'), 'Returned'],
    ['Ready to assign', data.counts.Available || 0, 'Available'],
    ['Generated / unverified', sum('Generated'), 'Generated'],
  ];
  const download = async () => {
    const { default: Papa } = await import('papaparse');
    const csv = Papa.unparse([
      ['Snapshot time', new Date().toISOString()],
      ['Metric', 'Items'],
      ...rows.map(([label, value]) => [label, value]),
      ['Pending approval', data.pending],
      [], ['Lifecycle status', 'Items'],
      ...Object.entries(totals),
    ], { escapeFormulae: true });
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventory-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section aria-label="Inventory report totals" className="space-y-3 border-b pb-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Inventory totals</h3>
      {canExport && <Button variant="outline" size="sm" onClick={download}>
        <Download className="mr-2 h-4 w-4" />Export Summary
      </Button>}
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {rows.map(([label, value, report]) => <button key={label} type="button"
        onClick={() => onSelect(report)}
        className="min-w-0 rounded-md border p-3 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
        <span className="block break-words text-xs text-muted-foreground">{label}</span>
        <span className="block text-xl font-semibold tabular-nums">{value}</span>
      </button>)}
    </div>
  </section>;
}
