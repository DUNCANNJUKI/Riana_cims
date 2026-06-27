import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Clock,
  CheckCircle,
  XCircle,
  Pause,
  Eye,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@crms/components/ui/button';
import { Card, CardContent } from '@crms/components/ui/card';
import { Badge } from '@crms/components/ui/badge';
import { StatusBadge } from '@crms/components/common/StatusBadge';
import { PriorityBadge } from '@crms/components/common/PriorityBadge';
import { Skeleton } from '@crms/components/ui/skeleton';
import { Textarea } from '@crms/components/ui/textarea';
import { Label } from '@crms/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@crms/components/ui/dialog';
import { useToast } from '@crms/hooks/use-toast';
import { useChangeRequests, useUpdateChangeRequest } from '@crms/hooks/useSupabaseData';
import type { Database } from '@crms/integrations/supabase/types';

type RequestStatus = Database['public']['Enums']['request_status'];
type PriorityLevel = Database['public']['Enums']['priority_level'];

export default function Approvals() {
  const { toast } = useToast();
  const { data: changeRequests, isLoading } = useChangeRequests();
  const updateRequest = useUpdateChangeRequest();

  // Hold comment dialog state
  const [holdDialogOpen, setHoldDialogOpen] = useState(false);
  const [holdComment, setHoldComment] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<{ id: string; ticketNumber: string } | null>(null);

  const pendingRequests = (changeRequests || []).filter((r) => r.status === 'pending_approval');
  const waitingRequests = (changeRequests || []).filter((r) => ['waiting', 'waiting_clarification'].includes(String(r.status)));

  const handleQuickAction = async (action: 'approve' | 'reject' | 'waiting', requestId: string, ticketNumber: string, comment?: string) => {
    const statusMap: Record<string, RequestStatus | 'waiting_clarification'> = {
      approve: 'approved',
      reject: 'rejected',
      waiting: 'waiting_clarification',
    } as const;

    try {
      const updateData: any = {
        id: requestId,
        status: statusMap[action] as any,
      };

      // Add comment if holding
      if (action === 'waiting' && comment) {
        updateData.approval_comment = comment;
      }

      await updateRequest.mutateAsync(updateData);

      const messages = {
        approve: `${ticketNumber} has been approved`,
        reject: `${ticketNumber} has been rejected`,
        waiting: `${ticketNumber} has been placed on hold`,
      };

      toast({
        title: action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : 'On Hold',
        description: messages[action],
      });

      // Close dialog and reset state
      setHoldDialogOpen(false);
      setHoldComment('');
      setSelectedRequest(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update request status',
        variant: 'destructive',
      });
    }
  };

  const handleHoldClick = (requestId: string, ticketNumber: string) => {
    setSelectedRequest({ id: requestId, ticketNumber });
    setHoldComment('');
    setHoldDialogOpen(true);
  };

  const handleConfirmHold = () => {
    if (selectedRequest) {
      handleQuickAction('waiting', selectedRequest.id, selectedRequest.ticketNumber, holdComment);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Pending Approvals</h1>
          <p className="text-muted-foreground">Review and approve change requests from clients</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Pending Approvals</h1>
        <p className="text-muted-foreground">
          Review and approve change requests from clients
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-status-pending/30 bg-status-pending-bg/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-status-pending/10 p-3">
                <Clock className="h-6 w-6 text-status-pending" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingRequests.length}</p>
                <p className="text-sm text-muted-foreground">Pending Approval</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-status-waiting/30 bg-status-waiting-bg/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-status-waiting/10 p-3">
                <Pause className="h-6 w-6 text-status-waiting" />
              </div>
              <div>
                <p className="text-2xl font-bold">{waitingRequests.length}</p>
                <p className="text-sm text-muted-foreground">On Hold</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-muted p-3">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingRequests.length + waitingRequests.length}</p>
                <p className="text-sm text-muted-foreground">Total Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Requests */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Awaiting Your Review</h2>
        {pendingRequests.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle className="mx-auto h-12 w-12 text-status-approved/50 mb-4" />
              <p className="text-muted-foreground">No pending approvals</p>
              <p className="text-sm text-muted-foreground">You're all caught up!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {pendingRequests.map((request) => (
              <Card key={request.id} className="card-interactive">
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <Link to={`/developers/requests/${request.id}`} className="font-semibold text-primary hover:underline">
                          {request.ticket_number}
                        </Link>
                        <StatusBadge status={request.status as RequestStatus} />
                        <PriorityBadge priority={request.priority as PriorityLevel} />
                      </div>
                      <div>
                        <p className="font-medium">{request.client?.name || 'Unknown Client'}</p>
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
                      <p className="text-xs text-muted-foreground">
                        Requested {format(new Date(request.date_requested), 'MMM d, yyyy')} •
                        Due {format(new Date(request.estimated_completion_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:flex-col">
                      <Link to={`/developers/requests/${request.id}`}>
                        <Button variant="outline" size="sm" className="w-full">
                          <Eye className="mr-2 h-4 w-4" />
                          Review
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => handleQuickAction('approve', request.id, request.ticket_number)}
                        disabled={updateRequest.isPending || request.is_chargeable}
                        title={request.is_chargeable ? "Chargeable requests must be reviewed manually" : ""}
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Quick Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => handleHoldClick(request.id, request.ticket_number)}
                        disabled={updateRequest.isPending}
                      >
                        <Pause className="mr-2 h-4 w-4" />
                        Hold
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="w-full"
                        onClick={() => handleQuickAction('reject', request.id, request.ticket_number)}
                        disabled={updateRequest.isPending}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Waiting/On Hold Requests */}
      {waitingRequests.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">On Hold</h2>
          <div className="grid gap-4">
            {waitingRequests.map((request) => (
              <Card key={request.id} className="border-status-waiting/30">
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <Link to={`/developers/requests/${request.id}`} className="font-semibold text-primary hover:underline">
                          {request.ticket_number}
                        </Link>
                        <StatusBadge status={request.status as RequestStatus} />
                        <PriorityBadge priority={request.priority as PriorityLevel} />
                      </div>
                      <p className="font-medium">{request.client?.name || 'Unknown Client'}</p>
                      <p className="text-sm text-muted-foreground">{request.approval_comment || 'No comment'}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleQuickAction('approve', request.id, request.ticket_number)}
                        disabled={updateRequest.isPending}
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Approve Now
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleQuickAction('reject', request.id, request.ticket_number)}
                        disabled={updateRequest.isPending}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Hold Comment Dialog */}
      <Dialog open={holdDialogOpen} onOpenChange={setHoldDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Place Request On Hold</DialogTitle>
            <DialogDescription>
              Add a comment explaining why this request is being placed on hold. This will be sent to the requester.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="hold-comment">Comment (required for hold)</Label>
              <Textarea
                id="hold-comment"
                placeholder="Explain why this request is being placed on hold..."
                value={holdComment}
                onChange={(e) => setHoldComment(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
            {selectedRequest && (
              <p className="text-sm text-muted-foreground">
                Request: <span className="font-medium text-foreground">{selectedRequest.ticketNumber}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmHold}
              disabled={!holdComment.trim() || updateRequest.isPending}
            >
              <Pause className="mr-2 h-4 w-4" />
              Confirm Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
