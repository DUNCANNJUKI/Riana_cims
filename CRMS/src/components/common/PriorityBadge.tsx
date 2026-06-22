import { cn } from '@crms/lib/utils';
import { Priority } from '@crms/types';

interface PriorityBadgeProps {
  priority: Priority;
  showLabel?: boolean;
  className?: string;
}

const priorityConfig: Record<Priority, { label: string; className: string }> = {
  low: { label: 'Low', className: 'priority-low' },
  medium: { label: 'Medium', className: 'priority-medium' },
  high: { label: 'High', className: 'priority-high' },
  critical: { label: 'Critical', className: 'priority-critical' },
};

export function PriorityBadge({ priority, showLabel = true, className }: PriorityBadgeProps) {
  const config = priorityConfig[priority];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className={cn('priority-indicator', config.className)} />
      {showLabel && (
        <span className="text-sm font-medium capitalize">{config.label}</span>
      )}
    </div>
  );
}
