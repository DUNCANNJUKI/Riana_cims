import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock, 
  UserPlus, 
  Play,
  MessageSquare,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuditLogs } from '@/hooks/useSupabaseData';
import { Skeleton } from '@/components/ui/skeleton';

const activityIcons: Record<string, any> = {
  created: FileText,
  approved: CheckCircle,
  rejected: XCircle,
  assigned: UserPlus,
  started: Play,
  completed: CheckCircle,
  comment_added: MessageSquare,
  status_changed: History,
  updated: FileText,
  document_uploaded: FileText,
};

const activityColors: Record<string, string> = {
  created: 'bg-primary/10 text-primary',
  approved: 'bg-status-approved/10 text-status-approved',
  rejected: 'bg-status-rejected/10 text-status-rejected',
  assigned: 'bg-status-in-progress/10 text-status-in-progress',
  started: 'bg-status-pending/10 text-status-pending',
  completed: 'bg-status-completed/10 text-status-completed',
  comment_added: 'bg-muted text-muted-foreground',
  status_changed: 'bg-status-pending/10 text-status-pending',
  updated: 'bg-muted text-muted-foreground',
  document_uploaded: 'bg-primary/10 text-primary',
};

export function ActivityFeed() {
  const { data: auditLogs, isLoading } = useAuditLogs();
  const recentActivities = auditLogs?.slice(0, 5) || [];

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card">
        <div className="border-b px-6 py-4">
          <h3 className="font-semibold">Recent Activity</h3>
          <p className="text-sm text-muted-foreground">Latest updates across all requests</p>
        </div>
        <div className="p-6">
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-6 py-4">
        <h3 className="font-semibold">Recent Activity</h3>
        <p className="text-sm text-muted-foreground">Latest updates across all requests</p>
      </div>
      <div className="divide-y">
        {recentActivities.map((activity) => {
          const Icon = activityIcons[activity.action] || History;
          const colorClass = activityColors[activity.action] || 'bg-muted text-muted-foreground';
          return (
            <div key={activity.id} className="flex gap-4 px-6 py-4 hover:bg-muted/30 transition-colors">
              <div className={cn('mt-0.5 rounded-lg p-2', colorClass)}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">{activity.action_label}</p>
                <p className="text-sm text-muted-foreground">{activity.details}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
        {recentActivities.length === 0 && (
          <div className="px-6 py-8 text-center">
            <p className="text-muted-foreground">No activity yet</p>
          </div>
        )}
      </div>
      <div className="border-t p-4">
        <Link to="/audit" className="w-full text-sm text-primary hover:underline block text-center">
          View all activity
        </Link>
      </div>
    </div>
  );
}
