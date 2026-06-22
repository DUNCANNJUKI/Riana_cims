import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import {
  BarChart3,
  ClipboardCheck,
  FileText,
  FolderKanban,
  History,
  LayoutDashboard,
  PlusCircle,
} from "lucide-react";
import { cn } from "@crms/lib/utils";
import { installAuthenticatedFetch } from "@crms/lib/authenticatedFetch";
import { useRealtimeSubscription } from "@crms/hooks/useRealtimeSubscription";

const preloadDashboard = () => import("@crms/pages/Dashboard");
const preloadRequestList = () => import("@crms/pages/RequestList");
const preloadNewRequest = () => import("@crms/pages/NewRequest");
const preloadRequestDetail = () => import("@crms/pages/RequestDetail");
const preloadApprovals = () => import("@crms/pages/Approvals");
const preloadReports = () => import("@crms/pages/Reports");
const preloadAuditLog = () => import("@crms/pages/AuditLog");
const preloadAssignments = () => import("@crms/pages/Assignments");
const preloadNotFound = () => import("@crms/pages/NotFound");

const Dashboard = lazy(preloadDashboard);
const RequestList = lazy(preloadRequestList);
const NewRequest = lazy(preloadNewRequest);
const RequestDetail = lazy(preloadRequestDetail);
const Approvals = lazy(preloadApprovals);
const Reports = lazy(preloadReports);
const AuditLog = lazy(preloadAuditLog);
const Assignments = lazy(preloadAssignments);
const NotFound = lazy(preloadNotFound);

const routePreloaders = [
  preloadRequestList,
  preloadNewRequest,
  preloadRequestDetail,
  preloadApprovals,
  preloadReports,
  preloadAuditLog,
  preloadAssignments,
  preloadNotFound,
] as const;

installAuthenticatedFetch();

type CimsRole = "SuperAdmin" | "Admin" | "Teamlead" | "Developer" | "Sales";

interface NativeDevelopersWorkspaceProps {
  userId: string;
  role: CimsRole;
}

const navigation = [
  { label: "Overview", to: "/developers", icon: LayoutDashboard, roles: ["SuperAdmin", "Admin", "Teamlead", "Developer", "Sales"] },
  { label: "Requests", to: "/developers/requests", icon: FileText, roles: ["SuperAdmin", "Admin", "Teamlead", "Developer", "Sales"] },
  { label: "New Request", to: "/developers/requests/new", icon: PlusCircle, roles: ["SuperAdmin", "Admin", "Teamlead", "Sales"] },
  { label: "Approvals", to: "/developers/approvals", icon: ClipboardCheck, roles: ["SuperAdmin", "Admin", "Sales"] },
  { label: "Assignments", to: "/developers/assignments", icon: FolderKanban, roles: ["SuperAdmin", "Admin", "Teamlead", "Developer"] },
  { label: "Reports", to: "/developers/reports", icon: BarChart3, roles: ["SuperAdmin", "Admin", "Teamlead", "Sales"] },
  { label: "Audit", to: "/developers/audit", icon: History, roles: ["SuperAdmin", "Admin", "Teamlead"] },
] as const;

export function NativeDevelopersWorkspace({ userId, role }: NativeDevelopersWorkspaceProps) {
  useRealtimeSubscription();
  const visibleNavigation = navigation.filter((item) => (item.roles as readonly string[]).includes(role));

  useEffect(() => {
    const preload = () => routePreloaders.forEach((loader) => void loader());
    const idleCallback = "requestIdleCallback" in window
      ? window.requestIdleCallback(preload, { timeout: 2000 })
      : globalThis.setTimeout(preload, 350);

    return () => {
      if ("cancelIdleCallback" in window && typeof idleCallback === "number") {
        window.cancelIdleCallback(idleCallback);
      } else {
        globalThis.clearTimeout(idleCallback as number);
      }
    };
  }, []);

  return (
    <section className="crms-native flex min-h-0 flex-col gap-4" data-user-id={userId}>
      <div className="rounded-xl border bg-card p-2 shadow-sm">
        <nav className="flex gap-1 overflow-x-auto" aria-label="Developers workspace">
          {visibleNavigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/developers"}
              className={({ isActive }) => cn(
                "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="min-h-[560px] rounded-xl border bg-background p-1 shadow-sm sm:p-3">
        <Suspense fallback={<div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">Loading Developers workspace…</div>}>
        <Routes>
          <Route path="/developers" element={<Dashboard />} />
          <Route path="/developers/requests" element={<RequestList />} />
          <Route path="/developers/requests/new" element={role === "SuperAdmin" || role === "Admin" || role === "Teamlead" || role === "Sales" ? <NewRequest /> : <Navigate to="/developers/requests" replace />} />
          <Route path="/developers/requests/:id" element={<RequestDetail />} />
          <Route path="/developers/approvals" element={role === "SuperAdmin" || role === "Admin" || role === "Sales" ? <Approvals /> : <Navigate to="/developers" replace />} />
          <Route path="/developers/reports" element={role !== "Developer" ? <Reports /> : <Navigate to="/developers" replace />} />
          <Route path="/developers/audit" element={role === "SuperAdmin" || role === "Admin" || role === "Teamlead" ? <AuditLog /> : <Navigate to="/developers" replace />} />
          <Route path="/developers/assignments" element={<Assignments />} />
          <Route path="/developers/users" element={<Navigate to="/" replace />} />
          <Route path="/developers/settings" element={<Navigate to="/" replace />} />
          <Route path="/developers/notifications" element={<Navigate to="/" replace />} />
          <Route path="/developers/*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </div>
    </section>
  );
}
