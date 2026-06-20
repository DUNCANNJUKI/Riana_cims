import { cn } from '@/lib/utils';
import { RequestStatus } from '@/types';

interface StatusBadgeProps {
  status: RequestStatus;
  className?: string;
}

const statusConfig: Record<RequestStatus, { label: string; className: string }> = {
  pending_approval: { label: 'Pending Approval', className: 'status-pending' },
  approved: { label: 'Approved', className: 'status-approved' },
  rejected: { label: 'Rejected', className: 'status-rejected' },
  waiting: { label: 'On Hold', className: 'status-waiting' },
  assigned: { label: 'Assigned', className: 'status-assigned' },
  in_progress: { label: 'In Progress', className: 'status-in-progress' },
  completed: { label: 'Completed', className: 'status-completed' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span className={cn('status-badge', config.className, className)}>
      {config.label}
    </span>
  );
}
