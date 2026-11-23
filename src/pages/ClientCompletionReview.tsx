import { errorDetails } from '@/utils/errorDetails';
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  FileCheck2, CheckCircle2, AlertTriangle, AlertCircle, Clock, Building2, User, Phone,
  Mail, ShieldCheck, Download, Send, ArrowRight, RefreshCw, KeyRound, PenTool, XCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { API_URL } from '@/integrations/apiClient';

interface ReportDetails {
  report_id: string;
  version_number: number;
  status: string;
  sent_at: string;
  summary_of_change: string;
  implemented_solution: string;
  deliverables?: string | null;
  issues_resolved?: string | null;
  testing_performed?: string | null;
  implementation_date?: string | null;
  deployment_date?: string | null;
  outstanding_items?: string | null;
  known_limitations?: string | null;
  client_recommendations?: string | null;
  additional_comments?: string | null;
  attachments?: Array<{ name: string; url: string; size?: number }> | null;
  change_request: {
    id: string;
    ticket_number: string;
    title: string;
    category: string;
    status: string;
  };
  client: {
    client_name: string;
    branch_name?: string | null;
    department_name?: string | null;
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
  acceptance?: {
    accepted_at: string;
    feedback_rating?: number | null;
    feedback_comment?: string | null;
    feedback_submitted_at?: string | null;
    sign_off_method: string;
    client_representative_name: string;
    client_representative_designation: string;
  } | null;
}

export const ClientCompletionReview: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Acceptance Modal State
  const [acceptModalOpen, setAcceptModalOpen] = useState(false);
  const [acceptMethod, setAcceptMethod] = useState<'otp' | 'signature'>('otp');
  const [repName, setRepName] = useState('');
  const [repDesignation, setRepDesignation] = useState('');
  const [authorityDeclaration, setAuthorityDeclaration] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState('');
  const [feedbackComment, setFeedbackComment] = useState('');

  // OTP State
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [submittingOtp, setSubmittingOtp] = useState(false);

  // Signature State
  const [signatureFile, setSignatureFile] = useState<{ base64: string; name: string } | null>(null);
  const [submittingSignature, setSubmittingSignature] = useState(false);

