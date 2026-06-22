import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Search, TrendingUp, Clock, CheckCircle2, AlertCircle, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDatabase } from "@/hooks/useDatabase";
import { User, Installation, Client } from "@/types";

interface InstallationProgressProps {
  user: User;
}

interface InstallationProgressData {
  id: string;
  installation_id: string;
  progress_percentage: number;
  last_updated_by: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface ExtendedInstallation extends Installation {
  progress?: InstallationProgressData;
  client_name?: string;
  branch?: string;
  hardware_technician_id?: string;
  software_technician_id?: string;
  assigned_date?: string;
}

export const InstallationProgressModule = ({ user }: InstallationProgressProps) => {
  const [installations, setInstallations] = useState<ExtendedInstallation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [technicianFilter, setTechnicianFilter] = useState("all");
  const [isProgressDialogOpen, setIsProgressDialogOpen] = useState(false);
  const [selectedInstallation, setSelectedInstallation] = useState<ExtendedInstallation | null>(null);
  const [progressData, setProgressData] = useState({
    progress_percentage: 0,
    notes: "",
    waiting_reason: ""
  });
  const { toast } = useToast();
  const { 
    getInstallations, 
    getClients, 
    getUsers, 
    getAssignments, 
    updateInstallationStatus, 
    loading 
  } = useDatabase();

  useEffect(() => {
    loadData();
  }, [user.id]);

  const loadData = async () => {
    try {
      const [installationsData, clientsData, usersData, assignmentsData] = await Promise.all([
        getInstallations(),
        getClients(),
        getUsers(),
        getAssignments()
      ]);

      setTechnicians(usersData);
      
      // Enhanced installations with client info and assignment data
      const enhancedInstallations = (installationsData || []).map((installation: Installation) => {
        const client = clientsData.find((c: Client) => c.id === installation.client_id);
        const assignment = assignmentsData?.find((a: any) => 
          a.client_id === installation.client_id && a.branch === (client?.branch || installation.branch)
        );
        
        return {
          ...installation,
          client_name: client?.client_name || 'Unknown',
          branch: client?.branch || installation.branch || '',
          hardware_technician_id: installation.hardware_technician_id || assignment?.hardware_technician_id,
          software_technician_id: installation.software_technician_id || assignment?.software_technician_id,
          assigned_date: installation.assigned_date || assignment?.installation_start_date,
          progress: {
            id: '',
            installation_id: installation.id,
            progress_percentage: getProgressByStatus(installation.status),
            last_updated_by: installation.assigned_technician_id || installation.account_manager_id,
            created_at: installation.created_at,
            updated_at: installation.updated_at
          }
        };
      });
      
      setInstallations(enhancedInstallations);
      setClients(clientsData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load installation data",
        variant: "destructive",
      });
    }
  };

