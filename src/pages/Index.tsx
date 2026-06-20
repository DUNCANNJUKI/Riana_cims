import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { LoginForm } from "@/components/auth/LoginForm";
import { ForcePasswordChange } from "@/components/auth/ForcePasswordChange";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { ClientsModule } from "@/components/clients/ClientsModule";
import { InstallationsModule } from "@/components/installations/InstallationsModule";
import { UsersModule } from "@/components/users/UsersModule";
import { CompanySettingsModule } from "@/components/company/CompanySettingsModule";
import { ImportModule } from "@/components/import/ImportModule";
import { ReportsModule } from "@/components/reports/ReportsModule";
import { AnalyticsModule } from "@/components/analytics/AnalyticsModule";
import { HelpModule } from "@/components/help/HelpModule";
import { ChatbotWidget } from "@/components/chatbot/ChatbotWidget";
import { HandoverUploadModule } from "@/components/handover/HandoverUploadModule";
import { AssignmentModule } from "@/components/assignments/AssignmentModule";
import { InstallationProgressModule } from "@/components/progress/InstallationProgressModule";
import { FinancesModule } from "@/components/finances/FinancesModule";
import { TechnicianWorkloadCalendar } from "@/components/calendar/TechnicianWorkloadCalendar";
import { TechnicianMobileDashboard } from "@/components/technician/TechnicianMobileDashboard";
import { NoticeBoard } from "@/components/noticeboard/NoticeBoard";
import { SiteLoader } from "@/components/common/SiteLoader";
import { AnnouncementsManagementModule } from "@/components/announcements/AnnouncementsManagementModule";
import { TechnicianProfilePage } from "@/components/profile/TechnicianProfilePage";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Menu, LogOut, User, Settings } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { DevelopersWorkspace } from "@/components/developers/DevelopersWorkspace";

const Index = () => {
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  const [activeModule, setActiveModule] = useState('dashboard');
  const [showLoader, setShowLoader] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Initialize push notifications and offline sync
  usePushNotifications();
  const { isOnline } = useOfflineSync();

  useEffect(() => {
    // Show loader for minimum time for better UX
    const timer = setTimeout(() => setShowLoader(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'Developer') {
      setActiveModule('developers');
    }
  }, [isAuthenticated, user?.role]);

  // Auto-logout due to inactivity (30 minutes)
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      // 30 minutes = 30 * 60 * 1000 = 1800000 ms
      timeoutId = setTimeout(() => {
        if (isAuthenticated) {
          logout();
        }
      }, 1800000);
    };

    if (isAuthenticated) {
      resetTimer();
      window.addEventListener('mousemove', resetTimer);
      window.addEventListener('keydown', resetTimer);
      window.addEventListener('click', resetTimer);
      window.addEventListener('scroll', resetTimer);

      return () => {
        clearTimeout(timeoutId);
        window.removeEventListener('mousemove', resetTimer);
        window.removeEventListener('keydown', resetTimer);
        window.removeEventListener('click', resetTimer);
        window.removeEventListener('scroll', resetTimer);
      };
    }
  }, [isAuthenticated, logout]);

  // Show loader during initial load
  if (showLoader || isLoading) {
    return <SiteLoader isLoading={true} />;
  }

  if (!isAuthenticated || !user) {
    return <LoginForm />;
  }

  if (user.first_login) {
    return <ForcePasswordChange />;
  }

  const renderContent = () => {
    switch (activeModule) {
      case 'dashboard':
        return <Dashboard user={user} />;
      case 'technician-dashboard':
        return <TechnicianMobileDashboard user={user} />;
      case 'technician-profile':
        return <TechnicianProfilePage user={user} />;
      case 'clients':
        return <ClientsModule user={user} />;
      case 'installations':
        return <InstallationsModule user={user} />;
      case 'progress':
        return <InstallationProgressModule user={user} />;
      case 'users':
        return <UsersModule user={user} />;
      case 'finances':
        return <FinancesModule user={user} />;
      case 'company':
        return <CompanySettingsModule user={user} />;
      case 'import':
        return <ImportModule user={user} />;
      case 'reports':
        return <ReportsModule user={user} />;
      case 'analytics':
        return <AnalyticsModule user={user} />;
      case 'handover':
        return <HandoverUploadModule user={user} />;
      case 'assignments':
        return <AssignmentModule user={user} />;
      case 'calendar':
        return <TechnicianWorkloadCalendar user={user} />;
      case 'announcements-management':
        return <AnnouncementsManagementModule user={user} />;
      case 'developers':
        if (user.role === 'Admin' || user.role === 'Teamlead' || user.role === 'Developer' || user.role === 'Sales') {
          return <DevelopersWorkspace userId={user.id} role={user.role} />;
        }
        return <Dashboard user={user} />;
      case 'help':
        return <HelpModule user={user} />;
      default:
        return <Dashboard user={user} />;
    }
  };

  const currentYear = new Date().getFullYear();

  const getUserInitials = () => {
    if (user.first_name && user.last_name) {
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    }
    return user.email.charAt(0).toUpperCase();
  };

  const getUserDisplayName = () => {
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return user.email;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="flex h-screen overflow-hidden">
        <Sidebar 
          user={user} 
          activeModule={activeModule} 
          setActiveModule={setActiveModule}
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
        />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile Header with Menu Button and User Menu */}
          <div className="lg:hidden flex items-center justify-between gap-2 p-2 bg-background border-b">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="shrink-0"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <span className="font-semibold text-sm truncate">RIANA CIMS</span>
            </div>
            <div className="flex items-center gap-1">
              {!isOnline && (
                <span className="text-xs text-warning bg-warning/10 px-2 py-1 rounded">Offline</span>
              )}
              <NotificationBell user={user} onNavigate={setActiveModule} />
              
              {/* Mobile User Menu with Logout */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 rounded-full p-0">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                        {getUserInitials()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium truncate">{getUserDisplayName()}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.role}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setActiveModule('help')}>
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveModule('company')}>
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          
          <Header user={user} className="sticky top-0 z-40 hidden lg:block" setActiveModule={setActiveModule} />
          <main className="flex-1 p-3 sm:p-4 lg:p-6 bg-background overflow-auto">
            {renderContent()}
          </main>
          {/* Footer */}
          <footer className="border-t border-border bg-muted/30 py-2 sm:py-3 px-4 text-center shrink-0">
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              © {currentYear} RIANA Group. All rights reserved. | www.riana.co
            </p>
          </footer>
        </div>
      </div>
      
      <ChatbotWidget user={user} />
    </div>
  );
};

export default Index;
