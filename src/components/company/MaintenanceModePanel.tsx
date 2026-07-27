import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bell, Clock, Database, RefreshCw, Save, ShieldCheck, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/apiClient";
import type { MaintenanceState } from "@/hooks/useMaintenanceStatus";

const emptyState: MaintenanceState = {
  enabled: false,
  reason: "",
  message: "RIANA CIMS is temporarily unavailable while scheduled maintenance is in progress.",
  estimated_completion: null,
  enabled_by: null,
  enabled_by_name: null,
  enabled_at: null,
  disabled_by: null,
  disabled_at: null,
  allow_api_access: false,
  force_logout: true,
  notify_users: false,
  backup_before_enable: true,
  allow_super_admin_only: true,
};

const toDatetimeLocalValue = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

type MaintenanceToggleKey = "force_logout" | "notify_users" | "allow_api_access" | "backup_before_enable";

const maintenanceToggleOptions: Array<{
  key: MaintenanceToggleKey;
  title: string;
  description: string;
  Icon: LucideIcon;
}> = [
  { key: "force_logout", title: "Force Logout", description: "Invalidate active non-SuperAdmin sessions immediately.", Icon: AlertTriangle },
  { key: "notify_users", title: "Notify Users", description: "Create maintenance notifications for active users.", Icon: Bell },
  { key: "allow_api_access", title: "Allow API Access", description: "Permit existing non-SuperAdmin API calls during maintenance.", Icon: ShieldCheck },
  { key: "backup_before_enable", title: "Backup Before Enable", description: "Run a database backup before switching maintenance on.", Icon: Database },
];

export const MaintenanceModePanel = () => {
  const [settings, setSettings] = useState<MaintenanceState>(emptyState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get("/admin/maintenance-mode");
      setSettings({ ...emptyState, ...(data.maintenance || {}) });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load maintenance settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const update = <K extends keyof MaintenanceState>(key: K, value: MaintenanceState[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const data = await apiClient.put("/admin/maintenance-mode", {
        maintenance_enabled: settings.enabled,
        maintenance_reason: settings.reason,
        maintenance_message: settings.message,
        estimated_completion: settings.estimated_completion,
        maintenance_allow_api_access: settings.allow_api_access,
        maintenance_force_logout: settings.force_logout,
        maintenance_notify_users: settings.notify_users,
        maintenance_backup_before_enable: settings.backup_before_enable,
      });
      setSettings({ ...emptyState, ...(data.maintenance || {}) });
      window.dispatchEvent(new CustomEvent("riana-maintenance-updated", { detail: data.maintenance }));
      toast({
        title: data.maintenance?.enabled ? "Maintenance Mode Active" : "Maintenance Mode Disabled",
        description: data.backupWarning || "Maintenance settings saved successfully.",
        variant: data.backupWarning ? "destructive" : "default",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save maintenance settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="shadow-riana">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Maintenance Mode
              </CardTitle>
              <CardDescription>Restrict RIANA CIMS access to Super Administrators during planned work.</CardDescription>
            </div>
            <Badge variant={settings.enabled ? "destructive" : "outline"} className="w-fit">
              {settings.enabled ? "Active" : "Inactive"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4">
            <div>
              <Label htmlFor="maintenance_enabled" className="text-base font-bold">Enable Maintenance</Label>
              <p className="mt-1 text-sm text-muted-foreground">Only Super Administrators can enter the system while active.</p>
            </div>
            <Switch
              id="maintenance_enabled"
              checked={settings.enabled}
              onCheckedChange={(checked) => update("enabled", checked)}
              aria-label="Enable maintenance mode"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="maintenance_reason">Reason</Label>
              <Input
                id="maintenance_reason"
                value={settings.reason}
                maxLength={255}
                onChange={(event) => update("reason", event.target.value)}
                placeholder="Scheduled database maintenance"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="estimated_completion">Estimated Completion</Label>
              <Input
                id="estimated_completion"
                type="datetime-local"
                value={toDatetimeLocalValue(settings.estimated_completion)}
                onChange={(event) => update("estimated_completion", event.target.value || null)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maintenance_message">Custom Message</Label>
            <Textarea
              id="maintenance_message"
              value={settings.message}
              rows={4}
              maxLength={1000}
              onChange={(event) => update("message", event.target.value)}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {maintenanceToggleOptions.map(({ key, title, description, Icon }) => (
              <div key={key} className="flex items-start justify-between gap-4 rounded-lg border p-4">
                <div className="flex gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <Label htmlFor={`maintenance_${key}`} className="font-bold">{title}</Label>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
                  </div>
                </div>
                <Switch
                  id={`maintenance_${key}`}
                  checked={Boolean(settings[key])}
                  onCheckedChange={(checked) => update(key, checked)}
                  aria-label={String(title)}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => void loadSettings()} disabled={isSaving}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={saveSettings} className="gradient-primary" disabled={isSaving}>
              {isSaving ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Maintenance Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-riana">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5" />
            Current State
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Status</p>
            <p className="mt-1 font-bold">{settings.enabled ? "Maintenance Mode Active" : "Normal Operation"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Enabled By</p>
            <p className="mt-1">{settings.enabled_by_name || "Not active"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Estimated Completion</p>
            <p className="mt-1">{toDatetimeLocalValue(settings.estimated_completion) || "Not set"}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
