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
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { DevelopersWorkspace } from "@/components/developers/DevelopersWorkspace";
import { InactivityGuard } from "@/components/auth/InactivityGuard";
import { useLocation } from "react-router-dom";

const Index = () => {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const location = useLocation();

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
    if (isAuthenticated && (user?.role === 'Developer' || location.pathname.startsWith('/developers'))) {
      setActiveModule('developers');
    }
  }, [isAuthenticated, user?.role, location.pathname]);

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
    const developerWorkspaceRole = user.module_roles?.crms || user.role;
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
        if (developerWorkspaceRole === 'SuperAdmin' || developerWorkspaceRole === 'Admin' || developerWorkspaceRole === 'Management' || developerWorkspaceRole === 'Teamlead' || developerWorkspaceRole === 'Developer' || developerWorkspaceRole === 'Sales') {
          return <DevelopersWorkspace userId={user.id} role={developerWorkspaceRole} />;
        }
        return <Dashboard user={user} />;
      case 'help':
        return <HelpModule user={user} />;
      default:
        return <Dashboard user={user} />;
    }
  };

  const currentYear = new Date().getFullYear();

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
          <Header
            user={user}
            className="sticky top-0 z-40"
            setActiveModule={setActiveModule}
            onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
          />
          {!isOnline && (
            <div className="bg-warning/10 px-3 py-1 text-center text-xs text-warning">
              Offline - changes will sync when the connection returns.
            </div>
          )}
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
      <InactivityGuard active={isAuthenticated} onLogout={logout} />
    </div>
  );
};

export default Index;
