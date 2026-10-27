import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  History, 
  Filter, 
  Download,
  FileText,
  CheckCircle,
  XCircle,
  UserPlus,
  Play,
  Upload,
  MessageSquare,
  Edit,
  Search,
  Calendar,
} from 'lucide-react';
import { Button } from '@crms/components/ui/button';
import { Input } from '@crms/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@crms/components/ui/card';
import { Badge } from '@crms/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@crms/components/ui/select';
import { useAuditLogs, useProfiles } from '@crms/hooks/useSupabaseData';
import { Skeleton } from '@crms/components/ui/skeleton';
import { cn } from '@crms/lib/utils';

const actionIcons: Record<string, React.ElementType> = {
  created: FileText,
  updated: Edit,
  status_changed: History,
  approved: CheckCircle,
  rejected: XCircle,
  assigned: UserPlus,
  started: Play,
  completed: CheckCircle,
  document_uploaded: Upload,
  comment_added: MessageSquare,
};

const actionColors: Record<string, string> = {
  created: 'bg-primary/10 text-primary',
  updated: 'bg-muted text-muted-foreground',
  status_changed: 'bg-status-pending/10 text-status-pending',
  approved: 'bg-status-approved/10 text-status-approved',
  rejected: 'bg-status-rejected/10 text-status-rejected',
  assigned: 'bg-status-in-progress/10 text-status-in-progress',
  started: 'bg-status-pending/10 text-status-pending',
  completed: 'bg-status-completed/10 text-status-completed',
  document_uploaded: 'bg-primary/10 text-primary',
  comment_added: 'bg-muted text-muted-foreground',
};

export default function AuditLog() {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');

  const { data: auditLogs, isLoading } = useAuditLogs();
  const { data: profiles } = useProfiles();

  const filteredLogs = (auditLogs || []).filter((log) => {
    const matchesSearch =
      log.change_request?.ticket_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action_label?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    const matchesUser = userFilter === 'all' || log.user_id === userFilter;

    return matchesSearch && matchesAction && matchesUser;
  });

  const uniqueUsers = profiles || [];

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <History className="h-6 w-6" />
              Audit Log
            </h1>
            <p className="text-muted-foreground">
              Complete history of all changes and actions across the system
            </p>
          </div>
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6" />
            Audit Log
          </h1>
          <p className="text-muted-foreground">
            Complete history of all changes and actions across the system
          </p>
        </div>
        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Export Log
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by ticket, action, or details..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Action Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="created">Created</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="started">Started</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="status_changed">Status Changed</SelectItem>
                <SelectItem value="document_uploaded">Document Uploaded</SelectItem>
              </SelectContent>
            </Select>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="User" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {uniqueUsers.map((user) => (
                  <SelectItem key={user.id} value={user.user_id || user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Timeline</CardTitle>
          <CardDescription>
            Showing {filteredLogs.length} entries
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />

            <div className="space-y-6">
              {filteredLogs.map((log) => {
                const Icon = actionIcons[log.action] || History;
                return (
                  <div key={log.id} className="relative flex gap-4 pl-0">
                    {/* Icon */}
                    <div
                      className={cn(
                        'relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-4 border-background',
                        actionColors[log.action] || 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 space-y-2 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{log.action_label}</span>
                        {log.change_request?.ticket_number && (
                          <Badge variant="outline" className="text-xs">
                            {log.change_request.ticket_number}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{log.details}</p>
                      {(log.previous_value || log.new_value) && (
                        <div className="flex items-center gap-2 text-xs">
                          {log.previous_value && (
                            <Badge variant="secondary" className="bg-muted">
                              From: {log.previous_value}
                            </Badge>
                          )}
                          {log.new_value && (
                            <Badge variant="secondary" className="bg-primary/10 text-primary">
                              To: {log.new_value}
                            </Badge>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                        <span className="text-muted-foreground/60">
                          ({formatDistanceToNow(new Date(log.created_at), { addSuffix: true })})
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {filteredLogs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <History className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No audit entries found</p>
              <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
