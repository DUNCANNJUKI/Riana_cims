import { useState } from 'react';
import { 
  Settings as SettingsIcon, 
  Plus,
  Edit,
  Trash2,
  Building2,
  Layers,
  Briefcase,
  Save,
  Bell,
  Mail,
  Globe,
  Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useClients, useCreateClient, useUpdateClient } from '@/hooks/useSupabaseData';
import { useDeleteClient } from '@/hooks/useDeleteClient';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { validateKenyanPhone, formatKenyanPhoneDisplay } from '@/lib/smsNotifications';
import logoImage from '@/assets/riana-group-logo.jpg';

// Default modules
const defaultModules = [
  'Authentication',
  'User Management',
  'Security',
  'Reporting',
  'Analytics',
  'Data Export',
  'Payment Gateway',
  'Transaction Processing',
  'HR Portal',
  'Leave Management',
  'Timesheets',
  'Inventory',
  'ERP Integration',
  'Stock Management',
  'Dashboard',
  'Notifications',
];

// Default departments
const defaultDepartments = [
  'IT Infrastructure',
  'Sales Operations',
  'Finance',
  'HR',
  'Operations',
  'Customer Support',
  'Marketing',
];

const contractTypeLabels: Record<string, string> = {
  amc: 'AMC',
  lease: 'Lease',
  warranty: 'Warranty',
  poc: 'POC',
};