  const downloadCompletion = async (base64?: string) => {
    try {
      let blob: Blob;
      if (base64) blob = new Blob([Uint8Array.from(atob(base64), character => character.charCodeAt(0))], { type: 'application/pdf' });
      else {
        const response = await fetch(`${API_URL}/public/change-requests/review/${encodeURIComponent(token || '')}/completion.pdf`);
        if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) throw new Error('Your sign-off is saved. The signed report is temporarily unavailable; please try Download again.');
        blob = await response.blob();
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'signed-completion-report.pdf'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast({ title: 'Report download unavailable', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' }); }
  };

  // Corrections / Action Modal State
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [actionType, setActionType] = useState<'correction_requested' | 'disputed'>('correction_requested');
  const [actionText, setActionText] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  const fetchReport = async () => {
    if (!token) {
      setError('A valid completion review token is required.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/public/change-requests/review/${token}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load completion report.');
        return;
      }
      setError(null);
      setReport({ ...data, status: data.report_status, change_request: { id: data.change_request_id, ticket_number: data.ticket_number, title: data.request_title, category: data.request_category, status: data.request_status }, client: { client_name: data.client.name, branch_name: data.client.branch, department_name: data.client.department }, client_representative: data.representative });
      setRepName(data.representative?.name || '');
    } catch (err: unknown) {
      setError(errorDetails(err).message || 'Unable to connect to Riana servers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [token]);

  useEffect(() => {
    let interval: any;
    if (otpTimer > 0) {
      interval = setInterval(() => setOtpTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [otpTimer]);

  const handleRequestOtp = async () => {
    try {
      setRequestingOtp(true);
      const res = await fetch(`${API_URL}/public/change-requests/review/${token}/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'sms' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP.');

      setOtpRequested(true);
      setOtpTimer(60);
      toast({
        title: 'Verification Code Sent',
        description: `A 6-digit code was sent by ${data.channel} to ${data.maskedTarget}.`,
      });
    } catch (err: unknown) {
      toast({
        title: 'Error Requesting OTP',
        description: errorDetails(err).message,
        variant: 'destructive',
      });
    } finally {
      setRequestingOtp(false);
    }
  };

  const handleVerifyOtpAndAccept = async () => {
    if (!otpCode || otpCode.length !== 6) {
      toast({ title: 'Validation Error', description: 'Please enter the 6-digit verification code.', variant: 'destructive' });
      return;
    }
    if (!repName.trim() || !repDesignation.trim()) {
      toast({ title: 'Validation Error', description: 'Please enter your name and official designation.', variant: 'destructive' });
      return;
    }
    if (!authorityDeclaration) {
      toast({ title: 'Declaration Required', description: 'Please confirm the client acceptance declaration.', variant: 'destructive' });
      return;
    }

    try {
      setSubmittingOtp(true);
      const res = await fetch(`${API_URL}/public/change-requests/review/${token}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: otpCode.trim(),
          representativeName: repName.trim(),
          designation: repDesignation.trim(),
          declaration_confirmed: authorityDeclaration,
          feedback: { rating: feedbackRating ? Number(feedbackRating) : null, comment: feedbackComment.trim() },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to verify OTP.');

      toast({
        title: 'Acceptance Confirmed',
        description: 'Thank you. Your implementation is confirmed and the request is closed.',
      });
      setAcceptModalOpen(false);
      await fetchReport();
      void downloadCompletion(data.report_pdf_base64);
    } catch (err: unknown) {
      toast({
        title: 'Verification Failed',
        description: errorDetails(err).message,
        variant: 'destructive',
      });
    } finally {
      setSubmittingOtp(false);
    }
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File Too Large', description: 'Signature image must be under 5MB.', variant: 'destructive' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSignatureFile({
        base64: reader.result as string,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSignAndAccept = async () => {
    if (!signatureFile) {
      toast({ title: 'Signature Required', description: 'Please upload an image of your signature.', variant: 'destructive' });
      return;
    }
    if (!repName.trim() || !repDesignation.trim()) {
      toast({ title: 'Validation Error', description: 'Please enter your name and official designation.', variant: 'destructive' });
      return;
    }
    if (!authorityDeclaration) {
      toast({ title: 'Declaration Required', description: 'Please confirm the client acceptance declaration.', variant: 'destructive' });
      return;
    }

    try {
      setSubmittingSignature(true);
      const res = await fetch(`${API_URL}/public/change-requests/review/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: signatureFile.name,
          base64Data: signatureFile.base64,
          representativeName: repName.trim(),
          designation: repDesignation.trim(),
          declaration_confirmed: authorityDeclaration,
          feedback: { rating: feedbackRating ? Number(feedbackRating) : null, comment: feedbackComment.trim() },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record signature acceptance.');

      toast({
        title: 'Acceptance Confirmed',
        description: 'Thank you. Your signature is recorded and the request is closed.',
      });
      setAcceptModalOpen(false);
      await fetchReport();
      void downloadCompletion(data.report_pdf_base64);
    } catch (err: unknown) {
      toast({
        title: 'Submission Failed',
        description: errorDetails(err).message,
        variant: 'destructive',
      });
    } finally {
      setSubmittingSignature(false);
    }
  };

  const handleSubmitAction = async () => {
    if (!actionText.trim()) {
      toast({
        title: 'Explanation Required',
        description: 'Please describe the reasons, incomplete items, or issues.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSubmittingAction(true);
      const res = await fetch(`${API_URL}/public/change-requests/review/${token}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: actionType === 'disputed' ? 'dispute_raised' : 'correction_requested',
          explanation: actionText.trim(),
          client_representative_name: repName.trim() || report?.client_representative.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit response.');

      toast({
        title: actionType === 'correction_requested' ? 'Corrections Requested' : 'Dispute Recorded',
        description: 'Your response has been dispatched to the Riana Account Manager and Senior Developer.',
      });
      setActionModalOpen(false);
      fetchReport();
    } catch (err: unknown) {
      toast({
        title: 'Action Failed',
        description: errorDetails(err).message,
        variant: 'destructive',
      });
    } finally {
      setSubmittingAction(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-600 dark:text-slate-400 font-medium">Loading completion report...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 flex items-center justify-center">
        <Card className="max-w-md w-full border-red-200 dark:border-red-900 shadow-lg bg-white dark:bg-slate-900">
          <CardHeader className="text-center">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-950 text-red-600 rounded-full flex items-center justify-center mx-auto mb-2">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <CardTitle className="text-xl font-bold text-red-700 dark:text-red-400">Report Unavailable</CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400 mt-1">{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const isAlreadyAccepted = report.status === 'accepted' || Boolean(report.acceptance);
  const canRespond = report.status === 'sent' && report.change_request.status === 'awaiting_client_acceptance';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-200 dark:border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-2xl tracking-tight text-teal-700 dark:text-teal-400">RIANA</span>
              <span className="text-sm px-2 py-0.5 font-semibold bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 rounded">
                COMPLETION REPORT
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
              {report.change_request.title}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Ticket: <strong className="text-teal-700 dark:text-teal-400 font-mono">{report.change_request.ticket_number}</strong> • Version {report.version_number}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isAlreadyAccepted ? (
              <Badge className="bg-emerald-600 text-white px-3 py-1.5 text-sm font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Formally Accepted
              </Badge>
            ) : report.status === 'rejected' ? (
              <Badge variant="destructive" className="px-3 py-1.5 text-sm font-semibold">
                Corrections Requested
              </Badge>
            ) : report.status === 'disputed' ? (
              <Badge className="bg-amber-600 text-white px-3 py-1.5 text-sm font-semibold">
                Disputed
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 border-amber-300 px-3 py-1.5 text-sm font-semibold flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> Awaiting Client Review
              </Badge>
            )}
          </div>
        </div>

        {/* Accepted Banner */}
        {isAlreadyAccepted && report.acceptance && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-500 rounded-lg p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900 text-emerald-600 rounded-full flex items-center justify-center flex-shrink-0">
                <FileCheck2 className="w-7 h-7" />
              </div>
              <div>
                <p className="font-bold text-emerald-900 dark:text-emerald-200 text-base">
                  {report.change_request.status === 'closed_client_accepted' ? 'Implementation Confirmed & Request Closed' : 'Delivered Work Accepted & Confirmed'}
                </p>
                <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Signed off by <strong>{report.acceptance.client_representative_name}</strong> ({report.acceptance.client_representative_designation}) via{' '}
                  <span className="uppercase font-mono text-xs">{report.acceptance.sign_off_method}</span> on{' '}
                  {new Date(report.acceptance.accepted_at).toLocaleString()}.
                </p>
                {report.acceptance.feedback_submitted_at && <div className="mt-2 text-sm">
                  {report.acceptance.feedback_rating != null && <p>Feedback rating: {report.acceptance.feedback_rating} / 5</p>}
                  {report.acceptance.feedback_comment && <p className="whitespace-pre-wrap break-words">{report.acceptance.feedback_comment}</p>}
                </div>}
                  <Button variant="outline" className="mt-3" onClick={() => void downloadCompletion()}><Download className="mr-2 h-4 w-4" />Download Signed Completion Report</Button>
              </div>
            </div>
            <Button asChild variant="outline" className="border-emerald-600 text-emerald-700 dark:text-emerald-300">
              <Link to={`/change-request/track/${token}`}>
                View Lifecycle Tracking <ArrowRight className="w-4 h-4 ml-1.5" />
              </Link>
            </Button>
          </div>
        )}

        {/* Scope Card */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <CardContent className="pt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500">Client Organization</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{report.client.client_name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Branch & Department</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                {report.client.branch_name || 'Main'} {report.client.department_name ? `• ${report.client.department_name}` : ''}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Account Manager</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{report.account_manager.name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Report Sent Date</p>
              <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                {report.sent_at ? new Date(report.sent_at).toLocaleDateString() : 'N/A'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Formal Report Content */}
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-4">
            <CardTitle className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-teal-600" />
              Technical Completion Report Details
            </CardTitle>
            <CardDescription>
              Prepared by Riana Engineering & Account Management for formal client review and sign-off.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {/* Summary */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-bold text-slate-500">
                1. Executive Summary of Changes
              </Label>
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-slate-800 dark:text-slate-200 text-sm leading-relaxed border border-slate-100 dark:border-slate-800 whitespace-pre-wrap">
                {report.summary_of_change}
              </div>
            </div>

            {/* Implemented Solution */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-bold text-slate-500">
                2. Implemented Technical Solution
              </Label>
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-slate-800 dark:text-slate-200 text-sm leading-relaxed border border-slate-100 dark:border-slate-800 whitespace-pre-wrap">
                {report.implemented_solution}
              </div>
            </div>

            {/* Deliverables & Issues Resolved */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-bold text-slate-500">
                  3. Deliverables Completed
                </Label>
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-slate-800 dark:text-slate-200 text-sm leading-relaxed border border-slate-100 dark:border-slate-800 min-h-[90px] whitespace-pre-wrap">
                  {report.deliverables || 'All agreed scope items successfully delivered.'}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-bold text-slate-500">
                  4. Issues Resolved
                </Label>
                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-slate-800 dark:text-slate-200 text-sm leading-relaxed border border-slate-100 dark:border-slate-800 min-h-[90px] whitespace-pre-wrap">
                  {report.issues_resolved || 'Target functional and operational requirements met.'}
                </div>
              </div>
            </div>

            {/* Verification & Dates */}
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider font-bold text-slate-500">
                5. Testing & Quality Verification Performed
              </Label>
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-slate-800 dark:text-slate-200 text-sm leading-relaxed border border-slate-100 dark:border-slate-800 whitespace-pre-wrap">
                {report.testing_performed || 'Quality assurance and staging integration tests executed successfully.'}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded border border-slate-200 dark:border-slate-700">
                <span className="text-xs text-slate-500 font-semibold block">Implementation Date:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {report.implementation_date ? new Date(report.implementation_date).toLocaleDateString() : 'N/A'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded border border-slate-200 dark:border-slate-700">
                <span className="text-xs text-slate-500 font-semibold block">Production Deployment Date:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {report.deployment_date ? new Date(report.deployment_date).toLocaleDateString() : 'N/A'}
                </span>
              </div>
            </div>

            {/* Recommendations or Limitations if any */}
            {(report.client_recommendations || report.known_limitations) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {report.client_recommendations && (
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider font-bold text-slate-500">
                      Recommendations for Client
                    </Label>
                    <div className="p-4 bg-teal-50/50 dark:bg-teal-950/20 rounded-lg text-slate-800 dark:text-slate-200 text-sm leading-relaxed border border-teal-100 dark:border-teal-900 whitespace-pre-wrap">
                      {report.client_recommendations}
                    </div>
                  </div>
                )}
                {report.known_limitations && (
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider font-bold text-slate-500">
                      Known Limitations / Constraints
                    </Label>
                    <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg text-slate-800 dark:text-slate-200 text-sm leading-relaxed border border-amber-100 dark:border-amber-900 whitespace-pre-wrap">
                      {report.known_limitations}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>

          {report.attachments && report.attachments.length > 0 && (
            <div className="flex flex-col gap-2 p-6">
              <h2 className="font-semibold">Supporting documents</h2>
              {report.attachments.map((attachment, index) => (
                <a key={index} className="text-primary underline" href={`${API_URL}/public/change-requests/review/${encodeURIComponent(token || '')}/attachments/${index}`} download>
                  {attachment.name}
                </a>
              ))}
            </div>
          )}
          {/* Action Bar */}
          {canRespond && <div className="border-t px-6 pt-5 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Review implementation and share feedback</p>
            <p className="mt-1">Select Accept &amp; Confirm Completion to add an optional satisfaction rating and comments, then sign off by OTP or e-signature. Your feedback appears in the signed report and request tracking. If work needs attention, request corrections or raise a concern below.</p>
          </div>}
          {canRespond && (
            <CardFooter className="flex flex-col sm:flex-row justify-between gap-3 pt-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={() => {
                    setActionType('correction_requested');
                    setActionModalOpen(true);
                  }}
                  className="w-full sm:w-auto text-amber-700 hover:text-amber-800 border-amber-300"
                >
                  <AlertCircle className="w-4 h-4 mr-1.5" />
                  Request Further Action
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setActionType('disputed');
                    setActionModalOpen(true);
                  }}
                  className="w-full sm:w-auto text-red-600 hover:text-red-700 border-red-300"
                >
                  <XCircle className="w-4 h-4 mr-1.5" />
                  Raise Concern
                </Button>
              </div>

              <Button
                onClick={() => setAcceptModalOpen(true)}
                className="w-full sm:w-auto bg-teal-700 hover:bg-teal-800 text-white font-semibold shadow-md"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Accept & Confirm Completion
              </Button>
            </CardFooter>
          )}
        </Card>
      </div>

      {/* Accept & Confirm Completion Modal */}
      <Dialog open={acceptModalOpen} onOpenChange={setAcceptModalOpen}>
        <DialogContent className="max-w-lg bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-teal-800 dark:text-teal-300 flex items-center gap-2">
              <FileCheck2 className="w-6 h-6 text-teal-600" />
              Confirm Client Acceptance
            </DialogTitle>
            <DialogDescription>
              Share optional feedback, then confirm implementation by OTP or e-signature for Ticket {report.change_request.ticket_number}. Your confirmation closes the request and generates the signed report.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="implementation-feedback-rating">Implementation feedback (optional)</Label>
              <select id="implementation-feedback-rating" className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm" value={feedbackRating} onChange={event => setFeedbackRating(event.target.value)}>
                <option value="">Select a rating</option>
                {['Very dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very satisfied'].map((label, index) => <option key={label} value={index + 1}>{index + 1} / 5 - {label}</option>)}
              </select>
              <Label htmlFor="implementation-feedback-comment">Feedback and comments (optional)</Label>
              <Textarea id="implementation-feedback-comment" aria-describedby="implementation-feedback-help" value={feedbackComment} onChange={event => setFeedbackComment(event.target.value)} maxLength={2000} placeholder="Share your feedback about the implemented change" />
              <p id="implementation-feedback-help" className="text-xs text-muted-foreground">{feedbackComment.length} / 2000 characters. Feedback is saved with your verified confirmation and included in the signed completion report. If work is incomplete, close this dialog and choose Request Further Changes or Raise Concern.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="repName" className="font-semibold text-xs">Full Name of Signatory *</Label>
                <Input
                  id="repName"
                  value={repName}
                  onChange={(e) => setRepName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="repDesignation" className="font-semibold text-xs">Official Designation / Title *</Label>
                <Input
                  id="repDesignation"
                  value={repDesignation}
                  onChange={(e) => setRepDesignation(e.target.value)}
                  placeholder="e.g. Head of ICT / Operations"
                  required
                />
              </div>
            </div>

            <Tabs value={acceptMethod} onValueChange={(val) => setAcceptMethod(val as 'otp' | 'signature')}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="otp" aria-label="Method 1: OTP Code" className="flex min-w-0 items-center gap-1 px-2 text-xs sm:gap-2 sm:text-sm">
                  <KeyRound className="h-4 w-4 shrink-0" /> OTP code
                </TabsTrigger>
                <TabsTrigger value="signature" aria-label="Method 2: Signature" className="flex min-w-0 items-center gap-1 px-2 text-xs sm:gap-2 sm:text-sm">
                  <PenTool className="h-4 w-4 shrink-0" /> E-signature
                </TabsTrigger>
              </TabsList>

              {/* Method 1: OTP */}
              <TabsContent value="otp" className="space-y-4 pt-3">
                <div className="bg-slate-50 dark:bg-slate-800 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
                  A 6-digit one-time code will be dispatched by SMS to your registered phone (<strong>{report.client_representative.phone}</strong>).
                </div>

                {!otpRequested ? (
                  <Button
                    type="button"
                    onClick={handleRequestOtp}
                    disabled={requestingOtp}
                    className="w-full bg-teal-700 hover:bg-teal-800 text-white"
                  >
                    {requestingOtp ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
                    Send 6-Digit Verification Code
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="otpInput" className="font-semibold text-xs">Enter 6-Digit OTP</Label>
                      <Input
                        id="otpInput"
                        maxLength={6}
                        placeholder="123456"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                        className="text-center text-xl tracking-widest font-mono font-bold"
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Expires in 10 minutes</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={otpTimer > 0 || requestingOtp}
                        onClick={handleRequestOtp}
                        className="h-auto p-0 text-teal-600 font-semibold"
                      >
                        {otpTimer > 0 ? `Resend in ${otpTimer}s` : 'Resend Code'}
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Method 2: Signature Upload */}
              <TabsContent value="signature" className="space-y-4 pt-3">
                <div className="space-y-2">
                  <Label className="font-semibold text-xs">Upload Signature Image (PNG / JPG / JPEG)</Label>
                  <label className="cursor-pointer border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 rounded-lg p-5 flex flex-col items-center justify-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <PenTool className="w-6 h-6 text-teal-600" />
                    <span>Click to select signature image</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleSignatureUpload}
                    />
                  </label>
                  {signatureFile && (
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                      <span className="font-semibold text-teal-700 truncate">{signatureFile.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSignatureFile(null)}
                        className="h-6 text-red-500 p-0"
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {/* Authority Declaration */}
            <div className="pt-2">
              <div className="flex items-start space-x-2.5 bg-teal-50/60 dark:bg-teal-950/30 p-3 rounded border border-teal-200 dark:border-teal-900">
                <Checkbox
                  id="authDecl"
                  checked={authorityDeclaration}
                  onCheckedChange={(checked) => setAuthorityDeclaration(Boolean(checked))}
                  className="mt-0.5"
                />
                <label htmlFor="authDecl" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer leading-tight">
                  I confirm that I am authorized on behalf of <strong>{report.client.client_name}</strong> to accept
                  this completion report. I confirm that the delivered change satisfies our requirements.
                </label>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button variant="outline" onClick={() => setAcceptModalOpen(false)}>
              Cancel
            </Button>
            {acceptMethod === 'otp' ? (
              <Button
                onClick={handleVerifyOtpAndAccept}
                disabled={submittingOtp || !otpRequested || otpCode.length !== 6 || !authorityDeclaration}
                className="bg-teal-700 hover:bg-teal-800 text-white"
              >
                {submittingOtp ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                Verify OTP & Accept
              </Button>
            ) : (
              <Button
                onClick={handleSignAndAccept}
                disabled={submittingSignature || !signatureFile || !authorityDeclaration}
                className="bg-teal-700 hover:bg-teal-800 text-white"
              >
                {submittingSignature ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Confirm Signature Acceptance
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Action / Dispute Modal */}
      <Dialog open={actionModalOpen} onOpenChange={setActionModalOpen}>
        <DialogContent className="max-w-lg bg-white dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              {actionType === 'correction_requested' ? (
                <>
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  Request Corrections or Incomplete Items
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-red-600" />
                  Raise Concern or Dispute
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'correction_requested'
                ? 'Detail the specific functions, discrepancies, or adjustments required before acceptance.'
                : 'Provide a formal explanation of the unresolved concern for Riana management review.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="actionText" className="font-semibold text-xs">
                Detailed Explanation & Discrepancies <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="actionText"
                rows={5}
                placeholder="Provide clear steps to reproduce, missing criteria, or specific observations..."
                value={actionText}
                onChange={(e) => setActionText(e.target.value)}
                required
              />
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button variant="outline" onClick={() => setActionModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitAction}
              disabled={submittingAction || !actionText.trim()}
              className={actionType === 'correction_requested' ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
            >
              {submittingAction ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Submit Formal Response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientCompletionReview;
