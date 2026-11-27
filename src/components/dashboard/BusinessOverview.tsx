import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EquipmentIcon } from "@/components/inventory/EquipmentIcon";
import { NoticeBoard } from "@/components/noticeboard/NoticeBoard";
import { apiClient } from "@/integrations/apiClient";
import type { User } from "@/types";
import type { EquipmentIconKind } from "@/utils/equipmentImages";

type Overview = {
  business: { subsidiary_name: string; clients: number };
  installation_statuses: { status: string | null; total: number }[];
  installations: { overdue: number; pending_handovers: number; kiosks: number; displays: number;
    service_points: number; media_controllers: number; average_days: number | null; measured: number; on_time: number };
  request_totals: { open: number; completed: number; pending_approvals: number; pending_acceptance: number; overdue: number };
  finance: { currency: string; budgets: number; recorded_budget: string }[];
  attention: { id: string; client_name: string; due_date: string | null; reason: string }[];
  team: { active_technicians: number; assignments: number; completed_assignments: number; overdue_assignments: number };
  inventory: { allocated: number; deployed: number; faulty: number } | null;
};

type Section = "dashboard" | "business-escalations" | "performance";
type MetricValue = string | number;

const ratio = (portion: number, total: number) =>
  total ? `${Math.round(100 * portion / total)}%` : "Not available";

function Metric({ label, value, icon }: { label: string; value: MetricValue; icon?: EquipmentIconKind }) {
  return (
    <div className="flex min-w-0 items-center gap-2 bg-card px-3 py-2">
      <EquipmentIcon kind={icon} />
      <div className="min-w-0 break-words">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      </div>
    </div>
  );
}

function Metrics({ values }: { values: [string, MetricValue][] }) {
  return <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 xl:grid-cols-4">
    {values.map(([label, value]) => <Metric key={label} label={label} value={value} />)}
  </dl>;
}

function AttentionList({ data, onNavigate }: { data: Overview; onNavigate: (module: string, recordId?: string) => void }) {
  return (
    <section aria-labelledby="executive-attention" className="space-y-2">
    <h2 id="executive-attention" className="font-semibold">Items requiring attention</h2>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => onNavigate("business-approvals")}>
        Pending change approvals · {data.request_totals.pending_approvals}
      </Button>
      <Button variant="outline" size="sm" onClick={() => onNavigate("business-overdue")}>
        Overdue change requests · {data.request_totals.overdue}
      </Button>
    </div>
    {data.attention.length ? <ul className="divide-y rounded-lg border bg-card">
      {data.attention.map(item => <li key={item.id}>
        <button className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline" onClick={() => onNavigate("installations", item.id)}>
          <span className="min-w-0 break-words"><span className="font-medium">{item.client_name}</span><span className="block text-xs text-muted-foreground">{item.reason}</span></span>
          {item.due_date && <time className="shrink-0 text-xs text-muted-foreground" dateTime={item.due_date}>{item.due_date}</time>}
        </button>
      </li>)}
    </ul> : <p className="text-sm text-muted-foreground">No overdue installations, near deadlines, or pending handovers found.</p>}
  </section>
  );
}

