import { NativeDevelopersWorkspace } from "@crms/NativeWorkspace";
import { Navigate, useLocation } from "react-router-dom";

interface DevelopersWorkspaceProps {
  userId: string;
  role: "SuperAdmin" | "Admin" | "Management" | "Teamlead" | "Developer" | "Sales";
}

export const DevelopersWorkspace = ({ userId, role }: DevelopersWorkspaceProps) => {
  const location = useLocation();
  if (!location.pathname.startsWith("/developers")) {
    return <Navigate to="/developers" replace />;
  }
  return <NativeDevelopersWorkspace userId={userId} role={role} />;
};
