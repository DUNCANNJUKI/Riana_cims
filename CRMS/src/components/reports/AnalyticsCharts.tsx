import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend, Area, AreaChart, TooltipProps } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@crms/components/ui/card';
import { useChangeRequests, useClients } from '@crms/hooks/useSupabaseData';
import { Skeleton } from '@crms/components/ui/skeleton';
import { useMemo } from 'react';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { CheckCircle2, Clock, Gauge, TrendingUp } from 'lucide-react';

// Shared RIANA brand colors; status colors remain semantic.
const THEME_COLORS = {
  primary: 'hsl(var(--primary))',
  highlight: 'hsl(var(--primary-light))',
  pending: 'hsl(var(--status-pending))',
  approved: 'hsl(var(--status-approved))',
  inProgress: 'hsl(var(--status-in-progress))',
  completed: 'hsl(var(--status-completed))',
  rejected: 'hsl(var(--status-rejected))',
  waiting: 'hsl(var(--status-waiting))',
  assigned: 'hsl(var(--status-waiting))',
  critical: 'hsl(var(--priority-critical))',
  high: 'hsl(var(--priority-high))',
  medium: 'hsl(var(--priority-medium))',
  low: 'hsl(var(--priority-low))',
};

const CHART_GRID = {
  stroke: 'hsl(var(--border))',
  strokeOpacity: 0.7,
};

const CHART_AXIS = {
  stroke: 'hsl(var(--border))',
};

const CHART_TICK = {
  fill: 'hsl(var(--muted-foreground))',
  fontSize: 12,
};

// Custom tooltip component for better styling
function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg shadow-lg p-3">
        <p className="font-medium text-foreground mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
}

