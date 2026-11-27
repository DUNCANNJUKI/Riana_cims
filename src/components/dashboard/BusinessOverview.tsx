import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/integrations/apiClient";
import { formatRoleLabel } from "@/utils/roleLabel";
import { getBusinessScope, setBusinessScope } from "@/utils/businessScope";

type Overview = {
  business: { subsidiary_name: string; clients: number; active_users: number };
  staff: { id: string; first_name: string; last_name: string; role: string; is_active: boolean; can_manage_status: boolean }[];
  requests: { id: string; ticket_number: string; client_name: string; status: string; priority: string; change_description: string; due_date: string | null }[];
  installation_statuses: { status: string | null; total: number }[];
};

export function BusinessOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [scopes, setScopes] = useState<{ id: string; subsidiary_name: string }[]>([]);
  const [primaryScope, setPrimaryScope] = useState("");
  const [staffChange, setStaffChange] = useState<Overview["staff"][number] | null>(null);
  const [saving, setSaving] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [decision, setDecision] = useState<{ id: string; status: "approved" | "rejected" } | null>(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  useEffect(() => {
    let current = true;
    setFailed(false);
    void (async () => {
      const available = await apiClient.get("/business/scopes");
      if (!current) return;
      setScopes(available.scopes);
      setPrimaryScope(available.primary_subsidiary_id);
      const requested = getBusinessScope();
      if (requested && !available.scopes.some((scope: { id: string }) => scope.id === requested)) setBusinessScope("");
      const data = await apiClient.get("/business/overview");
      if (current) setOverview(data);
    })().catch(() => {
      if (current) setFailed(true);
    });
    return () => { current = false; };
  }, [attempt]);

  const saveStaffStatus = async () => {
    if (!staffChange || saving) return;
    setSaving(true);
    setStaffError("");
    try {
      await apiClient.patch(`/business/staff/${encodeURIComponent(staffChange.id)}`, { is_active: !staffChange.is_active });
      setStaffChange(null);
      setAttempt(current => current + 1);
    } catch (error) {
      setStaffError(error instanceof Error ? error.message : "Unable to update this account.");
    } finally {
      setSaving(false);
    }
  };

  const saveDecision = async () => {
    if (!decision || decisionSaving || (decision.status === "rejected" && !decisionComment.trim())) return;
    setDecisionSaving(true);
    setDecisionError("");
    try {
      await apiClient.patch(`/crms/change_requests/${encodeURIComponent(decision.id)}`, {
        status: decision.status, approval_comment: decisionComment.trim(),
      });
      setDecision(null);
      setAttempt(current => current + 1);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "Unable to save the decision.");
    } finally {
      setDecisionSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="border-b pb-3">
        <h1 className="text-2xl font-semibold tracking-tight">Business overview</h1>
        {overview && <p className="mt-1 text-sm text-muted-foreground">{overview.business.subsidiary_name}</p>}
        {scopes.length > 1 && <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          Subsidiary
          <select aria-label="Subsidiary" className="max-w-full rounded-md border bg-background px-2 py-1.5" value={getBusinessScope() || primaryScope} onChange={event => {
            setBusinessScope(event.target.value === primaryScope ? "" : event.target.value);
            window.location.reload();
          }}>
            {scopes.map(scope => <option key={scope.id} value={scope.id}>{scope.subsidiary_name}</option>)}
          </select>
        </label>}
      </header>
      {failed && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3" role="alert">
          <p className="text-sm">Unable to load the business overview.</p>
          <Button variant="outline" size="sm" onClick={() => setAttempt(current => current + 1)}>Retry</Button>
        </div>
      )}
      {!overview && !failed && <Skeleton className="h-20 w-full" aria-label="Loading business overview" />}
      {overview && <>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            ["Clients", overview.business.clients],
            ["Active staff", overview.business.active_users],
            ["Installations", overview.installation_statuses.reduce((total, row) => total + Number(row.total), 0)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-card p-3">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="grid min-w-0 gap-5 xl:grid-cols-2">
          <section aria-labelledby="business-requests-heading" className="min-w-0">
            <h2 id="business-requests-heading" className="mb-2 text-base font-semibold">Recent change requests</h2>
            {overview.requests.length ? <ul className="divide-y rounded-lg border bg-card">
              {overview.requests.map(request => (
                <li key={request.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-sm">
                  <div className="min-w-0 break-words">
                    <p className="font-medium">{request.ticket_number}</p>
                    <p className="text-xs text-muted-foreground">{request.client_name}</p>
                  </div>
                  <span className="rounded bg-muted px-2 py-1 text-xs capitalize">{request.status.replace(/_/g, " ")}</span>
                  <details className="w-full">
                    <summary className="cursor-pointer text-primary">Review request</summary>
                    <div className="my-2 space-y-2">
                      <p className="whitespace-pre-wrap break-words">{request.change_description}</p>
                      <p className="capitalize text-muted-foreground">{request.priority} priority{request.due_date && <> · Due <time dateTime={request.due_date}>{request.due_date}</time></>}</p>
                    </div>
                    {request.status === "pending_approval" && <div className="flex flex-wrap gap-2">
                    {(["approved", "rejected"] as const).map(status => <Button key={status} size="sm" variant="outline" disabled={decisionSaving} onClick={() => {
                      setDecision({ id: request.id, status });
                      setDecisionComment("");
                      setDecisionError("");
                    }}>{status === "approved" ? "Approve" : "Reject"}</Button>)}
                    </div>}
                  </details>
                  {decision?.id === request.id && <div className="w-full space-y-2 rounded-md border p-2">
                    <label className="grid gap-1">
                      {decision.status === "rejected" ? "Reason for rejection" : "Approval comment (optional)"}
                      <textarea className="min-h-16 rounded-md border bg-background p-2" maxLength={1000} value={decisionComment} onChange={event => setDecisionComment(event.target.value)} />
                    </label>
                    {decisionError && <p role="alert" className="text-destructive">{decisionError}</p>}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={decisionSaving || (decision.status === "rejected" && !decisionComment.trim())} onClick={() => void saveDecision()}>Confirm {decision.status === "approved" ? "approval" : "rejection"}</Button>
                      <Button size="sm" variant="outline" disabled={decisionSaving} onClick={() => setDecision(null)}>Cancel</Button>
                    </div>
                  </div>}
                </li>
              ))}
            </ul> : <p className="text-sm text-muted-foreground">No change requests for this subsidiary.</p>}
          </section>
          <section aria-labelledby="business-staff-heading" className="min-w-0">
            <h2 id="business-staff-heading" className="mb-2 text-base font-semibold">Staff and roles</h2>
            {overview.staff.length ? <ul className="divide-y rounded-lg border bg-card">
              {overview.staff.map(person => (
                <li key={person.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-sm">
                  <span className="min-w-0 break-words font-medium">{[person.first_name, person.last_name].filter(Boolean).join(" ") || "Unnamed account"}</span>
                  <span className="text-xs text-muted-foreground">{formatRoleLabel(person.role)}{!person.is_active && " · Inactive"}</span>
                  {Boolean(person.can_manage_status) && <Button size="sm" variant="outline" onClick={() => { setStaffError(""); setStaffChange(person); }} disabled={saving}>
                    {person.is_active ? "Suspend" : "Reactivate"}
                  </Button>}
                </li>
              ))}
            </ul> : <p className="text-sm text-muted-foreground">No staff are assigned to this subsidiary.</p>}
            {staffChange && <div className="mt-2 rounded-lg border bg-card p-3 text-sm" role="group" aria-label="Confirm staff status change">
              <p>{staffChange.is_active ? "Suspend" : "Reactivate"} {[staffChange.first_name, staffChange.last_name].filter(Boolean).join(" ") || "this account"}?</p>
              {staffError && <p className="mt-2 text-destructive" role="alert">{staffError}</p>}
              <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" onClick={() => void saveStaffStatus()} disabled={saving}>Confirm</Button><Button size="sm" variant="outline" disabled={saving} onClick={() => setStaffChange(null)}>Cancel</Button></div>
            </div>}
          </section>
        </div>
      </>}
    </div>
  );
}
