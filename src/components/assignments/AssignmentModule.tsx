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
import { User, Client, ClientBranch, ClientDepartment } from "@/types";
import { apiClient } from "@/integrations/apiClient";
import { can } from "@/security/accessControl";

interface AssignmentModuleProps {
  user: User;
}

interface ClientAssignment {
  id: string;
  client_id: string;
  branch: string;
  branch_id?: string;
  department_id?: string;
  department_name?: string;
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

const fallbackBranchForClient = (client: Client): ClientBranch => ({
  id: `legacy-${client.id}`,
  client_id: client.id,
  branch_name: client.branch?.trim() || 'MAIN',
  branch_code: client.branch?.trim() ? null : 'MAIN',
  status: 'active',
  department_count: 0,
  installation_count: 0,
});
// Remove mock data - we'll use real data from the database

export const AssignmentModule = ({ user }: AssignmentModuleProps) => {
  const canViewAssignments = can(user, 'assignments.view');
  const canManageAssignments = can(user, 'assignments.manage');
  const [assignments, setAssignments] = useState<ClientAssignment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [newAssignment, setNewAssignment] = useState<Partial<ClientAssignment>>({});
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientBranches, setClientBranches] = useState<ClientBranch[]>([]);
  const [clientDepartments, setClientDepartments] = useState<ClientDepartment[]>([]);
  const [isLoadingClientBranches, setIsLoadingClientBranches] = useState(false);
  const [isLoadingClientDepartments, setIsLoadingClientDepartments] = useState(false);
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

  if (!canViewAssignments) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Access denied. Assignment viewing permission is required.</p>
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
           assignment.branch?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           assignment.department_name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleClientSelect = async (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    setSelectedClient(client || null);
    setNewAssignment((current) => ({ ...current, client_id: clientId, branch: '', branch_id: '', department_id: '' }));
    setClientBranches([]);
    setClientDepartments([]);

    if (!client) {
      return;
    }

    setIsLoadingClientBranches(true);
    try {
      const branches = await apiClient.get(`/clients/${clientId}/branches`);
      const branchOptions: ClientBranch[] = (Array.isArray(branches) ? branches : [])
        .filter((branch: any) => branch && (!branch.status || branch.status === 'active'))
        .map((branch: any) => ({
          ...branch,
          branch_name: String(branch.branch_name || branch.name || '').trim(),
        }))
        .filter((branch: ClientBranch) => Boolean(branch.branch_name));
      setClientBranches(branchOptions.length ? branchOptions : [fallbackBranchForClient(client)]);
    } catch (error) {
      console.error('Error loading client branches:', error);
      setClientBranches([fallbackBranchForClient(client)]);
      toast({
        title: "Branch loading failed",
        description: "Could not load the saved branches for this client. Please refresh and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingClientBranches(false);
    }
  };


  const loadDepartmentsForBranch = async (branchId: string) => {
    setClientDepartments([]);
    if (!branchId || branchId.startsWith('legacy-')) return [] as ClientDepartment[];

    setIsLoadingClientDepartments(true);
    try {
      const departments = await apiClient.get(`/branches/${branchId}/departments`);
      const departmentOptions: ClientDepartment[] = (Array.isArray(departments) ? departments : [])
        .filter((department: any) => department && (!department.status || department.status === 'active'))
        .map((department: any) => ({
          ...department,
          department_name: String(department.department_name || department.name || '').trim(),
        }))
        .filter((department: ClientDepartment) => Boolean(department.department_name));
      setClientDepartments(departmentOptions);
      return departmentOptions;
    } catch (error) {
      console.error('Error loading branch departments:', error);
      toast({
        title: "Department loading failed",
        description: "Could not load departments for this branch. Please refresh and try again.",
        variant: "destructive",
      });
      return [] as ClientDepartment[];
    } finally {
      setIsLoadingClientDepartments(false);
    }
  };

  const handleBranchSelect = async (branchId: string) => {
    const selectedBranch = clientBranches.find((branch) => branch.id === branchId);
    setNewAssignment((current) => ({
      ...current,
      branch_id: branchId,
      branch: selectedBranch?.branch_name || '',
      department_id: '',
    }));
    await loadDepartmentsForBranch(branchId);
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

    if (clientDepartments.length > 0 && !newAssignment.department_id) {
      toast({
        title: "Error",
        description: "Please select the department for this branch assignment",
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
        branch_id: newAssignment.branch_id?.startsWith('legacy-') ? null : newAssignment.branch_id || null,
        department_id: newAssignment.department_id || null,
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

      if (result?.installation_id) {
        try {
          await apiClient.patch(`/installations/${result.installation_id}`, {
            status: 'in_progress',
            hardware_technician_id: newAssignment.hardware_technician_id || null,
            software_technician_id: newAssignment.software_technician_id || null,
            assigned_date: startDate,
            scheduled_end_date: newAssignment.scheduled_end_date || null
          });
        } catch (installError) {
          console.error('Error updating linked installation:', installError);
        }
      }
      await loadData();
      setNewAssignment({});
      setSelectedClient(null);
      setClientBranches([]);
      setClientDepartments([]);
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
    canAssignAny: canManageAssignments
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Assign</h1>
          <p className="text-muted-foreground">Assign hardware and software technicians to client installations</p>
        </div>
        {canManageAssignments && <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary">
              <UserPlus className="h-4 w-4 mr-2" />
              New Assignment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Assign Technicians to Client Installation</DialogTitle>
              <DialogDescription>
                Select client, branch, technicians, and installation details
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                    value={newAssignment.branch_id || ''}
                    onValueChange={(value) => void handleBranchSelect(value)}
                    disabled={!selectedClient || isLoadingClientBranches || clientBranches.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={!selectedClient ? "Select client first" : isLoadingClientBranches ? "Loading branches..." : "Select branch"} />
                    </SelectTrigger>
                    <SelectContent>
                      {clientBranches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {branch.branch_name}{branch.branch_code ? ` (${branch.branch_code})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedClient && !isLoadingClientBranches && clientBranches.length === 0 && (
                    <p className="text-xs text-destructive">No active branches found for this client. Add a branch in Client Management first.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Select
                    value={newAssignment.department_id || 'none'}
                    onValueChange={(value) => setNewAssignment({...newAssignment, department_id: value === 'none' ? '' : value})}
                    disabled={(!newAssignment.branch && !newAssignment.branch_id) || isLoadingClientDepartments || clientDepartments.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={!newAssignment.branch ? "Select branch first" : isLoadingClientDepartments ? "Loading departments..." : clientDepartments.length ? "Select department" : "No departments"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No department</SelectItem>
                      {clientDepartments.map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.department_name}{department.department_code ? ` (${department.department_code})` : ''}
                        </SelectItem>
                      ))}
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
                setClientDepartments([]);
              }}>
                Cancel
              </Button>
              <Button onClick={handleAssignClient} className="gradient-primary" disabled={loading}>
                {loading ? 'Assigning...' : 'Assign'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>}
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
                {canManageAssignments && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssignments.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell>
                    <div className="font-medium">{getClientName(assignment.client_id)}</div>
                    <div className="text-sm text-muted-foreground">{assignment.department_name ? `${assignment.branch} / ${assignment.department_name}` : assignment.branch}</div>
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
                  {canManageAssignments && <TableCell>
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
                  </TableCell>}
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
