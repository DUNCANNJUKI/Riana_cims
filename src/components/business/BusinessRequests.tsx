import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiClient, downloadAuthenticatedFile } from "@/integrations/apiClient";
import type { User } from "@/types";

const requestCategories = {
  "business-requests": { title: "Client Change Requests", filter: "all" },
  "business-approvals": { title: "Approvals Centre", filter: "approvals" },
  "business-development": { title: "Development Progress", filter: "development" },
  "business-overdue": { title: "Overdue Change Requests", filter: "overdue" },
} as const;

type RequestRow = {
  id: string;
  ticket_number: string;
  client_name: string;
  status: string;
  priority: string;
  requested_on: string | null;
  due_date: string | null;
};
type RequestDetail = RequestRow & {
  change_description: string;
  approval_comment: string | null;
  department: string | null;
  developer: string | null;
  report: { version_number: number; status: string; summary_of_change: string; implemented_solution: string;
    testing_performed: string | null; outstanding_items: string | null; deployed_on: string | null } | null;
  history: { id: string; action_label: string; details: string | null; created_at: string; actor: string | null; previous_value: string | null; new_value: string | null }[];
};
type ActivityRow = { id: string; category: string; action: string; client_name: string; created_at: string };
type Decision = "approved" | "rejected" | "waiting_clarification";

const decisions: Record<Decision, string> = {
  approved: "Approve",
  rejected: "Reject",
  waiting_clarification: "Request clarification",
};
const initialFilters = { search: "", after: "", before: "" };
const statusLabel = (status: string) => status === "waiting" ? "Waiting for clarification" : status.replace(/_/g, " ");
const dateLabel = (date: string) => new Date(date).toLocaleString();

