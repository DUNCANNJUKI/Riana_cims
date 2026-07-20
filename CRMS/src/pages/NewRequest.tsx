import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Send, Save, X } from 'lucide-react';
import { Button } from '@crms/components/ui/button';
import { Input } from '@crms/components/ui/input';
import { Label } from '@crms/components/ui/label';
import { Textarea } from '@crms/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@crms/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@crms/components/ui/card';
import { Checkbox } from '@crms/components/ui/checkbox';
import { useToast } from '@crms/hooks/use-toast';
import { useClients, useProfiles, useCreateChangeRequest, useClientScope } from '@crms/hooks/useSupabaseData';
import { Skeleton } from '@crms/components/ui/skeleton';

type RequestSource = 'email' | 'phone' | 'whatsapp' | 'meeting';
type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';

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

export default function NewRequest() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: clients, isLoading: clientsLoading } = useClients();
  const { data: profiles } = useProfiles();
  const createRequest = useCreateChangeRequest();

  const [availableModules, setAvailableModules] = useState<string[]>(defaultModules);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [customModule, setCustomModule] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    clientId: '',
    branchId: '',
    departmentId: '',
    department: '',
    source: '' as RequestSource | '',
    description: '',
    priority: '' as PriorityLevel | '',
    dateRequested: new Date().toISOString().split('T')[0],
    estimatedCompletion: '',
  });

  const { data: clientScope, isLoading: scopeLoading } = useClientScope(formData.clientId);
  const branchOptions = clientScope?.branches || [];
  const allDepartments = clientScope?.departments || [];
  const departmentOptions = useMemo(
    () => formData.branchId ? allDepartments.filter((department) => department.branch_id === formData.branchId) : allDepartments,
    [allDepartments, formData.branchId],
  );
  const hasConfiguredBranches = branchOptions.length > 0;
  const hasConfiguredDepartments = departmentOptions.length > 0;
  const modulesAffected = useMemo(() => selectedModules.filter(Boolean), [selectedModules]);

  useEffect(() => {
    const branchMissing = formData.branchId && hasConfiguredBranches && !branchOptions.some((branch) => branch.id === formData.branchId);
    if (branchMissing) {
      setFormData((prev) => ({ ...prev, branchId: '', departmentId: '', department: '' }));
      return;
    }
    if (!formData.departmentId) return;
    const selectedDepartment = departmentOptions.find((department) => department.id === formData.departmentId);
    if (!selectedDepartment) {
      setFormData((prev) => ({ ...prev, departmentId: '', department: '' }));
    }
  }, [branchOptions, departmentOptions, formData.branchId, formData.departmentId, hasConfiguredBranches]);

  const selectModule = (module: string) => {
    setSelectedModules((prev) => prev.includes(module) ? prev : [...prev, module]);
  };

  const handleModuleToggle = (module: string) => {
    setSelectedModules((prev) =>
      prev.includes(module)
        ? prev.filter((m) => m !== module)
        : [...prev, module]
    );
  };

  const handleAddCustomModule = () => {
    const moduleName = customModule.trim().replace(/\s+/g, ' ');
    if (!moduleName) return;
    const exists = availableModules.some((module) => module.toLowerCase() === moduleName.toLowerCase());
    if (!exists) setAvailableModules((prev) => [...prev, moduleName]);
    selectModule(exists ? availableModules.find((module) => module.toLowerCase() === moduleName.toLowerCase()) || moduleName : moduleName);
    setCustomModule('');
  };

  const handleInputChange = (field: string, value: string) => {
    setSubmitError(null);
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleClientChange = (clientId: string) => {
    setSubmitError(null);
    setFormData(prev => ({
      ...prev,
      clientId,
      branchId: '',
      departmentId: '',
      department: '',
    }));
  };

  const handleBranchChange = (branchId: string) => {
    setSubmitError(null);
    setFormData(prev => ({
      ...prev,
      branchId,
      departmentId: '',
      department: '',
    }));
  };

  const handleDepartmentChange = (departmentId: string) => {
    const selectedDepartment = allDepartments.find((department) => department.id === departmentId);
    setSubmitError(null);
    setFormData(prev => ({
      ...prev,
      departmentId,
      branchId: selectedDepartment?.branch_id || prev.branchId,
      department: selectedDepartment?.department_name || '',
    }));
  };

  const handleDeleteAvailableModule = (module: string) => {
    setAvailableModules((prev) => prev.filter((availableModule) => availableModule !== module));
    setSelectedModules((prev) => prev.filter((selectedModule) => selectedModule !== module));
  };

  const handleSubmit = async (sendForApproval: boolean, event?: React.SyntheticEvent) => {
    event?.preventDefault();
    setSubmitError(null);

    const departmentName = formData.department || (!hasConfiguredDepartments ? 'General' : '');
    if (!formData.clientId || (hasConfiguredBranches && !formData.branchId) || (hasConfiguredDepartments && !formData.departmentId) || !departmentName || !formData.source ||
      !formData.description || !formData.priority || !formData.estimatedCompletion) {
      const message = 'Please fill in all required fields';
      setSubmitError(message);
      toast({
        title: 'Validation Error',
        description: message,
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const seniorDevs = profiles?.filter((profile) => {
        const role = (profile as { role?: string }).role;
        return role === 'senior_developer' || role === 'admin';
      }) || [];
      const seniorDevId = seniorDevs[0]?.id || profiles?.[0]?.id;

      if (!seniorDevId) {
        throw new Error('No senior developer available');
      }

      await createRequest.mutateAsync({
        client_id: formData.clientId,
        branch_id: formData.branchId || null,
        department_id: formData.departmentId || null,
        department: departmentName,
        source: formData.source as RequestSource,
        change_description: formData.description,
        priority: formData.priority as PriorityLevel,
        date_requested: formData.dateRequested,
        estimated_completion_date: formData.estimatedCompletion,
        modules_affected: modulesAffected,
        senior_developer_id: seniorDevId,
        status: sendForApproval ? 'pending_approval' : 'waiting',
      });

      toast({
        title: sendForApproval ? 'Request Sent for Approval' : 'Draft Saved',
        description: sendForApproval
          ? 'The change request has been submitted to the Sales Team for approval.'
          : 'Your draft has been saved successfully.',
      });

      navigate('/developers/requests');
    } catch (error) {
      console.error('Error creating request:', error);
      const message = error instanceof Error ? error.message : 'Failed to create change request. Please try again.';
      setSubmitError(message);
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (clientsLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded-md" />
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Change Request</h1>
          <p className="text-muted-foreground">Create a new system modification request</p>
        </div>
      </div>

      {submitError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {submitError}
        </div>
      )}

      <form onSubmit={(event) => handleSubmit(true, event)}>
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
              <CardDescription>Select the client and provide contract details</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="client">Client *</Label>
                <Select value={formData.clientId} onValueChange={handleClientChange}>
                  <SelectTrigger id="client">
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name} - {client.branch}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="branch">Branch {hasConfiguredBranches ? '*' : ''}</Label>
                <Select
                  value={formData.branchId}
                  onValueChange={handleBranchChange}
                  disabled={!formData.clientId || scopeLoading || !hasConfiguredBranches}
                >
                  <SelectTrigger id="branch">
                    <SelectValue
                      placeholder={
                        !formData.clientId
                          ? 'Select client first'
                          : scopeLoading
                            ? 'Loading branches...'
                            : !hasConfiguredBranches
                              ? 'No branches configured'
                              : 'Select branch'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {branchOptions.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.branch_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department {hasConfiguredDepartments ? '*' : ''}</Label>
                <Select
                  value={formData.departmentId}
                  onValueChange={handleDepartmentChange}
                  disabled={!formData.clientId || scopeLoading || (hasConfiguredBranches && !formData.branchId) || !hasConfiguredDepartments}
                >
                  <SelectTrigger id="department">
                    <SelectValue
                      placeholder={
                        !formData.clientId
                          ? 'Select client first'
                          : scopeLoading
                            ? 'Loading departments...'
                            : hasConfiguredBranches && !formData.branchId
                              ? 'Select branch first'
                              : !hasConfiguredDepartments
                                ? 'No departments configured'
                                : 'Select department'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {departmentOptions.map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.department_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="source">Request Source *</Label>
                <Select value={formData.source} onValueChange={(value) => handleInputChange('source', value)}>
                  <SelectTrigger id="source">
                    <SelectValue placeholder="How was this received?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Phone Call</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Request Details</CardTitle>
              <CardDescription>Describe the change request and set priority</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="description">Change Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Provide a detailed description of the change request..."
                  className="min-h-[120px]"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority *</Label>
                  <Select value={formData.priority} onValueChange={(value) => handleInputChange('priority', value)}>
                    <SelectTrigger id="priority">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dateRequested">Date Requested *</Label>
                  <Input id="dateRequested" type="date" value={formData.dateRequested} onChange={(e) => handleInputChange('dateRequested', e.target.value)} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="estimatedCompletion">Estimated Completion *</Label>
                  <Input id="estimatedCompletion" type="date" value={formData.estimatedCompletion} onChange={(e) => handleInputChange('estimatedCompletion', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Modules Affected</CardTitle>
              <CardDescription>Select or add all modules that will be impacted by this change</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {availableModules.map((module) => (
                  <div key={module} className="flex min-w-0 items-center gap-2 rounded-md border border-border/60 px-2 py-1.5">
                    <Checkbox id={`module-${module}`} checked={selectedModules.includes(module)} onCheckedChange={() => handleModuleToggle(module)} />
                    <Label htmlFor={`module-${module}`} className="min-w-0 flex-1 cursor-pointer truncate text-sm font-normal">{module}</Label>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDeleteAvailableModule(module)}
                      aria-label={`Delete ${module}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={customModule}
                  onChange={(event) => setCustomModule(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAddCustomModule();
                    }
                  }}
                  placeholder="Add module affected"
                />
                <Button type="button" variant="outline" onClick={handleAddCustomModule}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Module
                </Button>
              </div>

              {modulesAffected.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {modulesAffected.map((module) => (
                    <span key={module} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {module}
                      <button
                        type="button"
                        className="rounded-full p-0.5 hover:bg-primary/15"
                        onClick={() => setSelectedModules((prev) => prev.filter((selected) => selected !== module))}
                        aria-label={`Remove ${module}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={(event) => handleSubmit(false, event)} disabled={isSubmitting}>
              <Save className="mr-2 h-4 w-4" />
              Save as Draft
            </Button>
            <Button type="button" onClick={(event) => handleSubmit(true, event)} disabled={isSubmitting}>
              <Send className="mr-2 h-4 w-4" />
              Send for Approval
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}



