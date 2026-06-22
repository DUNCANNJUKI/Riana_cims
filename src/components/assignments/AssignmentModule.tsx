import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus, Search, Shield, Users, Calendar, CalendarDays, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDatabase } from "@/hooks/useDatabase";
import { User, Client } from "@/types";
import { apiClient } from "@/integrations/apiClient";

interface AssignmentModuleProps {
  user: User;
}

interface ClientAssignment {
  id: string;
  client_id: string;
  branch: string;
  hardware_technician_id?: string;
  software_technician_id?: string;
  installation_start_date: string;
  scheduled_end_date?: string;
  assigned_by_user_id: string;
  status: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Remove mock data - we'll use real data from the database

export const AssignmentModule = ({ user }: AssignmentModuleProps) => {
  const [assignments, setAssignments] = useState<ClientAssignment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [newAssignment, setNewAssignment] = useState<Partial<ClientAssignment>>({});
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientBranches, setClientBranches] = useState<string[]>([]);
  const { toast } = useToast();
  const { getClients, getUsers, getAssignments, addAssignment, updateAssignment, loading } = useDatabase();

  useEffect(() => {
    loadData();
  }, [user.id]);

  const loadData = async () => {
    try {
      const [clientsData, usersData, assignmentsData] = await Promise.all([
        getClients(),
        getUsers(),
        getAssignments()
      ]);
      
      setClients(clientsData);
      // Include all users as potential technicians (Admin, Teamlead, User, Technician, etc.)
      setTechnicians(usersData.filter((u: User) => u.role !== undefined));
      setAssignments(assignmentsData);
      
      console.log('Assignment Module Data Loaded:', {
        clients: clientsData.length,
        technicians: usersData.length,
        assignments: assignmentsData.length,
        availableRoles: [...new Set(usersData.map(u => u.role))]
      });
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  // Only Admin and Teamlead can access this module
  if (user.role !== 'SuperAdmin' && user.role !== 'Admin' && user.role !== 'Teamlead') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Access denied. Admin or Team Lead privileges required.</p>
        </div>
      </div>
    );
  }

