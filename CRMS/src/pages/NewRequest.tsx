import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useClients, useProfiles, useCreateChangeRequest, useUsersWithRoles } from '@/hooks/useSupabaseData';
import { sendNotificationEmail } from '@/lib/notifications';
import { Skeleton } from '@/components/ui/skeleton';
type RequestSource = 'email' | 'phone' | 'whatsapp' | 'meeting';
type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';

const modules = [
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

const departments = [
  'IT Infrastructure',
  'Sales Operations',
  'Finance',
  'HR',
  'Operations',
  'Customer Support',
  'Marketing',
];

export default function NewRequest() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: clients, isLoading: clientsLoading } = useClients();
  const { data: profiles } = useProfiles();
  const { data: usersWithRoles } = useUsersWithRoles();
  const createRequest = useCreateChangeRequest();

  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    clientId: '',
    department: '',
    source: '' as RequestSource | '',
    description: '',
    priority: '' as PriorityLevel | '',
    dateRequested: new Date().toISOString().split('T')[0],
    estimatedCompletion: '',
  });

  const handleModuleToggle = (module: string) => {
    setSelectedModules((prev) =>
      prev.includes(module)
        ? prev.filter((m) => m !== module)
        : [...prev, module]
    );
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent, sendForApproval: boolean) => {
    e.preventDefault();

    // Validation
    if (!formData.clientId || !formData.department || !formData.source ||
      !formData.description || !formData.priority || !formData.estimatedCompletion) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Get a senior developer to assign (first available one for now)
      const seniorDevs = profiles?.filter(p => p.department === 'Development') || [];
      const seniorDevId = seniorDevs[0]?.id || profiles?.[0]?.id;

      if (!seniorDevId) {
        throw new Error('No senior developer available');
      }

      const newRequest = await createRequest.mutateAsync({
        client_id: formData.clientId,
        department: formData.department,
        source: formData.source as RequestSource,
        change_description: formData.description,
        priority: formData.priority as PriorityLevel,
        date_requested: formData.dateRequested,
        estimated_completion_date: formData.estimatedCompletion,
        modules_affected: selectedModules,
        senior_developer_id: seniorDevId,
        status: sendForApproval ? 'pending_approval' : 'waiting',
      });

      // Send email notification if submitting for approval
      if (sendForApproval && newRequest) {
        const client = clients?.find(c => c.id === formData.clientId);

        // Notify all users with sales role
        const salesUsers = (usersWithRoles || []).filter(u =>
          u.roles.some(r => r.role === 'sales')
        );

        for (const salesPerson of salesUsers) {
          if (salesPerson.email) {
            await sendNotificationEmail({
              recipientEmail: salesPerson.email,
              recipientName: salesPerson.name,
              notificationType: 'approval_needed',
              ticketNumber: newRequest.ticket_number,
              clientName: client?.name || 'Unknown Client',
              requestDescription: formData.description,
              actionUrl: `${window.location.origin}/requests/${newRequest.id}`,
            });
          }
        }
      }

      toast({
        title: sendForApproval ? 'Request Sent for Approval' : 'Draft Saved',
        description: sendForApproval
          ? 'The change request has been submitted to the Sales Team for approval.'
          : 'Your draft has been saved successfully.',
      });

      navigate('/requests');
    } catch (error) {
      console.error('Error creating request:', error);
      toast({
        title: 'Error',
        description: 'Failed to create change request. Please try again.',
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
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">New Change Request</h1>
          <p className="text-muted-foreground">
            Create a new system modification request
          </p>
        </div>
      </div>

      <form onSubmit={(e) => handleSubmit(e, true)}>
        <div className="grid gap-6">
          {/* Client Information */}
          <Card>
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
              <CardDescription>
                Select the client and provide contract details
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="client">Client *</Label>
                <Select
                  value={formData.clientId}
                  onValueChange={(value) => handleInputChange('clientId', value)}
                >
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
                <Label htmlFor="department">Department *</Label>
                <Select
                  value={formData.department}
                  onValueChange={(value) => handleInputChange('department', value)}
                >
                  <SelectTrigger id="department">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="source">Request Source *</Label>
                <Select
                  value={formData.source}
                  onValueChange={(value) => handleInputChange('source', value)}
                >
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

          {/* Request Details */}
          <Card>
            <CardHeader>
              <CardTitle>Request Details</CardTitle>
              <CardDescription>
                Describe the change request and set priority
              </CardDescription>
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
                  <Select
                    value={formData.priority}
                    onValueChange={(value) => handleInputChange('priority', value)}
                  >
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
                  <Input
                    id="dateRequested"
                    type="date"
                    value={formData.dateRequested}
                    onChange={(e) => handleInputChange('dateRequested', e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="estimatedCompletion">Estimated Completion *</Label>
                  <Input
                    id="estimatedCompletion"
                    type="date"
                    value={formData.estimatedCompletion}
                    onChange={(e) => handleInputChange('estimatedCompletion', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Modules Affected */}
          <Card>
            <CardHeader>
              <CardTitle>Modules Affected</CardTitle>
              <CardDescription>
                Select all modules that will be impacted by this change
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {modules.map((module) => (
                  <div key={module} className="flex items-center space-x-2">
                    <Checkbox
                      id={module}
                      checked={selectedModules.includes(module)}
                      onCheckedChange={() => handleModuleToggle(module)}
                    />
                    <Label
                      htmlFor={module}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {module}
                    </Label>
                  </div>
                ))}
              </div>
              {selectedModules.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedModules.map((module) => (
                    <span
                      key={module}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
                    >
                      {module}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={(e) => handleSubmit(e as React.FormEvent, false)}
              disabled={isSubmitting}
            >
              <Save className="mr-2 h-4 w-4" />
              Save as Draft
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Send className="mr-2 h-4 w-4" />
              Send for Approval
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
