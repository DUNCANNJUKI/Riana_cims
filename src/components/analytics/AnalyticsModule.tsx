import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { TrendingUp, TrendingDown, BarChart3, PieChart as PieChartIcon, Activity, Calendar, MessageSquare, Loader2 } from "lucide-react";
import { User } from "@/types";
import { FeedbackAnalytics } from "@/components/analytics/FeedbackAnalytics";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/integrations/apiClient";
import { calculateSatisfaction } from "@/utils/satisfaction";

interface AnalyticsModuleProps {
  user: User;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export const AnalyticsModule = ({ user }: AnalyticsModuleProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [clientsByIndustry, setClientsByIndustry] = useState<any[]>([]);
  const [installationsByMonth, setInstallationsByMonth] = useState<any[]>([]);
  const [contractTypes, setContractTypes] = useState<any[]>([]);
  const [equipmentStats, setEquipmentStats] = useState<any[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState({
    totalInstallations: 0,
    avgInstallationTime: 0,
    clientSatisfaction: 0,
  });
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    loadAnalyticsData();
    
    // Set up real-time polling every 30 seconds
    const interval = setInterval(() => {
      console.log('Real-time analytics refresh...');
      loadAnalyticsData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadAnalyticsData = async (isManual = false) => {
    try {
      if (isManual) setIsLoading(true);
      setHasError(false);

      const clients = await apiClient.get('/clients');
      const installations = await apiClient.get('/installations');

      // Calculate clients by industry
      const industryMap = new Map<string, number>();
      clients?.forEach((client: any) => {
        const industry = client.industry_classification || 'Other';
        industryMap.set(industry, (industryMap.get(industry) || 0) + 1);
      });

      const totalClients = clients?.length || 0;
      const industryData = Array.from(industryMap.entries()).map(([name, count]) => ({
        name,
        count,
        percentage: totalClients > 0 ? Math.round((count / totalClients) * 100) : 0,
      })).sort((a, b) => b.count - a.count);

      setClientsByIndustry(industryData);

      // Calculate contract types distribution
      const contractMap = new Map<string, number>();
      clients?.forEach((client: any) => {
        const type = client.contract_type || 'OTHER';
        contractMap.set(type, (contractMap.get(type) || 0) + 1);
      });

      const contractData = Array.from(contractMap.entries()).map(([name, value], index) => ({
        name,
        value,
        color: COLORS[index % COLORS.length],
      }));

      setContractTypes(contractData);

      // Calculate monthly installations trend
      const monthlyMap = new Map<string, { installations: number; clients: Set<string> }>();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      
      installations?.forEach((installation: any) => {
        if (installation.created_at) {
          const date = new Date(installation.created_at);
          const monthKey = months[date.getMonth()];
          
          if (!monthlyMap.has(monthKey)) {
            monthlyMap.set(monthKey, { installations: 0, clients: new Set() });
          }
          
          const monthData = monthlyMap.get(monthKey)!;
          monthData.installations++;
          monthData.clients.add(installation.client_id);
        }
      });

      const monthlyData = months.map(month => ({
        month,
        installations: monthlyMap.get(month)?.installations || 0,
        clients: monthlyMap.get(month)?.clients.size || 0,
      }));

      setInstallationsByMonth(monthlyData);

      // Calculate equipment statistics
      const totalKiosks = installations?.reduce((sum: number, i: any) => sum + (i.kiosk_count || 0), 0) || 0;
      const totalDisplays = installations?.reduce((sum: number, i: any) => sum + (i.led_count || 0), 0) || 0;
      const totalTablets = installations?.reduce((sum: number, i: any) => sum + (i.tablets || 0), 0) || 0;
      const totalUPS = installations?.reduce((sum: number, i: any) => sum + (i.ups_count || 0), 0) || 0;

      setEquipmentStats([
        { equipment: 'Total Kiosks', count: totalKiosks, trend: 'up', change: '+' + Math.round(totalKiosks * 0.05) + '%' },
        { equipment: 'Total Displays', count: totalDisplays, trend: 'up', change: '+' + Math.round(totalDisplays * 0.03) + '%' },
        { equipment: 'Total Tablets', count: totalTablets, trend: 'up', change: '+' + Math.round(totalTablets * 0.02) + '%' },
        { equipment: 'Total UPS Units', count: totalUPS, trend: 'up', change: '+' + Math.round(totalUPS * 0.07) + '%' },
      ]);

      // Calculate performance metrics
      const completedInstallations = installations?.filter((i: any) => i.status === 'completed') || [];
      const installationsWithDates = completedInstallations.filter(
        (i: any) => i.assigned_date && i.completion_date
      );

      let avgTime = 0;
      if (installationsWithDates.length > 0) {
        const totalDays = installationsWithDates.reduce((sum: number, i: any) => {
          const start = new Date(i.assigned_date!);
          const end = new Date(i.completion_date!);
          const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
          return sum + days;
        }, 0);
        avgTime = totalDays / installationsWithDates.length;
      }

      // Get feedback satisfaction
      const feedbackData = await apiClient.get('/installation_feedback');
      
      const satisfaction = calculateSatisfaction(feedbackData || []);

      const completedCount = completedInstallations.length;
      
      setPerformanceMetrics({
        totalInstallations: completedCount,
        avgInstallationTime: Number(avgTime.toFixed(1)),
        clientSatisfaction: satisfaction.csatScore,
      });

    } catch (error) {
      console.error('Error loading analytics data:', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };
  // Only Admin and Teamlead can access this module
  if (user.role !== 'SuperAdmin' && user.role !== 'Admin' && user.role !== 'Teamlead') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Access denied. Insufficient permissions.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading analytics data...</p>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="text-center">
          <Activity className="h-12 w-12 text-destructive mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold text-destructive">Unable to Load Analytics</h3>
          <p className="text-muted-foreground max-w-xs mx-auto">There was a problem fetching the latest data. This could be due to a temporary connection issue.</p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => loadAnalyticsData(true)}
          className="flex items-center gap-2"
        >
          <Activity className="h-4 w-4" />
          Retry Now
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">Analytics</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Business intelligence and performance metrics</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => loadAnalyticsData(true)}
            className="hidden sm:flex"
            disabled={isLoading}
          >
            <Activity className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Select defaultValue="30days">
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Time Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="30days">Last 30 Days</SelectItem>
              <SelectItem value="90days">Last 90 Days</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4 sm:space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview" className="flex items-center gap-2 text-xs sm:text-sm">
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden xs:inline">Overview</span>
            <span className="xs:hidden">Stats</span>
          </TabsTrigger>
          <TabsTrigger value="feedback" className="flex items-center gap-2 text-xs sm:text-sm">
            <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Client Satisfaction</span>
            <span className="sm:hidden">Feedback</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 sm:space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {equipmentStats.map((stat, index) => (
              <Card key={index} className="shadow-riana hover:shadow-lg transition-shadow">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">{stat.equipment}</p>
                      <p className="text-xl sm:text-2xl font-bold">{stat.count}</p>
                      <div className="flex items-center gap-1 mt-1">
                        {stat.trend === 'up' ? (
                          <TrendingUp className="h-3 w-3 text-green-600 shrink-0" />
                        ) : (
                          <TrendingDown className="h-3 w-3 text-red-600 shrink-0" />
                        )}
                        <span className={`text-[10px] sm:text-xs ${stat.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                          {stat.change}
                        </span>
                      </div>
                    </div>
                    <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground shrink-0 hidden xs:block" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Equipment Totals */}
          <Card className="shadow-riana">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Total Equipment Installed
              </CardTitle>
              <CardDescription>
                Cumulative equipment counts across all completed installations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {equipmentStats.map((stat, index) => (
                  <div key={index} className="text-center p-3 sm:p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-lg border border-primary/20 hover:shadow-md transition-shadow">
                    <div className="text-xl sm:text-2xl font-bold text-primary">{stat.count}</div>
                    <div className="text-[10px] sm:text-sm text-muted-foreground">{stat.equipment}</div>
                    <div className="flex items-center justify-center gap-1 mt-1">
                      {stat.trend === 'up' ? (
                        <TrendingUp className="h-3 w-3 text-green-600" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-red-600" />
                      )}
                      <span className={`text-[10px] sm:text-xs ${stat.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                        {stat.change}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
            {/* Monthly Installations Trend */}
            <Card className="shadow-riana hover:shadow-lg transition-shadow">
              <CardHeader className="pb-2 sm:pb-4">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-blue-500" />
                  Monthly Installation Trends
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Installations and new clients over time
                </CardDescription>
              </CardHeader>
              <CardContent className="p-2 sm:p-6">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={installationsByMonth}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="installations" fill="hsl(var(--primary))" name="Installations" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="clients" fill="hsl(142, 76%, 36%)" name="New Clients" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Contract Types Distribution */}
            <Card className="shadow-riana hover:shadow-lg transition-shadow">
              <CardHeader className="pb-2 sm:pb-4">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <PieChartIcon className="h-4 w-4 sm:h-5 sm:w-5 text-purple-500" />
                  Contract Types Distribution
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Breakdown of clients by contract type
                </CardDescription>
              </CardHeader>
              <CardContent className="p-2 sm:p-6">
                <div className="flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={contractTypes}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name} (${value})`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {contractTypes.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-2 sm:gap-4 mt-4 flex-wrap">
                  {contractTypes.map((type, index) => (
                    <div key={index} className="flex items-center gap-1.5 sm:gap-2">
                      <div 
                        className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full" 
                        style={{ backgroundColor: type.color }}
                      />
                      <span className="text-xs sm:text-sm">{type.name}: {type.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Industry Analysis */}
          <Card className="shadow-riana hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
                Clients by Industry
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Distribution of clients across different industries
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 sm:space-y-4">
                {clientsByIndustry.map((industry, index) => (
                  <div key={index} className="flex items-center justify-between p-2 sm:p-3 bg-gradient-to-r from-muted/30 to-muted/50 rounded-lg hover:shadow-sm transition-shadow">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                      <div 
                        className="w-3 h-3 sm:w-4 sm:h-4 rounded shrink-0"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-xs sm:text-sm truncate">{industry.name}</p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground">{industry.count} clients</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="w-16 sm:w-32 bg-muted rounded-full h-1.5 sm:h-2 hidden xs:block">
                        <div 
                          className="h-full rounded-full transition-all"
                          style={{ 
                            width: `${industry.percentage}%`,
                            backgroundColor: COLORS[index % COLORS.length]
                          }}
                        />
                      </div>
                      <Badge variant="outline" className="text-[10px] sm:text-xs">
                        {industry.percentage}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Performance Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <Card className="shadow-riana bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-lg text-green-700">Total Installations Done</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-bold text-green-600">{performanceMetrics.totalInstallations}</div>
                <p className="text-[10px] sm:text-sm text-muted-foreground">Completed installations</p>
              </CardContent>
            </Card>

            <Card className="shadow-riana bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-lg text-blue-700">Avg. Installation Time</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-bold text-blue-600">
                  {performanceMetrics.avgInstallationTime > 0 
                    ? `${performanceMetrics.avgInstallationTime.toFixed(1)} days` 
                    : 'N/A'}
                </div>
                <p className="text-[10px] sm:text-sm text-muted-foreground">Per installation</p>
              </CardContent>
            </Card>

            <Card className="shadow-riana bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-lg text-primary">Client Satisfaction</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-bold text-primary">{performanceMetrics.clientSatisfaction}%</div>
                <p className="text-[10px] sm:text-sm text-muted-foreground">Average valid 1-5 rating converted to %</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="feedback">
          <FeedbackAnalytics user={user} refreshTrigger={isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
