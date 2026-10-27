import { useCallback, useEffect, useState } from "react";
import { API_URL } from "@/integrations/apiClient";

export interface MaintenanceState {
  enabled: boolean;
  reason: string;
  message: string;
  estimated_completion: string | null;
  enabled_by: string | null;
  enabled_by_name: string | null;
  enabled_at: string | null;
  disabled_by: string | null;
  disabled_at: string | null;
  allow_api_access: boolean;
  force_logout: boolean;
  notify_users: boolean;
  backup_before_enable: boolean;
  allow_super_admin_only: boolean;
}

export const useMaintenanceStatus = ({ pollMs = 0, enabled = true } = {}) => {
  const [maintenance, setMaintenance] = useState<MaintenanceState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return null;
    try {
      setError(null);
      const response = await fetch(`${API_URL}/maintenance/status`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Unable to load maintenance status.");
      const data = await response.json();
      setMaintenance(data.maintenance || null);
      return data.maintenance || null;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load maintenance status.");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
    if (!pollMs || !enabled) return undefined;
    const timer = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(timer);
  }, [enabled, pollMs, refresh]);

  return { maintenance, isLoading, error, refresh };
};
