import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Download, RefreshCcw, Search } from "lucide-react";
import { apiClient, API_URL, getAuthToken } from "@/integrations/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { User } from "@/types";

interface AuditRow {
  id: string;
  event_uuid: string;
  user_id?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  action: string;
  module: string;
  entity_type?: string | null;
  entity_id?: string | null;
  description?: string | null;
  ip_address?: string | null;
  device?: string | null;
  status: "success" | "failure" | "denied";
  severity: "info" | "notice" | "warning" | "critical";
  created_at: string;
}

const statusVariant = (status: string) => status === "success" ? "default" : "destructive";
const formatActor = (row: AuditRow) => [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email || row.user_id || "System";

const AuditTable = ({ rows, showActor, showIp }: { rows: AuditRow[]; showActor?: boolean; showIp?: boolean }) => (
  <div className="overflow-x-auto rounded-lg border bg-background">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          {showActor && <TableHead>User</TableHead>}
          <TableHead>Action</TableHead>
          <TableHead>Module</TableHead>
          <TableHead>Entity</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Severity</TableHead>
          {showIp && <TableHead>IP</TableHead>}
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow><TableCell colSpan={showActor && showIp ? 9 : 7} className="h-24 text-center text-muted-foreground">No audit events found.</TableCell></TableRow>
        ) : rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="whitespace-nowrap text-xs">{format(new Date(row.created_at), "MMM d, yyyy h:mm a")}</TableCell>
            {showActor && <TableCell className="max-w-44 truncate text-xs">{formatActor(row)}</TableCell>}
            <TableCell className="font-medium">{row.action.replace(/_/g, " ")}</TableCell>
            <TableCell>{row.module}</TableCell>
            <TableCell className="max-w-40 truncate text-xs">{[row.entity_type, row.entity_id].filter(Boolean).join(": ") || "-"}</TableCell>
            <TableCell><Badge variant={statusVariant(row.status)}>{row.status}</Badge></TableCell>
            <TableCell><Badge variant="outline">{row.severity}</Badge></TableCell>
            {showIp && <TableCell className="text-xs">{row.ip_address || "-"}</TableCell>}
            <TableCell className="max-w-80 truncate text-xs text-muted-foreground">{row.description || row.device || "-"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

export const AuditLogsModule = ({ user }: { user: User }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("");
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [loading, setLoading] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ limit: "50" });
      if (search.trim()) query.set("search", search.trim());
      if (module.trim()) query.set("module", module.trim());
      if (status) query.set("status", status);
      if (severity) query.set("severity", severity);
      const data = await apiClient.get(`/admin/audit-logs?${query.toString()}`);
      setRows(data.rows || []);
    } catch (error) {
      toast({ title: "Audit logs unavailable", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadLogs(); }, []);

  const exportLogs = () => {
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (module.trim()) query.set("module", module.trim());
    if (status) query.set("status", status);
    if (severity) query.set("severity", severity);
    const token = getAuthToken();
    window.open(`${API_URL}/admin/audit-logs/export?${query.toString()}${token ? `&token_hint=1` : ""}`, "_blank", "noopener,noreferrer");
  };

  if (user.role !== "SuperAdmin") {
    return <div className="rounded-lg border bg-background p-6 text-sm text-muted-foreground">Superadmin access is required to view global audit logs.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-sm text-muted-foreground">System-wide security, data, and administrative activity.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void loadLogs()} disabled={loading}><RefreshCcw className="mr-2 h-4 w-4" />Refresh</Button>
          <Button onClick={exportLogs}><Download className="mr-2 h-4 w-4" />Export</Button>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        <div className="relative md:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search action, module, entity, or details" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void loadLogs()} /></div>
        <Input placeholder="Module" value={module} onChange={(event) => setModule(event.target.value)} />
        <div className="flex gap-2"><Input placeholder="Status" value={status} onChange={(event) => setStatus(event.target.value)} /><Input placeholder="Severity" value={severity} onChange={(event) => setSeverity(event.target.value)} /></div>
      </div>
      <AuditTable rows={rows} showActor showIp />
    </div>
  );
};

export const MyActivityModule = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get('/me/activity-logs?limit=50');
      setRows(data.rows || []);
    } catch (error) {
      toast({ title: "Activity logs unavailable", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadLogs(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Activity</h1>
          <p className="text-sm text-muted-foreground">Your own account usage and security activity.</p>
        </div>
        <Button variant="outline" onClick={() => void loadLogs()} disabled={loading}><RefreshCcw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>
      <AuditTable rows={rows} />
    </div>
  );
};
