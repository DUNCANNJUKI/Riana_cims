import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Clock,
  Download,
  Edit,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  UserPlus,
  CheckCircle,
  XCircle,
  Pause,
  FileCheck,
  Play,
  Flag,
  Plus,
  X,
} from 'lucide-react';
import { CompanyLogoLoader, PageLoader } from '@crms/components/common/CompanyLogoLoader';
import { Button } from '@crms/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@crms/components/ui/card';
import { Separator } from '@crms/components/ui/separator';
import { Textarea } from '@crms/components/ui/textarea';
import { Avatar, AvatarFallback } from '@crms/components/ui/avatar';
import { Input } from '@crms/components/ui/input';
import { StatusBadge } from '@crms/components/common/StatusBadge';
import { PriorityBadge } from '@crms/components/common/PriorityBadge';
import { RequestTimeline } from '@crms/components/request/RequestTimeline';
import { useToast } from '@crms/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@crms/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@crms/components/ui/select';
import { useState, useEffect, useMemo } from 'react';
import { getCimsUser } from '@crms/lib/cimsSession';
import { Label } from '@crms/components/ui/label';
import { useChangeRequest, useProfiles, useUpdateChangeRequest, useCreateAuditLog, useAuditLogs, useClientScope } from '@crms/hooks/useSupabaseData';
import { generateChangeRequestPDF, generateCompletionReportPDF, downloadPDF } from '@crms/lib/pdfGenerator';
import { useCurrentUserRole } from '@crms/hooks/useCurrentUserRole';
import { useLocation } from 'react-router-dom';

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

