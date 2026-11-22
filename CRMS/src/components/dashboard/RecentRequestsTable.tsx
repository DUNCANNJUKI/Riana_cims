import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { MoreHorizontal, ExternalLink } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@crms/components/ui/table';
import { Button } from '@crms/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@crms/components/ui/dropdown-menu';
import { StatusBadge } from '@crms/components/common/StatusBadge';
import { PriorityBadge } from '@crms/components/common/PriorityBadge';
import { useChangeRequests } from '@crms/hooks/useSupabaseData';
import { Skeleton } from '@crms/components/ui/skeleton';

export function RecentRequestsTable() {
  const { data: allRequests, isLoading } = useChangeRequests();
  const recentRequests = allRequests?.slice(0, 5) || [];

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-6">
          <div>
            <h3 className="font-semibold">Recent Change Requests</h3>
            <p className="text-sm text-muted-foreground">Latest requests requiring attention</p>
          </div>
        </div>
        <div className="p-6">
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-6">
        <div>
          <h3 className="font-semibold">Recent Change Requests</h3>
          <p className="text-sm text-muted-foreground">Latest requests requiring attention</p>
        </div>
        <Link to="/developers/requests">
          <Button variant="outline" size="sm">
            View All
            <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
      <Table mobileLayout="cards" aria-label="Recent change requests">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[120px]">Ticket #</TableHead>
            <TableHead>Client</TableHead>
            <TableHead >Description</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead >Date</TableHead>
            <TableHead className="w-[50px]"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recentRequests.map((request) => (
            <TableRow key={request.id} className="table-row-interactive">
              <TableCell mobileLabel="Ticket #" className="font-medium text-primary">
                <Link to={`/developers/requests/${request.id}`} className="hover:underline">
                  {request.ticket_number}
                </Link>
              </TableCell>
              <TableCell mobileLabel="Client">
                <div>
                  <p className="font-medium">{request.client?.name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">{request.client?.branch}</p>
                </div>
              </TableCell>
              <TableCell mobileLabel="Description" className="max-w-[300px]">
                <p className="whitespace-normal break-words text-sm text-muted-foreground">
                  {request.change_description}
                </p>
              </TableCell>
              <TableCell mobileLabel="Priority">
                <PriorityBadge priority={request.priority} />
              </TableCell>
              <TableCell mobileLabel="Status">
                <StatusBadge status={request.status} />
              </TableCell>
              <TableCell mobileLabel="Date" className="text-muted-foreground">
                {format(new Date(request.date_requested), 'MMM d, yyyy')}
              </TableCell>
              <TableCell mobileLabel="Actions">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${request.ticket_number}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link to={`/developers/requests/${request.id}`}>View Details</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem>Edit Request</DropdownMenuItem>
                    <DropdownMenuItem>Assign Developer</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
          {recentRequests.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8">
                <p className="text-muted-foreground">No change requests yet</p>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
