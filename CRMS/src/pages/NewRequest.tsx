import { AffectedModulesPicker } from '@crms/components/AffectedModulesPicker';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Save } from 'lucide-react';
import { Button } from '@crms/components/ui/button';
import { Input } from '@crms/components/ui/input';
import { PlanningDateInput } from '@crms/components/ui/planning-date-input';
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
import { useToast } from '@crms/hooks/use-toast';
import { useClients, useProfiles, useCreateChangeRequest, useClientScope } from '@crms/hooks/useSupabaseData';
import { Skeleton } from '@crms/components/ui/skeleton';

type RequestSource = 'email' | 'phone' | 'whatsapp' | 'meeting';
type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';


export default function NewRequest() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: clients, isLoading: clientsLoading } = useClients();
  const { data: profiles } = useProfiles();
  const createRequest = useCreateChangeRequest();

  const [selectedModules, setSelectedModules] = useState<string[]>([]);
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
  const branchOptions = useMemo(() => clientScope?.branches || [], [clientScope?.branches]);
  const allDepartments = useMemo(() => clientScope?.departments || [], [clientScope?.departments]);
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
                  <PlanningDateInput id="estimatedCompletion" type="date" value={formData.estimatedCompletion} onChange={(e) => handleInputChange('estimatedCompletion', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Modules Affected</CardTitle>
              <CardDescription>Select the shared modules impacted by this change</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <AffectedModulesPicker value={selectedModules} onChange={setSelectedModules} />
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
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



