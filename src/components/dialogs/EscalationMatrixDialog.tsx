import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import { EscalationMatrix, EscalationTier } from '@/types';
import { CountryPhoneInput } from '@/components/common/CountryPhoneInput';
import {
  emptyEscalationTier,
  escalationTierEntries,
  normalizeEscalationMatrix,
} from '@/utils/escalationMatrix';

interface EscalationMatrixDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (matrix: EscalationMatrix) => void | Promise<void>;
  existingMatrix?: EscalationMatrix;
  canAddTiers?: boolean;
}

export const EscalationMatrixDialog: React.FC<EscalationMatrixDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  existingMatrix,
  canAddTiers = false,
}) => {
  const [matrix, setMatrix] = useState(() => normalizeEscalationMatrix(existingMatrix));
  const [validationError, setValidationError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMatrix(normalizeEscalationMatrix(existingMatrix));
      setValidationError('');
    }
  }, [isOpen, existingMatrix]);

  const handleTierChange = (tier: string, field: keyof EscalationTier, value: string) => {
    setMatrix((current) => ({
      ...current,
      [tier]: { ...current[tier], [field]: value },
    }));
  };

  const addTier = () => {
    const nextNumber = Math.max(3, ...escalationTierEntries(matrix).map(([key]) => Number(key.slice(4)))) + 1;
    setMatrix((current) => ({ ...current, [`tier${nextNumber}`]: emptyEscalationTier() }));
  };

  const removeTier = (tier: string) => {
    if (Number(tier.slice(4)) <= 3) return;
    setMatrix((current) => {
      const next = { ...current };
      delete next[tier];
      return next;
    });
  };

  const handleSave = async () => {
    const populatedTiers = escalationTierEntries(matrix).filter(([, tier]) =>
      Object.values(tier).some((value) => String(value || '').trim()),
    );
    const incompleteTier = populatedTiers.find(([, tier]) =>
      !tier.name.trim() || !tier.role.trim() || (!tier.phone_number.trim() && !tier.email.trim()),
    );
    if (incompleteTier) {
      setValidationError(`${incompleteTier[0].replace('tier', 'Tier ')} needs a name, role, and either a phone number or email.`);
      return;
    }
    if (populatedTiers.length === 0) {
      setValidationError('Add at least one escalation contact before saving.');
      return;
    }

    setIsSaving(true);
    setValidationError('');
    try {
      await onSave(normalizeEscalationMatrix(matrix));
      onClose();
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Unable to save the escalation matrix.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSaving && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Escalation Matrix Configuration</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Add the contacts needed for each escalation level. Empty optional tiers are allowed.
          </p>
          {escalationTierEntries(matrix).map(([tierKey, tier], index) => (
            <div key={tierKey} className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold">Tier {index + 1} Escalation</h4>
                {canAddTiers && index >= 3 && (
                  <Button variant="ghost" size="sm" onClick={() => removeTier(tierKey)} aria-label={`Remove tier ${index + 1}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {([
                  ['name', 'Name', 'Enter full name', 'text'],
                  ['role', 'Role', 'Enter role or position', 'text'],
                  ['phone_number', 'Phone Number', 'Enter international phone number', 'tel'],
                  ['email', 'Email', 'Enter email address', 'email'],
                ] as const).map(([field, label, placeholder, type]) => (
                  <div key={field}>
                    <Label htmlFor={`${tierKey}-${field}`}>{label}</Label>
                    {field === 'phone_number' ? (
                      <CountryPhoneInput
                        id={`${tierKey}-${field}`}
                        value={tier.phone_number}
                        onChange={(value) => handleTierChange(tierKey, field, value)}
                      />
                    ) : (
                      <Input
                        id={`${tierKey}-${field}`}
                        type={type}
                        value={tier[field]}
                        onChange={(event) => handleTierChange(tierKey, field, event.target.value)}
                        placeholder={placeholder}
                        maxLength={field === 'email' ? 254 : 100}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {canAddTiers && (
            <Button variant="outline" onClick={addTier}>
              <Plus className="mr-2 h-4 w-4" /> Add Escalation Tier
            </Button>
          )}
          {validationError && <p className="text-sm text-destructive" role="alert">{validationError}</p>}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Escalation Matrix'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