const parseModulesAffected = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((module): module is string => typeof module === 'string' && module.trim().length > 0);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((module): module is string => typeof module === 'string' && module.trim().length > 0) : [];
  } catch {
    return [];
  }
};
export default function RequestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { userId: currentUserId, isAdmin, isSeniorDeveloper, isSales, canApprove, canAssignDevelopers } = useCurrentUserRole();
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const { data: request, isLoading: requestLoading } = useChangeRequest(id!);
  const { data: profiles } = useProfiles();
  const { data: allAuditLogs } = useAuditLogs();
  const { data: clientScope } = useClientScope(request?.client_id);

  const updateRequest = useUpdateChangeRequest();
  const createAuditLog = useCreateAuditLog();

  const [selectedDeveloperId, setSelectedDeveloperId] = useState('');
  const [approvalComment, setApprovalComment] = useState('');
  const [isChargeable, setIsChargeable] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    change_description: '',
    priority: '',
    branch_id: '',
    department_id: '',
    department: '',
    modules_affected: [] as string[],
  });
  const [availableEditModules, setAvailableEditModules] = useState<string[]>(defaultModules);
  const [editCustomModule, setEditCustomModule] = useState('');

  const developers = profiles || [];
  const auditLogs = allAuditLogs?.filter((log: any) => log.request_id === id) || [];
  const editBranchOptions = clientScope?.branches || [];
  const editDepartmentOptions = useMemo(
    () => editForm.branch_id
      ? (clientScope?.departments || []).filter((department) => department.branch_id === editForm.branch_id)
      : (clientScope?.departments || []),
    [clientScope?.departments, editForm.branch_id],
  );

  useEffect(() => {
    if (request) {
      const requestModules = parseModulesAffected(request.modules_affected);
      setEditForm({
        change_description: request.change_description,
        priority: request.priority,
        branch_id: request.branch_id || request.branch_scope?.id || request.department_scope?.branch_id || '',
        department_id: request.department_id || request.department_scope?.id || '',
        department: request.department_scope?.name || request.department,
        modules_affected: requestModules,
      });
      setAvailableEditModules(Array.from(new Set([...defaultModules, ...requestModules])));

      // Auto-open assign dialog if coming from RequestList dropdown
      const params = new URLSearchParams(location.search);
      if (params.get('assign') === 'true' && canAssignDevelopers) {
        setAssignDialogOpen(true);
        // Remove param from URL
        navigate(`/developers/requests/${id}`, { replace: true });
      }
    }
  }, [request, location.search, canAssignDevelopers]);

  if (requestLoading) {
    return <PageLoader />;
  }

  const handleEditModuleToggle = (module: string) => {
    setEditForm((prev) => ({
      ...prev,
      modules_affected: prev.modules_affected.includes(module)
        ? prev.modules_affected.filter((selected) => selected !== module)
        : [...prev.modules_affected, module],
    }));
  };

  const handleAddEditModule = () => {
    const moduleName = editCustomModule.trim().replace(/\s+/g, ' ');
    if (!moduleName) return;
    const existingModule = availableEditModules.find((module) => module.toLowerCase() === moduleName.toLowerCase());
    const resolvedModule = existingModule || moduleName;
    if (!existingModule) setAvailableEditModules((prev) => [...prev, moduleName]);
    setEditForm((prev) => ({
      ...prev,
      modules_affected: prev.modules_affected.includes(resolvedModule) ? prev.modules_affected : [...prev.modules_affected, resolvedModule],
    }));
    setEditCustomModule('');
  };

  const handleEditBranchChange = (branchId: string) => {
    setEditForm((prev) => ({
      ...prev,
      branch_id: branchId,
      department_id: '',
      department: '',
    }));
  };

  const handleEditDepartmentChange = (departmentId: string) => {
    const selectedDepartment = (clientScope?.departments || []).find((department) => department.id === departmentId);
    setEditForm((prev) => ({
      ...prev,
      department_id: departmentId,
      branch_id: selectedDepartment?.branch_id || prev.branch_id,
      department: selectedDepartment?.department_name || prev.department,
    }));
  };

  const handleDeleteEditModule = (module: string) => {
    setAvailableEditModules((prev) => prev.filter((availableModule) => availableModule !== module));
    setEditForm((prev) => ({
      ...prev,
      modules_affected: prev.modules_affected.filter((selectedModule) => selectedModule !== module),
    }));
  };

  if (!request) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h2 className="text-xl font-semibold">Request not found</h2>
        <Button variant="link" onClick={() => navigate('/developers/requests')}>
          Back to requests
        </Button>
      </div>
    );
  }

  const contractTypeLabels: Record<string, string> = {
    amc: 'Annual Maintenance Contract',
    lease: 'Lease Agreement',
    warranty: 'Warranty Coverage',
    poc: 'Proof of Concept',
  };

  const sourceLabels: Record<string, string> = {
    email: 'Email',
    phone: 'Phone Call',
    whatsapp: 'WhatsApp',
    meeting: 'Meeting',
  };

  const handleAssignDeveloper = async () => {
    if (!request || !selectedDeveloperId) return;
    setActionLoading(true);
    try {
      await updateRequest.mutateAsync({
        id: request.id,
        assigned_developer_id: selectedDeveloperId,
        status: 'assigned',
      });

      const developer = developers.find(d => d.id === selectedDeveloperId);

      toast({
        title: 'Developer Assigned',
        description: `${developer?.name} has been assigned and notified.`,
      });

      // Reset states and close dialog
      setAssignDialogOpen(false);
      setSelectedDeveloperId('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprovalAction = async (action: 'approve' | 'reject' | 'waiting') => {
    if (!request) return;
    setActionLoading(true);

    const statusMap = {
      approve: 'approved',
      reject: 'rejected',
      waiting: 'waiting_clarification',
    } as const;

    const newStatus = statusMap[action];
    const auditAction = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'status_changed';

    try {
      await updateRequest.mutateAsync({
        id: request.id,
        status: newStatus as any,
        approval_comment: approvalComment || null,
        is_chargeable: isChargeable,
      });

      // Create audit log
      await createAuditLog.mutateAsync({
        request_id: request.id,
        action: auditAction as any,
        action_label: action === 'approve' ? 'Request Approved' : action === 'reject' ? 'Request Rejected' : 'Request On Hold',
        details: approvalComment || undefined,
        previous_value: request.status,
        new_value: newStatus,
        user_id: getCimsUser()?.id,
      });

      const messages = {
        approve: 'Request approved. Notifications sent.',
        reject: 'Request rejected. Notifications sent.',
        waiting: 'Request placed on hold. Notifications sent.',
      };

      toast({
        title: action === 'approve' ? 'Request Approved' : action === 'reject' ? 'Request Rejected' : 'Request On Hold',
        description: messages[action],
      });

      setApprovalDialogOpen(false);
      setApprovalComment('');
      setIsChargeable(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartWork = async () => {
    if (!request) return;
    setActionLoading(true);
    try {
      await updateRequest.mutateAsync({
        id: request.id,
        status: 'in_progress',
        commencement_date: new Date().toISOString().split('T')[0],
      });

      await createAuditLog.mutateAsync({
        request_id: request.id,
        action: 'started',
        action_label: 'Work Commenced',
        previous_value: request.status,
        new_value: 'in_progress',
        user_id: getCimsUser()?.id,
      });

      toast({ title: 'Work Started', description: 'Status updated to In Progress. Notifications sent.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!request) return;
    setActionLoading(true);
    try {
      await updateRequest.mutateAsync({
        id: request.id,
        status: 'completed',
        completion_date: new Date().toISOString().split('T')[0],
      });

      await createAuditLog.mutateAsync({
        request_id: request.id,
        action: 'completed',
        action_label: 'Request Completed',
        previous_value: request.status,
        new_value: 'completed',
        user_id: getCimsUser()?.id,
      });

      toast({ title: 'Request Completed', description: 'Marked as completed. All parties notified.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };
  const handleEdit = async () => {
    if (!request) return;
    setActionLoading(true);
    try {
      await updateRequest.mutateAsync({
        id: request.id,
        ...editForm,
      } as any);

      await createAuditLog.mutateAsync({
        request_id: request.id,
        action: 'status_changed',
        action_label: 'Request Updated',
        details: 'Manual edit by user',
        user_id: getCimsUser()?.id,
      });

      toast({ title: 'Request Updated', description: 'Changes saved successfully.' });
      setEditDialogOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadPDF = async (type: 'request' | 'completion') => {
    const formattedLogs = auditLogs.map(log => ({
      action_label: log.action_label,
      created_at: log.created_at,
      details: log.details,
      profiles: log.profiles,
    }));

    if (type === 'request') {
      const doc = await generateChangeRequestPDF(request, formattedLogs);
      downloadPDF(doc, `${request.ticket_number}-request-form.pdf`);
    } else {
      const doc = await generateCompletionReportPDF(request, formattedLogs);
      downloadPDF(doc, `${request.ticket_number}-completion-report.pdf`);
    }

    toast({
      title: 'PDF Generated',
      description: `${type === 'request' ? 'Request form' : 'Completion report'} has been downloaded.`,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">{request.ticket_number}</h1>
              <StatusBadge status={request.status} />
              <PriorityBadge priority={request.priority} />
            </div>
            <p className="text-muted-foreground">
              {request.client?.name} • {request.client?.branch}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => handleDownloadPDF('request')}>
            <Download className="mr-2 h-4 w-4" />
            Request Form
          </Button>
          {request.status === 'completed' && (
            <Button variant="outline" size="sm" onClick={() => handleDownloadPDF('completion')}>
              <FileCheck className="mr-2 h-4 w-4" />
              Completion Report
            </Button>
          )}
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Change Request</DialogTitle>
                <DialogDescription>Update request details.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    value={editForm.change_description}
                    onChange={(e) => setEditForm(prev => ({ ...prev, change_description: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    value={editForm.priority}
                    onValueChange={(val) => setEditForm(prev => ({ ...prev, priority: val }))}
                  >
                    <SelectTrigger>
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
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Branch</Label>
                    <Select value={editForm.branch_id} onValueChange={handleEditBranchChange} disabled={editBranchOptions.length === 0}>
                      <SelectTrigger>
                        <SelectValue placeholder={editBranchOptions.length ? "Select branch" : "No branches configured"} />
                      </SelectTrigger>
                      <SelectContent>
                        {editBranchOptions.map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.branch_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Department</Label>
                    <Select
                      value={editForm.department_id}
                      onValueChange={handleEditDepartmentChange}
                      disabled={(editBranchOptions.length > 0 && !editForm.branch_id) || editDepartmentOptions.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            editBranchOptions.length > 0 && !editForm.branch_id
                              ? "Select branch first"
                              : editDepartmentOptions.length
                                ? "Select department"
                                : "No departments configured"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {editDepartmentOptions.map((department) => (
                          <SelectItem key={department.id} value={department.id}>
                            {department.department_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-3">
                  <Label>Modules Affected</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {availableEditModules.map((module) => (
                      <div key={module} className="flex min-w-0 items-center gap-2 rounded-md border border-border/60 px-2 py-1.5">
                        <input
                          id={`edit-module-${module}`}
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={editForm.modules_affected.includes(module)}
                          onChange={() => handleEditModuleToggle(module)}
                        />
                        <Label htmlFor={`edit-module-${module}`} className="min-w-0 flex-1 cursor-pointer truncate text-sm font-normal">
                          {module}
                        </Label>
                        <button
                          type="button"
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDeleteEditModule(module)}
                          aria-label={`Delete ${module}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={editCustomModule}
                      onChange={(event) => setEditCustomModule(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          handleAddEditModule();
                        }
                      }}
                      placeholder="Add module affected"
                    />
                    <Button type="button" variant="outline" onClick={handleAddEditModule}>
                      <Plus className="mr-2 h-4 w-4" />
                      Add
                    </Button>
                  </div>
                  {editForm.modules_affected.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {editForm.modules_affected.map((module) => (
                        <span key={module} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                          {module}
                          <button
                            type="button"
                            className="rounded-full p-0.5 hover:bg-primary/15"
                            onClick={() => setEditForm((prev) => ({ ...prev, modules_affected: prev.modules_affected.filter((selected) => selected !== module) }))}
                            aria-label={`Remove ${module}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleEdit} disabled={actionLoading}>Save Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {request.status === 'pending_approval' && canApprove && (
            <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">Review Request</Button>
              </DialogTrigger>
              <DialogContent>
                {/* ... existing dialog content ... */}
                <DialogHeader>
                  <DialogTitle>Review Change Request</DialogTitle>
                  <DialogDescription>
                    Review and approve, reject, or place this request on hold.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Commercial Remarks</Label>
                    <Textarea
                      placeholder="Add your approval comments..."
                      value={approvalComment}
                      onChange={(e) => setApprovalComment(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="chargeable"
                      className="rounded"
                      checked={isChargeable}
                      onChange={(e) => setIsChargeable(e.target.checked)}
                    />
                    <Label htmlFor="chargeable">Chargeable to client</Label>
                  </div>
                </div>
                <DialogFooter className="flex gap-2">
                  <Button variant="outline" onClick={() => handleApprovalAction('waiting')} disabled={actionLoading || (isChargeable && !approvalComment.trim())}>
                    <Pause className="mr-2 h-4 w-4" />
                    Hold
                  </Button>
                  <Button variant="destructive" onClick={() => handleApprovalAction('reject')} disabled={actionLoading}>
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                  <Button
                    onClick={() => handleApprovalAction('approve')}
                    disabled={actionLoading || isChargeable}
                    title={isChargeable ? "Chargeable requests must be placed on hold until payment is confirmed" : ""}
                  >
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {request.status === 'approved' && !request.assigned_developer && canAssignDevelopers && (
            <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Assign Developer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assign Developer</DialogTitle>
                  <DialogDescription>
                    Select a developer to work on this change request.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Developer</Label>
                    <Select value={selectedDeveloperId} onValueChange={setSelectedDeveloperId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select developer" />
                      </SelectTrigger>
                      <SelectContent>
                        {developers.filter(d => {
                          // Only show users with developer roles
                          return true; // Simplified for now, or check detailed roles
                        }).map((dev) => (
                          <SelectItem key={dev.id} value={dev.id}>
                            {dev.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleAssignDeveloper} disabled={actionLoading || !selectedDeveloperId}>Assign</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {request.status === 'assigned' && (request.assigned_developer_id === currentUserId || isAdmin) && (
            <Button size="sm" onClick={handleStartWork} disabled={actionLoading}>
              <Play className="mr-2 h-4 w-4" />
              Start Work
            </Button>
          )}
          {request.status === 'in_progress' && (request.assigned_developer_id === currentUserId || isAdmin) && (
            <Button size="sm" onClick={handleComplete} disabled={actionLoading}>
              <Flag className="mr-2 h-4 w-4" />
              Mark Complete
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Change Description
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                {request.change_description}
              </p>
            </CardContent>
          </Card>

          {/* Modules Affected */}
          <Card>
            <CardHeader>
              <CardTitle>Modules Affected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {parseModulesAffected(request.modules_affected).map((module: string) => (
                  <span
                    key={module}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium bg-primary/10 text-primary border border-primary/20"
                  >
                    {module}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Approval Details */}
          {request.approval_comment && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  Approval Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Comment</p>
                  <p>{request.approval_comment}</p>
                </div>
                <div className="flex gap-8">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Chargeable</p>
                    <p>{request.is_chargeable ? 'Yes' : 'No'}</p>
                  </div>
                  {request.sales_remarks && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Commercial Remarks</p>
                      <p>{request.sales_remarks}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Activity Timeline - Realtime */}
          <RequestTimeline requestId={id!} />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Key Details */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Date Requested</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(request.date_requested), 'MMMM d, yyyy')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Estimated Completion</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(request.estimated_completion_date), 'MMMM d, yyyy')}
                  </p>
                </div>
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Department</p>
                  <p className="text-sm text-muted-foreground">{request.department}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Contract Type</p>
                  <p className="text-sm text-muted-foreground">
                    {request.client ? contractTypeLabels[request.client.contract_type] : 'N/A'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Source</p>
                  <p className="text-sm text-muted-foreground">{sourceLabels[request.source]}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Client Contact */}
          <Card>
            <CardHeader>
              <CardTitle>Client Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {request.client?.contact_person ? request.client.contact_person.split(' ').map((n: string) => n[0]).join('') : 'C'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{request.client?.contact_person}</p>
                  <p className="text-xs text-muted-foreground">{request.client?.name}</p>
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${request.client?.contact_email}`} className="text-primary hover:underline">
                    {request.client?.contact_email}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{request.client?.contact_phone}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Team */}
          <Card>
            <CardHeader>
              <CardTitle>Team</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {request.senior_developer?.name ? request.senior_developer.name.split(' ').map((n: string) => n[0]).join('') : 'SD'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{request.senior_developer?.name || 'Unassigned'}</p>
                    <p className="text-xs text-muted-foreground">Senior Developer</p>
                  </div>
                </div>
              </div>
              {request.assigned_developer && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-status-in-progress/10 text-status-in-progress text-xs">
                        {request.assigned_developer?.name ? request.assigned_developer.name.split(' ').map((n: string) => n[0]).join('') : 'D'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{request.assigned_developer.name}</p>
                      <p className="text-xs text-muted-foreground">Assigned Developer</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}



