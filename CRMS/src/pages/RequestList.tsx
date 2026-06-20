import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Plus, Search, Filter, Loader2, FileText, CheckCircle, Clock, AlertCircle, Eye, ArrowRight } from 'lucide-react';
import { PageLoader } from '@/components/common/CompanyLogoLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useChangeRequests } from '@/hooks/useSupabaseData';
import { StatusBadge } from '@/components/common/StatusBadge';
import { PriorityBadge } from '@/components/common/PriorityBadge';

export default function RequestList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  const { data: changeRequests, isLoading } = useChangeRequests();

  const filteredRequests = (changeRequests || []).filter((request) => {
    const matchesSearch =
      request.ticket_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.client?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.change_description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || request.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || request.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Change Requests</h1>
          <p className="text-muted-foreground">
            Manage and track all system modification requests
          </p>
        </div>
        <Link to="/requests/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Request
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by ticket, client, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending_approval">Pending Approval</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="waiting">Waiting</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon">
            <ArrowRight className="h-4 w-4" /> {/* Changed from Download to ArrowRight as per instruction context */}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[120px]">
                <Button variant="ghost" size="sm" className="-ml-3 h-8 font-medium">
                  Ticket #
                  <ArrowRight className="ml-2 h-3 w-3" /> {/* Changed from ArrowUpDown to ArrowRight as per instruction context */}
                </Button>
              </TableHead>
              <TableHead>Client</TableHead>
              <TableHead className="hidden lg:table-cell">Description</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Assigned To</TableHead>
              <TableHead className="hidden xl:table-cell">Requested</TableHead>
              <TableHead className="hidden xl:table-cell">Due Date</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRequests.map((request) => (
              <TableRow key={request.id} className="table-row-interactive">
                <TableCell className="font-medium">
                  <Link
                    to={`/requests/${request.id}`}
                    className="text-primary hover:underline"
                  >
                    {request.ticket_number}
                  </Link>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{request.client?.name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{request.client?.branch}</p>
                  </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell max-w-[300px]">
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
                <TableCell className="hidden md:table-cell">
                  {request.assigned_developer ? (
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-medium text-primary">
                          {request.assigned_developer.name ? request.assigned_developer.name.split(' ').map(n => n[0]).join('') : 'U'}
                        </span>
                      </div>
                      <span className="text-sm">{request.assigned_developer.name}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Unassigned</span>
                  )}
                </TableCell>
                <TableCell className="hidden xl:table-cell text-muted-foreground">
                  {format(new Date(request.date_requested), 'MMM d, yyyy')}
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <span className="text-sm">
                    {format(new Date(request.estimated_completion_date), 'MMM d, yyyy')}
                  </span>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ArrowRight className="h-4 w-4" /> {/* Changed from MoreHorizontal to ArrowRight as per instruction context */}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/requests/${request.id}`} className="flex items-center">
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <FileText className="mr-2 h-4 w-4" /> {/* Changed from Edit to FileText as per instruction context */}
                        Edit Request
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to={`/requests/${request.id}?assign=true`} className="flex items-center">
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Assign Developer
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive">
                        Cancel Request
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filteredRequests.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No requests found</p>
            <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
          </div>
        )}
      </div>

      {/* Pagination placeholder */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {filteredRequests.length} of {changeRequests?.length || 0} requests
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
