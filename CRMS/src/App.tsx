import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { MainLayout } from "@/components/layout/MainLayout";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import Dashboard from "@/pages/Dashboard";
import RequestList from "@/pages/RequestList";
import NewRequest from "@/pages/NewRequest";
import RequestDetail from "@/pages/RequestDetail";
import Approvals from "@/pages/Approvals";
import Reports from "@/pages/Reports";
import AuditLog from "@/pages/AuditLog";
import Assignments from "@/pages/Assignments";
import Users from "@/pages/Users";
import Settings from "@/pages/Settings";
import Notifications from "@/pages/Notifications";
import NotFound from "./pages/NotFound";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Navigate } from "react-router-dom";

const queryClient = new QueryClient();

// Protected Route Component
const hasCrmsSession = () => localStorage.getItem('crms-user-session') === 'active'
  && Boolean(localStorage.getItem('crms-auth-token'));

const WaitingForCimsSession = () => (
  <main className="flex min-h-screen items-center justify-center bg-background p-6">
    <div className="flex items-center gap-3 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>Checking your RIANA session...</span>
    </div>
  </main>
);

const ProtectedRoute = ({ children, isAuthenticated }: { children: React.ReactNode; isAuthenticated: boolean }) => {
  if (!isAuthenticated) {
    return <WaitingForCimsSession />;
  }

  return <>{children}</>;
};

function AppContent({ isAuthenticated }: { isAuthenticated: boolean }) {
  // Enable realtime subscriptions for live updates
  useRealtimeSubscription();

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={
        <ProtectedRoute isAuthenticated={isAuthenticated}>
          <MainLayout />
        </ProtectedRoute>
      }>
        <Route path="/" element={<Dashboard />} />
        <Route path="/requests" element={<RequestList />} />
        <Route path="/requests/new" element={<NewRequest />} />
        <Route path="/requests/:id" element={<RequestDetail />} />
        <Route path="/approvals" element={<Approvals />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/assignments" element={<Assignments />} />
        <Route path="/users" element={<Users />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/notifications" element={<Notifications />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(hasCrmsSession);

  useEffect(() => {
    const receiveParentSession = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      let parentUrl: URL;
      try {
        parentUrl = new URL(event.origin);
      } catch {
        return;
      }

      if (parentUrl.hostname !== window.location.hostname) return;
      const message = event.data as { type?: string; token?: string; userId?: string; role?: string };
      if (message?.type !== 'riana:crms-session' || !message.token || !message.userId) return;

      localStorage.setItem('crms-user-session', 'active');
      localStorage.setItem('crms-user-id', message.userId);
      localStorage.setItem('crms-auth-token', message.token);
      if (message.role) localStorage.setItem('crms-user-role', message.role);
      setIsAuthenticated(true);
    };

    window.addEventListener('message', receiveParentSession);
    return () => window.removeEventListener('message', receiveParentSession);
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="crms-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter basename="/developers">
            <AppContent isAuthenticated={isAuthenticated} />
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
