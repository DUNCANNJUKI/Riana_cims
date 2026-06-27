import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  FileCheck,
  Clock,
  Play,
  CheckCircle2,
  Eye,
  Calendar,
  Filter,
  MessageSquare,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Button } from '@crms/components/ui/button';
import { Card, CardContent } from '@crms/components/ui/card';
import { Badge } from '@crms/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@crms/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@crms/components/ui/dialog';
import { Textarea } from '@crms/components/ui/textarea';
import { Label } from '@crms/components/ui/label';
import { StatusBadge } from '@crms/components/common/StatusBadge';
import { PriorityBadge } from '@crms/components/common/PriorityBadge';
import { useChangeRequests, useUpdateChangeRequest, useCreateAuditLog } from '@crms/hooks/useSupabaseData';
import { Skeleton } from '@crms/components/ui/skeleton';
import { useToast } from '@crms/hooks/use-toast';
import { Database } from '@crms/integrations/supabase/types';
import { useCurrentUserRole } from '@crms/hooks/useCurrentUserRole';

type RequestStatus = Database['public']['Enums']['request_status'];
type CrmsStatus = RequestStatus | 'waiting_clarification';

export default function Assignments() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<CrmsStatus>('in_progress');
  const [statusComment, setStatusComment] = useState('');

  const { profileId, isAdmin } = useCurrentUserRole();
  const { data: allRequests, isLoading, error } = useChangeRequests();
  const updateRequest = useUpdateChangeRequest();
  const createAuditLog = useCreateAuditLog();
  const { toast } = useToast();

  // Filter assigned requests (those with an assigned developer matching current user)
  const assignedRequests = allRequests?.filter(r =>
    r.assigned_developer_id === profileId || isAdmin
  ) || [];

  const filteredRequests = assignedRequests.filter(request => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'waiting_clarification') return ['waiting', 'waiting_clarification'].includes(String(request.status));
    return request.status === statusFilter;
  });

  const activeCount = assignedRequests.filter(r => r.status === 'in_progress').length;
  const pendingCount = assignedRequests.filter(r => r.status === 'assigned' || r.status === 'approved').length;
  const waitingCount = assignedRequests.filter(r => ['waiting', 'waiting_clarification'].includes(String(r.status))).length;
  const completedCount = assignedRequests.filter(r => r.status === 'completed').length;

  const handleOpenStatusDialog = (requestId: string, currentStatus: CrmsStatus) => {
    setSelectedRequest(requestId);
    setNewStatus(currentStatus === 'in_progress' ? 'completed' : 'in_progress');
    setStatusComment('');
    setStatusDialogOpen(true);
  };

  const handleStatusUpdate = async () => {
    if (!selectedRequest || !statusComment.trim()) {
      toast({
        title: 'Comment required',
        description: 'Please add a comment explaining the status change.',
        variant: 'destructive',
      });
      return;
    }

    const request = allRequests?.find(r => r.id === selectedRequest);
    if (!request) return;

    try {
      const updates: Partial<Database['public']['Tables']['change_requests']['Row']> = {
        status: newStatus as any,
        approval_comment: statusComment,
      };

      // Set dates based on status
      if (newStatus === 'in_progress' && !request.commencement_date) {
        updates.commencement_date = new Date().toISOString().split('T')[0];
      } else if (newStatus === 'completed') {
        updates.completion_date = new Date().toISOString().split('T')[0];
      }

      await updateRequest.mutateAsync({
        id: selectedRequest,
        ...updates,
      });

      // Create audit log
      const actionLabel = newStatus === 'in_progress'
        ? 'Started Work'
        : newStatus === 'waiting_clarification'
          ? 'Waiting for Clarification'
          : 'Completed';

      await createAuditLog.mutateAsync({
        request_id: selectedRequest,
        action: newStatus === 'in_progress' ? 'started' : newStatus === 'completed' ? 'completed' : 'status_changed',
        action_label: actionLabel,
        details: statusComment,
        previous_value: request.status,
        new_value: newStatus,
      });

      toast({
        title: 'Status Updated',
        description: `Request ${request.ticket_number} has been updated to ${actionLabel}.`,
      });

      setStatusDialogOpen(false);
      setStatusComment('');
    } catch (err) {
      console.error('Error updating status:', err);
      toast({
        title: 'Error',
        description: 'Failed to update request status.',
        variant: 'destructive',
      });
    }
  };

  const getStatusIcon = (status: CrmsStatus) => {
    switch (status) {
      case 'in_progress':
        return <Play className="h-4 w-4" />;
      case 'waiting':
      case 'waiting_clarification':
        return <AlertCircle className="h-4 w-4" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileCheck className="h-6 w-6 text-primary" />
            My Assignments
          </h1>
          <p className="text-muted-foreground">Tasks assigned to you for implementation</p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">Error loading assignments</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileCheck className="h-6 w-6 text-primary" />
            My Assignments
          </h1>
          <p className="text-muted-foreground">
            Tasks assigned to you for implementation
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="waiting_clarification">Waiting Clarification</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-status-pending/30 bg-gradient-to-br from-status-pending/5 to-transparent">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-status-pending/10 p-3">
                <Clock className="h-6 w-6 text-status-pending" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">Pending Start</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-status-in-progress/30 bg-gradient-to-br from-status-in-progress/5 to-transparent">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-status-in-progress/10 p-3">
                <Play className="h-6 w-6 text-status-in-progress" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-sm text-muted-foreground">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-status-pending/30 bg-gradient-to-br from-status-pending/5 to-transparent">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-status-pending/10 p-3">
                <AlertCircle className="h-6 w-6 text-status-pending" />
              </div>
              <div>
                <p className="text-2xl font-bold">{waitingCount}</p>
                <p className="text-sm text-muted-foreground">Waiting</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-status-completed/30 bg-gradient-to-br from-status-completed/5 to-transparent">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-status-completed/10 p-3">
                <CheckCircle2 className="h-6 w-6 text-status-completed" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedCount}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assignments List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">
          {filteredRequests.length} Assignment{filteredRequests.length !== 1 ? 's' : ''}
        </h2>

        {filteredRequests.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileCheck className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No assignments found</p>
              <p className="text-sm text-muted-foreground">
                {statusFilter !== 'all' ? 'Try adjusting your filter' : 'Assignments will appear here when requests are assigned to you'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredRequests.map((request) => (
              <Card key={request.id} className="card-interactive overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex">
                    {/* Status indicator bar */}
                    <div className={`w-1.5 ${request.status === 'in_progress' ? 'bg-status-in-progress' :
                      ['waiting', 'waiting_clarification'].includes(String(request.status)) ? 'bg-status-pending' :
                        request.status === 'completed' ? 'bg-status-completed' :
                          'bg-status-pending'
                      }`} />

                    <div className="flex-1 p-6">
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-3 flex-wrap">
                            <Link
                              to={`/developers/requests/${request.id}`}
                              className="font-semibold text-primary hover:underline text-lg"
                            >
                              {request.ticket_number}
                            </Link>
                            <StatusBadge status={request.status} />
                            <PriorityBadge priority={request.priority} />
                          </div>

                          <div>
                            <p className="font-medium text-foreground">{request.client?.name || 'Unknown Client'}</p>
                            <p className="text-sm text-muted-foreground">
                              {request.client?.branch} • {request.department}
                            </p>
                          </div>

                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {request.change_description}
                          </p>

                          <div className="flex flex-wrap gap-2">
                            {request.modules_affected.slice(0, 3).map((module) => (
                              <Badge key={module} variant="secondary" className="text-xs">
                                {module}
                              </Badge>
                            ))}
                            {request.modules_affected.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{request.modules_affected.length - 3} more
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Due: {format(new Date(request.estimated_completion_date), 'MMM d, yyyy')}
                            </span>
                            {request.commencement_date && (
                              <span className="flex items-center gap-1">
                                <Play className="h-3 w-3" />
                                Started: {format(new Date(request.commencement_date), 'MMM d, yyyy')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-col gap-2 lg:items-end">
                          <Link to={`/developers/requests/${request.id}`}>
                            <Button variant="outline" size="sm" className="w-full lg:w-auto">
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </Button>
                          </Link>

                          {request.status !== 'completed' && (
                            <div className="flex gap-2">
                              {(request.status === 'assigned' || request.status === 'approved') && (
                                <Button
                                  size="sm"
                                  className="bg-status-in-progress hover:bg-status-in-progress/90"
                                  onClick={() => handleOpenStatusDialog(request.id, 'assigned')}
                                >
                                  <Play className="mr-2 h-4 w-4" />
                                  Start Work
                                </Button>
                              )}

                              {request.status === 'in_progress' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-status-pending/50 text-status-pending hover:bg-status-pending/10"
                                    onClick={() => {
                                      setSelectedRequest(request.id);
                                      setNewStatus('waiting_clarification');
                                      setStatusComment('');
                                      setStatusDialogOpen(true);
                                    }}
                                  >
                                    <AlertCircle className="mr-2 h-4 w-4" />
                                    Need Clarification
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="bg-status-completed hover:bg-status-completed/90"
                                    onClick={() => handleOpenStatusDialog(request.id, 'in_progress')}
                                  >
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Complete
                                  </Button>
                                </>
                              )}

                              {['waiting', 'waiting_clarification'].includes(String(request.status)) && (
                                <Button
                                  size="sm"
                                  className="bg-status-in-progress hover:bg-status-in-progress/90"
                                  onClick={() => {
                                    setSelectedRequest(request.id);
                                    setNewStatus('in_progress');
                                    setStatusComment('');
                                    setStatusDialogOpen(true);
                                  }}
                                >
                                  <Play className="mr-2 h-4 w-4" />
                                  Resume Work
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Status Update Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getStatusIcon(newStatus)}
              {newStatus === 'in_progress' && 'Start Work on Request'}
              {newStatus === 'waiting_clarification' && 'Request Clarification'}
              {newStatus === 'completed' && 'Mark as Completed'}
            </DialogTitle>
            <DialogDescription>
              {newStatus === 'in_progress' && 'Add a comment to indicate you are starting work on this request.'}
              {newStatus === 'waiting_clarification' && 'Describe what clarification you need from the client or team.'}
              {newStatus === 'completed' && 'Add a summary of the work completed.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="statusComment" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Comment <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="statusComment"
                value={statusComment}
                onChange={(e) => setStatusComment(e.target.value)}
                placeholder={
                  newStatus === 'in_progress'
                    ? "e.g., Beginning implementation of the requested changes..."
                    : newStatus === 'waiting_clarification'
                      ? "e.g., Need clarification on the expected behavior when..."
                      : "e.g., Successfully implemented all requested changes. Testing completed."
                }
                className="min-h-[120px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleStatusUpdate}
              disabled={updateRequest.isPending || !statusComment.trim()}
              className={
                newStatus === 'in_progress' ? 'bg-status-in-progress hover:bg-status-in-progress/90' :
                  newStatus === 'waiting_clarification' ? 'bg-status-pending hover:bg-status-pending/90' :
                    'bg-status-completed hover:bg-status-completed/90'
              }
            >
              {updateRequest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {newStatus === 'in_progress' && 'Start Work'}
              {newStatus === 'waiting_clarification' && 'Request Clarification'}
              {newStatus === 'completed' && 'Mark Complete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