  const filteredAssignments = assignments.filter(assignment => {
    if (!searchTerm) return true;
    const client = clients.find(c => c.id === assignment.client_id);
    const hardwareTech = technicians.find(t => t.id === assignment.hardware_technician_id);
    const softwareTech = technicians.find(t => t.id === assignment.software_technician_id);
    return client?.client_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           hardwareTech?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           softwareTech?.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           assignment.branch?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleClientSelect = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    setSelectedClient(client || null);
    setNewAssignment({...newAssignment, client_id: clientId});
    
    // Get unique branches for this client (in real app, this would be from a proper branches table)
    if (client) {
      const branches = [client.branch].filter(Boolean);
      setClientBranches(branches);
    }
  };

  const handleAssignClient = async () => {
    console.log('Assignment data:', newAssignment);
    
    if (!newAssignment.client_id || !newAssignment.branch || !newAssignment.installation_start_date) {
      toast({
        title: "Error",
        description: "Please fill in all required fields (client, branch, start date)",
        variant: "destructive",
      });
      return;
    }

    if (!newAssignment.hardware_technician_id && !newAssignment.software_technician_id) {
      toast({
        title: "Error",
        description: "Please select at least one technician (hardware or software)",
        variant: "destructive",
      });
      return;
    }

    try {
      // Auto-set installation start date to today if not set
      const startDate = newAssignment.installation_start_date || new Date().toISOString().split('T')[0];
      
      const assignmentData = {
        client_id: newAssignment.client_id,
        branch: newAssignment.branch,
        hardware_technician_id: newAssignment.hardware_technician_id || null,
        software_technician_id: newAssignment.software_technician_id || null,
        installation_start_date: startDate,
        scheduled_end_date: newAssignment.scheduled_end_date || null,
        assigned_by_user_id: user.id,
        status: 'assigned',
        notes: newAssignment.notes || ''
      };

      const result = await addAssignment(assignmentData);

      // Update corresponding installation record to "in_progress" status
      try {
        await apiClient.patch(`/installations/update_by_client/${newAssignment.client_id}`, {
          status: 'in_progress',
          hardware_technician_id: newAssignment.hardware_technician_id || null,
          software_technician_id: newAssignment.software_technician_id || null,
          assigned_date: startDate,
          scheduled_end_date: newAssignment.scheduled_end_date || null
        });
      } catch (installError) {
        console.error('Error updating installation:', installError);
      }

      await loadData();
      setNewAssignment({});
      setSelectedClient(null);
      setClientBranches([]);
      setIsAssignDialogOpen(false);
      
      toast({
        title: "Assignment Created",
        description: "Technician(s) have been assigned.",
      });
    } catch (error) {
      console.error('Error creating assignment:', error);
      toast({
        title: "Error",
        description: "Failed to create assignment",
        variant: "destructive",
      });
    }
  };

  const updateAssignmentStatus = async (assignmentId: string, status: string, remarks?: string) => {
    try {
      await updateAssignment(assignmentId, { status, notes: remarks });

      await loadData();
      
      toast({
        title: "Status Updated",
        description: "Assignment status updated.",
      });
    } catch (error) {
      console.error('Error updating assignment status:', error);
      toast({
        title: "Error",
        description: "Failed to update assignment status",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'assigned': 
        return (
          <Badge className="status-waiting border-none text-sm font-semibold">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-yellow-700"></div>
              Assigned
            </div>
          </Badge>
        );
      case 'in_progress': 
        return (
          <Badge className="status-progress border-none text-sm font-semibold">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-white"></div>
              In Progress
            </div>
          </Badge>
        );
      case 'completed': 
        return (
          <Badge className="status-complete border-none text-sm font-semibold">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-white"></div>
              Completed
            </div>
          </Badge>
        );
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.client_name || 'Unknown Client';
  };

  const getTechnicianName = (technicianId?: string) => {
    if (!technicianId) return 'Not assigned';
    const tech = technicians.find(t => t.id === technicianId);
    return tech ? `${tech.first_name} ${tech.last_name}` : 'Unknown Technician';
  };

  const availableClients = clients; // Show all clients as they can have multiple assignments

  // Admin and Teamlead can see all users for assignment
  const availableTechnicians = technicians;
  
  console.log('Available technicians for assignment:', {
    total: availableTechnicians.length,
    userRole: user.role,
    canAssignAny: user.role === 'SuperAdmin' || user.role === 'Admin' || user.role === 'Teamlead'
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Assign</h1>
          <p className="text-muted-foreground">Assign hardware and software technicians to client installations</p>
        </div>
        <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary">
              <UserPlus className="h-4 w-4 mr-2" />
              New Assignment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Assign Technicians to Client Installation</DialogTitle>
              <DialogDescription>
                Select client, branch, technicians, and installation details
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="client">Client *</Label>
                  <Select value={newAssignment.client_id || ''} onValueChange={handleClientSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableClients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.client_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branch">Branch *</Label>
                  <Select 
                    value={newAssignment.branch || ''} 
                    onValueChange={(value) => setNewAssignment({...newAssignment, branch: value})}
                    disabled={!selectedClient}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedClient && (
                        <SelectItem value={selectedClient.branch || 'Main Branch'}>
                          {selectedClient.branch || 'Main Branch'}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hardware-tech">Hardware Technician</Label>
                   <Select 
                     value={newAssignment.hardware_technician_id || 'none'} 
                     onValueChange={(value) => setNewAssignment({...newAssignment, hardware_technician_id: value === 'none' ? undefined : value})}
                   >
                     <SelectTrigger>
                       <SelectValue placeholder="Select hardware technician" />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="none">None (Optional)</SelectItem>
                      {availableTechnicians.map((tech) => (
                        <SelectItem key={tech.id} value={tech.id}>
                          {tech.first_name} {tech.last_name} - {tech.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="software-tech">Software Technician</Label>
                   <Select 
                     value={newAssignment.software_technician_id || 'none'} 
                     onValueChange={(value) => setNewAssignment({...newAssignment, software_technician_id: value === 'none' ? undefined : value})}
                   >
                     <SelectTrigger>
                       <SelectValue placeholder="Select software technician" />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="none">None (Optional)</SelectItem>
                      {availableTechnicians.map((tech) => (
                        <SelectItem key={tech.id} value={tech.id}>
                          {tech.first_name} {tech.last_name} - {tech.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-date">Installation Start Date *</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={newAssignment.installation_start_date || ''}
                    onChange={(e) => setNewAssignment({...newAssignment, installation_start_date: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">Installation End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={newAssignment.scheduled_end_date || ''}
                    onChange={(e) => setNewAssignment({...newAssignment, scheduled_end_date: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea
                  id="notes"
                  value={newAssignment.notes || ''}
                  onChange={(e) => setNewAssignment({...newAssignment, notes: e.target.value})}
                  placeholder="Any additional instructions or requirements..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => {
                setIsAssignDialogOpen(false);
                setNewAssignment({});
                setSelectedClient(null);
                setClientBranches([]);
              }}>
                Cancel
              </Button>
              <Button onClick={handleAssignClient} className="gradient-primary" disabled={loading}>
                {loading ? 'Assigning...' : 'Assign'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-riana">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Assignment Overview
          </CardTitle>
          <CardDescription>
            Track technician assignments and installation schedules
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by client, branch, or technician name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client & Branch</TableHead>
                <TableHead>Hardware Technician</TableHead>
                <TableHead>Software Technician</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell>
                    <div className="font-medium">{getClientName(assignment.client_id)}</div>
                    <div className="text-sm text-muted-foreground">{assignment.branch}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{getTechnicianName(assignment.hardware_technician_id)}</div>
                    {assignment.hardware_technician_id && (
                      <div className="text-sm text-muted-foreground">
                        {technicians.find(t => t.id === assignment.hardware_technician_id)?.email}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{getTechnicianName(assignment.software_technician_id)}</div>
                    {assignment.software_technician_id && (
                      <div className="text-sm text-muted-foreground">
                        {technicians.find(t => t.id === assignment.software_technician_id)?.email}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {new Date(assignment.installation_start_date).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    {assignment.scheduled_end_date ? (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(assignment.scheduled_end_date).toLocaleDateString()}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">Not set</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(assignment.status)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Select
                        value={assignment.status}
                        onValueChange={(value) => updateAssignmentStatus(assignment.id, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="assigned">Assigned</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredAssignments.length === 0 && (
            <div className="text-center py-8">
              <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No assignments found</p>
              <p className="text-sm text-muted-foreground mt-2">
                Create your first assignment by clicking the "New Assignment" button above
              </p>
            </div>
          )}
          
          {/* Items Counter */}
          <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {filteredAssignments.length} of {assignments.length} assignments
            </span>
            <span className="font-medium text-foreground">
              Total: {assignments.length} records
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
