import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, Building2, FileText, Package, Upload, UserPlus, Users } from "lucide-react";
import { NoticeBoard } from "@/components/noticeboard/NoticeBoard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/integrations/apiClient";
import { can } from "@/security/accessControl";
import type { DashboardStats, User } from "@/types";
import { OPERATIONAL_REFRESH_INTERVAL_MS } from "@/utils/refreshIntervals";
import { formatRoleLabel } from "@/utils/roleLabel";

interface DashboardProps {
  user: User;
  stats?: DashboardStats;
  onNavigate?: (module: string) => void;
}

const initialStats: DashboardStats = { totalClients: 0, totalInstallations: 0, totalUsers: 0, recentLogs: [] };

export const Dashboard = ({ user, stats, onNavigate }: DashboardProps) => {
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>(stats || initialStats);
  const [isLoading, setIsLoading] = useState(!stats);
  const [showRecents, setShowRecents] = useState(false);

  useEffect(() => {
    if (stats) {
      setDashboardStats(stats);
      setIsLoading(false);
      return;
    }
    let active = true;
    const loadDashboardData = async () => {
      try {
        const response = await apiClient.get(`/dashboard/stats?userId=${user.id}&role=${user.role}`);
        if (!active) return;
        setDashboardStats({
          totalClients: response.totalClients || 0,
          totalInstallations: response.totalInstallations || 0,
          totalUsers: response.totalUsers || 0,
          recentLogs: response.recentLogs || [],
        });
      } catch (error) {
        console.error("Error loading dashboard data:", error);
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadDashboardData();
    const intervalId = window.setInterval(loadDashboardData, OPERATIONAL_REFRESH_INTERVAL_MS);
    return () => { active = false; window.clearInterval(intervalId); };
  }, [stats, user.id, user.role]);

  const statCards = useMemo(() => [
    { title: "Total Clients", value: dashboardStats.totalClients, icon: Building2 },
    { title: "Active Installations", value: dashboardStats.totalInstallations, icon: Package },
    { title: "System Users", value: dashboardStats.totalUsers, icon: Users },
    { title: "Recent Activities", value: dashboardStats.recentLogs.length, icon: Activity },
  ], [dashboardStats]);

  const quickActions = [
    can(user, "clients.view") && { label: "Add New Client", description: "Open client management", module: "clients", icon: UserPlus },
    can(user, "reports.view") && { label: "View Reports", description: "Access operational reports", module: "reports", icon: FileText },
    can(user, "import.manage") && { label: "Import Data", description: "Import approved records", module: "import", icon: Upload },
  ].filter(Boolean) as Array<{ label: string; description: string; module: string; icon: typeof UserPlus }>;

  return (
    <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
      <section className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3" aria-labelledby="dashboard-title">
        <div className="min-w-0">
          <h1 id="dashboard-title" className="text-2xl font-bold tracking-tight sm:text-[1.75rem]">Operational overview</h1>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Current access context">
          <Badge variant="secondary">{formatRoleLabel(user.role)}</Badge>
          {user.designation && user.designation.toLowerCase() !== user.role.toLowerCase() && <Badge variant="outline">{user.designation}</Badge>}
        </div>
      </section>

      <section aria-label="Operational summary" className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {statCards.map(({ title, value, icon: Icon }) => (
          <Card key={title} className="min-w-0 shadow-none">
            <CardContent className="flex flex-wrap items-center gap-2 p-3">
              <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground">{title}</p>{isLoading ? <Skeleton className="mt-1 h-6 w-12" /> : <p className="text-xl font-semibold tabular-nums tracking-tight">{value}</p>}</div>
            </CardContent>
          </Card>
        ))}
      </section>

      <NoticeBoard compact onNavigate={onNavigate} />

      <section className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
        <Card className="min-w-0">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 p-4">
            <CardTitle className="text-base">Recent system activity</CardTitle>
            {dashboardStats.recentLogs.length > 5 && <Button variant="ghost" size="sm" onClick={() => setShowRecents((current) => !current)} aria-expanded={showRecents}>{showRecents ? "Show less" : "View more"}<ArrowRight className="ml-1.5 h-3.5 w-3.5" data-icon="inline-end" /></Button>}
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border/70" role="list">
              {dashboardStats.recentLogs.slice(0, showRecents ? 10 : 5).map((log, index) => (
                <div key={`${log.created_at}-${index}`} className="flex items-start gap-2 py-2 first:pt-0 last:pb-0" role="listitem">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{log.action}</p><p className="mt-0.5 text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p></div>
                </div>
              ))}
              {!isLoading && dashboardStats.recentLogs.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No recent activity</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Quick actions</CardTitle><CardDescription>Common tasks available to your role</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {quickActions.map(({ label, description, module, icon: Icon }) => (
              <Button key={module} variant="outline" className="h-auto min-h-14 justify-start whitespace-normal px-3 py-2 text-left" onClick={() => onNavigate?.(module)}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="block font-semibold">{label}</span><span className="block text-xs font-normal text-muted-foreground">{description}</span></span>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" data-icon="inline-end" />
              </Button>
            ))}
            {quickActions.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No quick actions are available for this role.</p>}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};
