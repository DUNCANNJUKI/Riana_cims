import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@crms/components/ui/dialog';
import { Button } from '@crms/components/ui/button';
import { Input } from '@crms/components/ui/input';
import { Label } from '@crms/components/ui/label';
import { Textarea } from '@crms/components/ui/textarea';
import { useToast } from '@crms/hooks/use-toast';
import { apiRequest } from '@crms/lib/apiRequest';
import { FileCheck2, Send, Save, RefreshCw, Upload, X } from 'lucide-react';

interface PrepareCompletionReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changeRequestId: string;
  ticketNumber: string;
  requestTitle: string;
  initialReport?: any | null;
  onSuccess?: () => void;
}

export const PrepareCompletionReportDialog: React.FC<PrepareCompletionReportDialogProps> = ({
  open,
  onOpenChange,
  changeRequestId,
  ticketNumber,
  requestTitle,
  initialReport,
  onSuccess,
}) => {
  const { toast } = useToast();

  const [summary, setSummary] = useState('');
  const [solution, setSolution] = useState('');
  const [deliverables, setDeliverables] = useState('');
  const [issuesResolved, setIssuesResolved] = useState('');
  const [testingPerformed, setTestingPerformed] = useState('');
  const [implementationDate, setImplementationDate] = useState('');
  const [deploymentDate, setDeploymentDate] = useState('');
  const [knownLimitations, setKnownLimitations] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [additionalComments, setAdditionalComments] = useState('');
  const [attachments, setAttachments] = useState<Array<{ name: string; size: number; base64: string }>>([]);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialReport) {
      setSummary(initialReport.summary_of_change || '');
      setSolution(initialReport.implemented_solution || '');
      setDeliverables(initialReport.deliverables || '');
      setIssuesResolved(initialReport.issues_resolved || '');
      setTestingPerformed(initialReport.testing_performed || '');
      setImplementationDate(initialReport.implementation_date ? initialReport.implementation_date.split('T')[0] : '');
      setDeploymentDate(initialReport.deployment_date ? initialReport.deployment_date.split('T')[0] : '');
      setKnownLimitations(initialReport.known_limitations || '');
      setRecommendations(initialReport.client_recommendations || '');
      setAdditionalComments(initialReport.additional_comments || '');
    } else {
      setSummary('');
      setSolution('');
      setDeliverables('');
      setIssuesResolved('');
      setTestingPerformed('');
      setImplementationDate(new Date().toISOString().split('T')[0]);
      setDeploymentDate(new Date().toISOString().split('T')[0]);
      setKnownLimitations('');
      setRecommendations('');
      setAdditionalComments('');
      setAttachments([]);
    }
  }, [initialReport, open]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setAttachments((prev) => [...prev, { name: file.name, size: file.size, base64 }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const validate = () => {
    if (!summary.trim()) {
      toast({ title: 'Validation Error', description: 'Summary of change is required.', variant: 'destructive' });
      return false;
    }
    if (!solution.trim()) {
      toast({ title: 'Validation Error', description: 'Implemented solution details are required.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleSubmit = async (sendToClient: boolean) => {
    if (!validate()) return;

    try {
      setSubmitting(true);
      const res = await apiRequest('/api/crms/completion_reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          change_request_id: changeRequestId,
          summary_of_change: summary.trim(),
          implemented_solution: solution.trim(),
          deliverables: deliverables.trim(),
          issues_resolved: issuesResolved.trim(),
          testing_performed: testingPerformed.trim(),
          implementation_date: implementationDate || null,
          deployment_date: deploymentDate || null,
          known_limitations: knownLimitations.trim(),
          client_recommendations: recommendations.trim(),
          additional_comments: additionalComments.trim(),
          send_to_client: sendToClient,
          attachments,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save completion report.');

      toast({
        title: sendToClient ? 'Completion Report Dispatched' : 'Report Draft Saved',
        description: sendToClient
          ? 'SMS and email review links sent to client representative.'
          : 'Completion report saved as draft.',
      });

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast({
        title: 'Error Saving Report',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-teal-600" />
            Prepare Client Completion Report
          </DialogTitle>
          <DialogDescription>
            Formal technical completion report for Ticket <strong>{ticketNumber}</strong> ({requestTitle}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Summary of Change */}
          <div className="space-y-1.5">
            <Label htmlFor="summary" className="font-semibold text-xs">
              Executive Summary of Changes <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="summary"
              rows={3}
              placeholder="High-level overview of what was implemented..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              required
            />
          </div>

          {/* Implemented Solution */}
          <div className="space-y-1.5">
            <Label htmlFor="solution" className="font-semibold text-xs">
              Implemented Technical Solution <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="solution"
              rows={3}
              placeholder="Technical architecture, services touched, or logic configured..."
              value={solution}
              onChange={(e) => setSolution(e.target.value)}
              required
            />
          </div>

          {/* Deliverables & Issues */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="deliverables" className="font-semibold text-xs">Deliverables Completed</Label>
              <Textarea
                id="deliverables"
                rows={2}
                placeholder="List completed deliverables..."
                value={deliverables}
                onChange={(e) => setDeliverables(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issuesResolved" className="font-semibold text-xs">Issues Resolved</Label>
              <Textarea
                id="issuesResolved"
                rows={2}
                placeholder="Target bugs or issues addressed..."
                value={issuesResolved}
                onChange={(e) => setIssuesResolved(e.target.value)}
              />
            </div>
          </div>

          {/* Testing Performed */}
          <div className="space-y-1.5">
            <Label htmlFor="testing" className="font-semibold text-xs">Testing & Quality Verification</Label>
            <Textarea
              id="testing"
              rows={2}
              placeholder="Details of unit, integration, and user acceptance testing performed..."
              value={testingPerformed}
              onChange={(e) => setTestingPerformed(e.target.value)}
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="implDate" className="font-semibold text-xs">Implementation Date</Label>
              <Input
                id="implDate"
                type="date"
                value={implementationDate}
                onChange={(e) => setImplementationDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deployDate" className="font-semibold text-xs">Deployment Date</Label>
              <Input
                id="deployDate"
                type="date"
                value={deploymentDate}
                onChange={(e) => setDeploymentDate(e.target.value)}
              />
            </div>
          </div>

          {/* Recommendations & Limitations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="recs" className="font-semibold text-xs">Client Recommendations</Label>
              <Textarea
                id="recs"
                rows={2}
                placeholder="Best practices or operational tips..."
                value={recommendations}
                onChange={(e) => setRecommendations(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="limits" className="font-semibold text-xs">Known Limitations / Constraints</Label>
              <Textarea
                id="limits"
                rows={2}
                placeholder="Any environmental or external limits..."
                value={knownLimitations}
                onChange={(e) => setKnownLimitations(e.target.value)}
              />
            </div>
          </div>

          {/* Attachments */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Label className="font-semibold text-xs">Supporting Deliverable Attachments</Label>
            <label className="cursor-pointer border border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 rounded p-3 flex items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <Upload className="w-4 h-4" />
              <span>Upload Delivery Documents or Screenshots</span>
              <input type="file" multiple className="hidden" onChange={handleFileUpload} />
            </label>
            {attachments.length > 0 && (
              <div className="space-y-1">
                {attachments.map((file, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded text-xs">
                    <span className="truncate">{file.name}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeAttachment(i)} className="h-5 p-0 text-red-500">
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
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
            <Save className="w-4 h-4 mr-1.5" /> Save as Draft
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => handleSubmit(true)}
            className="w-full sm:w-auto bg-teal-700 hover:bg-teal-800 text-white"
          >
            {submitting ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
            Send Report & Request Client Acceptance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PrepareCompletionReportDialog;
