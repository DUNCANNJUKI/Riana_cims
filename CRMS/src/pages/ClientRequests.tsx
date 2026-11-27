import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@crms/components/ui/card';
import { Button } from '@crms/components/ui/button';
import { Input } from '@crms/components/ui/input';
import { Badge } from '@crms/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@crms/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@crms/components/ui/table';
import {
  FileText, Plus, Search, RefreshCw, Send, CheckCircle2, Clock, AlertTriangle,
  Building2, User, Eye, FileCheck2, ShieldCheck, Copy, Check, ChevronRight
} from 'lucide-react';
import { ApiRequestError, apiRequest } from '@crms/lib/apiRequest';
import { useToast } from '@crms/hooks/use-toast';
import { ClientRequestInitiationDialog } from '@crms/components/ClientRequestInitiationDialog';
import { PrepareCompletionReportDialog } from '@crms/components/PrepareCompletionReportDialog';
import { CloseChangeRequestDialog } from '@crms/components/CloseChangeRequestDialog';
import type { ChangeRequestWithRelations } from '@crms/hooks/useSupabaseData';
import type { ClientInvitation } from '@crms/types/clientWorkflow';
import { errorMessage } from '@crms/lib/utils';

export const ClientRequests: React.FC = () => {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requests, setRequests] = useState<ChangeRequestWithRelations[]>([]);
  const [invitations, setInvitations] = useState<ClientInvitation[]>([]);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  // Dialog States
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ChangeRequestWithRelations | null>(null);

  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [reqRes, invRes, statsRes] = await Promise.all([
        apiRequest('/api/crms/change_requests'),
        apiRequest('/api/crms/invitations'),
        apiRequest('/api/crms/account-manager/stats').catch(() => null),
      ]);

      if (!reqRes.ok || !invRes.ok) throw new Error('Failed to load client requests and invitations. Please try again.');

      const reqData = await reqRes.json() as ChangeRequestWithRelations[];
      const invData = await invRes.json() as ClientInvitation[];
      const statsData = statsRes?.ok ? await statsRes.json().catch(() => null) : null;

      if (!Array.isArray(reqData) || !Array.isArray(invData)) throw new Error('The client request service returned an unexpected response. Please try again.');

      if (Array.isArray(reqData)) {
        // Filter to client requests or all for account managers
        setRequests(reqData.filter((r) => r.is_client_request || r.client_name));
      }
      if (Array.isArray(invData)) {
        setInvitations(invData);
      }
      if (statsData) {
        setStats(statsData.stats);
      }
      setLoadError(null);
    } catch (err: unknown) {
      const message = err instanceof ApiRequestError && err.status === 404
        ? 'The client request service is unavailable on this server. Ask your administrator to complete the application update, then retry.'
        : errorMessage(err);
      setLoadError(message);
      toast({
        title: 'Error Loading Requests',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleCopyInvitationLink = async (token: string) => {
    const fullUrl = `${window.location.origin}/change-request/submit/${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedToken(token);
      toast({ title: 'Client link copied', description: 'Use this link for submission, tracking and completion.' });
      setTimeout(() => setCopiedToken(null), 2500);
    } catch {
      toast({ title: 'Copy Failed', description: 'Your browser could not copy the invitation link.', variant: 'destructive' });
    }
  };


  const handleSendInvitation = async (invitationId: string) => {
    try {
      const res = await apiRequest(`/api/crms/invitations/${invitationId}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invitation.');
      toast({ title: 'Invitation Updated', description: `SMS: ${data.smsStatus || 'pending'}. Email: ${data.emailStatus || 'pending'}.` });
      fetchData();
    } catch (err: unknown) {
      toast({ title: 'Send Failed', description: errorMessage(err), variant: 'destructive' });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready_for_completion_report':
        return <Badge className="bg-blue-600 text-white">Ready for Report</Badge>;
      case 'awaiting_client_acceptance':
        return <Badge className="bg-amber-600 text-white">Awaiting Client Acceptance</Badge>;
      case 'client_accepted':
        return <Badge className="bg-emerald-600 text-white">Client Accepted</Badge>;
      case 'closed_client_accepted':
        return <Badge className="bg-teal-700 text-white">Closed & Accepted</Badge>;
      case 'client_requested_corrections':
        return <Badge variant="destructive">Corrections Requested</Badge>;
      case 'client_disputed':
        return <Badge className="bg-red-700 text-white">Disputed</Badge>;
      case 'in_progress':
        return <Badge className="bg-purple-600 text-white">In Development</Badge>;
      case 'completed':
        return <Badge className="bg-emerald-500 text-white">Development Complete</Badge>;
      case 'pending_approval':
      case 'sales_review':
        return <Badge variant="outline" className="border-amber-400 text-amber-700">Under Review</Badge>;
      default:
        return <Badge variant="outline">{status.replace(/_/g, ' ')}</Badge>;
    }
  };

  const filteredRequests = requests.filter((r) => {
    const matchesSearch =
      (r.ticket_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.client?.client_name || r.client_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.client_representative_name || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (activeTab === 'in_dev') {
      return ['approved', 'assigned', 'in_progress', 'completed'].includes(r.status);
    }
    if (activeTab === 'awaiting') {
      return ['ready_for_completion_report', 'awaiting_client_acceptance'].includes(r.status);
    }
    if (activeTab === 'accepted_closed') {
      return ['client_accepted', 'closed_client_accepted', 'closed'].includes(r.status);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-6 h-6 text-teal-600" />
            Client Change Request Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Account Manager portal for client change initiation, completion reporting, and verified acceptance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="bg-teal-700 hover:bg-teal-800 text-white font-medium"
          >
            <Plus className="w-4 h-4 mr-2" /> Create Client Change Request
          </Button>
        </div>
      </div>

      {loadError && <div role="alert" className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="font-semibold">Client requests could not be loaded</p><p className="mt-1 text-sm">{loadError}</p>{(requests.length > 0 || invitations.length > 0) && <p className="mt-1 text-sm">Previously loaded records are shown below and may be out of date.</p>}</div>
        <Button type="button" variant="outline" onClick={() => void fetchData()} disabled={loading} className="shrink-0">{loading ? 'Retrying…' : 'Retry'}</Button>
      </div>}

      {/* Metrics Cards */}
      {(!loadError || requests.length > 0 || invitations.length > 0) && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="border-slate-200 dark:border-slate-800">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 uppercase font-semibold">Total Invitations</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {invitations.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-800">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 uppercase font-semibold">In Development</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">
              {stats?.in_progress || requests.filter((r) => ['in_progress', 'assigned'].includes(r.status)).length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-800">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 uppercase font-semibold">Awaiting Acceptance</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {stats?.awaiting_acceptance || requests.filter((r) => r.status === 'awaiting_client_acceptance').length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-800">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 uppercase font-semibold">Corrections / Dispute</p>
            <p className="text-2xl font-bold text-red-600 mt-1">
              {requests.filter((r) => ['client_requested_corrections', 'client_disputed'].includes(r.status)).length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-800 col-span-2 sm:col-span-1">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-slate-500 uppercase font-semibold">Client Accepted / Closed</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {stats?.client_accepted || requests.filter((r) => ['client_accepted', 'closed_client_accepted'].includes(r.status)).length}
            </p>
          </CardContent>
        </Card>
      </div>

      }
      {/* Tabs and Search */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <TabsList className="flex-wrap bg-slate-100 dark:bg-slate-800">
            <TabsTrigger value="all">All Requests</TabsTrigger>
            <TabsTrigger value="invitations">Invitations ({invitations.length})</TabsTrigger>
            <TabsTrigger value="in_dev">In Development</TabsTrigger>
            <TabsTrigger value="awaiting">Awaiting Acceptance</TabsTrigger>
            <TabsTrigger value="accepted_closed">Accepted / Closed</TabsTrigger>
          </TabsList>

          <div className="relative w-full min-w-0 sm:w-72 sm:shrink-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search by ticket, client, rep..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>

        {/* Change Requests Table */}
        {activeTab !== 'invitations' ? (
          <Card className="border-slate-200 dark:border-slate-800">
            <CardContent className="p-0">
              <Table mobileLayout="cards" aria-label="Client change requests">
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket #</TableHead>
                    <TableHead>Title & Category</TableHead>
                    <TableHead>Client & Scope</TableHead>
                    <TableHead>Representative</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-slate-500 text-sm">
                        {loading ? 'Loading change requests...' : loadError ? 'Client requests are unavailable. Use Retry above to load them.' : 'No change requests match your criteria.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRequests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell mobileLabel="Ticket #" className="font-mono font-bold text-teal-700 dark:text-teal-400">
                          <Link to={`/developers/requests/${r.id}`} className="hover:underline">
                            {r.ticket_number}
                          </Link>
                        </TableCell>
                        <TableCell mobileLabel="Title & Category">
                          <div className="font-medium text-slate-900 dark:text-white sm:line-clamp-1">{r.title}</div>
                          <span className="text-xs text-slate-500">{r.category}</span>
                        </TableCell>
                        <TableCell mobileLabel="Client & Scope">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {r.client?.client_name || r.client_name || 'N/A'}
                          </div>
                          <div className="text-xs text-slate-500">
                            {r.branch_name ? r.branch_name : 'Main'}
                          </div>
                        </TableCell>
                        <TableCell mobileLabel="Representative">
                          <div className="text-sm font-medium">{r.client_representative_name || 'N/A'}</div>
                          <div className="text-xs text-slate-500">{r.client_representative_phone || ''}</div>
                        </TableCell>
                        <TableCell mobileLabel="Status">{getStatusBadge(r.status)}</TableCell>
                        <TableCell mobileLabel="Updated" className="text-xs text-slate-500">
                          {r.updated_at ? new Date(r.updated_at).toLocaleDateString() : 'N/A'}
                        </TableCell>
                        <TableCell mobileLabel="Actions" className="text-right">
                          <div className="flex flex-wrap items-center justify-start sm:justify-end gap-1.5">
                            <Button asChild variant="ghost" size="sm" className="h-8 px-2">
                              <Link to={`/developers/requests/${r.id}`}>
                                <Eye className="w-3.5 h-3.5 mr-1" /> View
                              </Link>
                            </Button>

                            {r.tracking_token && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCopyInvitationLink(r.tracking_token as string)}
                                className="h-8 px-2"
                              >
                                {copiedToken === r.tracking_token ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                                Share Link
                              </Button>
                            )}

                            {/* Prepare Completion Report Action */}
                            {(r.status === 'ready_for_completion_report' || r.status === 'completed' || r.status === 'awaiting_client_acceptance') && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedRequest(r);
                                  setReportDialogOpen(true);
                                }}
                                className="h-8 text-teal-700 border-teal-300 hover:bg-teal-50"
                              >
                                <FileCheck2 className="w-3.5 h-3.5 mr-1" /> Report
                              </Button>
                            )}

                            {/* Close Request Action */}
                            {r.status === 'client_accepted' && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedRequest(r);
                                  setCloseDialogOpen(true);
                                }}
                                className="h-8 bg-emerald-700 hover:bg-emerald-800 text-white"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Close
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          /* Invitations Tab */
          <Card className="border-slate-200 dark:border-slate-800">
            <CardContent className="p-0">
              <Table mobileLayout="cards" aria-label="Client request invitations">
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Client & Scope</TableHead>
                    <TableHead>Representative</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-slate-500 text-sm">
                        {loadError ? 'Invitations are unavailable. Use Retry above to load them.' : 'No invitations found. Click "+ Create Client Change Request" to initiate one.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    invitations.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell mobileLabel="Reference" className="font-mono font-bold text-teal-700 dark:text-teal-400">
                          {inv.request_reference}
                        </TableCell>
                        <TableCell mobileLabel="Client & Scope">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{inv.client_name}</div>
                          <div className="text-xs text-slate-500">{inv.branch_name || 'Main'}</div>
                        </TableCell>
                        <TableCell mobileLabel="Representative">
                          <div className="text-sm font-medium">{inv.client_representative_name}</div>
                          <div className="text-xs text-slate-500">{inv.client_representative_phone}</div>
                        </TableCell>
                        <TableCell mobileLabel="Status">
                          <Badge variant="outline" className="capitalize">
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell mobileLabel="Created" className="text-xs text-slate-500">
                          {new Date(inv.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell mobileLabel="Expires" className="text-xs text-slate-500">
                          {new Date(inv.expires_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell mobileLabel="Actions" className="text-right">
                          <div className="flex flex-wrap items-center justify-start sm:justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopyInvitationLink(inv.invitation_token)}
                              className="h-8 px-2"
                            >
                              {copiedToken === inv.invitation_token ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 mr-1" />
                              )}
                              Copy Link
                            </Button>
                            {inv.status === 'draft' && (
                              <Button
                                size="sm"
                                onClick={() => handleSendInvitation(inv.id)}
                                className="h-8 bg-teal-700 hover:bg-teal-800 text-white px-2"
                              >
                                <Send className="w-3.5 h-3.5 mr-1" /> Send
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Tabs>

      {/* Initiation Dialog */}
      <ClientRequestInitiationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={fetchData}
      />

      {/* Prepare Completion Report Dialog */}
      {selectedRequest && (
        <PrepareCompletionReportDialog
          open={reportDialogOpen}
          onOpenChange={setReportDialogOpen}
          changeRequestId={selectedRequest.id}
          ticketNumber={selectedRequest.ticket_number}
          requestTitle={selectedRequest.title || selectedRequest.ticket_number}
          confirmImplementation={Boolean(selectedRequest.account_manager_id)}
          onSuccess={fetchData}
        />
      )}

      {/* Close Request Dialog */}
      {selectedRequest && (
        <CloseChangeRequestDialog
          open={closeDialogOpen}
          onOpenChange={setCloseDialogOpen}
          changeRequestId={selectedRequest.id}
          ticketNumber={selectedRequest.ticket_number}
          requestTitle={selectedRequest.title || selectedRequest.ticket_number}
          acceptanceRecord={selectedRequest.client_acceptance}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
};

export default ClientRequests;
