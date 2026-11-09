import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@crms/components/ui/dialog';
import { Button } from '@crms/components/ui/button';
import { Input } from '@crms/components/ui/input';
import { Label } from '@crms/components/ui/label';
import { Badge } from '@crms/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@crms/components/ui/select';
import { useClients, useClientScope } from '@crms/hooks/useSupabaseData';
import { useToast } from '@crms/hooks/use-toast';
import { apiRequest } from '@crms/lib/apiRequest';
import { Building2, User, Phone, Mail, Send, Save, Copy, Check, CheckCircle2, RefreshCw } from 'lucide-react';

interface ClientRequestInitiationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const ClientRequestInitiationDialog: React.FC<ClientRequestInitiationDialogProps> = ({
  open,
  onOpenChange,
  onSuccess,
}) => {
  const { toast } = useToast();
  const { data: clients = [], isLoading: loadingClients } = useClients();

  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const { data: scope, isLoading: loadingScope } = useClientScope(selectedClientId || undefined);

  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');

  const [repName, setRepName] = useState('');
  const [repPhone, setRepPhone] = useState('');
  const [repEmail, setRepEmail] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [createdResult, setCreatedResult] = useState<{
    invitation: any;
    submissionUrl: string;
    sent?: {
      smsStatus?: string;
      emailStatus?: string;
      success?: boolean;
    } | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Auto-fill contact person when client changes
  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId);
    setSelectedBranchId('');
    setSelectedDepartmentId('');

    const client = clients.find((c: any) => c.id === clientId);
    if (client) {
      const contactPerson = client.contact_person_name || client.contact_person || '';
      const contactPhone = client.contact_person_phone || client.contact_phone || '';
      const contactEmail = client.contact_person_email || client.contact_email || '';
      if (contactPerson) setRepName(contactPerson);
      if (contactPhone) setRepPhone(contactPhone);
      if (contactEmail) setRepEmail(contactEmail);
    }
  };

  const handleBranchChange = (branchId: string) => {
    setSelectedBranchId(branchId);
    setSelectedDepartmentId('');
    if (branchId && branchId !== 'all') {
      const branch = scope?.branches?.find((b: any) => b.id === branchId);
      if (branch && branch.contact_person_name) {
        setRepName(branch.contact_person_name);
        if (branch.contact_phone) setRepPhone(branch.contact_phone);
        if (branch.contact_email) setRepEmail(branch.contact_email);
      }
    }
  };

  const validate = () => {
    if (!selectedClientId) {
      toast({ title: 'Validation Error', description: 'Please select a client.', variant: 'destructive' });
      return false;
    }
    if (!repName.trim()) {
      toast({ title: 'Validation Error', description: 'Client representative name is required.', variant: 'destructive' });
      return false;
    }
    if (!repPhone.trim()) {
      toast({ title: 'Validation Error', description: 'Client representative phone number is required.', variant: 'destructive' });
      return false;
    }
    if (!repEmail.trim() || !repEmail.includes('@')) {
      toast({ title: 'Validation Error', description: 'A valid client representative email is required.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleSubmit = async (sendImmediately: boolean) => {
    if (!validate()) return;

    try {
      setSubmitting(true);
      const res = await apiRequest('/api/crms/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: selectedClientId,
          branch_id: (selectedBranchId && selectedBranchId !== 'all') ? selectedBranchId : null,
          department_id: (selectedDepartmentId && selectedDepartmentId !== 'all') ? selectedDepartmentId : null,
          client_representative_name: repName.trim(),
          client_representative_phone: repPhone.trim(),
          client_representative_email: repEmail.trim(),
          send_immediately: sendImmediately,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create change request invitation.');

      setCreatedResult({
        invitation: data.invitation,
        submissionUrl: data.submission_url,
        sent: data.sent,
      });

      let toastDesc = 'Invitation generated.';
      if (sendImmediately) {
        if (data.sent?.smsStatus === 'sent' && data.sent?.emailStatus === 'sent') {
          toastDesc = `SMS sent to ${repPhone} and Email sent to ${repEmail}.`;
        } else if (data.sent?.smsStatus === 'sent') {
          toastDesc = `SMS sent to ${repPhone}. Email status: ${data.sent?.emailStatus || 'pending'}`;
        } else if (data.sent?.emailStatus === 'sent') {
          toastDesc = `Email sent to ${repEmail}. SMS status: ${data.sent?.smsStatus || 'pending'}`;
        } else {
          toastDesc = `Submission link created. Delivery status: SMS (${data.sent?.smsStatus || 'pending'}), Email (${data.sent?.emailStatus || 'pending'}).`;
        }
      } else {
        toastDesc = 'Draft invitation saved. You can send it whenever ready.';
      }

      toast({
        title: sendImmediately ? 'Invitation Dispatched' : 'Draft Invitation Created',
        description: toastDesc,
      });

      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast({
        title: 'Operation Failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    if (!createdResult) return;
    navigator.clipboard.writeText(createdResult.submissionUrl);
    setCopied(true);
    toast({ title: 'Link Copied', description: 'Client submission URL copied to clipboard.' });
    setTimeout(() => setCopied(false), 2500);
  };

  const resetForm = () => {
    setSelectedClientId('');
    setSelectedBranchId('');
    setSelectedDepartmentId('');
    setRepName('');
    setRepPhone('');
    setRepEmail('');
    setCreatedResult(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const filteredDepartments = scope?.departments?.filter(
    (d: any) => !selectedBranchId || selectedBranchId === 'all' || d.branch_id === selectedBranchId
  ) || [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-teal-600" />
            Create Client Change Request Invitation
          </DialogTitle>
          <DialogDescription>
            Initiate an official change request on behalf of your assigned client. A secure, single-use link will be generated for the designated client representative.
          </DialogDescription>
        </DialogHeader>

        {createdResult ? (
          <div className="space-y-4 py-3">
            <div className="bg-teal-50 dark:bg-teal-950/40 p-4 rounded-lg border border-teal-200 dark:border-teal-900 text-center">
              <CheckCircle2 className="w-10 h-10 text-teal-600 mx-auto mb-2" />
              <p className="font-bold text-teal-900 dark:text-teal-200 text-base">
                Invitation Successfully Generated
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Reference: <strong className="font-mono text-teal-700">{createdResult.invitation.request_reference}</strong>
              </p>
              {createdResult.sent && (
                <div className="flex items-center justify-center gap-2 mt-3 text-xs">
                  <Badge variant={createdResult.sent.smsStatus === 'sent' ? 'default' : 'secondary'} className={createdResult.sent.smsStatus === 'sent' ? 'bg-emerald-600 text-white' : ''}>
                    SMS: {createdResult.sent.smsStatus || 'draft'}
                  </Badge>
                  <Badge variant={createdResult.sent.emailStatus === 'sent' ? 'default' : 'secondary'} className={createdResult.sent.emailStatus === 'sent' ? 'bg-emerald-600 text-white' : ''}>
                    Email: {createdResult.sent.emailStatus || 'draft'}
                  </Badge>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase text-slate-500">Secure Client Submission Link</Label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={createdResult.submissionUrl}
                  className="font-mono text-xs bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                />
                <Button variant="outline" size="sm" onClick={handleCopyLink} className="flex-shrink-0">
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                This link expires on {new Date(createdResult.invitation.expires_at).toLocaleDateString()}.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button onClick={handleClose} className="bg-teal-700 hover:bg-teal-800 text-white w-full sm:w-auto">
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Client Selection */}
            <div className="space-y-1.5">
              <Label htmlFor="clientSelect" className="font-semibold text-xs">
                Select Client <span className="text-red-500">*</span>
              </Label>
              <Select value={selectedClientId} onValueChange={handleClientChange} disabled={loadingClients}>
                <SelectTrigger id="clientSelect">
                  <SelectValue placeholder={loadingClients ? 'Loading clients...' : 'Choose registered client'} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {clients.map((c: any) => {
                    const clientName = (c.client_name || c.name || '').trim();
                    const branchName = c.branch ? ` (${c.branch})` : '';
                    const label = clientName ? `${clientName}${branchName}` : (c.branch || 'Unknown Client');
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Branch and Department */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="branchSelect" className="font-semibold text-xs">Branch (Optional)</Label>
                <Select
                  value={selectedBranchId}
                  onValueChange={handleBranchChange}
                  disabled={!selectedClientId || loadingScope}
                >
                  <SelectTrigger id="branchSelect">
                    <SelectValue placeholder={loadingScope ? 'Loading branches...' : 'All / Main Branch'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-52">
                    <SelectItem value="all">Main / All Branches</SelectItem>
                    {scope?.branches?.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.branch_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="deptSelect" className="font-semibold text-xs">Department (Optional)</Label>
                <Select
                  value={selectedDepartmentId}
                  onValueChange={setSelectedDepartmentId}
                  disabled={!selectedClientId || loadingScope}
                >
                  <SelectTrigger id="deptSelect">
                    <SelectValue placeholder={loadingScope ? 'Loading departments...' : 'All Departments'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-52">
                    <SelectItem value="all">All Departments</SelectItem>
                    {filteredDepartments.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.department_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Representative Details */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Designated Client Representative
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="repName" className="font-semibold text-xs flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-teal-600" /> Representative Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="repName"
                  placeholder="e.g. John Doe"
                  value={repName}
                  onChange={(e) => setRepName(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="repPhone" className="font-semibold text-xs flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-teal-600" /> Phone Number (SMS) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="repPhone"
                    placeholder="e.g. +254 712 345678"
                    value={repPhone}
                    onChange={(e) => setRepPhone(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="repEmail" className="font-semibold text-xs flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-teal-600" /> Email Address <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="repEmail"
                    type="email"
                    placeholder="e.g. representative@client.com"
                    value={repEmail}
                    onChange={(e) => setRepEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-4 flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => handleSubmit(false)}
                className="w-full sm:w-auto"
              >
                <Save className="w-4 h-4 mr-2" /> Save as Draft
              </Button>
              <Button
                type="button"
                disabled={submitting}
                onClick={() => handleSubmit(true)}
                className="w-full sm:w-auto bg-teal-700 hover:bg-teal-800 text-white"
              >
                {submitting ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Send Invitation to Client
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ClientRequestInitiationDialog;
