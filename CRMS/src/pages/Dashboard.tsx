import { 
  FileText, 
  Clock, 
  PlayCircle, 
  CheckCircle2, 
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Users,
  Building2,
  CalendarDays,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatCard } from '@crms/components/dashboard/StatCard';
import { RecentRequestsTable } from '@crms/components/dashboard/RecentRequestsTable';
import { ActivityFeed } from '@crms/components/dashboard/ActivityFeed';
import { useDashboardStats, useChangeRequests, useClients } from '@crms/hooks/useSupabaseData';
import { Skeleton } from '@crms/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@crms/components/ui/card';
import { Button } from '@crms/components/ui/button';
import { Progress } from '@crms/components/ui/progress';
import { format } from 'date-fns';
import { RoleDashboard } from '@crms/components/dashboard/RoleDashboard';

export default function Dashboard() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: requests } = useChangeRequests();
  const { data: clients } = useClients();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  // Calculate additional metrics
  const criticalRequests = requests?.filter(r => r.priority === 'critical' && r.status !== 'completed').length || 0;
  const thisMonthRequests = requests?.filter(r => {
    const created = new Date(r.created_at);
    const now = new Date();
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length || 0;

  const completionRate = stats?.totalRequests 
    ? Math.round((stats.completed / stats.totalRequests) * 100) 
    : 0;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Banner */}
      <div className="dashboard-welcome relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-6 shadow-sm md:p-8">
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1.5 bg-primary" />
        <div className="pointer-events-none absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 w-48 h-48 bg-primary/5 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-start gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">Riana Group CRMS</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                {getGreeting()}!
              </h1>
              <p className="text-muted-foreground mt-1 text-sm md:text-base">
                Here's your change request management overview for {format(new Date(), 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <Link to="/developers/requests/new">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md">
                New Request
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

       {/* Role-Based Quick Actions */}
       <RoleDashboard />
 
      {/* Quick Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {isLoading ? (
          <>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </>
        ) : (
          <>
            <StatCard
              title="Total Requests"
              value={stats?.totalRequests || 0}
              icon={FileText}
              variant="primary"
              trend={{ value: thisMonthRequests, isPositive: true, label: 'this month' }}
            />
            <StatCard
              title="Pending Approval"
              value={stats?.pendingApproval || 0}
              icon={Clock}
              variant="warning"
            />
            <StatCard
              title="In Progress"
              value={stats?.inProgress || 0}
              icon={PlayCircle}
              variant="default"
            />
            <StatCard
              title="Completed"
              value={stats?.completed || 0}
              icon={CheckCircle2}
              variant="success"
            />
            <StatCard
              title="Critical"
              value={criticalRequests}
              icon={AlertTriangle}
              variant="danger"
            />
            <StatCard
              title="Avg. Completion"
              value={`${stats?.avgCompletionDays || 0}d`}
              icon={TrendingUp}
              variant="default"
            />
          </>
        )}
      </div>

      {/* Progress Overview */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="metric-card md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Completion Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold text-foreground">{completionRate}%</span>
                <span className="text-xs text-muted-foreground">
                  {stats?.completed || 0} of {stats?.totalRequests || 0}
                </span>
              </div>
              <Progress value={completionRate} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Request completion progress
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="metric-card md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Active Clients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold text-foreground">{clients?.length || 0}</span>
                <span className="text-xs text-muted-foreground">total clients</span>
              </div>
              <div className="flex gap-2">
                {clients?.slice(0, 3).map((client, i) => (
                  <div 
                    key={client.id} 
                    className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary"
                    style={{ marginLeft: i > 0 ? '-8px' : 0 }}
                  >
                    {client.name.charAt(0)}
                  </div>
                ))}
                {(clients?.length || 0) > 3 && (
                  <div 
                    className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground"
                    style={{ marginLeft: '-8px' }}
                  >
                    +{(clients?.length || 0) - 3}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Client records are managed from the main CIMS Clients module.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="metric-card md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-end justify-between">
                <span className="text-3xl font-bold text-foreground">{thisMonthRequests}</span>
                <span className="text-xs text-muted-foreground">new requests</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-status-completed" />
                  <span className="text-muted-foreground">
                    {requests?.filter(r => {
                      const created = new Date(r.created_at);
                      const now = new Date();
                      return r.status === 'completed' && created.getMonth() === now.getMonth();
                    }).length || 0} completed
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-status-in-progress" />
                  <span className="text-muted-foreground">
                    {requests?.filter(r => {
                      const created = new Date(r.created_at);
                      const now = new Date();
                      return r.status === 'in_progress' && created.getMonth() === now.getMonth();
                    }).length || 0} active
                  </span>
                </div>
              </div>
              <Link to="/developers/reports" className="text-xs font-medium text-primary hover:underline">
                View reports →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentRequestsTable />
        </div>
        <div>
          <ActivityFeed />
        </div>
      </div>
    </div>
  );
}
