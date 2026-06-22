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
        <div className="flex items-center justify-between border-b px-6 py-4">
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
      <div className="flex items-center justify-between border-b px-6 py-4">
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
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[120px]">Ticket #</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="hidden md:table-cell">Description</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Date</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {recentRequests.map((request) => (
            <TableRow key={request.id} className="table-row-interactive">
              <TableCell className="font-medium text-primary">
                <Link to={`/developers/requests/${request.id}`} className="hover:underline">
                  {request.ticket_number}
                </Link>
              </TableCell>
              <TableCell>
                <div>
                  <p className="font-medium">{request.client?.name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">{request.client?.branch}</p>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell max-w-[300px]">
                <p className="truncate text-sm text-muted-foreground">
                  {request.change_description}
                </p>
              </TableCell>
              <TableCell>
                <PriorityBadge priority={request.priority} />
              </TableCell>
              <TableCell>
                <StatusBadge status={request.status} />
              </TableCell>
              <TableCell className="hidden lg:table-cell text-muted-foreground">
                {format(new Date(request.date_requested), 'MMM d, yyyy')}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
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
