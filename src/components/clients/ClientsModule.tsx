import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Edit, Trash2, Building2, Phone, Calendar, Loader2, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDatabase } from "@/hooks/useDatabase";
import { User, Client } from "@/types";
import { apiClient } from "@/integrations/apiClient";
import { ClientDetailsDialog } from "@/components/dialogs/ClientDetailsDialog";

interface ClientsModuleProps {
  user: User;
}

export const ClientsModule = ({ user }: ClientsModuleProps) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newClient, setNewClient] = useState<Partial<Client>>({});
  const [departments, setDepartments] = useState<any[]>([]);
  const [subsidiaries, setSubsidiaries] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { toast } = useToast();
  const { 
    getClients, 
    addClient,
    updateClient,
    deleteClient, 
    getDepartments, 
    getSubsidiaries, 
    loading 
  } = useDatabase();

  useEffect(() => {
    loadInitialData();
  }, []);


  const loadInitialData = async () => {
    try {
      const [clientsData, departmentsData, subsidiariesData] = await Promise.all([
        getClients(),
        getDepartments(),
        getSubsidiaries()
      ]);
      
      setClients(clientsData);
      setDepartments(departmentsData);
      setSubsidiaries(subsidiariesData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive",
      });
    }
  };

  const filteredClients = clients.filter(client =>
    client.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.contact_person_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.industry_classification.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddClient = async () => {
    if (!newClient.client_name || !newClient.contact_person_name || !newClient.department_id || !newClient.subsidiary_id) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      const clientData = {
        client_name: newClient.client_name!,
        branch: newClient.branch || null,
        contact_person_name: newClient.contact_person_name!,
        contact_phone: newClient.contact_person_phone || '',
        contact_email: newClient.contact_person_email || null,
        contact_person_department: newClient.contact_person_department || null,
        current_vendor: newClient.current_vendor || null,
        start_date: newClient.start_date || new Date().toISOString().split('T')[0],
        contract_type: newClient.contract_type || 'AMC',
        industry_classification: newClient.industry_classification || '',
        department_id: newClient.department_id!,
        subsidiary_id: newClient.subsidiary_id!,
        added_by_user_id: user.id
      };

      await addClient(clientData);
      await loadInitialData(); // Refresh the client list
      setNewClient({});
      setIsAddDialogOpen(false);
      toast({
        title: "Success",
        description: "Client added successfully",
      });
    } catch (error: any) {
      console.error('Error adding client:', error);
      const serverMessage = error?.response?.data?.error || error?.message;
      toast({
        title: "Error",
        description: serverMessage || "Failed to add client",
        variant: "destructive",
      });
    }
  };

  const handleViewDetails = (client: Client) => {
    setSelectedClient(client);
    setIsDetailsDialogOpen(true);
  };

  const handleEditClient = (client: Client) => {
    setSelectedClient(client);
    setIsEditDialogOpen(true);
  };

  const handleSaveClient = async (updatedClient: Client) => {
    try {
      await updateClient(updatedClient.id, {
        client_name: updatedClient.client_name,
        branch: updatedClient.branch,
        contact_person_name: updatedClient.contact_person_name,
        contact_person_phone: updatedClient.contact_person_phone,
        contact_person_email: updatedClient.contact_person_email,
        contract_type: updatedClient.contract_type,
        industry_classification: updatedClient.industry_classification,
        start_date: updatedClient.start_date,
        department_id: updatedClient.department_id,
        subsidiary_id: updatedClient.subsidiary_id,
      });

      await loadInitialData();
      
      toast({
        title: "Success",
        description: "Client updated successfully",
      });
    } catch (error) {
      console.error('Error updating client:', error);
    }
  };

  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDeleteClient = (clientId: string) => {
    setClientToDelete(clientId);
    setDeletePassword("");
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteClient = async () => {
    if (!clientToDelete) return;

    if (!deletePassword) {
      toast({
        title: "Error",
        description: "Password is required to delete a client",
        variant: "destructive",
      });
      return;
    }

    setIsDeleting(true);
    try {
      // Verify admin password
      await apiClient.post('/auth/verify-password', { email: user.email, password: deletePassword });

      await deleteClient(clientToDelete);
      await loadInitialData();
      
      toast({
        title: "Success",
        description: "Client deleted successfully",
      });
      setIsDeleteDialogOpen(false);
    } catch (error: any) {
      console.error('Error deleting client:', error);
      toast({
        title: "Error",
        description: "Incorrect password or failed to delete client",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };


  const getContractTypeColor = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'AMC': return 'contract-amc';
      case 'WARRANTY': return 'contract-warranty';
      case 'LEASE': return 'contract-lease';
      case 'POC': return 'contract-poc';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Clients Management</h1>
          <p className="text-muted-foreground">Manage your client database and information</p>
        </div>
        {(user.role === 'SuperAdmin' || user.role === 'Admin' || user.role === 'Teamlead') && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Plus className="h-4 w-4 mr-2" />
                Add Client
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
              <DialogDescription>
                Enter client information to add them to the system
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client_name">Client Name *</Label>
                <Input
                  id="client_name"
                  value={newClient.client_name || ''}
                  onChange={(e) => setNewClient({...newClient, client_name: e.target.value})}
                  placeholder="Enter client name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch">Branch</Label>
                <Input
                  id="branch"
                  value={newClient.branch || ''}
                  onChange={(e) => setNewClient({...newClient, branch: e.target.value})}
                  placeholder="Enter branch name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_person_name">Contact Person *</Label>
                <Input
                  id="contact_person_name"
                  value={newClient.contact_person_name || ''}
                  onChange={(e) => setNewClient({...newClient, contact_person_name: e.target.value})}
                  placeholder="Enter contact person name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact_person_phone">Contact Phone</Label>
                <Input
                  id="contact_person_phone"
                  value={newClient.contact_person_phone || ''}
                  onChange={(e) => setNewClient({...newClient, contact_person_phone: e.target.value})}
                  placeholder="Enter phone number"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_person_email">Contact Person Email</Label>
                <Input
                  id="contact_person_email"
                  type="email"
                  value={newClient.contact_person_email || ''}
                  onChange={(e) => setNewClient({...newClient, contact_person_email: e.target.value})}
                  placeholder="contact@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department_id">Department *</Label>
                <Select value={newClient.department_id || ''} onValueChange={(value) => setNewClient({...newClient, department_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.department_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subsidiary_id">Subsidiary *</Label>
                <Select value={newClient.subsidiary_id || ''} onValueChange={(value) => setNewClient({...newClient, subsidiary_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select subsidiary" />
                  </SelectTrigger>
                  <SelectContent>
                    {subsidiaries.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>{sub.subsidiary_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={newClient.start_date || ''}
                  onChange={(e) => setNewClient({...newClient, start_date: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contract_type">Contract Type</Label>
                <Select value={newClient.contract_type || ''} onValueChange={(value) => setNewClient({...newClient, contract_type: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select contract type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AMC">AMC</SelectItem>
                    <SelectItem value="WARRANTY">WARRANTY</SelectItem>
                    <SelectItem value="LEASE">LEASE</SelectItem>
                    <SelectItem value="POC">POC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="current_vendor">Current Vendor</Label>
                <Input
                  id="current_vendor"
                  value={newClient.current_vendor || ''}
                  onChange={(e) => setNewClient({...newClient, current_vendor: e.target.value})}
                  placeholder="Enter current vendor if any"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="industry_classification">Industry Classification</Label>
                <Select value={newClient.industry_classification || ''} onValueChange={(value) => setNewClient({...newClient, industry_classification: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select industry classification" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Banking">Banking</SelectItem>
                    <SelectItem value="Healthcare">Healthcare</SelectItem>
                    <SelectItem value="Education">Education</SelectItem>
                    <SelectItem value="Government">Government</SelectItem>
                    <SelectItem value="Retail">Retail</SelectItem>
                    <SelectItem value="Technology">Technology</SelectItem>
                    <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                    <SelectItem value="Hospitality">Hospitality</SelectItem>
                    <SelectItem value="Transportation">Transportation</SelectItem>
                    <SelectItem value="Telecommunications">Telecommunications</SelectItem>
                    <SelectItem value="Insurance">Insurance</SelectItem>
                    <SelectItem value="Real Estate">Real Estate</SelectItem>
                    <SelectItem value="Entertainment">Entertainment</SelectItem>
                    <SelectItem value="Utilities">Utilities</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleAddClient} className="gradient-primary" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Add Client
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <Card className="shadow-riana">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Client Database
          </CardTitle>
          <CardDescription>
            Search and manage all registered clients
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search clients by name, contact, or industry..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client Name</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Contract Type</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{client.client_name}</div>
                      {client.branch && (
                        <div className="text-sm text-muted-foreground">{client.branch}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{client.contact_person_name}</TableCell>
                  <TableCell>
                    {client.contact_person_phone && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {client.contact_person_phone}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={getContractTypeColor(client.contract_type)}>
                      {client.contract_type}
                    </Badge>
                  </TableCell>
                  <TableCell>{client.industry_classification}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(client.start_date).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleViewDetails(client)}>
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                      {(user.role === 'SuperAdmin' || user.role === 'Admin') && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => handleEditClient(client)}>
                            <Edit className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="text-destructive hover:text-destructive"
                            onClick={() => confirmDeleteClient(client.id)}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredClients.length === 0 && (
            <div className="text-center py-8">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No clients found</p>
            </div>
          )}
          
          {/* Items Counter */}
          <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {filteredClients.length} of {clients.length} clients
            </span>
            <span className="font-medium text-foreground">
              Total: {clients.length} records
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Client Details Dialog */}
      <ClientDetailsDialog
        client={selectedClient}
        isOpen={isDetailsDialogOpen}
        onClose={() => setIsDetailsDialogOpen(false)}
        user={user}
        departments={departments}
        subsidiaries={subsidiaries}
      />

      {/* Client Edit Dialog */}
      <ClientDetailsDialog
        client={selectedClient}
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onSave={handleSaveClient}
        isEditing={true}
        user={user}
        departments={departments}
        subsidiaries={subsidiaries}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Confirm Client Deletion
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. To confirm deletion, please enter your Admin password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="delete-password">Admin Password</Label>
              <Input
                id="delete-password"
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Enter password..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteClient} disabled={isDeleting || !deletePassword}>
              {isDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Permanently Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
