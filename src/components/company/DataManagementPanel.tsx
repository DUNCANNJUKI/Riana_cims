import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Database, Trash2, RefreshCw, Shield, AlertTriangle, Lock, Save, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { User } from "@/types";
import { can } from "@/security/accessControl";
import { apiClient } from "@/integrations/apiClient";

interface DataManagementPanelProps {
  user: User;
}

export const DataManagementPanel = ({ user }: DataManagementPanelProps) => {
  const [isCleaning, setIsCleaning] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupsList, setBackupsList] = useState<{name: string, size: number, created_at: string}[]>([]);
  const [dbStats, setDbStats] = useState<Record<string, number> | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [backupSchedule, setBackupSchedule] = useState("0 2 * * *");
  const [backupDay, setBackupDay] = useState("Daily");
  const [backupTime, setBackupTime] = useState("02:00");
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const { toast } = useToast();
  const isSuperAdmin = can(user, 'backup.manage');

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadBackupsList();
    loadBackupSchedule();
  }, [isSuperAdmin]);

  const loadBackupSchedule = async () => {
    try {
      const data = await apiClient.get('/admin/backup-schedule');
      if (data) {
        if (data.day) setBackupDay(data.day);
        if (data.time) setBackupTime(data.time);
        if (data.schedule) setBackupSchedule(data.schedule);
      }
    } catch (error) {
      console.error("Error loading backup schedule", error);
    }
  };

  const saveBackupSchedule = async () => {
    setIsSavingSchedule(true);
    try {
      const res = await apiClient.post('/admin/backup-schedule', { 
        schedule: backupSchedule,
        day: backupDay,
        time: backupTime
      });
      if (res.success) {
        toast({ title: "Success", description: "Backup schedule updated" });
      } else {
        toast({ title: "Error", description: res.message || "Failed to update schedule", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to update schedule", variant: "destructive" });
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const loadBackupsList = async () => {
    try {
      const data = await apiClient.get('/admin/backups');
      if (Array.isArray(data)) {
        setBackupsList(data);
      }
    } catch (error) {
      console.error("Error loading backups", error);
    }
  };

  const createBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await apiClient.post('/admin/backup', {});
      if (res.success) {
        toast({ title: "Backup Created", description: res.message });
        loadBackupsList();
      } else {
        toast({ title: "Error", description: res.message || "Failed to create backup", variant: "destructive" });
      }
    } catch (error) {
      console.error("Backup error:", error);
      toast({ title: "Error", description: "Failed to create backup", variant: "destructive" });
    } finally {
      setIsBackingUp(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Access denied. Backup management permission is required.</p>
        </div>
      </div>
    );
  }

  const handleGetStats = async () => {
    setIsLoadingStats(true);
    try {
      const stats = await apiClient.get('/admin/db-stats');
      setDbStats(stats);
      toast({
        title: "Database Statistics",
        description: "Successfully loaded database statistics from local server",
      });
    } catch (error) {
      console.error('Error getting database stats:', error);
      toast({
        title: "Error",
        description: "Failed to load database statistics",
        variant: "destructive",
      });
    } finally {
      setIsLoadingStats(false);
    }
  };

  const verifyPasswordAndClean = async () => {
    if (!confirmPassword) {
      toast({
        title: "Password Required",
        description: "Please enter your password to confirm this action.",
        variant: "destructive",
      });
      return;
    }

    setIsCleaning(true);
    
    try {
      // Verify local password
      const verifyRes = await apiClient.post('/auth/verify-password', {
        email: user.email,
        password: confirmPassword,
      });

      if (!verifyRes.success) {
        toast({
          title: "Invalid Password",
          description: "The password you entered is incorrect.",
          variant: "destructive",
        });
        setIsCleaning(false);
        return;
      }

      // Password verified, proceed with local database cleanup
      const result = await apiClient.post('/admin/clean-db', {});
      
      if (result.success) {
        toast({
          title: "Database Cleaned Successfully",
          description: result.message,
        });
        
        await handleGetStats();
        setShowPasswordDialog(false);
        setConfirmPassword("");
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error cleaning database:', error);
      toast({
        title: "Error",
        description: "Failed to clean local database",
        variant: "destructive",
      });
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-primary mb-2">Data Management</h2>
        <p className="text-muted-foreground">Manage system data and perform administrative cleanup operations</p>
      </div>


      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Statistics
          </CardTitle>
          <CardDescription>Current record counts across all local tables</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleGetStats} disabled={isLoadingStats} variant="outline" className="w-full">
            {isLoadingStats ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            {isLoadingStats ? "Loading Statistics..." : "Load Database Statistics"}
          </Button>

          {dbStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              {Object.entries(dbStats).map(([table, count]) => (
                <div key={table} className="p-3 border rounded-lg">
                  <div className="text-xs text-muted-foreground mb-1 capitalize">{table.replace(/_/g, ' ')}</div>
                  <div className="text-2xl font-bold">{count === -1 ? <Badge variant="destructive">Error</Badge> : count}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Database Backups
          </CardTitle>
          <CardDescription>Create and view local database backup files (.sql)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col space-y-4 border p-4 rounded-lg bg-muted/20">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Automated Backup Schedule
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="backup-day">Select Day</Label>
                <Select value={backupDay} onValueChange={setBackupDay}>
                  <SelectTrigger id="backup-day text-sm">
                    <SelectValue placeholder="Select Day" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Daily">Daily</SelectItem>
                    <SelectItem value="Monday">Monday</SelectItem>
                    <SelectItem value="Tuesday">Tuesday</SelectItem>
                    <SelectItem value="Wednesday">Wednesday</SelectItem>
                    <SelectItem value="Thursday">Thursday</SelectItem>
                    <SelectItem value="Friday">Friday</SelectItem>
                    <SelectItem value="Saturday">Saturday</SelectItem>
                    <SelectItem value="Sunday">Sunday</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="backup-time">Select Time</Label>
                <Input 
                  id="backup-time" 
                  type="time" 
                  value={backupTime} 
                  onChange={(e) => setBackupTime(e.target.value)} 
                />
              </div>

              <div className="flex items-end">
                <Button onClick={saveBackupSchedule} disabled={isSavingSchedule} className="w-full">
                  {isSavingSchedule ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : "Save Schedule"}
                </Button>
              </div>
            </div>

            <div className="pt-2 border-t">
              <Label htmlFor="cron" className="text-xs text-muted-foreground mb-1 block">Advanced: Cron Expression</Label>
              <Input 
                id="cron" 
                value={backupSchedule} 
                onChange={(e) => setBackupSchedule(e.target.value)} 
                placeholder="0 2 * * *" 
                className="h-8 text-[10px] font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Last calculated schedule: {backupSchedule}
              </p>
            </div>
          </div>

          <Button onClick={createBackup} disabled={isBackingUp} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            {isBackingUp ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {isBackingUp ? "Creating Backup..." : "Create New Backup"}
          </Button>

          {backupsList.length > 0 && (
            <div className="mt-4 border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">File Name</th>
                    <th className="px-4 py-2 text-left">Size</th>
                    <th className="px-4 py-2 text-left">Created At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {backupsList.map((file) => (
                    <tr key={file.name} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 align-middle">{file.name}</td>
                      <td className="px-4 py-3 align-middle">{(file.size / 1024 / 1024).toFixed(2)} MB</td>
                      <td className="px-4 py-3 align-middle">{new Date(file.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {backupsList.length === 0 && (
            <div className="text-center p-4 text-muted-foreground bg-muted/20 rounded-lg">
              No backups created yet.
            </div>
          )}
        </CardContent>
      </Card>

      {/*
      <Card className="border-red-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <Trash2 className="h-5 w-5" />
            Clean Database (Production Reset)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AlertDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isCleaning} className="w-full">
                {isCleaning ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                {isCleaning ? "Cleaning Database..." : "Reset System Data"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-6 w-6 animate-pulse" />
                  ⚠️ CRITICAL WARNING ⚠️
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <p className="font-bold text-red-700">THIS ACTION CANNOT BE UNDONE!</p>
                  <p>You are about to permanently delete ALL system data from the local database.</p>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="confirm-password">Enter your password to confirm</Label>
                    <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isCleaning} />
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => { setConfirmPassword(""); setShowPasswordDialog(false); }}>Cancel</AlertDialogCancel>
                <Button onClick={verifyPasswordAndClean} disabled={isCleaning || !confirmPassword} className="bg-red-600 hover:bg-red-700">
                  {isCleaning ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : "Confirm Reset"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
      */}
    </div>
  );
};