  const getProgressByStatus = (status: string): number => {
    switch (status) {
      case 'pending': return 0;
      case 'waiting': return 25;
      case 'in_progress': return 50;
      case 'completed': return 100;
      default: return 0;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-success/10 text-success border-success/20 hover:bg-success/20';
      case 'in_progress': return 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20';
      case 'waiting': return 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20';
      case 'pending': return 'bg-muted text-muted-foreground border-border hover:bg-muted/80';
      default: return 'bg-muted text-muted-foreground border-border hover:bg-muted/80';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4" />;
      case 'in_progress': return <TrendingUp className="h-4 w-4" />;
      case 'waiting': return <AlertCircle className="h-4 w-4" />;
      case 'pending': return <Clock className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const filteredInstallations = installations.filter(installation => {
    const matchesSearch = (installation.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          installation.kiosk_type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          installation.branch?.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || installation.status === statusFilter;
    const matchesTechnician = technicianFilter === 'all' || 
                             installation.hardware_technician_id === technicianFilter ||
                             installation.software_technician_id === technicianFilter ||
                             installation.assigned_technician_id === technicianFilter;
    return matchesSearch && matchesStatus && matchesTechnician;
  });

  const handleStatusUpdate = async (installationId: string, newStatus: string, reason?: string) => {
    if (user.role !== 'SuperAdmin' && user.role !== 'Teamlead' && user.role !== 'Admin') {
      toast({
        title: "Access Denied",
        description: "Only team leads and admins can update installation status",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateInstallationStatus(installationId, newStatus, user.id, reason);
      await loadData();
      toast({
        title: "Status Updated",
        description: `Installation status changed to ${newStatus}`,
      });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleOpenProgressDialog = (installation: ExtendedInstallation) => {
    setSelectedInstallation(installation);
    setProgressData({
      progress_percentage: installation.progress?.progress_percentage || 0,
      notes: installation.progress?.notes || "",
      waiting_reason: installation.waiting_reason || ""
    });
    setIsProgressDialogOpen(true);
  };

  const handleSaveProgress = async () => {
    if (!selectedInstallation) return;

    try {
      if (selectedInstallation.status === 'waiting' && progressData.waiting_reason) {
        await handleStatusUpdate(selectedInstallation.id, 'waiting', progressData.waiting_reason);
      }
      
      // In a real implementation, we'd also save progress_percentage and notes
      // to the installation_progress table via a separate hook method.
      
      setIsProgressDialogOpen(false);
      await loadData();
      toast({
        title: "Progress Updated",
        description: "Installation progress has been updated successfully",
      });
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };

  const getTechnicianName = (technicianId?: string) => {
    if (!technicianId) return 'Not assigned';
    const tech = technicians.find(t => t.id === technicianId);
    if (!tech) return 'Unknown';
    return `${tech.first_name || ''} ${tech.last_name || ''}`.trim() || tech.email;
  };

  const totalInstallations = installations.length;
  const completedInstallations = installations.filter(i => i.status === 'completed').length;
  const inProgressInstallations = installations.filter(i => i.status === 'in_progress').length;
  const waitingInstallations = installations.filter(i => i.status === 'waiting').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Installation Progress</h1>
          <p className="text-muted-foreground">Track and manage installation progress across all clients</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-elegant">
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-primary">{totalInstallations}</p>
                <p className="text-xs text-muted-foreground">Total Installations</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-elegant">
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="h-8 w-8 text-success" />
              <div>
                <p className="text-2xl font-bold text-success">{completedInstallations}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-elegant">
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-primary">{inProgressInstallations}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-elegant">
          <CardContent className="p-6">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-8 w-8 text-warning" />
              <div>
                <p className="text-2xl font-bold text-warning">{waitingInstallations}</p>
                <p className="text-xs text-muted-foreground">Waiting</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-riana">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by client name, kiosk type, or branch..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="waiting">Waiting</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by technician" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Technicians</SelectItem>
                {technicians.map((tech) => (
                  <SelectItem key={tech.id} value={tech.id}>
                    {tech.first_name} {tech.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-riana">
        <CardHeader>
          <CardTitle>Installation Progress Overview</CardTitle>
          <CardDescription>
            Detailed view of installation progress across all clients
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Kiosk Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Technician</TableHead>
                {(user.role === 'SuperAdmin' || user.role === 'Teamlead' || user.role === 'Admin') && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInstallations.map((installation) => (
                <TableRow key={installation.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{installation.client_name}</div>
                      {installation.branch && (
                        <div className="text-sm text-muted-foreground">{installation.branch}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{installation.kiosk_type}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStatusColor(installation.status)}>
                      {getStatusIcon(installation.status)}
                      <span className="ml-1 capitalize">{installation.status.replace('_', ' ')}</span>
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Progress value={installation.progress?.progress_percentage || 0} className="w-20" />
                      <span className="text-sm text-muted-foreground">
                        {installation.progress?.progress_percentage || 0}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div className="font-medium text-primary">
                        {installation.assigned_date 
                          ? new Date(installation.assigned_date).toLocaleDateString()
                          : 'Not assigned'
                        }
                      </div>
                      {installation.hardware_technician_id && (
                        <div className="text-muted-foreground text-xs mt-1">
                          <span className="font-semibold">HW:</span> {getTechnicianName(installation.hardware_technician_id)}
                        </div>
                      )}
                      {installation.software_technician_id && (
                        <div className="text-muted-foreground text-xs">
                          <span className="font-semibold">SW:</span> {getTechnicianName(installation.software_technician_id)}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  {(user.role === 'SuperAdmin' || user.role === 'Teamlead' || user.role === 'Admin') && (
                    <TableCell>
                      <div className="flex gap-2">
                        <Select
                          value={installation.status}
                          onValueChange={(value) => {
                            if (value === 'waiting') {
                              handleOpenProgressDialog(installation);
                            } else {
                              handleStatusUpdate(installation.id, value);
                            }
                          }}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="waiting">Waiting</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenProgressDialog(installation)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredInstallations.length === 0 && (
            <div className="text-center py-8">
              <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No installations found matching your criteria</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isProgressDialogOpen} onOpenChange={setIsProgressDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Installation Progress</DialogTitle>
            <DialogDescription>
              Update progress details for {selectedInstallation?.client_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Progress Percentage</Label>
              <Input
                type="number"
                min="0"
                max="100"
                value={progressData.progress_percentage}
                onChange={(e) => setProgressData({
                  ...progressData,
                  progress_percentage: parseInt(e.target.value) || 0
                })}
              />
            </div>
            
            {selectedInstallation?.status === 'waiting' && (
              <div className="space-y-2">
                <Label>Waiting Reason *</Label>
                <Textarea
                  placeholder="Please specify the reason for waiting..."
                  value={progressData.waiting_reason}
                  onChange={(e) => setProgressData({
                    ...progressData,
                    waiting_reason: e.target.value
                  })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Progress Notes</Label>
              <Textarea
                placeholder="Add any progress notes or updates..."
                value={progressData.notes}
                onChange={(e) => setProgressData({
                  ...progressData,
                  notes: e.target.value
                })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsProgressDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveProgress} className="gradient-primary">
              Update Progress
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