export function BusinessOverview({ user, section = "dashboard", onNavigate }: {
  user: User;
  section?: Section;
  onNavigate: (module: string, recordId?: string) => void;
}) {
  const overview = useQuery<Overview>({
    queryKey: ["business", "overview", user.id, user.subsidiary_id],
    queryFn: () => apiClient.get("/business/overview"),
  });
  const data = overview.data;
  const dashboard = section === "dashboard";
  const installCount = (status: string) =>
    data?.installation_statuses.reduce((sum, row) => sum + ((row.status ?? "pending") === status ? Number(row.total) : 0), 0) ?? 0;
  const total = data?.installation_statuses.reduce((sum, row) => sum + Number(row.total), 0) ?? 0;

  return (
    <div className="space-y-5">
      <header className="cims-page-header">
        <div>
          <h1 className="cims-page-title">{dashboard ? "Executive Dashboard" : section === "performance" ? "Business Performance" : "Business Escalations"}</h1>
          {data && <p className="cims-page-subtitle">{data.business.subsidiary_name}</p>}
        </div>
      </header>
      {overview.isError && <div className="flex flex-wrap items-center gap-3 rounded-md border p-3" role="alert">
        <p className="text-sm">Unable to load the business overview.</p>
        <Button variant="outline" size="sm" onClick={() => void overview.refetch()}>Retry</Button>
      </div>}
      {overview.isPending && <Skeleton className="h-24 w-full" aria-label="Loading business overview" />}
      {data && <>
        {section !== "business-escalations" && <>
          <Metrics values={[
            ["Clients", data.business.clients], ["Active technicians", data.team.active_technicians],
            ["Installations", total], ["In progress", installCount("in_progress")],
            ["Completed", installCount("completed")], ["Pending", installCount("pending") + installCount("waiting")],
            ["Overdue installations", data.installations.overdue], ["Completion rate", ratio(installCount("completed"), total)],
            ["Open change requests", data.request_totals.open], ["Implemented change requests", data.request_totals.completed],
            ["Client sign-offs pending", data.request_totals.pending_acceptance], ["Pending handovers", data.installations.pending_handovers],
          ]} />
          {dashboard && <AttentionList data={data} onNavigate={onNavigate} />}
          <section aria-labelledby="executive-equipment" className="space-y-2">
            <h2 id="executive-equipment" className="font-semibold">Equipment overview</h2>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
              <Metric label="Kiosks" value={data.installations.kiosks} icon="kiosk" />
              <Metric label="TV displays" value={data.installations.displays} icon="display" />
              <Metric label="Service points" value={data.installations.service_points} icon="service-point" />
              <Metric label="Media controllers" value={data.installations.media_controllers} icon="media-controller" />
            </dl>
            <Metrics values={[
              ["Registered assets", data.inventory?.allocated ?? "Not available"],
              ["Deployed assets", data.inventory?.deployed ?? "Not available"],
              ["Faulty assets", data.inventory?.faulty ?? "Not available"],
            ]} />
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-labelledby="executive-finance" className="space-y-2 rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="executive-finance" className="font-semibold">Finance overview</h2>
                <Button size="sm" variant="link" onClick={() => onNavigate("finances")}>View budgets</Button>
              </div>
              {data.finance.length ? <dl className="space-y-1 text-sm">
                {data.finance.map(row => <div key={row.currency} className="flex flex-wrap justify-between gap-2">
                  <dt>Recorded budgets · {row.currency}</dt>
                  <dd className="font-medium tabular-nums">{Number(row.recorded_budget).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</dd>
                </div>)}
              </dl> : <p className="text-sm text-muted-foreground">No current budgets recorded.</p>}
              <p className="text-xs text-muted-foreground">Approved budgets, actual expenditure and utilization are not available.</p>
            </section>
            <section aria-labelledby="executive-performance" className="space-y-2 rounded-lg border bg-card p-3">
              <h2 id="executive-performance" className="font-semibold">Installation performance</h2>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between gap-2"><dt>Average installation duration</dt><dd>{data.installations.average_days == null ? "Not available" : `${Number(data.installations.average_days).toFixed(1)} days`}</dd></div>
                <div className="flex justify-between gap-2"><dt>On-time completion</dt><dd>{ratio(data.installations.on_time, data.installations.measured)}</dd></div>
              </dl>
            </section>
          </div>
        </>}
        {section === "performance" && <section className="space-y-2" aria-labelledby="business-team-metrics">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="business-team-metrics" className="font-semibold">Team performance</h2>
            <Button variant="link" size="sm" onClick={() => onNavigate("reports")}>Open reports and date filters</Button>
          </div>
          <Metrics values={[
            ["Assignments", data.team.assignments], ["Completed assignments", data.team.completed_assignments],
            ["Overdue assignments", data.team.overdue_assignments], ["Assignment completion", ratio(data.team.completed_assignments, data.team.assignments)],
          ]} />
        </section>}

        {section === "business-escalations" && <AttentionList data={data} onNavigate={onNavigate} />}
        {dashboard && <NoticeBoard compact onNavigate={onNavigate} />}
      </>}
    </div>
  );
}
