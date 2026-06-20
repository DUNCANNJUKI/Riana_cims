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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/common/StatusBadge';
import { PriorityBadge } from '@/components/common/PriorityBadge';
import { AnalyticsCharts } from '@/components/reports/AnalyticsCharts';
import { changeRequests, clients } from '@/data/mockData';
import { generateChangeRequestPDF, generateCompletionReportPDF, downloadPDF } from '@/lib/pdfGenerator';
import { useToast } from '@/hooks/use-toast';

export default function Reports() {
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [clientFilter, setClientFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredRequests = changeRequests.filter((request) => {
    const matchesClient = clientFilter === 'all' || request.clientId === clientFilter;
    const matchesStatus = statusFilter === 'all' || request.status === statusFilter;
    return matchesClient && matchesStatus;
  });

  // Calculate summary stats
  const summary = {
    total: filteredRequests.length,
    completed: filteredRequests.filter((r) => r.status === 'completed').length,
    inProgress: filteredRequests.filter((r) => r.status === 'in_progress').length,
    pending: filteredRequests.filter((r) => r.status === 'pending_approval').length,
    chargeable: filteredRequests.filter((r) => r.isChargeable).length,
  };

  const handleDownloadChangeRequest = (request: typeof changeRequests[0]) => {
    const doc = generateChangeRequestPDF(request as any);
    downloadPDF(doc, `${request.ticketNumber}-change-request.pdf`);
    toast({
      title: 'Document Downloaded',
      description: `Change Request Form for ${request.ticketNumber} has been downloaded.`,
    });
  };

  const handleDownloadCompletionReport = (request: typeof changeRequests[0]) => {
    const doc = generateCompletionReportPDF(request as any);
    downloadPDF(doc, `${request.ticketNumber}-completion-report.pdf`);
    toast({
      title: 'Document Downloaded',
      description: `Completion Report for ${request.ticketNumber} has been downloaded.`,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground">
            Generate reports, view analytics, and export documents
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          <Button>
            <Download className="mr-2 h-4 w-4" />
            Export Excel
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
          <Card>
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
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              </div>
            </CardContent>
          </Card>

          {/* Summary Stats */}
          <div className="grid gap-4 md:grid-cols-5">
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
          <Card>
            <CardHeader>
              <CardTitle>Request Details</CardTitle>
              <CardDescription>
                Showing {filteredRequests.length} requests based on your filters
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
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
                      <TableCell className="font-medium">{request.ticketNumber}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{request.client.name}</p>
                          <p className="text-xs text-muted-foreground">{request.client.branch}</p>
                        </div>
                      </TableCell>
                      <TableCell className="uppercase text-xs">
                        {request.client.contractType}
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={request.priority} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={request.status} />
                      </TableCell>
                      <TableCell>
                        {request.assignedDeveloper?.name || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(request.dateRequested), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {request.commencementDate 
                          ? format(new Date(request.commencementDate), 'MMM d, yyyy') 
                          : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {request.completionDate 
                          ? format(new Date(request.completionDate), 'MMM d, yyyy') 
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Document Generation</CardTitle>
              <CardDescription>
                Generate and download Change Request Forms and Completion Reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
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
                  {changeRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.ticketNumber}</TableCell>
                      <TableCell>{request.client.name}</TableCell>
                      <TableCell>
                        <StatusBadge status={request.status} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadChangeRequest(request)}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download
                        </Button>
                      </TableCell>
                      <TableCell>
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
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
