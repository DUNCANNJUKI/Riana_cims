import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Clock3 } from 'lucide-react';
import { Badge } from '@crms/components/ui/badge';
import { Button } from '@crms/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@crms/components/ui/card';
import { Skeleton } from '@crms/components/ui/skeleton';
import { StatusBadge } from '@crms/components/common/StatusBadge';
import { useCurrentUserRole } from '@crms/hooks/useCurrentUserRole';
import { useChangeRequests } from '@crms/hooks/useSupabaseData';

export default function Pending() {
  const { data: requests = [], isLoading } = useChangeRequests();
  const role = useCurrentUserRole();

  const pending = requests.filter((request) => {
    if (role.isDeveloper) {
      return request.assigned_developer_id === role.userId
        && ['approved', 'assigned', 'in_progress', 'waiting', 'waiting_clarification'].includes(request.status);
    }
    if (role.isSales) return ['pending_approval', 'waiting', 'waiting_clarification'].includes(request.status);
    if (role.isSeniorDeveloper) {
      return ['approved', 'assigned', 'waiting', 'waiting_clarification'].includes(request.status)
        || (!request.assigned_developer_id && request.status !== 'completed' && request.status !== 'rejected');
    }
    return !['completed', 'rejected'].includes(request.status);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Clock3 className="h-6 w-6 text-primary" /> Pending Work</h1>
          <p className="text-muted-foreground">Items waiting for your approval, assignment, clarification, or completion.</p>
        </div>
        <Badge variant="secondary" className="w-fit px-3 py-1">{pending.length} pending</Badge>
      </div>

      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : pending.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-14 text-center"><AlertCircle className="mb-3 h-10 w-10 text-muted-foreground" /><p className="font-medium">Nothing is pending from your end.</p><p className="text-sm text-muted-foreground">New approvals and assignments will appear here automatically.</p></CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pending.map((request) => (
            <Card key={request.id} className="border-l-4 border-l-primary shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div><CardTitle className="text-base">{request.ticket_number}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{request.client?.name || 'Unknown client'}</p></div>
                  <StatusBadge status={request.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="line-clamp-2 text-sm">{request.change_description}</p>
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{request.assigned_developer?.name ? `Assigned to ${request.assigned_developer.name}` : 'Awaiting assignment'}</span>
                  <Button asChild size="sm" variant="outline"><Link to={`/developers/requests/${request.id}`}>Open <ArrowRight className="ml-2 h-3.5 w-3.5" /></Link></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