function RequestDialog({ user, id, onClose }: { user: User; id: string; onClose: () => void }) {
  const client = useQueryClient();
  const query = useQuery<RequestDetail>({
    queryKey: ["business", "request", user.id, user.subsidiary_id, id],
    queryFn: () => apiClient.get(`/business/requests/${encodeURIComponent(id)}`),
  });
  const [decision, setDecision] = useState<Decision | null>(null);
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const request = query.data;
  const canSave = decision && (decision === "approved" || remarks.trim().length > 0);
  const submit = async () => {
    if (!decision || !canSave || saving) return;
    setSaving(true);
    setError("");
    try {
      await apiClient.patch(`/crms/change_requests/${encodeURIComponent(id)}`, { status: decision, approval_comment: remarks.trim() });
      setDecision(null);
      setRemarks("");
      await client.invalidateQueries({ queryKey: ["business"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save the decision.");
    } finally {
      setSaving(false);
    }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{request?.ticket_number ?? "Change request"}</DialogTitle>
        <DialogDescription>{request?.client_name ?? "Subsidiary business review"}</DialogDescription>
      </DialogHeader>
      {query.isPending && <p className="text-sm" role="status">Loading request</p>}
      {query.isError && <div className="flex flex-wrap items-center gap-2 text-sm" role="alert">
        This request is unavailable.
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>Retry</Button>
      </div>}
      {request && <div className="space-y-4 text-sm">
        <dl className="grid grid-cols-2 gap-2">
          {[
            ["Status", statusLabel(request.status)], ["Priority", request.priority],
            ["Requested", request.requested_on], ["Due", request.due_date],
            ["Department", request.department], ["Assigned developer", request.developer],
          ].map(([label, value]) => <div key={label} className="min-w-0 break-words">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="capitalize">{value || "Not recorded"}</dd>
          </div>)}
        </dl>
        <p className="whitespace-pre-wrap break-words">{request.change_description}</p>
        {request.status === "pending_approval" && <section className="space-y-2 border-t pt-3">
          <h3 className="font-semibold">Commercial decision</h3>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(decisions) as Decision[]).map(value => <Button key={value} variant={value === decision ? "default" : "outline"} size="sm" disabled={saving}
              onClick={() => { setDecision(value); setError(""); }}>{decisions[value]}</Button>)}
          </div>
          {decision && <div className="space-y-2">
            <Label htmlFor="business-decision-remarks">{decision === "approved" ? "Remarks (optional)" : "Reason"}</Label>
            <textarea id="business-decision-remarks" value={remarks} maxLength={1000} onChange={event => setRemarks(event.target.value)} className="block min-h-20 w-full rounded border bg-background p-2" />
            {error && <p className="text-destructive" role="alert">{error}</p>}
            <Button size="sm" disabled={saving || !canSave} onClick={() => void submit()}>Confirm decision</Button>
          </div>}
        </section>}
        {request.report && <section className="space-y-2 border-t pt-3">
          <h3 className="font-semibold">Completion report · Version {request.report.version_number}</h3>
          <p className="capitalize">{request.report.status}{request.report.deployed_on && ` · Deployed ${request.report.deployed_on}`}</p>
          {([
            ["Summary", request.report.summary_of_change], ["Implementation", request.report.implemented_solution],
            ["Testing", request.report.testing_performed], ["Outstanding items", request.report.outstanding_items],
          ] as const).map(([label, value]) => value && <div key={label}>
            <h4 className="font-medium">{label}</h4><p className="whitespace-pre-wrap break-words">{value}</p>
          </div>)}
          {request.report.status === "accepted" && <>
            <Button size="sm" variant="outline" onClick={() => {
              setDownloadError("");
              void downloadAuthenticatedFile(`/crms/change_requests/${encodeURIComponent(id)}/completion.pdf`, `${request.ticket_number}-signed-completion.pdf`)
                .catch(() => setDownloadError("The verified completion PDF is unavailable."));
            }}>Signed completion PDF</Button>
            {downloadError && <p role="alert" className="text-destructive">{downloadError}</p>}
          </>}
        </section>}
        {!!request.history.length && <section className="border-t pt-3">
          <h3 className="font-semibold">Approval and status history</h3>
          <ul className="mt-2 divide-y">
            {request.history.map(row => <li key={row.id} className="py-2 break-words">
              <p>{row.action_label} · {row.actor || "System"} · {dateLabel(row.created_at)}</p>
              {row.previous_value && row.new_value && <p className="text-xs text-muted-foreground">{statusLabel(row.previous_value)} → {statusLabel(row.new_value)}</p>}
              {row.details && <p className="whitespace-pre-wrap">{row.details}</p>}
            </li>)}
          </ul>
        </section>}
      </div>}
    </DialogContent>
  </Dialog>;
}

export function BusinessRequests({ user, category, recordId }: {
  user: User; category: keyof typeof requestCategories; recordId?: string | null;
}) {
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(recordId || "");
  const { title, filter } = requestCategories[category];
  const query = useQuery<{rows: RequestRow[]; hasMore: boolean}>({
    queryKey: ["business", "requests", user.id, user.subsidiary_id, category, applied, page],
    queryFn: () => apiClient.get(`/business/requests?${new URLSearchParams({ ...applied, category: filter, offset: String(page * 50) })}`),
  });
  return <div className="space-y-4">
    <header className="cims-page-header"><h1 className="cims-page-title">{title}</h1></header>
    {category === "business-approvals" && <p className="text-sm text-muted-foreground">Change requests awaiting commercial approval.</p>}
    <form className="grid items-end gap-2 sm:grid-cols-4" onSubmit={event => { event.preventDefault(); setApplied(filters); setPage(0); }}>
      <label className="grid gap-1 text-sm">Search <Input value={filters.search} maxLength={120} onChange={event => setFilters({ ...filters, search: event.target.value })} placeholder="Ticket or client" /></label>
      <label className="grid gap-1 text-sm">Requested from <Input type="date" value={filters.after} max={filters.before || undefined} onChange={event => setFilters({ ...filters, after: event.target.value })} /></label>
      <label className="grid gap-1 text-sm">Requested through <Input type="date" value={filters.before} min={filters.after || undefined} onChange={event => setFilters({ ...filters, before: event.target.value })} /></label>
      <Button type="submit" variant="outline">Apply filters</Button>
    </form>
    {query.isPending && <p className="text-sm" role="status">Loading change requests</p>}
    {query.isError && <div className="flex flex-wrap items-center gap-2 text-sm" role="alert">Unable to load change requests.<Button size="sm" variant="outline" onClick={() => void query.refetch()}>Retry</Button></div>}
    {query.data && (query.data.rows.length ? <ul className="divide-y rounded-lg border bg-card">
      {query.data.rows.map(row => <li key={row.id}>
        <button type="button" onClick={() => setSelected(row.id)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline">
          <span className="min-w-0 break-words"><span className="font-medium text-primary">{row.ticket_number}</span><span className="block text-xs">{row.client_name}</span></span>
          <span className="text-xs capitalize">{statusLabel(row.status)} · {row.priority}</span>
          {row.due_date && <span className="text-xs text-muted-foreground">Due <time dateTime={row.due_date}>{row.due_date}</time></span>}
        </button>
      </li>)}
    </ul> : <p className="text-sm text-muted-foreground">No matching requests in this subsidiary.</p>)}
    {(page > 0 || query.data?.hasMore) && <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={!page || query.isFetching} onClick={() => setPage(current => current - 1)}>Previous</Button>
      <Button size="sm" variant="outline" disabled={!query.data?.hasMore || query.isFetching} onClick={() => setPage(current => current + 1)}>Next</Button>
    </div>}
    {selected && <RequestDialog key={selected} user={user} id={selected} onClose={() => setSelected("")} />}
  </div>;
}

export function BusinessActivity({ user }: { user: User }) {
  const query = useQuery<ActivityRow[]>({
    queryKey: ["business", "activity", user.id, user.subsidiary_id],
    queryFn: () => apiClient.get("/business/activity"),
  });
  return <div className="space-y-4">
    <header className="cims-page-header"><h1 className="cims-page-title">Business Activity</h1></header>
    {query.isPending && <p className="text-sm" role="status">Loading activity</p>}
    {query.isError && <div className="flex flex-wrap items-center gap-2 text-sm" role="alert">Unable to load activity.<Button size="sm" variant="outline" onClick={() => void query.refetch()}>Retry</Button></div>}
    {query.data && (query.data.length ? <ul className="divide-y rounded-lg border bg-card">
      {query.data.map(row => <li key={`${row.category}:${row.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="min-w-0 break-words"><span className="font-medium">{row.client_name}</span><span className="block text-xs capitalize text-muted-foreground">{row.category} · {statusLabel(row.action)}</span></span>
        <time className="text-xs text-muted-foreground" dateTime={row.created_at}>{dateLabel(row.created_at)}</time>
      </li>)}
    </ul> : <p className="text-sm text-muted-foreground">No business activity recorded.</p>)}
  </div>;
}
