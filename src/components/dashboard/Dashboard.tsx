import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Building2, Package, Activity, Loader2 } from "lucide-react";
import { User, DashboardStats } from "@/types";
import { apiClient } from "@/integrations/apiClient";
import { NoticeBoard } from "@/components/noticeboard/NoticeBoard";

interface DashboardProps {
  user: User;
  stats?: DashboardStats;
}

export const Dashboard = ({ user, stats }: DashboardProps) => {
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    totalClients: 0,
    totalInstallations: 0,
    totalUsers: 0,
    recentLogs: []
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    
    // Set up polling for dashboard updates
    const intervalId = setInterval(loadDashboardData, 30000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [user.id, user.role]);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      
      const stats = await apiClient.get(`/dashboard/stats?userId=${user.id}&role=${user.role}`);
      
      setDashboardStats({
        totalClients: stats.totalClients || 0,
        totalInstallations: stats.totalInstallations || 0,
        totalUsers: stats.totalUsers || 0,
        recentLogs: stats.recentLogs || []
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  const statCards = [
    {
      title: "Total Clients",
      value: dashboardStats.totalClients,
      icon: Building2,
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      title: "Active Installations",
      value: dashboardStats.totalInstallations,
      icon: Package,
      color: "text-green-600",
      bgColor: "bg-green-100"
    },
    {
      title: "System Users",
      value: dashboardStats.totalUsers,
      icon: Users,
      color: "text-blue-600",
      bgColor: "bg-blue-100"
    },
    {
      title: "Recent Activities",
      value: dashboardStats.recentLogs.length,
      icon: Activity,
      color: "text-orange-600",
      bgColor: "bg-orange-100"
    }
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="gradient-primary rounded-lg p-6 text-white">
        <h1 className="text-2xl font-bold">
          {getGreeting()}, {user.email.split('@')[0]}!
        </h1>
        <p className="opacity-90 mt-1">
          Welcome to RIANA Client Installation Management System
        </p>
        <div className="mt-4 flex gap-2">
          <Badge variant="outline" className="text-white border-white/30">
            {user.role}
          </Badge>
          <Badge variant="outline" className="text-white border-white/30">
            Department Access
          </Badge>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} className="shadow-riana">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {(user.role === 'Admin' || user.role === 'Teamlead') && (
        <NoticeBoard />
      )}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-riana">
          <CardHeader>
            <CardTitle>Recent System Activity</CardTitle>
            <CardDescription>
              Latest actions in the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {dashboardStats.recentLogs.slice(0, 5).map((log, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{log.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
              {dashboardStats.recentLogs.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No recent activity
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-riana">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common tasks and shortcuts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-1 gap-2">
              <div className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                <h4 className="font-medium text-sm">Add New Client</h4>
                <p className="text-xs text-muted-foreground">Create a new client record</p>
              </div>
              <div className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                <h4 className="font-medium text-sm">View Reports</h4>
                <p className="text-xs text-muted-foreground">Generate system reports</p>
              </div>
              <div className="p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                <h4 className="font-medium text-sm">Import Data</h4>
                <p className="text-xs text-muted-foreground">Bulk import from Excel</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};