export default function Settings() {
  const [modules, setModules] = useState<string[]>(defaultModules);
  const [departments, setDepartments] = useState<string[]>(defaultDepartments);
  const [newModule, setNewModule] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [editingModule, setEditingModule] = useState<{ index: number; value: string } | null>(null);
  const [editingDepartment, setEditingDepartment] = useState<{ index: number; value: string } | null>(null);
  
  // Company settings
  const [companySettings, setCompanySettings] = useState({
    companyName: 'Riana Group',
    companyEmail: 'support@rianagroup.com',
    companyPhone: '+254 712 345 678',
    companyAddress: 'Nairobi Business Park, Upperhill',
    timezone: 'UTC+03:00',
    dateFormat: 'dd/MM/yyyy',
    emailNotifications: true,
    smsNotifications: true,
    inAppNotifications: true,
    autoApproveNonChargeable: false,
    requireTwoFactorAuth: false,
    sessionTimeout: '30',
  });
  
  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<any>(null);
  
  // Client management
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  const [clientForm, setClientForm] = useState({
    name: '',
    branch: '',
    contract_type: 'amc' as 'amc' | 'lease' | 'warranty' | 'poc',
    contact_person: '',
    contact_email: '',
    contact_phone: '',
  });

  const { data: clients, isLoading: clientsLoading } = useClients();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();
  const { toast } = useToast();

  // Phone validation state
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Module management
  const handleAddModule = () => {
    if (newModule.trim() && !modules.includes(newModule.trim())) {
      setModules([...modules, newModule.trim()]);
      setNewModule('');
      toast({ title: 'Module Added', description: `"${newModule.trim()}" has been added.` });
    }
  };

  const handleEditModule = (index: number) => {
    if (editingModule && editingModule.value.trim()) {
      const updated = [...modules];
      updated[index] = editingModule.value.trim();
      setModules(updated);
      setEditingModule(null);
      toast({ title: 'Module Updated' });
    }
  };

  const handleDeleteModule = (index: number) => {
    setModules(modules.filter((_, i) => i !== index));
    toast({ title: 'Module Removed' });
  };

  // Department management
  const handleAddDepartment = () => {
    if (newDepartment.trim() && !departments.includes(newDepartment.trim())) {
      setDepartments([...departments, newDepartment.trim()]);
      setNewDepartment('');
      toast({ title: 'Department Added', description: `"${newDepartment.trim()}" has been added.` });
    }
  };

  const handleEditDepartment = (index: number) => {
    if (editingDepartment && editingDepartment.value.trim()) {
      const updated = [...departments];
      updated[index] = editingDepartment.value.trim();
      setDepartments(updated);
      setEditingDepartment(null);
      toast({ title: 'Department Updated' });
    }
  };

  const handleDeleteDepartment = (index: number) => {
    setDepartments(departments.filter((_, i) => i !== index));
    toast({ title: 'Department Removed' });
  };

  // Client management
  const handleOpenAddClient = () => {
    setClientForm({
      name: '',
      branch: '',
      contract_type: 'amc',
      contact_person: '',
      contact_email: '',
      contact_phone: '',
    });
    setEditingClient(null);
    setIsClientDialogOpen(true);
  };

  const handleOpenEditClient = (client: any) => {
    setClientForm({
      name: client.name,
      branch: client.branch,
      contract_type: client.contract_type,
      contact_person: client.contact_person || '',
      contact_email: client.contact_email || '',
      contact_phone: client.contact_phone || '',
    });
    setEditingClient(client);
    setIsClientDialogOpen(true);
  };

  const handleSubmitClient = async () => {
    // Validate phone number if provided
    if (clientForm.contact_phone) {
      const validation = validateKenyanPhone(clientForm.contact_phone);
      if (!validation.valid) {
        setPhoneError(validation.error || 'Invalid phone number');
        return;
      }
      clientForm.contact_phone = validation.formatted;
    }
    setPhoneError(null);

    try {
      if (editingClient) {
        await updateClient.mutateAsync({
          id: editingClient.id,
          ...clientForm,
        });
        toast({ title: 'Client Updated', description: `${clientForm.name} has been updated.` });
      } else {
        await createClient.mutateAsync(clientForm);
        toast({ title: 'Client Created', description: `${clientForm.name} has been added.` });
      }
      setIsClientDialogOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDeleteClick = (client: any) => {
    setClientToDelete(client);
    setDeleteDialogOpen(true);
  };
  
  const handleConfirmDelete = async () => {
    if (!clientToDelete) return;
    
    try {
      await deleteClient.mutateAsync(clientToDelete.id);
      toast({ title: 'Client Deleted', description: `${clientToDelete.name} has been removed.` });
      setDeleteDialogOpen(false);
      setClientToDelete(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleSaveCompanySettings = () => {
    toast({ title: 'Settings Saved', description: 'Company settings have been updated successfully.' });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground">
          <SettingsIcon className="h-6 w-6 text-primary" />
          Settings
        </h1>
        <p className="text-muted-foreground">
          Manage system configuration, modules, departments, and clients
        </p>
      </div>

      <Tabs defaultValue="company" className="space-y-4">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="company" className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-primary">
            <Globe className="h-4 w-4" />
            Company
          </TabsTrigger>
          <TabsTrigger value="clients" className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-primary">
            <Building2 className="h-4 w-4" />
            Clients
          </TabsTrigger>
          <TabsTrigger value="modules" className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-primary">
            <Layers className="h-4 w-4" />
            Modules
          </TabsTrigger>
          <TabsTrigger value="departments" className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-primary">
            <Briefcase className="h-4 w-4" />
            Departments
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:text-primary">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* Company Settings Tab */}
        <TabsContent value="company" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5 text-primary" />
                  Branding
                </CardTitle>
                <CardDescription>Company logo and identity</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted">
                    <img src={logoImage} alt="Company Logo" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-foreground">Company Logo</p>
                    <p className="text-sm text-muted-foreground">Used in sidebar, reports, and emails</p>
                    <Button variant="outline" size="sm" className="mt-2">
                      Change Logo
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-primary" />
                  Company Details
                </CardTitle>
                <CardDescription>Basic company information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    value={companySettings.companyName}
                    onChange={(e) => setCompanySettings(prev => ({ ...prev, companyName: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyEmail">Support Email</Label>
                  <Input
                    id="companyEmail"
                    type="email"
                    value={companySettings.companyEmail}
                    onChange={(e) => setCompanySettings(prev => ({ ...prev, companyEmail: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyPhone">Phone Number</Label>
                  <Input
                    id="companyPhone"
                    value={companySettings.companyPhone}
                    onChange={(e) => setCompanySettings(prev => ({ ...prev, companyPhone: e.target.value }))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-primary" />
                  Regional Settings
                </CardTitle>
                <CardDescription>Timezone and date format preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Timezone</Label>
                    <Select value={companySettings.timezone} onValueChange={(value) => setCompanySettings(prev => ({ ...prev, timezone: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UTC+03:00">UTC+03:00 (EAT - Kenya)</SelectItem>
                        <SelectItem value="UTC+00:00">UTC+00:00 (GMT)</SelectItem>
                        <SelectItem value="UTC+01:00">UTC+01:00 (WAT)</SelectItem>
                        <SelectItem value="UTC+02:00">UTC+02:00 (CAT)</SelectItem>
                        <SelectItem value="UTC+05:30">UTC+05:30 (IST)</SelectItem>
                        <SelectItem value="UTC+08:00">UTC+08:00 (SGT)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Date Format</Label>
                    <Select value={companySettings.dateFormat} onValueChange={(value) => setCompanySettings(prev => ({ ...prev, dateFormat: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MMM d, yyyy">Jan 15, 2025</SelectItem>
                        <SelectItem value="dd/MM/yyyy">15/01/2025</SelectItem>
                        <SelectItem value="MM/dd/yyyy">01/15/2025</SelectItem>
                        <SelectItem value="yyyy-MM-dd">2025-01-15</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Session Timeout (minutes)</Label>
                    <Select value={companySettings.sessionTimeout} onValueChange={(value) => setCompanySettings(prev => ({ ...prev, sessionTimeout: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="pt-4 flex justify-end">
                  <Button onClick={handleSaveCompanySettings} className="bg-primary hover:bg-primary/90">
                    <Save className="mr-2 h-4 w-4" />
                    Save Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Clients Tab */}
        <TabsContent value="clients" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Client Management</h2>
              <p className="text-sm text-muted-foreground">Add and manage client organizations</p>
            </div>
            <Dialog open={isClientDialogOpen} onOpenChange={setIsClientDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={handleOpenAddClient} className="bg-primary hover:bg-primary/90">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Client
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingClient ? 'Edit Client' : 'Add New Client'}</DialogTitle>
                  <DialogDescription>
                    {editingClient ? 'Update client information' : 'Create a new client organization'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="client-name">Company Name *</Label>
                      <Input
                        id="client-name"
                        value={clientForm.name}
                        onChange={(e) => setClientForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Acme Corp"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="client-branch">Branch *</Label>
                      <Input
                        id="client-branch"
                        value={clientForm.branch}
                        onChange={(e) => setClientForm(prev => ({ ...prev, branch: e.target.value }))}
                        placeholder="New York HQ"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contract-type">Contract Type *</Label>
                    <Select
                      value={clientForm.contract_type}
                      onValueChange={(value: any) => setClientForm(prev => ({ ...prev, contract_type: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select contract type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="amc">AMC (Annual Maintenance Contract)</SelectItem>
                        <SelectItem value="lease">Lease</SelectItem>
                        <SelectItem value="warranty">Warranty</SelectItem>
                        <SelectItem value="poc">POC (Proof of Concept)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact-person">Contact Person</Label>
                    <Input
                      id="contact-person"
                      value={clientForm.contact_person}
                      onChange={(e) => setClientForm(prev => ({ ...prev, contact_person: e.target.value }))}
                      placeholder="John Smith"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contact-email">Email</Label>
                      <Input
                        id="contact-email"
                        type="email"
                        value={clientForm.contact_email}
                        onChange={(e) => setClientForm(prev => ({ ...prev, contact_email: e.target.value }))}
                        placeholder="john@acme.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-phone">Phone (Kenyan format)</Label>
                      <Input
                        id="contact-phone"
                        value={clientForm.contact_phone}
                        onChange={(e) => {
                          setClientForm(prev => ({ ...prev, contact_phone: e.target.value }));
                          setPhoneError(null);
                        }}
                        placeholder="+254 712 345 678"
                        className={phoneError ? 'border-destructive' : ''}
                      />
                      {phoneError && (
                        <p className="text-xs text-destructive">{phoneError}</p>
                      )}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsClientDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleSubmitClient}
                    disabled={!clientForm.name || !clientForm.branch || createClient.isPending || updateClient.isPending}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {editingClient ? 'Update' : 'Create'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="pt-6">
              {clientsLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-semibold">Company</TableHead>
                      <TableHead className="font-semibold">Branch</TableHead>
                      <TableHead className="font-semibold">Contract Type</TableHead>
                      <TableHead className="font-semibold">Contact</TableHead>
                      <TableHead className="w-[100px] font-semibold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients?.map((client) => (
                      <TableRow key={client.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium text-foreground">{client.name}</TableCell>
                        <TableCell className="text-muted-foreground">{client.branch}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                            {contractTypeLabels[client.contract_type]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {client.contact_person && (
                            <div>
                              <p className="text-sm text-foreground">{client.contact_person}</p>
                              <p className="text-xs text-muted-foreground">{client.contact_email}</p>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleOpenEditClient(client)}
                              className="hover:bg-primary/10 hover:text-primary"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDeleteClick(client)}
                              className="hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!clients || clients.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                          <p className="text-muted-foreground">No clients found</p>
                          <p className="text-sm text-muted-foreground">Add your first client to get started</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Modules Tab */}
        <TabsContent value="modules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                Affected Modules
              </CardTitle>
              <CardDescription>
                Manage the list of modules that can be affected by change requests
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Add new module..."
                  value={newModule}
                  onChange={(e) => setNewModule(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddModule()}
                  className="flex-1"
                />
                <Button onClick={handleAddModule} disabled={!newModule.trim()} className="bg-primary hover:bg-primary/90">
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {modules.map((module, index) => (
                  <div key={index} className="group flex items-center gap-1">
                    {editingModule?.index === index ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editingModule.value}
                          onChange={(e) => setEditingModule({ index, value: e.target.value })}
                          className="h-8 w-40"
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" onClick={() => handleEditModule(index)} className="hover:bg-primary/10">
                          <Save className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Badge 
                        variant="secondary" 
                        className="pr-1 cursor-pointer hover:bg-secondary/80 bg-muted text-foreground"
                      >
                        {module}
                        <div className="ml-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-4 w-4 p-0 hover:text-primary"
                            onClick={() => setEditingModule({ index, value: module })}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-4 w-4 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteModule(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {modules.length} modules configured
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Departments Tab */}
        <TabsContent value="departments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-primary" />
                Departments
              </CardTitle>
              <CardDescription>
                Manage the list of departments for categorizing change requests
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Add new department..."
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddDepartment()}
                  className="flex-1"
                />
                <Button onClick={handleAddDepartment} disabled={!newDepartment.trim()} className="bg-primary hover:bg-primary/90">
                  <Plus className="mr-2 h-4 w-4" />
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {departments.map((dept, index) => (
                  <div key={index} className="group flex items-center gap-1">
                    {editingDepartment?.index === index ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editingDepartment.value}
                          onChange={(e) => setEditingDepartment({ index, value: e.target.value })}
                          className="h-8 w-40"
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" onClick={() => handleEditDepartment(index)} className="hover:bg-primary/10">
                          <Save className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Badge 
                        variant="secondary" 
                        className="pr-1 cursor-pointer hover:bg-secondary/80 bg-muted text-foreground"
                      >
                        {dept}
                        <div className="ml-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-4 w-4 p-0 hover:text-primary"
                            onClick={() => setEditingDepartment({ index, value: dept })}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-4 w-4 p-0 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteDepartment(index)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                {departments.length} departments configured
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" />
                  Notification Channels
                </CardTitle>
                <CardDescription>Configure how notifications are sent</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Bell className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">In-App Notifications</p>
                      <p className="text-sm text-muted-foreground">Show notifications in the app</p>
                    </div>
                  </div>
                  <Switch 
                    checked={companySettings.inAppNotifications}
                    onCheckedChange={(checked) => setCompanySettings(prev => ({ ...prev, inAppNotifications: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Mail className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">Email Notifications</p>
                      <p className="text-sm text-muted-foreground">Send emails for important updates</p>
                    </div>
                  </div>
                  <Switch 
                    checked={companySettings.emailNotifications}
                    onCheckedChange={(checked) => setCompanySettings(prev => ({ ...prev, emailNotifications: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-muted p-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">SMS Notifications</p>
                      <p className="text-sm text-muted-foreground">Send SMS for critical alerts</p>
                    </div>
                  </div>
                  <Switch 
                    checked={companySettings.smsNotifications}
                    onCheckedChange={(checked) => setCompanySettings(prev => ({ ...prev, smsNotifications: checked }))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SettingsIcon className="h-5 w-5 text-primary" />
                  Workflow Settings
                </CardTitle>
                <CardDescription>Automation and workflow preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                  <div>
                    <p className="font-medium text-foreground">Auto-approve Non-Chargeable</p>
                    <p className="text-sm text-muted-foreground">Skip approval for non-chargeable requests</p>
                  </div>
                  <Switch 
                    checked={companySettings.autoApproveNonChargeable}
                    onCheckedChange={(checked) => setCompanySettings(prev => ({ ...prev, autoApproveNonChargeable: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                  <div>
                    <p className="font-medium text-foreground">Require Two-Factor Auth</p>
                    <p className="text-sm text-muted-foreground">Enhanced security for all users</p>
                  </div>
                  <Switch 
                    checked={companySettings.requireTwoFactorAuth}
                    onCheckedChange={(checked) => setCompanySettings(prev => ({ ...prev, requireTwoFactorAuth: checked }))}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveCompanySettings} className="bg-primary hover:bg-primary/90">
              <Save className="mr-2 h-4 w-4" />
              Save Notification Settings
            </Button>
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Delete Client Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Client</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold">{clientToDelete?.name}</span>? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleteClient.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