export function AnalyticsCharts() {
  const { data: requests, isLoading: requestsLoading } = useChangeRequests();
  const { data: clients, isLoading: clientsLoading } = useClients();

  // Calculate status distribution from live data
  const statusData = useMemo(() => {
    if (!requests) return [];
    const statusCounts: Record<string, number> = {
      pending_approval: 0,
      approved: 0,
      in_progress: 0,
      completed: 0,
      rejected: 0,
      waiting_clarification: 0,
      assigned: 0,
    };
    requests.forEach(r => {
      if (statusCounts[r.status] !== undefined) {
        statusCounts[r.status]++;
      }
    });
    return [
      { name: 'Pending', value: statusCounts.pending_approval, color: THEME_COLORS.pending },
      { name: 'Approved', value: statusCounts.approved, color: THEME_COLORS.approved },
      { name: 'In Progress', value: statusCounts.in_progress, color: THEME_COLORS.inProgress },
      { name: 'Completed', value: statusCounts.completed, color: THEME_COLORS.completed },
      { name: 'Waiting', value: statusCounts.waiting_clarification, color: THEME_COLORS.waiting },
      { name: 'Assigned', value: statusCounts.assigned, color: THEME_COLORS.assigned },
      { name: 'Rejected', value: statusCounts.rejected, color: THEME_COLORS.rejected },
    ].filter(item => item.value > 0);
  }, [requests]);

  // Calculate priority breakdown from live data
  const priorityData = useMemo(() => {
    if (!requests) return [];
    const priorityCounts: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    requests.forEach(r => {
      if (priorityCounts[r.priority] !== undefined) {
        priorityCounts[r.priority]++;
      }
    });
    return [
      { priority: 'Critical', count: priorityCounts.critical, color: THEME_COLORS.critical },
      { priority: 'High', count: priorityCounts.high, color: THEME_COLORS.high },
      { priority: 'Medium', count: priorityCounts.medium, color: THEME_COLORS.medium },
      { priority: 'Low', count: priorityCounts.low, color: THEME_COLORS.low },
    ];
  }, [requests]);

  // Calculate monthly trends from live data
  const monthlyData = useMemo(() => {
    if (!requests) return [];
    const months = [];
    const now = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const monthDate = subMonths(now, i);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      
      const monthRequests = requests.filter(r => {
        const created = new Date(r.created_at);
        return isWithinInterval(created, { start: monthStart, end: monthEnd });
      });
      
      const completedRequests = monthRequests.filter(r => r.status === 'completed');
      
      months.push({
        month: format(monthDate, 'MMM'),
        requests: monthRequests.length,
        completed: completedRequests.length,
        completionRate: monthRequests.length > 0 
          ? Math.round((completedRequests.length / monthRequests.length) * 100) 
          : 0,
      });
    }
    return months;
  }, [requests]);

  // Calculate completion rate trend
  const completionTrendData = useMemo(() => {
    if (!requests) return [];
    const weeks = [];
    const now = new Date();
    
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (i * 7) - 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      
      const weekRequests = requests.filter(r => {
        const created = new Date(r.created_at);
        return created >= weekStart && created < weekEnd;
      });
      
      const onTime = weekRequests.filter(r => {
        if (r.status !== 'completed' || !r.completion_date) return false;
        const completion = new Date(r.completion_date);
        const estimated = r.estimated_completion_date ? new Date(r.estimated_completion_date) : null;
        if (!estimated) return false;
        return completion <= estimated;
      }).length;
      
      const late = weekRequests.filter(r => {
        if (r.status !== 'completed' || !r.completion_date) return false;
        const completion = new Date(r.completion_date);
        const estimated = r.estimated_completion_date ? new Date(r.estimated_completion_date) : null;
        if (!estimated) return false;
        return completion > estimated;
      }).length;
      
      const total = onTime + late;
      weeks.push({
        week: `Week ${4 - i}`,
        onTime,
        late,
        slaRate: total > 0 ? Math.round((onTime / total) * 100) : 100,
      });
    }
    return weeks;
  }, [requests]);

  // Calculate client distribution
  const clientData = useMemo(() => {
    if (!requests || !clients) return [];
    const clientCounts: Record<string, { name: string; count: number }> = {};
    
    requests.forEach(r => {
      const client = clients.find(c => c.id === r.client_id);
      if (client) {
        if (!clientCounts[r.client_id]) {
          clientCounts[r.client_id] = { name: client.name, count: 0 };
        }
        clientCounts[r.client_id].count++;
      }
    });
    
    return Object.values(clientCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [requests, clients]);

  const kpis = useMemo(() => {
    const total = requests?.length || 0;
    const completed = requests?.filter((r) => r.status === 'completed').length || 0;
    const active = requests?.filter((r) => !['completed', 'rejected'].includes(r.status)).length || 0;
    const critical = requests?.filter((r) => r.priority === 'critical' && r.status !== 'completed').length || 0;
    return {
      total,
      completed,
      active,
      critical,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
    };
  }, [requests]);

  const isLoading = requestsLoading || clientsLoading;

  if (isLoading) {
    return (
      <div className="grid gap-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[250px] w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total Requests', value: kpis.total, icon: TrendingUp, accent: 'text-primary', caption: 'All Developers requests' },
          { label: 'Active Work', value: kpis.active, icon: Clock, accent: 'text-blue-500', caption: 'Open and in progress' },
          { label: 'Completed', value: kpis.completed, icon: CheckCircle2, accent: 'text-green-600', caption: `${kpis.completionRate}% completion rate` },
          { label: 'Critical Open', value: kpis.critical, icon: Gauge, accent: 'text-red-500', caption: 'Needs priority attention' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="overflow-hidden border-l-4 border-l-primary/70 shadow-sm">
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-3xl font-bold text-foreground">{item.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.caption}</p>
                </div>
                <div className="rounded-lg bg-primary/10 p-3">
                  <Icon className={`h-6 w-6 ${item.accent}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Top Row - Key Metrics */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Status Distribution Pie Chart */}
          <Card className="border-l-4 border-l-primary shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Request Status Distribution</CardTitle>
            <CardDescription>Current status of all requests</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No request data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Priority Breakdown */}
        <Card className="border-l-4 border-l-status-pending shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Priority Breakdown</CardTitle>
            <CardDescription>Requests by priority level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} {...CHART_GRID} />
                  <XAxis type="number" axisLine={CHART_AXIS} tickLine={CHART_AXIS} tick={CHART_TICK} />
                  <YAxis dataKey="priority" type="category" width={60} axisLine={CHART_AXIS} tickLine={CHART_AXIS} tick={CHART_TICK} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {priorityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* SLA Performance */}
        <Card className="border-l-4 border-l-status-completed shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">SLA Performance</CardTitle>
            <CardDescription>Weekly on-time completion rate</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={completionTrendData}>
                  <CartesianGrid strokeDasharray="3 3" {...CHART_GRID} />
                  <XAxis dataKey="week" axisLine={CHART_AXIS} tickLine={CHART_AXIS} tick={CHART_TICK} />
                  <YAxis domain={[0, 100]} axisLine={CHART_AXIS} tickLine={CHART_AXIS} tick={CHART_TICK} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="slaRate"
                    name="SLA Rate %"
                    stroke={THEME_COLORS.completed}
                    fill={THEME_COLORS.completed}
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Trends */}
      <Card className="border-t-4 border-t-primary shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Monthly Request Trends</CardTitle>
          <CardDescription>Requests created vs completed over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" {...CHART_GRID} />
                <XAxis dataKey="month" axisLine={CHART_AXIS} tickLine={CHART_AXIS} tick={CHART_TICK} />
                <YAxis yAxisId="left" axisLine={CHART_AXIS} tickLine={CHART_AXIS} tick={CHART_TICK} />
                <YAxis yAxisId="right" orientation="right" axisLine={CHART_AXIS} tickLine={CHART_AXIS} tick={CHART_TICK} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="requests"
                  name="Created"
                  stroke={THEME_COLORS.inProgress}
                  strokeWidth={2}
                  dot={{ fill: THEME_COLORS.inProgress }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="completed"
                  name="Completed"
                  stroke={THEME_COLORS.completed}
                  strokeWidth={2}
                  dot={{ fill: THEME_COLORS.completed }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="completionRate"
                  name="Completion Rate %"
                  stroke={THEME_COLORS.highlight}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: THEME_COLORS.highlight }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Client Request Distribution */}
      <Card className="border-t-4 border-t-status-pending shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Top Clients by Requests</CardTitle>
          <CardDescription>Request distribution across clients</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[340px]">
            {clientData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clientData}>
                  <CartesianGrid strokeDasharray="3 3" {...CHART_GRID} />
                  <XAxis dataKey="name" axisLine={CHART_AXIS} tickLine={CHART_AXIS} tick={{ ...CHART_TICK, fontSize: 11 }} />
                  <YAxis axisLine={CHART_AXIS} tickLine={CHART_AXIS} tick={CHART_TICK} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar 
                    dataKey="count" 
                    name="Requests" 
                    fill={THEME_COLORS.primary}
                    radius={[4, 4, 0, 0]} 
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No client data available
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
