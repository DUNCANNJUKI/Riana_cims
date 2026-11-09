import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@crms/components/ui/dialog';
import { Button } from '@crms/components/ui/button';
import { Label } from '@crms/components/ui/label';
import { Textarea } from '@crms/components/ui/textarea';
import { useToast } from '@crms/hooks/use-toast';
import { apiRequest } from '@crms/lib/apiRequest';
import { ShieldCheck, CheckCircle2, RefreshCw, KeyRound, PenTool } from 'lucide-react';

interface CloseChangeRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changeRequestId: string;
  ticketNumber: string;
  requestTitle: string;
  acceptanceRecord?: {
    client_representative_name: string;
    client_representative_designation: string;
    sign_off_method: string;
    accepted_at: string;
    signature_image_path?: string | null;
  } | null;
  onSuccess?: () => void;
}

export const CloseChangeRequestDialog: React.FC<CloseChangeRequestDialogProps> = ({
  open,
  onOpenChange,
  changeRequestId,
  ticketNumber,
  requestTitle,
  acceptanceRecord,
  onSuccess,
}) => {
  const { toast } = useToast();
  const [closureNotes, setClosureNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCloseRequest = async () => {
    try {
      setSubmitting(true);
      const res = await apiRequest(`/api/crms/change_requests/${changeRequestId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closure_notes: closureNotes.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to close change request.');

      toast({
        title: 'Change Request Officially Closed',
        description: `Ticket ${ticketNumber} has been verified and permanently closed with client acceptance.`,
      });

      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast({
        title: 'Closure Failed',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-teal-600" />
            Verify Acceptance & Close Request
          </DialogTitle>
          <DialogDescription>
            Confirm client acceptance evidence and execute formal request closure for Ticket <strong>{ticketNumber}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm">
          {/* Verified Acceptance Evidence */}
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg p-4 space-y-2">
            <p className="text-xs uppercase font-bold tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Verified Client Sign-off Evidence
            </p>
            {acceptanceRecord ? (
              <div className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
                <p>
                  <strong>Signatory:</strong> {acceptanceRecord.client_representative_name} ({acceptanceRecord.client_representative_designation})
                </p>
                <p className="flex items-center gap-1.5">
                  <strong>Method:</strong>
                  {acceptanceRecord.sign_off_method === 'otp' ? (
                    <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 font-semibold">
                      <KeyRound className="w-3.5 h-3.5" /> Verified OTP
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 font-semibold">
                      <PenTool className="w-3.5 h-3.5" /> Authenticated Signature Image
                    </span>
                  )}
                </p>
                <p>
                  <strong>Accepted At:</strong> {new Date(acceptanceRecord.accepted_at).toLocaleString()}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Client acceptance record on file.
              </p>
            )}
          </div>

          {/* Closure Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="closureNotes" className="font-semibold text-xs">
              Account Manager Verification & Closure Notes (Optional)
            </Label>
            <Textarea
              id="closureNotes"
              rows={3}
              placeholder="Record any final verification observations, handoff notes, or next steps..."
              value={closureNotes}
              onChange={(e) => setClosureNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCloseRequest}
            disabled={submitting}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
          >
            {submitting ? (
              <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-1.5" />
            )}
            Execute Final Request Closure
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CloseChangeRequestDialog;
