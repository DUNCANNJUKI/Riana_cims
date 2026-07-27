import { AlertTriangle, Clock } from "lucide-react";
import type { MaintenanceState } from "@/hooks/useMaintenanceStatus";

const formatDateTime = (value?: string | null) => {
  if (!value) return "completion not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "completion not set";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export const MaintenanceBanner = ({ maintenance }: { maintenance: MaintenanceState }) => (
  <div className="border-b border-orange-300 bg-orange-50 px-3 py-2 text-orange-950 shadow-sm sm:px-4">
    <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm">
      <span className="flex items-center gap-2 font-extrabold">
        <AlertTriangle className="h-4 w-4" />
        Maintenance Mode Active
      </span>
      <span className="font-medium">{maintenance.reason || "Scheduled maintenance"}</span>
      <span className="flex items-center gap-1 text-orange-900/80">
        <Clock className="h-3.5 w-3.5" />
        {formatDateTime(maintenance.estimated_completion)}
      </span>
      {maintenance.enabled_by_name && (
        <span className="text-orange-900/80">Enabled by {maintenance.enabled_by_name}</span>
      )}
    </div>
  </div>
);
