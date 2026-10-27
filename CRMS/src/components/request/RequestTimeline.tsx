import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@crms/components/ui/card';
import { Badge } from '@crms/components/ui/badge';
import { Skeleton } from '@crms/components/ui/skeleton';
import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  UserPlus,
  PlayCircle,
  Flag,
  MessageSquare,
  Upload,
  Edit3,
  AlertCircle
} from 'lucide-react';
import { cn } from '@crms/lib/utils';

interface AuditLog {
  id: string;
  action: string;
  action_label: string;
  details: string | null;
  previous_value: string | null;
  new_value: string | null;
  created_at: string;
  user_id: string | null;
  metadata: Record<string, unknown> | null;
  profiles: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface RequestTimelineProps {
  requestId: string;
  className?: string;
}

const actionIcons: Record<string, React.ReactNode> = {
  created: <FileText className="h-4 w-4" />,
  approved: <CheckCircle2 className="h-4 w-4" />,
  rejected: <XCircle className="h-4 w-4" />,
  status_changed: <Clock className="h-4 w-4" />,
  assigned: <UserPlus className="h-4 w-4" />,
  started: <PlayCircle className="h-4 w-4" />,
  completed: <Flag className="h-4 w-4" />,
  comment_added: <MessageSquare className="h-4 w-4" />,
  document_uploaded: <Upload className="h-4 w-4" />,
  updated: <Edit3 className="h-4 w-4" />,
};

const actionColors: Record<string, string> = {
  created: 'bg-blue-500',
  approved: 'bg-emerald-500',
  rejected: 'bg-destructive',
  status_changed: 'bg-amber-500',
  assigned: 'bg-violet-500',
  started: 'bg-cyan-500',
  completed: 'bg-status-completed',
  comment_added: 'bg-muted-foreground',
  document_uploaded: 'bg-indigo-500',
  updated: 'bg-orange-500',
};

const API_URL = '/api/crms';

export function RequestTimeline({ requestId, className }: RequestTimelineProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch(`${API_URL}/audit_logs?request_id=${requestId}`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data as AuditLog[]);
        }
      } catch (error) {
        console.error('Error fetching audit logs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();

    // Realtime disabled for local dev fallback
    return () => { };
  }, [requestId]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Request Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Request Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No activity recorded yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Request Timeline
          <Badge variant="secondary" className="ml-2 text-xs">
            {logs.length} events
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/50 via-border to-transparent" />

          <div className="space-y-6">
            {logs.map((log) => (
              <div key={log.id} className="relative flex gap-4 animate-fade-in">
                {/* Icon */}
                <div
                  className={cn(
                    'relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-primary-foreground shadow-md',
                    actionColors[log.action] || 'bg-muted-foreground'
                  )}
                >
                  {actionIcons[log.action] || <FileText className="h-4 w-4" />}
                </div>

                {/* Content */}
                <div className="flex-1 pb-2">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <p className="font-medium text-sm">{log.action_label}</p>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>

                  {log.profiles && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      by {log.profiles.name}
                    </p>
                  )}

                  {log.details && (
                    <p className="mt-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                      {log.details}
                    </p>
                  )}

                  {(log.previous_value || log.new_value) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {log.previous_value && (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                          From: {log.previous_value}
                        </Badge>
                      )}
                      {log.new_value && (
                        <Badge variant="outline" className="bg-status-approved/10 text-status-approved border-status-approved/20">
                          To: {log.new_value}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
