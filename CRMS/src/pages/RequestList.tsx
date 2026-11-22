import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Plus, Search, Filter, Loader2, FileText, CheckCircle, Clock, AlertCircle, Eye, ArrowRight, Download, ArrowUpDown, MoreHorizontal, Edit } from 'lucide-react';
import { PageLoader } from '@crms/components/common/CompanyLogoLoader';
import { Button } from '@crms/components/ui/button';
import { Input } from '@crms/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@crms/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@crms/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@crms/components/ui/dropdown-menu';
import { useChangeRequests } from '@crms/hooks/useSupabaseData';
import { StatusBadge } from '@crms/components/common/StatusBadge';
import { PriorityBadge } from '@crms/components/common/PriorityBadge';
import { Alert, AlertDescription, AlertTitle } from '@crms/components/ui/alert';
import { useCurrentUserRole } from '@crms/hooks/useCurrentUserRole';
import { downloadRequestsCsv, filterRequests, type TicketSort } from '@crms/lib/requestListData';
import { Constants } from '@crms/integrations/supabase/types';

const PAGE_SIZE = 25;

export default function RequestList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [ticketSort, setTicketSort] = useState<TicketSort>(null);
  const [page, setPage] = useState(1);
  const { canCreateRequests, canAssignDevelopers, isAdmin } = useCurrentUserRole();

  const { data: changeRequests, isLoading, error, refetch } = useChangeRequests();

  const filteredRequests = useMemo(
    () => filterRequests(changeRequests || [], searchQuery, statusFilter, priorityFilter, ticketSort),
    [changeRequests, searchQuery, statusFilter, priorityFilter, ticketSort],
  );
  const pageCount = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleRequests = filteredRequests.slice(pageStart, pageStart + PAGE_SIZE);

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
        {canCreateRequests && <Link to="/developers/requests/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Request
          </Button>
        </Link>}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by ticket, client, or description..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            aria-label="Search requests"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[160px]" aria-label="Filter by status">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
              <SelectItem value="all">All Status</SelectItem>
              {Constants.public.Enums.request_status.map((status) => (
                <SelectItem key={status} value={status}>{status.replace(/_/g, ' ')}</SelectItem>
              ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={(value) => { setPriorityFilter(value); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-[140px]" aria-label="Filter by priority">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { setTicketSort(ticketSort === 'asc' ? 'desc' : 'asc'); setPage(1); }} aria-label={`Sort ticket numbers ${ticketSort === 'asc' ? 'descending' : 'ascending'}`}>
            <ArrowUpDown className="mr-2 h-4 w-4" /> Ticket # {ticketSort === 'asc' ? '↑' : '↓'}
          </Button>
          <Button variant="outline" size="icon" title="Export filtered requests as CSV" aria-label="Export requests" disabled={!filteredRequests.length} onClick={() => downloadRequestsCsv(filteredRequests, 'change-requests.csv')}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Requests could not be loaded</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {error.message}
            <Button variant="outline" size="sm" onClick={() => void refetch()}>Try again</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table mobileLayout="cards" aria-label="Change requests">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[120px]" aria-sort={ticketSort === 'asc' ? 'ascending' : ticketSort === 'desc' ? 'descending' : 'none'}>
                <Button variant="ghost" size="sm" className="-ml-3 h-8 font-medium" onClick={() => { setTicketSort(ticketSort === 'asc' ? 'desc' : 'asc'); setPage(1); }}>
                  Ticket #
                  <ArrowUpDown className="ml-2 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>Client</TableHead>
              <TableHead className="">Description</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="">Assigned To</TableHead>
              <TableHead className="">Requested</TableHead>
              <TableHead className="">Due Date</TableHead>
              <TableHead className="w-[50px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRequests.map((request) => (
              <TableRow key={request.id} className="table-row-interactive">
                <TableCell mobileLabel="Ticket #" className="font-medium">
                  <Link
                    to={`/developers/requests/${request.id}`}
                    className="text-primary hover:underline"
                  >
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
                  <p className="text-sm text-muted-foreground">
                    {request.change_description}
                  </p>
                </TableCell>
                <TableCell mobileLabel="Priority">
                  <PriorityBadge priority={request.priority} />
                </TableCell>
                <TableCell mobileLabel="Status">
                  <StatusBadge status={request.status} />
                </TableCell>
                <TableCell mobileLabel="Assigned To" className="">
                  {request.assigned_developer ? (
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
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
                <TableCell mobileLabel="Requested" className="text-muted-foreground">
                  {format(new Date(request.date_requested), 'MMM d, yyyy')}
                </TableCell>
                <TableCell mobileLabel="Due Date" className="">
                  <span className="text-sm">
                    {format(new Date(request.estimated_completion_date), 'MMM d, yyyy')}
                  </span>
                </TableCell>
                <TableCell mobileLabel="Actions">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Request actions" aria-label="Request actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                      <DropdownMenuItem asChild>
                        <Link to={`/developers/requests/${request.id}`} className="flex items-center">
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </Link>
                      </DropdownMenuItem>
                      {isAdmin && <DropdownMenuItem asChild>
                        <Link to={`/developers/requests/${request.id}?edit=true`} className="flex items-center">
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Request
                        </Link>
                      </DropdownMenuItem>}
                      {canAssignDevelopers && request.status === 'approved' && <DropdownMenuItem asChild>
                        <Link to={`/developers/requests/${request.id}?assign=true`} className="flex items-center">
                          <CheckCircle className="mr-2 h-4 w-4" />
                          Assign Developer
                        </Link>
                      </DropdownMenuItem>}
                      </DropdownMenuGroup>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Showing {filteredRequests.length ? pageStart + 1 : 0}–{Math.min(pageStart + PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length} matching requests
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
