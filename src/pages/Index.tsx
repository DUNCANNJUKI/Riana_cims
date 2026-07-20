import { lazy, Suspense, type ComponentType, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { LoginForm } from "@/components/auth/LoginForm";
import { ForcePasswordChange } from "@/components/auth/ForcePasswordChange";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { HelpModule } from "@/components/help/HelpModule";
import { ChatbotWidget } from "@/components/chatbot/ChatbotWidget";
import { SiteLoader } from "@/components/common/SiteLoader";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { InactivityGuard } from "@/components/auth/InactivityGuard";
import { useLocation } from "react-router-dom";

const lazyNamed = <TModule extends Record<string, unknown>>(
  loader: () => Promise<TModule>,
  exportName: keyof TModule,
) => lazy(async () => {
  const module = await loader();
  return { default: module[exportName] as ComponentType<any> };
});

const Dashboard = lazyNamed(() => import("@/components/dashboard/Dashboard"), "Dashboard");
const ClientsModule = lazyNamed(() => import("@/components/clients/ClientsModule"), "ClientsModule");
const InstallationsModule = lazyNamed(() => import("@/components/installations/InstallationsModule"), "InstallationsModule");
const UsersModule = lazyNamed(() => import("@/components/users/UsersModule"), "UsersModule");
const CompanySettingsModule = lazyNamed(() => import("@/components/company/CompanySettingsModule"), "CompanySettingsModule");
const ImportModule = lazyNamed(() => import("@/components/import/ImportModule"), "ImportModule");
const ReportsModule = lazyNamed(() => import("@/components/reports/ReportsModule"), "ReportsModule");
const AnalyticsModule = lazyNamed(() => import("@/components/analytics/AnalyticsModule"), "AnalyticsModule");
const HandoverUploadModule = lazyNamed(() => import("@/components/handover/HandoverUploadModule"), "HandoverUploadModule");
const AssignmentModule = lazyNamed(() => import("@/components/assignments/AssignmentModule"), "AssignmentModule");
const InstallationProgressModule = lazyNamed(() => import("@/components/progress/InstallationProgressModule"), "InstallationProgressModule");
const FinancesModule = lazyNamed(() => import("@/components/finances/FinancesModule"), "FinancesModule");
const TechnicianWorkloadCalendar = lazyNamed(() => import("@/components/calendar/TechnicianWorkloadCalendar"), "TechnicianWorkloadCalendar");
const TechnicianMobileDashboard = lazyNamed(() => import("@/components/technician/TechnicianMobileDashboard"), "TechnicianMobileDashboard");
const AnnouncementsManagementModule = lazyNamed(() => import("@/components/announcements/AnnouncementsManagementModule"), "AnnouncementsManagementModule");
const TechnicianProfilePage = lazyNamed(() => import("@/components/profile/TechnicianProfilePage"), "TechnicianProfilePage");
const DevelopersWorkspace = lazyNamed(() => import("@/components/developers/DevelopersWorkspace"), "DevelopersWorkspace");
const AuditLogsModule = lazyNamed(() => import("@/components/audit/AuditLogsModule"), "AuditLogsModule");
const MyActivityModule = lazyNamed(() => import("@/components/audit/AuditLogsModule"), "MyActivityModule");

const Index = () => {
  const { user, isAuthenticated, isLoading, logout, refreshUserProfile } = useAuth();
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
      case 'audit-logs':
        return user.role === 'SuperAdmin' ? <AuditLogsModule user={user} /> : <Dashboard user={user} />;
      case 'my-activity':
        return <MyActivityModule />;
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
    <div className="min-h-dvh bg-background">
      <div className="flex h-dvh min-h-0 overflow-hidden">
        <Sidebar 
          user={user} 
          activeModule={activeModule} 
          setActiveModule={setActiveModule}
          isMobileOpen={isMobileSidebarOpen}
          onMobileClose={() => setIsMobileSidebarOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            user={user}
            className="sticky top-0 z-40"
            setActiveModule={setActiveModule}
            onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
            onProfileUpdate={refreshUserProfile}
          />
          {!isOnline && (
            <div className="bg-warning/10 px-3 py-1 text-center text-xs text-warning">
              Offline - changes will sync when the connection returns.
            </div>
          )}
          <main className="min-w-0 flex-1 overflow-auto overscroll-contain bg-background p-2 sm:p-4 lg:p-6">
            <Suspense fallback={<SiteLoader isLoading={true} />}>
              <div className="mx-auto w-full max-w-[1600px] min-w-0">
                {renderContent()}
              </div>
            </Suspense>
          </main>
          {/* Footer */}
          <footer className="shrink-0 border-t border-border bg-muted/30 px-3 py-2 text-center sm:px-4 sm:py-3">
            <p className="truncate text-[10px] text-muted-foreground sm:text-xs">
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
