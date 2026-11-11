import { cn } from '@crms/lib/utils';
import { RequestStatus } from '@crms/types';

interface StatusBadgeProps {
  status: RequestStatus;
  className?: string;
}

const statusConfig: Record<RequestStatus, { label: string; className: string }> = {
  pending_approval: { label: 'Pending Approval', className: 'status-pending' },
  approved: { label: 'Approved', className: 'status-approved' },
  rejected: { label: 'Rejected', className: 'status-rejected' },
  waiting: { label: 'On Hold', className: 'status-waiting' },
  waiting_clarification: { label: 'Waiting Clarification', className: 'status-waiting' },
  assigned: { label: 'Assigned', className: 'status-assigned' },
  in_progress: { label: 'In Progress', className: 'status-in-progress' },
  completed: { label: 'Completed', className: 'status-completed' },
  sales_review: { label: 'Sales Review', className: 'status-pending' },
  senior_dev_review: { label: 'Developer Review', className: 'status-pending' },
  ready_for_completion_report: { label: 'Ready for Report', className: 'status-approved' },
  awaiting_client_acceptance: { label: 'Awaiting Client Acceptance', className: 'status-waiting' },
  client_accepted: { label: 'Client Accepted', className: 'status-completed' },
  client_requested_corrections: { label: 'Corrections Requested', className: 'status-waiting' },
  client_disputed: { label: 'Disputed', className: 'status-rejected' },
  closed_client_accepted: { label: 'Closed and Accepted', className: 'status-completed' },
  closed: { label: 'Closed', className: 'status-completed' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || { label: String(status || 'Unknown').replace(/_/g, ' '), className: 'status-waiting' };

  return (
    <span className={cn('status-badge', config.className, className)}>
      {config.label}
    </span>
  );
}
