import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FileText, CheckCircle2, AlertTriangle, Clock, Building2, User, Phone, Mail,
  Upload, X, Send, ShieldCheck, ArrowRight, Eye, RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { API_URL } from '@/integrations/apiClient';

interface InvitationData {
  id: string;
  request_reference: string;
  status: string;
  expires_at: string;
  client: {
    client_name: string;
    branch_name?: string | null;
    department_name?: string | null;
    scope_label?: string | null;
  };
  client_representative: {
    name: string;
    phone: string;
    email: string;
  };
  account_manager: {
    name: string;
    email: string;
  };
  submitted_request?: {
    id: string;
    ticket_number: string;
    status: string;
  } | null;
}

interface AttachedFile {
  name: string;
  size: number;
  mime_type: string;
  base64: string;
}

export const ClientChangeRequestForm: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<{
    ticket_number: string;
    title: string;
    tracking_url?: string;
  } | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [currentBehaviour, setCurrentBehaviour] = useState('');
  const [expectedBehaviour, setExpectedBehaviour] = useState('');
  const [businessProblem, setBusinessProblem] = useState('');
  const [businessJustification, setBusinessJustification] = useState('');
  const [impactOnOperations, setImpactOnOperations] = useState('medium');
  const [preferredTimeline, setPreferredTimeline] = useState('within_2_weeks');
  const [additionalComments, setAdditionalComments] = useState('');
  const [declarationConfirmed, setDeclarationConfirmed] = useState(false);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);

  useEffect(() => {
    if (!token) {
      setError('A valid change request token is required.');
      setLoading(false);
      return;
    }

    const fetchInvitation = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_URL}/api/public/change-requests/invitation/${token}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Unable to load change request invitation.');
          setErrorCode(data.code || 'UNKNOWN_ERROR');
          if (data.submitted_request) {
            setSubmittedResult({
              ticket_number: data.submitted_request.ticket_number,
              title: 'Change Request',
              tracking_url: `/change-request/track/${token}`,
            });
          }
          return;
        }

        setInvitation(data.invitation);
      } catch (err: any) {
        setError(err.message || 'Unable to connect to Riana CIMS servers.');
      } finally {
        setLoading(false);
      }
    };

    fetchInvitation();
  }, [token]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = 5 - attachments.length;
    if (remainingSlots <= 0) {
      toast({
        title: 'Limit Reached',
        description: 'You can upload a maximum of 5 supporting documents.',
        variant: 'destructive',
      });
      return;
    }

    Array.from(files).slice(0, remainingSlots).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: `${file.name} exceeds the 10MB size limit.`,
          variant: 'destructive',
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            size: file.size,
            mime_type: file.type || 'application/octet-stream',
            base64,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const validateForm = () => {
    if (!title.trim()) {
      toast({ title: 'Validation Error', description: 'Please provide a clear request title.', variant: 'destructive' });
      return false;
    }
    if (!category) {
      toast({ title: 'Validation Error', description: 'Please select a request category.', variant: 'destructive' });
      return false;
    }
    if (!description.trim()) {
      toast({ title: 'Validation Error', description: 'Please describe the change you are requesting.', variant: 'destructive' });
      return false;
    }
    if (!expectedBehaviour.trim()) {
      toast({ title: 'Validation Error', description: 'Please specify the expected behaviour.', variant: 'destructive' });
      return false;
    }
    if (!businessProblem.trim()) {
      toast({ title: 'Validation Error', description: 'Please specify the business problem being solved.', variant: 'destructive' });
      return false;
    }
    if (!declarationConfirmed) {
      toast({ title: 'Declaration Required', description: 'Please confirm the client authorization declaration.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setSubmitting(true);
      const payload = {
        token,
        title: title.trim(),
        category,
        description: description.trim(),
        current_behaviour: currentBehaviour.trim(),
        expected_behaviour: expectedBehaviour.trim(),
        business_problem: businessProblem.trim(),
        business_justification: businessJustification.trim(),
        impact_on_operations: impactOnOperations,
        preferred_timeline: preferredTimeline,
        additional_comments: additionalComments.trim(),
        declaration_confirmed: declarationConfirmed,
        attachments,
      };

      const res = await fetch(`${API_URL}/api/public/change-requests/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit change request.');
      }

      setSubmittedResult({
        ticket_number: data.ticket_number,
        title: title.trim(),
        tracking_url: data.tracking_url,
      });

      toast({
        title: 'Request Submitted Successfully',
        description: `Ticket ${data.ticket_number} created and dispatched to the Riana development team.`,
      });
    } catch (err: any) {
      toast({
        title: 'Submission Failed',
        description: err.message || 'An error occurred while submitting your request.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-600 dark:text-slate-400 font-medium">Loading secure change request portal...</p>
      </div>
    );
  }

  if (submittedResult) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 flex items-center justify-center">
        <Card className="max-w-xl w-full border-teal-200 dark:border-teal-900 shadow-xl bg-white dark:bg-slate-900">
          <CardHeader className="text-center pb-4">
            <div className="w-16 h-16 bg-teal-100 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <CardTitle className="text-2xl font-bold text-slate-900 dark:text-white">
              Change Request Submitted
            </CardTitle>
            <CardDescription className="text-base text-slate-600 dark:text-slate-400">
              Your request has been officially recorded in Riana CIMS and assigned to the development team.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
              <p className="text-xs uppercase font-semibold text-slate-500 tracking-wider">Official Ticket Number</p>
              <p className="text-3xl font-extrabold text-teal-700 dark:text-teal-400 tracking-tight mt-1">
                {submittedResult.ticket_number}
              </p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-1">
                {submittedResult.title}
              </p>
            </div>

            <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-600 flex-shrink-0" />
                <span>Confirmation sent to your registered email and phone via SMS.</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-600 flex-shrink-0" />
                <span>Account Manager and Senior Developer notified for technical appraisal.</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-600 flex-shrink-0" />
                <span>You can track development progress using the secure link below anytime.</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button asChild className="w-full bg-teal-700 hover:bg-teal-800 text-white font-medium">
              <Link to={`/change-request/track/${token}`}>
                Track Request Status <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 flex items-center justify-center">
        <Card className="max-w-md w-full border-red-200 dark:border-red-900 shadow-lg bg-white dark:bg-slate-900">
          <CardHeader className="text-center">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-950 text-red-600 rounded-full flex items-center justify-center mx-auto mb-2">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <CardTitle className="text-xl font-bold text-red-700 dark:text-red-400">
              {errorCode === 'INVITATION_EXPIRED' ? 'Invitation Expired' : 'Portal Access Unavailable'}
            </CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400 mt-1">
              {error}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-slate-500">
            {errorCode === 'INVITATION_EXPIRED' ? (
              <p>This single-use change request invitation has expired. Please contact your Riana Account Manager to generate a new submission link.</p>
            ) : (
              <p>If you believe this is an error, please reach out to Riana Technologies customer support.</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header Branding */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-200 dark:border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-2xl tracking-tight text-teal-700 dark:text-teal-400">RIANA</span>
              <span className="text-sm px-2 py-0.5 font-semibold bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 rounded">
                CIMS PORTAL
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
              Client Change Request Form
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Initiated by your Riana Account Manager • Ref: {invitation.request_reference}
            </p>
          </div>
          <div className="text-right sm:self-center">
            <Badge variant="outline" className="border-teal-500 text-teal-700 dark:text-teal-400 px-3 py-1 font-mono text-xs">
              Expires: {new Date(invitation.expires_at).toLocaleDateString()}
            </Badge>
          </div>
        </div>

        {/* Client Scope Card (Pre-populated & Strictly Read-Only) */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <CardHeader className="pb-3 bg-slate-50 dark:bg-slate-800/40 rounded-t-lg border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-teal-600" />
              Verified Client & Scope Information (Read-Only)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500">Client Organization</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{invitation.client.client_name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Branch / Location</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                {invitation.client.branch_name || 'Main Branch'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Department</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                {invitation.client.department_name || 'All Departments'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Designated Client Representative</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-teal-600" />
                {invitation.client_representative.name}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Contact Phone</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-teal-600" />
                {invitation.client_representative.phone}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Contact Email</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-1.5 truncate">
                <Mail className="w-3.5 h-3.5 text-teal-600" />
                {invitation.client_representative.email}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Change Request Input Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-600" />
                Change Request Specification
              </CardTitle>
              <CardDescription>
                Provide detailed requirements to assist our engineering and product teams in assessing and implementing your request.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-5">
              {/* Request Title */}
              <div className="space-y-2">
                <Label htmlFor="title" className="font-semibold text-slate-800 dark:text-slate-200">
                  Request Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="e.g., Automated SMS notification for appointment reminders"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="focus-visible:ring-teal-600"
                />
              </div>

              {/* Category & Impact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category" className="font-semibold text-slate-800 dark:text-slate-200">
                    Request Category <span className="text-red-500">*</span>
                  </Label>
                  <Select value={category} onValueChange={setCategory} required>
                    <SelectTrigger id="category" className="focus:ring-teal-600">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="software_enhancement">Software Enhancement</SelectItem>
                      <SelectItem value="new_feature">New Feature</SelectItem>
                      <SelectItem value="bug_fix">Bug / Defect Fix</SelectItem>
                      <SelectItem value="workflow_adjustment">Workflow Adjustment</SelectItem>
                      <SelectItem value="report_export">Report / Data Export</SelectItem>
                      <SelectItem value="integration">Third-party Integration</SelectItem>
                      <SelectItem value="configuration">Configuration / Setup Change</SelectItem>
                      <SelectItem value="other">Other Technical Request</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="impact" className="font-semibold text-slate-800 dark:text-slate-200">
                    Impact on Operations
                  </Label>
                  <Select value={impactOnOperations} onValueChange={setImpactOnOperations}>
                    <SelectTrigger id="impact" className="focus:ring-teal-600">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low - Minor convenience</SelectItem>
                      <SelectItem value="medium">Medium - Operational efficiency</SelectItem>
                      <SelectItem value="high">High - Significant business impact</SelectItem>
                      <SelectItem value="critical">Critical - Workflow blocking</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Description of Requested Change */}
              <div className="space-y-2">
                <Label htmlFor="description" className="font-semibold text-slate-800 dark:text-slate-200">
                  Description of Requested Change <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="description"
                  rows={4}
                  placeholder="Detail the exact functional changes, screens, inputs, or workflow steps involved..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  className="focus-visible:ring-teal-600"
                />
              </div>

              {/* Current vs Expected Behaviour */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="currentBehaviour" className="font-semibold text-slate-800 dark:text-slate-200">
                    Current Behaviour / Situation
                  </Label>
                  <Textarea
                    id="currentBehaviour"
                    rows={3}
                    placeholder="Describe how the system currently behaves or what manual steps are required..."
                    value={currentBehaviour}
                    onChange={(e) => setCurrentBehaviour(e.target.value)}
                    className="focus-visible:ring-teal-600"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expectedBehaviour" className="font-semibold text-slate-800 dark:text-slate-200">
                    Expected Behaviour / Desired Outcome <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="expectedBehaviour"
                    rows={3}
                    placeholder="Describe exactly what should happen once the change is delivered..."
                    value={expectedBehaviour}
                    onChange={(e) => setExpectedBehaviour(e.target.value)}
                    required
                    className="focus-visible:ring-teal-600"
                  />
                </div>
              </div>

              {/* Business Problem & Justification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessProblem" className="font-semibold text-slate-800 dark:text-slate-200">
                    Business Problem Being Solved <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="businessProblem"
                    rows={3}
                    placeholder="What operational pain point, error, or bottleneck does this solve?"
                    value={businessProblem}
                    onChange={(e) => setBusinessProblem(e.target.value)}
                    required
                    className="focus-visible:ring-teal-600"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="businessJustification" className="font-semibold text-slate-800 dark:text-slate-200">
                    Business Justification / Benefits
                  </Label>
                  <Textarea
                    id="businessJustification"
                    rows={3}
                    placeholder="Anticipated time savings, cost reduction, accuracy, or customer experience gains..."
                    value={businessJustification}
                    onChange={(e) => setBusinessJustification(e.target.value)}
                    className="focus-visible:ring-teal-600"
                  />
                </div>
              </div>

              {/* Preferred Timeline */}
              <div className="space-y-2">
                <Label htmlFor="timeline" className="font-semibold text-slate-800 dark:text-slate-200">
                  Preferred Timeline
                </Label>
                <Select value={preferredTimeline} onValueChange={setPreferredTimeline}>
                  <SelectTrigger id="timeline" className="focus:ring-teal-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Immediate / Urgent Priority</SelectItem>
                    <SelectItem value="within_1_week">Within 1 Week</SelectItem>
                    <SelectItem value="within_2_weeks">Within 2 Weeks</SelectItem>
                    <SelectItem value="within_1_month">Within 1 Month</SelectItem>
                    <SelectItem value="flexible">Flexible / Next Scheduled Release</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Additional Comments */}
              <div className="space-y-2">
                <Label htmlFor="additionalComments" className="font-semibold text-slate-800 dark:text-slate-200">
                  Additional Notes or Comments
                </Label>
                <Textarea
                  id="additionalComments"
                  rows={2}
                  placeholder="Any other dependencies, special constraints, or test data available..."
                  value={additionalComments}
                  onChange={(e) => setAdditionalComments(e.target.value)}
                  className="focus-visible:ring-teal-600"
                />
              </div>

              {/* Supporting Attachments */}
              <div className="space-y-3 pt-2">
                <Label className="font-semibold text-slate-800 dark:text-slate-200">
                  Supporting Documents & Screenshots (Max 5 files, 10MB each)
                </Label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="cursor-pointer border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 rounded-lg p-4 flex items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-teal-600 transition-colors w-full sm:w-auto">
                    <Upload className="w-4 h-4" />
                    <span>Upload Documents or Images</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={attachments.length >= 5}
                    />
                  </label>
                </div>

                {attachments.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {attachments.map((file, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-200 dark:border-slate-700 text-sm"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="w-4 h-4 text-teal-600 flex-shrink-0" />
                          <span className="truncate font-medium">{file.name}</span>
                          <span className="text-xs text-slate-500 flex-shrink-0">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAttachment(idx)}
                          className="text-red-500 hover:text-red-700 h-8 w-8 p-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Client Authorization Declaration */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-start space-x-3 bg-teal-50/60 dark:bg-teal-950/30 p-4 rounded-lg border border-teal-200 dark:border-teal-900">
                  <Checkbox
                    id="declaration"
                    checked={declarationConfirmed}
                    onCheckedChange={(checked) => setDeclarationConfirmed(Boolean(checked))}
                    className="mt-1 data-[state=checked]:bg-teal-600 data-[state=checked]:border-teal-600"
                  />
                  <div className="grid gap-1.5 leading-none">
                    <label
                      htmlFor="declaration"
                      className="text-sm font-semibold text-slate-900 dark:text-white cursor-pointer"
                    >
                      Official Client Authorization & Declaration
                    </label>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      I, <strong>{invitation.client_representative.name}</strong>, confirm that I am authorized on behalf of{' '}
                      <strong>{invitation.client.client_name}</strong> to submit this change request. I acknowledge that this
                      submission enters Riana's engineering workflow and may be subject to contractual scope and evaluation.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row justify-between gap-4 pt-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                <span>Protected by 256-bit cryptographic session token</span>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPreview(!showPreview)}
                  className="w-full sm:w-auto"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  {showPreview ? 'Hide Summary' : 'Review Summary'}
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || !declarationConfirmed}
                  className="w-full sm:w-auto bg-teal-700 hover:bg-teal-800 text-white font-medium shadow"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Submit Official Request
                    </>
                  )}
                </Button>
              </div>
            </CardFooter>
          </Card>

          {/* Quick Review Summary Card */}
          {showPreview && (
            <Card className="border-teal-200 dark:border-teal-900 bg-teal-50/20 dark:bg-slate-900">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-teal-800 dark:text-teal-300 uppercase tracking-wide">
                  Review Submission Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <span className="text-xs text-slate-500 font-semibold">Title:</span>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{title || '(Not entered)'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-semibold">Category:</span>
                  <p className="text-slate-800 dark:text-slate-200">{category || '(Not selected)'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-semibold">Description:</span>
                  <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{description || '(Not entered)'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-semibold">Expected Outcome:</span>
                  <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{expectedBehaviour || '(Not entered)'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-semibold">Attached Files:</span>
                  <p className="text-slate-700 dark:text-slate-300">{attachments.length} file(s) attached</p>
                </div>
              </CardContent>
            </Card>
          )}
        </form>
      </div>
    </div>
  );
};

export default ClientChangeRequestForm;
