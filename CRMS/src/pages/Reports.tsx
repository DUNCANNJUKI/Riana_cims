import { useState } from 'react';
import { format } from 'date-fns';
import {
  Download,
  Filter,
  BarChart3,
  PieChart,
  TrendingUp,
  Calendar,
  FileText,
  FileCheck,
} from 'lucide-react';
import { Button } from '@crms/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@crms/components/ui/card';
import { Input } from '@crms/components/ui/input';
import { Label } from '@crms/components/ui/label';
import {
  Select,
  SelectContent,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@crms/components/ui/tabs';
import { StatusBadge } from '@crms/components/common/StatusBadge';
import { PriorityBadge } from '@crms/components/common/PriorityBadge';
import { AnalyticsCharts } from '@crms/components/reports/AnalyticsCharts';
import { useChangeRequests, useClients } from '@crms/hooks/useSupabaseData';
import { Skeleton } from '@crms/components/ui/skeleton';
import { generateChangeRequestPDF, generateCompletionReportPDF, generateRequestSummaryPDF, downloadPDF } from '@crms/lib/pdfGenerator';
import { useToast } from '@crms/hooks/use-toast';
import { downloadRequestsCsv } from '@crms/lib/requestListData';
import { errorMessage } from '@crms/lib/utils';

export default function Reports() {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [developerFilter, setDeveloperFilter] = useState('all');
  const { data: changeRequests = [], isLoading: requestsLoading } = useChangeRequests();
  const { data: clients = [], isLoading: clientsLoading } = useClients();

  const filteredRequests = changeRequests.filter((request) => {
    const requestedAt = new Date(request.date_requested || request.created_at);
    const matchesDateFrom = !dateFrom || requestedAt >= new Date(dateFrom);
    const matchesDateTo = !dateTo || requestedAt <= new Date(`${dateTo}T23:59:59`);
    const matchesClient = clientFilter === 'all' || request.client_id === clientFilter;
    const matchesStatus = statusFilter === 'all' || request.status === statusFilter;
    const matchesDeveloper = developerFilter === 'all' || request.assigned_developer_id === developerFilter;
    return matchesDateFrom && matchesDateTo && matchesClient && matchesStatus && matchesDeveloper;
  });

  const developers = Array.from(new Map(
    changeRequests
      .filter((request) => request.assigned_developer_id && request.assigned_developer?.name)
      .map((request) => [request.assigned_developer_id, request.assigned_developer]),
  ).entries());

  // Calculate summary stats
  const summary = {
    total: filteredRequests.length,
    completed: filteredRequests.filter((r) => r.status === 'completed').length,
    inProgress: filteredRequests.filter((r) => r.status === 'in_progress').length,
    pending: filteredRequests.filter((r) => r.status === 'pending_approval').length,
    chargeable: filteredRequests.filter((r) => r.is_chargeable).length,
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const doc = await generateRequestSummaryPDF(filteredRequests);
      downloadPDF(doc, 'change-request-report.pdf');
    } catch (error: unknown) {
      toast({ title: 'Export Failed', description: errorMessage(error), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadChangeRequest = async (request: typeof changeRequests[number]) => {
    const doc = await generateChangeRequestPDF(request);
    downloadPDF(doc, `${request.ticket_number}-change-request.pdf`);
    toast({
      title: 'Document Downloaded',
      description: `Change Request Form for ${request.ticket_number} has been downloaded.`,
    });
  };

  const handleDownloadCompletionReport = async (request: typeof changeRequests[number]) => {
    const doc = await generateCompletionReportPDF(request);
    downloadPDF(doc, `${request.ticket_number}-completion-report.pdf`);
    toast({
      title: 'Document Downloaded',
      description: `Completion Report for ${request.ticket_number} has been downloaded.`,
    });
  };

  const isLoading = requestsLoading || clientsLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports & Analytics</h1>
          <p className="text-muted-foreground">
            Live Developers reporting, KPI trends, and branded exports
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void handleExportPDF()} disabled={exporting || !filteredRequests.length}>
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          <Button onClick={() => downloadRequestsCsv(filteredRequests, 'change-request-report.csv')} disabled={!filteredRequests.length}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="analytics" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
          <TabsTrigger value="data" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Data
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            Documents
          </TabsTrigger>
        </TabsList>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <AnalyticsCharts />
        </TabsContent>

        {/* Data Tab */}
        <TabsContent value="data" className="space-y-6">
          {/* Filters */}
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Report Filters
              </CardTitle>
              <CardDescription>
                Configure filters to generate your report
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="space-y-2">
                  <Label>Date From</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Date To</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client</Label>
                  <Select value={clientFilter} onValueChange={setClientFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All clients" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Clients</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending_approval">Pending Approval</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Developer</Label>
                  <Select value={developerFilter} onValueChange={setDeveloperFilter}>
                    <SelectTrigger><SelectValue placeholder="All developers" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Developers</SelectItem>
                      {developers.map(([id, developer]) => (
                        <SelectItem key={id} value={id}>{developer?.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Stats */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{summary.total}</p>
                    <p className="text-sm text-muted-foreground">Total Requests</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-8 w-8 text-status-in-progress" />
                  <div>
                    <p className="text-2xl font-bold">{summary.inProgress}</p>
                    <p className="text-sm text-muted-foreground">In Progress</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-8 w-8 text-status-completed" />
                  <div>
                    <p className="text-2xl font-bold">{summary.completed}</p>
                    <p className="text-sm text-muted-foreground">Completed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Calendar className="h-8 w-8 text-status-pending" />
                  <div>
                    <p className="text-2xl font-bold">{summary.pending}</p>
                    <p className="text-sm text-muted-foreground">Pending</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <PieChart className="h-8 w-8 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{summary.chargeable}</p>
                    <p className="text-sm text-muted-foreground">Chargeable</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Data Table */}
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle>Request Details</CardTitle>
              <CardDescription>
                Showing {filteredRequests.length} requests based on your filters
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-6">
                  <Skeleton className="h-72 w-full" />
                </div>
              ) : (
              <Table mobileLayout="cards" aria-label="Change request report">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Ticket #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Contract</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Commenced</TableHead>
                    <TableHead>Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell mobileLabel="Ticket #" className="font-medium">{request.ticket_number}</TableCell>
                      <TableCell mobileLabel="Client">
                        <div>
                          <p className="font-medium">{request.client?.name || 'Unknown client'}</p>
                          <p className="text-xs text-muted-foreground">{request.client?.branch || '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell mobileLabel="Contract" className="uppercase text-xs">
                        {request.client?.contract_type || '-'}
                      </TableCell>
                      <TableCell mobileLabel="Priority">
                        <PriorityBadge priority={request.priority} />
                      </TableCell>
                      <TableCell mobileLabel="Status">
                        <StatusBadge status={request.status} />
                      </TableCell>
                      <TableCell mobileLabel="Assigned To">
                        {request.assigned_developer?.name || '-'}
                      </TableCell>
                      <TableCell mobileLabel="Requested" className="text-muted-foreground">
                        {format(new Date(request.date_requested || request.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell mobileLabel="Commenced" className="text-muted-foreground">
                        {request.commencement_date 
                          ? format(new Date(request.commencement_date), 'MMM d, yyyy') 
                          : '-'}
                      </TableCell>
                      <TableCell mobileLabel="Completed" className="text-muted-foreground">
                        {request.completion_date 
                          ? format(new Date(request.completion_date), 'MMM d, yyyy') 
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRequests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                        No requests match the selected filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-6">
          <Card className="shadow-soft">
            <CardHeader>
              <CardTitle>Document Generation</CardTitle>
              <CardDescription>
                Generate and download Change Request Forms and Completion Reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table mobileLayout="cards" aria-label="Change request documents">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Ticket #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Change Request Form</TableHead>
                    <TableHead>Completion Report</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell mobileLabel="Ticket #" className="font-medium">{request.ticket_number}</TableCell>
                      <TableCell mobileLabel="Client">{request.client?.name || 'Unknown client'}</TableCell>
                      <TableCell mobileLabel="Status">
                        <StatusBadge status={request.status} />
                      </TableCell>
                      <TableCell mobileLabel="Change Request Form">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadChangeRequest(request)}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                      </TableCell>
                      <TableCell mobileLabel="Completion Report">
                        {request.status === 'completed' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadCompletionReport(request)}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Not completed yet
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredRequests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        No live request documents are available yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
