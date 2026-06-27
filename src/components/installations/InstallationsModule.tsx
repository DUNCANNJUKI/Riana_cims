import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Package, Monitor, Smartphone, Wifi, Loader2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDatabase } from "@/hooks/useDatabase";
import { Installation, Client, User, EscalationMatrix, Subsidiary } from "@/types";
import { InstallationDetailsDialog } from "@/components/dialogs/InstallationDetailsDialog";
import { EscalationMatrixDialog } from "@/components/dialogs/EscalationMatrixDialog";

import { FeedbackLinkGenerator } from "@/components/feedback/FeedbackLinkGenerator";
import { EHandoverUpload } from "@/components/handover/EHandoverUpload";
import { generateInstallationReport } from "@/utils/installationExport";
import { InstallationActionsMenu } from "./InstallationActionsMenu";
import { can } from "@/security/accessControl";

interface InstallationsModuleProps {
  user: User;
}

export const InstallationsModule = ({ user }: InstallationsModuleProps) => {
  const canManageInstallations = can(user, 'installations.manage');
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [technicianFilter, setTechnicianFilter] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newInstallation, setNewInstallation] = useState<Partial<Installation>>({});
  const [selectedInstallation, setSelectedInstallation] = useState<Installation | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isEscalationDialogOpen, setIsEscalationDialogOpen] = useState(false);
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
  const [selectedFeedbackInstallation, setSelectedFeedbackInstallation] = useState<Installation | null>(null);
  const [currentEscalationInstallation, setCurrentEscalationInstallation] = useState<Installation | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [isUploadHandoverOpen, setIsUploadHandoverOpen] = useState(false);
  const [selectedInstallationForHandover, setSelectedInstallationForHandover] = useState<Installation | null>(null);
  const { toast } = useToast();
  const { 
    getInstallations, 
    addInstallation, 
    updateInstallation,
    getClients, 
    updateInstallationStatus,
    updateEscalationMatrix,
    getCompanySettings,
    getSubsidiaries,
    getUsers,
    getAssignments,
    loading 
  } = useDatabase();


  const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([]);

  useEffect(() => {
    loadInitialData();
  }, []);


  const loadInitialData = async () => {
    try {
      const [installationsData, clientsData, usersData, assignmentsData, subsidiariesData] = await Promise.all([
        getInstallations(),
        getClients(),
        getUsers(),
        getAssignments(),
        getSubsidiaries()
      ]);
      
      // Remove duplicate assignments based on client_id and branch
      const uniqueAssignments = assignmentsData?.filter((assignment: any, index: number, self: any[]) =>
        index === self.findIndex((a) => (
          a.client_id === assignment.client_id && a.branch === assignment.branch
        ))
      ) || [];
      
      setInstallations(installationsData);
      setClients(clientsData);
      setUsers(usersData);
      setAssignments(uniqueAssignments);
      setSubsidiaries(subsidiariesData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive",
      });
    }
  };


  const filteredInstallations = installations.filter(installation => {
    const client = clients.find(c => c.id === installation.client_id);
    const matchesSearch = installation.kiosk_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
           installation.screen_with_size.toLowerCase().includes(searchTerm.toLowerCase()) ||
           (client?.client_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    // Get assignment for this installation
    const assignment = assignments.find(a => 
      a.client_id === installation.client_id && 
      (!client?.branch || a.branch === client.branch)
    );
    
    // Technician filter
    const matchesTechnician = technicianFilter === 'all' || 
      installation.hardware_technician_id === technicianFilter ||
      installation.software_technician_id === technicianFilter ||
      installation.assigned_technician_id === technicianFilter ||
      assignment?.hardware_technician_id === technicianFilter ||
      assignment?.software_technician_id === technicianFilter;
    
    return matchesSearch && matchesTechnician;
  });

  // Get technicians for filter dropdown
  const technicians = users.filter(u => u.role === 'User' || u.role === 'Teamlead');

  const handleAddInstallation = async () => {
    if (!newInstallation.client_id || !newInstallation.kiosk_type) {
      toast({
        title: "Error",
        description: "Please fill in all required fields (Client and Kiosk Type)",
        variant: "destructive",
      });
      return;
    }

    try {
      // Prepare escalation matrix - ensure it's properly formatted
      let escalationMatrix = null;
      if (newInstallation.escalation_matrix) {
        escalationMatrix = {
          tier1: {
            name: newInstallation.escalation_matrix.tier1?.name || '',
            role: newInstallation.escalation_matrix.tier1?.role || '',
            phone_number: newInstallation.escalation_matrix.tier1?.phone_number || '',
            email: newInstallation.escalation_matrix.tier1?.email || ''
          },
          tier2: {
            name: newInstallation.escalation_matrix.tier2?.name || '',
            role: newInstallation.escalation_matrix.tier2?.role || '',
            phone_number: newInstallation.escalation_matrix.tier2?.phone_number || '',
            email: newInstallation.escalation_matrix.tier2?.email || ''
          },
          tier3: {
            name: newInstallation.escalation_matrix.tier3?.name || '',
            role: newInstallation.escalation_matrix.tier3?.role || '',
            phone_number: newInstallation.escalation_matrix.tier3?.phone_number || '',
            email: newInstallation.escalation_matrix.tier3?.email || ''
          }
        };
      }

      const installationData = {
        client_id: newInstallation.client_id!,
        kiosk_type: newInstallation.kiosk_type!,
        kiosk_count: newInstallation.kiosk_count || 0,
        counter_count: newInstallation.counter_count || 0,
        counter_names: Array.isArray(newInstallation.counter_names) ? newInstallation.counter_names : [],
        led_count: newInstallation.led_count || 0,
        led_names: Array.isArray(newInstallation.led_names) ? newInstallation.led_names : [],
        service_points: newInstallation.service_points || 0,
        ups_count: newInstallation.ups_count || 0,
        speakers: newInstallation.speakers || 0,
        screen_with_size: newInstallation.screen_with_size || '',
        media_controllers: newInstallation.media_controllers || 0,
        tablets: newInstallation.tablets || 0,
        digital_signage_system: newInstallation.digital_signage_system || 0,
        staff_trained: newInstallation.staff_trained || 0,
        amplifiers: newInstallation.amplifiers || 0,
        hdmis: newInstallation.hdmis || 0,
        splitters: newInstallation.splitters || 0,
        handover_file_path: '',
        account_manager_id: user.id,
        status: 'pending',
        remarks: newInstallation.remarks || '',
        scheduled_end_date: newInstallation.scheduled_end_date || null,
        escalation_matrix: escalationMatrix
      };

      if (newInstallation.id) {
        await updateInstallation(newInstallation.id, installationData);
      } else {
        await addInstallation(installationData);
      }
      await loadInitialData();
      setNewInstallation({});
      setIsAddDialogOpen(false);
      toast({
        title: "Success",
        description: "Installation added successfully",
      });
    } catch (error: any) {
      console.error('Error adding installation:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to add installation. Please check all required fields.",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = async (installationId: string, newStatus: string, waitingReason?: string) => {
    if (user.role !== 'SuperAdmin' && user.role !== 'Teamlead' && user.role !== 'Admin') {
      toast({
        title: "Access Denied",
        description: "Only team leads and admins can change installation status",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateInstallationStatus(installationId, newStatus, user.id, waitingReason);
      await loadInitialData(); // Refresh data
      toast({
        title: "Status Updated",
        description: `Installation status changed to ${newStatus}`,
      });
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: "Error",
        description: "Failed to update installation status",
        variant: "destructive",
      });
    }
  };

  const handleEscalationMatrix = (installation: Installation) => {
    setCurrentEscalationInstallation(installation);
    setIsEscalationDialogOpen(true);
  };

  const handleSaveEscalationMatrix = async (matrix: EscalationMatrix) => {
    if (!currentEscalationInstallation) return;

    try {
      await updateEscalationMatrix(currentEscalationInstallation.id, matrix);
      await loadInitialData(); // Refresh data
    } catch (error) {
      console.error('Error saving escalation matrix:', error);
    }
  };


  const handleDownloadReport = async (installation: Installation) => {
    try {
      const client = clients.find(c => c.id === installation.client_id);
      let company = await getCompanySettings();
      if (!company) {
        company = { id: 'default', name: 'RIANA Technologies' };
      } else {
        // Map database's company_name to Company interface's name
        company.name = company.company_name || company.name || 'RIANA Technologies';
      }
      
       if (!client) {
        toast({
          title: "Error",
          description: "Client information not found",
          variant: "destructive",
        });
        return;
      }

      const subsidiary = subsidiaries.find(s => s.id === client.subsidiary_id);
      await generateInstallationReport(installation, client, company, subsidiary, user.subsidiary_name);

      // Auto-mark installation as complete on export
      if (installation.status !== 'completed') {
        try {
          await updateInstallationStatus(installation.id, 'completed', user.id);
          await loadInitialData();
        } catch (statusError) {
          console.error('Error auto-completing installation:', statusError);
          // Don't fail the whole process if just the status update fails
        }
      }

      toast({
        title: "Success",
        description: "Installation report downloaded and status marked as complete",
      });
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: "Error",
        description: "Failed to generate installation report",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-success/10 text-success border-success/20';
      case 'in_progress': return 'bg-primary/10 text-primary border-primary/20';
      case 'waiting': return 'bg-warning/10 text-warning border-warning/20';
      case 'pending': return 'bg-pending text-pending-foreground border-pending/50';
      default: return 'bg-pending text-pending-foreground border-pending/50';
    }
  };

  const getStatusButtonColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-success hover:bg-success/90 text-success-foreground';
      case 'in_progress': return 'bg-primary hover:bg-primary/90 text-primary-foreground';
      case 'waiting': return 'bg-warning hover:bg-warning/90 text-warning-foreground';
      case 'pending': return 'bg-pending hover:bg-pending/90 text-pending-foreground';
      default: return 'bg-pending hover:bg-pending/90 text-pending-foreground';
    }
  };

  const getClientName = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    return client ? `${client.client_name}${client.branch ? ` - ${client.branch}` : ''}` : 'Unknown Client';
  };

  const getTechnicianName = (technicianId?: string) => {
    if (!technicianId) return 'Not assigned';
    const tech = users.find(u => u.id === technicianId);
    if (!tech) return 'Unknown';
    return `${tech.first_name || ''} ${tech.last_name || ''}`.trim() || tech.email;
  };

  const getInstallationAssignment = (installationClientId: string) => {
    const client = clients.find(c => c.id === installationClientId);
    // Match by both client_id and branch for accurate assignment
    const assignment = assignments.find(a => 
      a.client_id === installationClientId && 
      (!client?.branch || a.branch === client.branch)
    );
    return assignment;
  };

  const handleUploadHandover = (installation: Installation) => {
    setSelectedInstallationForHandover(installation);
    setIsUploadHandoverOpen(true);
  };

  const handleHandoverUploadComplete = async () => {
    await loadInitialData();
    setIsUploadHandoverOpen(false);
    setSelectedInstallationForHandover(null);
  };

  const handleViewDetails = (installation: Installation) => {
    setSelectedInstallation(installation);
    setIsDetailsDialogOpen(true);
  };

  const handleEditInstallation = (installation: Installation) => {
    // Set the installation to edit mode
    setNewInstallation(installation);
    setIsAddDialogOpen(true);
  };

  const getSelectedClient = () => {
    if (!selectedInstallation) return null;
    return clients.find(c => c.id === selectedInstallation.client_id) || null;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Installations Management</h1>
          <p className="text-muted-foreground">Track and manage client installations and equipment</p>
        </div>
        {canManageInstallations && <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary">
              <Plus className="h-4 w-4 mr-2" />
              Add Installation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{newInstallation.id ? 'Edit Installation' : 'Add New Installation'}</DialogTitle>
              <DialogDescription>
                Enter installation details and equipment specifications
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client_id">Client *</Label>
                <Select 
                  value={newInstallation.client_id || ''} 
                  onValueChange={(value) => {
                    setNewInstallation({
                      ...newInstallation, 
                      client_id: value
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      // Get clients that don't already have installations (unless editing)
                      const existingInstallationClientIds = installations.map(i => i.client_id);
                      const availableClients = newInstallation.id 
                        ? clients // If editing, show all clients
                        : clients.filter(c => !existingInstallationClientIds.includes(c.id));
                      
                      // For non-Admin/Teamlead users, only show assigned clients
                      const isRegularUser = user.role !== 'SuperAdmin' && user.role !== 'Admin' && user.role !== 'Teamlead';
                      const filteredClients = isRegularUser
                        ? availableClients.filter(c => 
                            assignments.some(a => 
                              a.client_id === c.id && 
                              (a.hardware_technician_id === user.id || a.software_technician_id === user.id)
                            )
                          )
                        : availableClients;
                      
                      return filteredClients.length > 0 ? (
                        filteredClients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.client_name} {client.branch ? `- ${client.branch}` : ''}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-clients" disabled>
                          {isRegularUser 
                            ? 'No assigned clients available' 
                            : 'All clients already have installations'}
                        </SelectItem>
                      );
                    })()}
                  </SelectContent>
                </Select>
                {newInstallation.client_id && (
                  <div className="text-sm text-muted-foreground">
                    Branch: {clients.find(c => c.id === newInstallation.client_id)?.branch || 'Main Branch'}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="kiosk_type">Kiosk Type *</Label>
                <Select value={newInstallation.kiosk_type || ''} onValueChange={(value) => setNewInstallation({...newInstallation, kiosk_type: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select kiosk type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Interactive Touch">Interactive Touch</SelectItem>
                    <SelectItem value="Queue Management">Queue Management</SelectItem>
                    <SelectItem value="Digital Signage System">Digital Signage System</SelectItem>
                    <SelectItem value="Self Service">Self Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="kiosk_count">Kiosk Count</Label>
                <Input
                  id="kiosk_count"
                  type="number"
                  value={newInstallation.kiosk_count || ''}
                  onChange={(e) => setNewInstallation({...newInstallation, kiosk_count: parseInt(e.target.value) || 0})}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="led_count">LED Count</Label>
                <Input
                  id="led_count"
                  type="number"
                  value={newInstallation.led_count || ''}
                  onChange={(e) => {
                    const count = parseInt(e.target.value) || 0;
                    const currentNames = Array.isArray(newInstallation.led_names) ? newInstallation.led_names : [];
                    // Adjust led_names array to match new count
                    let newNames = [...currentNames];
                    if (count > currentNames.length) {
                      // Add empty strings for new LEDs
                      for (let i = currentNames.length; i < count; i++) {
                        newNames.push(`LED Display ${i + 1}`);
                      }
                    } else {
                      // Trim array to new count
                      newNames = newNames.slice(0, count);
                    }
                    setNewInstallation({...newInstallation, led_count: count, led_names: newNames});
                  }}
                  placeholder="0"
                />
              </div>
              {/* LED Names - Auto-generated based on LED count */}
              {(newInstallation.led_count || 0) > 0 && (
                <div className="col-span-3 space-y-3 p-4 border rounded-lg bg-muted/30">
                  <Label className="font-semibold text-primary">LED Display Names</Label>
                  <p className="text-xs text-muted-foreground">Enter individual names for each LED display (will appear on E-Handover)</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Array.from({ length: newInstallation.led_count || 0 }).map((_, index) => (
                      <Input
                        key={index}
                        placeholder={`LED Display ${index + 1}`}
                        value={(Array.isArray(newInstallation.led_names) ? newInstallation.led_names[index] : '') || ''}
                        onChange={(e) => {
                          const currentNames = Array.isArray(newInstallation.led_names) ? [...newInstallation.led_names] : [];
                          currentNames[index] = e.target.value;
                          setNewInstallation({...newInstallation, led_names: currentNames});
                        }}
                        className="text-sm"
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="counter_count">Tripleplay Devices</Label>
                <Input
                  id="counter_count"
                  type="number"
                  value={newInstallation.counter_count || ''}
                  onChange={(e) => {
                    const count = parseInt(e.target.value) || 0;
                    const currentNames = Array.isArray(newInstallation.counter_names) ? newInstallation.counter_names : [];
                    // Adjust counter_names array to match new count
                    let newNames = [...currentNames];
                    if (count > currentNames.length) {
                      // Add empty strings for new counters
                      for (let i = currentNames.length; i < count; i++) {
                        newNames.push(`Counter ${i + 1}`);
                      }
                    } else {
                      // Trim array to new count
                      newNames = newNames.slice(0, count);
                    }
                    setNewInstallation({...newInstallation, counter_count: count, counter_names: newNames});
                  }}
                  placeholder="0"
                />
              </div>
              {/* Counter Names section removed - only LED names are maintained */}
              <div className="space-y-2">
                <Label htmlFor="service_points">Service Points</Label>
                <Input
                  id="service_points"
                  type="number"
                  value={newInstallation.service_points || ''}
                  onChange={(e) => setNewInstallation({...newInstallation, service_points: parseInt(e.target.value) || 0})}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ups_count">UPS Count</Label>
                <Input
                  id="ups_count"
                  type="number"
                  value={newInstallation.ups_count || ''}
                  onChange={(e) => setNewInstallation({...newInstallation, ups_count: parseInt(e.target.value) || 0})}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="speakers">Speakers</Label>
                <Input
                  id="speakers"
                  type="number"
                  value={newInstallation.speakers || ''}
                  onChange={(e) => setNewInstallation({...newInstallation, speakers: parseInt(e.target.value) || 0})}
                  placeholder="Number of speakers"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amplifiers">Amplifiers</Label>
                <Input
                  id="amplifiers"
                  type="number"
                  value={newInstallation.amplifiers || ''}
                  onChange={(e) => setNewInstallation({...newInstallation, amplifiers: parseInt(e.target.value) || 0})}
                  placeholder="Number of amplifiers"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hdmis">HDMI Cables/Adapters</Label>
                <Input
                  id="hdmis"
                  type="number"
                  value={newInstallation.hdmis || ''}
                  onChange={(e) => setNewInstallation({...newInstallation, hdmis: parseInt(e.target.value) || 0})}
                  placeholder="Number of HDMI items"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="splitters">Splitters</Label>
                <Input
                  id="splitters"
                  type="number"
                  value={newInstallation.splitters || ''}
                  onChange={(e) => setNewInstallation({...newInstallation, splitters: parseInt(e.target.value) || 0})}
                  placeholder="Number of splitters"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="media_controllers">Media Controllers</Label>
                <Input
                  id="media_controllers"
                  type="number"
                  value={newInstallation.media_controllers || ''}
                  onChange={(e) => setNewInstallation({...newInstallation, media_controllers: parseInt(e.target.value) || 0})}
                  placeholder="0"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="screen_with_size">Screen with Size</Label>
                <Input
                  id="screen_with_size"
                  value={newInstallation.screen_with_size || ''}
                  onChange={(e) => setNewInstallation({...newInstallation, screen_with_size: e.target.value})}
                  placeholder="e.g., 55&quot; 4K Display"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tablets">Tablets</Label>
                <Input
                  id="tablets"
                  type="number"
                  value={newInstallation.tablets || ''}
                  onChange={(e) => setNewInstallation({...newInstallation, tablets: parseInt(e.target.value) || 0})}
                  placeholder="Number of tablets"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="digital_signage_system">Digital Signage System</Label>
                <Input
                  id="digital_signage_system"
                  type="number"
                  value={newInstallation.digital_signage_system || ''}
                  onChange={(e) => setNewInstallation({...newInstallation, digital_signage_system: parseInt(e.target.value) || 0})}
                  placeholder="Number of digital signage systems"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="staff_trained">Staff Trained</Label>
                <Input
                  id="staff_trained"
                  type="number"
                  value={newInstallation.staff_trained || ''}
                  onChange={(e) => setNewInstallation({...newInstallation, staff_trained: parseInt(e.target.value) || 0})}
                  placeholder="Number of staff trained"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduled_end_date">Installation End Date</Label>
                <Input
                  id="scheduled_end_date"
                  type="date"
                  value={newInstallation.scheduled_end_date || ''}
                  onChange={(e) => setNewInstallation({...newInstallation, scheduled_end_date: e.target.value})}
                />
              </div>
              <div className="col-span-3 space-y-2">
                <Label htmlFor="remarks">Remarks</Label>
                <Input
                  id="remarks"
                  value={newInstallation.remarks || ''}
                  onChange={(e) => setNewInstallation({...newInstallation, remarks: e.target.value})}
                  placeholder="Any additional notes or remarks"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={loading} className="transition-all hover:scale-105 active:scale-95">
                Cancel
              </Button>
              <Button onClick={handleAddInstallation} className="gradient-primary transition-all hover:scale-105 active:scale-95" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {newInstallation.id ? 'Save Changes' : 'Add Installation'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="shadow-riana">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Total Kiosks</p>
                <p className="text-2xl font-bold">{installations.reduce((sum, inst) => sum + inst.kiosk_count, 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-riana">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Monitor className="h-8 w-8 text-success" />
              <div>
                <p className="text-sm text-muted-foreground">Displays</p>
                <p className="text-2xl font-bold">{installations.reduce((sum, inst) => sum + inst.led_count, 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-riana">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Smartphone className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Service Points</p>
                <p className="text-2xl font-bold">{installations.reduce((sum, inst) => sum + inst.service_points, 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-riana">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Wifi className="h-8 w-8 text-warning" />
              <div>
                <p className="text-sm text-muted-foreground">Media Controllers</p>
                <p className="text-2xl font-bold">{installations.reduce((sum, inst) => sum + inst.media_controllers, 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-riana">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Installation Records
          </CardTitle>
          <CardDescription>
            Track all client installations and equipment
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search installations by type, screen size..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="w-full sm:w-64">
              <Select value={technicianFilter} onValueChange={setTechnicianFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by technician" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Technicians</SelectItem>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.first_name || ''} {tech.last_name || ''} ({tech.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Kiosk Type</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assignment</TableHead>
                <TableHead>Handover</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInstallations.map((installation) => (
                <TableRow key={installation.id}>
                  <TableCell>
                    <div className="font-medium">{getClientName(installation.client_id)}</div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{installation.kiosk_type}</div>
                      <div className="text-sm text-muted-foreground">
                        {installation.kiosk_count} units
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div>LEDs: {installation.led_count}</div>
                      <div>Tripleplay: {installation.counter_count}</div>
                      <div>UPS: {installation.ups_count}</div>
                      <div>Amplifiers: {installation.amplifiers}</div>
                      <div>HDMIs: {installation.hdmis}</div>
                      <div>Splitters: {installation.splitters}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canManageInstallations ? (
                      <Select 
                        value={installation.status} 
                        onValueChange={(value) => handleStatusChange(installation.id, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue>
                            <Badge className={getStatusColor(installation.status)}>
                              {installation.status.replace('_', ' ')}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="waiting">Waiting</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge className={getStatusColor(installation.status)}>
                        {installation.status.replace('_', ' ')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const assignment = getInstallationAssignment(installation.client_id);
                      return (
                        <div className="text-sm">
                          <div className="font-medium">
                            {assignment?.installation_start_date 
                              ? new Date(assignment.installation_start_date).toLocaleDateString()
                              : installation.assigned_date
                              ? new Date(installation.assigned_date).toLocaleDateString()
                              : 'Not assigned'
                            }
                          </div>
                          {assignment && (
                            <>
                              <div className="text-muted-foreground text-xs">
                                HW: {getTechnicianName(assignment.hardware_technician_id)}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                SW: {getTechnicianName(assignment.software_technician_id)}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {(installation as any).handover_status === 'signed' ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          <Upload className="h-3 w-3 mr-1" />
                          Signed
                        </Badge>
                      ) : (installation as any).handover_status === 'uploaded' || installation.handover_file_path ? (
                        <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
                          <Upload className="h-3 w-3 mr-1" />
                          Uploaded
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                          Pending
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <InstallationActionsMenu
                      installation={installation}
                      user={user}
                      onView={handleViewDetails}
                      onExport={handleDownloadReport}
                      onFeedback={(inst) => {
                        setSelectedFeedbackInstallation(inst);
                        setIsFeedbackDialogOpen(true);
                      }}
                      onUpload={handleUploadHandover}
                      onEdit={handleEditInstallation}
                      onEscalation={handleEscalationMatrix}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredInstallations.length === 0 && (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No installations found</p>
            </div>
          )}
          
          {/* Items Counter */}
          <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {filteredInstallations.length} of {installations.length} installations
            </span>
            <span className="font-medium text-foreground">
              Total: {installations.length} records
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Installation Details Dialog */}
      <InstallationDetailsDialog
        installation={selectedInstallation}
        client={getSelectedClient()}
        isOpen={isDetailsDialogOpen}
        onClose={() => setIsDetailsDialogOpen(false)}
        user={user}
      />

      {/* Escalation Matrix Dialog */}
      <EscalationMatrixDialog
        isOpen={isEscalationDialogOpen}
        onClose={() => setIsEscalationDialogOpen(false)}
        onSave={handleSaveEscalationMatrix}
        existingMatrix={currentEscalationInstallation?.escalation_matrix}
      />

      {/* Feedback Link Generator Dialog */}
      <Dialog open={isFeedbackDialogOpen} onOpenChange={setIsFeedbackDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate Feedback Link</DialogTitle>
            <DialogDescription>
              Create a unique feedback link for the client to share their experience
            </DialogDescription>
          </DialogHeader>
          {selectedFeedbackInstallation && (
            <FeedbackLinkGenerator
              client={clients.find(c => c.id === selectedFeedbackInstallation.client_id)!}
              installation={selectedFeedbackInstallation}
              onClose={() => setIsFeedbackDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* E-Handover Upload Dialog */}
      <Dialog open={isUploadHandoverOpen} onOpenChange={setIsUploadHandoverOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Signed E-Handover</DialogTitle>
            <DialogDescription>
              Upload the signed E-handover document for this installation
            </DialogDescription>
          </DialogHeader>
          {selectedInstallationForHandover && (
            <EHandoverUpload
              user={user}
              client={clients.find(c => c.id === selectedInstallationForHandover.client_id)!}
              installation={selectedInstallationForHandover}
              onUploadComplete={handleHandoverUploadComplete}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
