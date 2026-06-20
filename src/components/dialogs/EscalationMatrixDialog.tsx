import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EscalationMatrix, EscalationTier } from "@/types";

interface EscalationMatrixDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (matrix: EscalationMatrix) => void;
  existingMatrix?: EscalationMatrix;
}

export const EscalationMatrixDialog: React.FC<EscalationMatrixDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  existingMatrix
}) => {
  const [escalationMatrix, setEscalationMatrix] = useState<EscalationMatrix>(
    existingMatrix || {
      tier1: { name: '', phone_number: '', email: '', role: '' },
      tier2: { name: '', phone_number: '', email: '', role: '' },
      tier3: { name: '', phone_number: '', email: '', role: '' }
    }
  );

  const handleTierChange = (tier: 'tier1' | 'tier2' | 'tier3', field: keyof EscalationTier, value: string) => {
    setEscalationMatrix(prev => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        [field]: value
      }
    }));
  };

  const handleSave = () => {
    // Validate that all fields are filled
    const isValid = Object.values(escalationMatrix).every(tier =>
      tier.name && tier.phone_number && tier.email && tier.role
    );

    if (!isValid) {
      alert('Please fill in all fields for all escalation tiers.');
      return;
    }

    onSave(escalationMatrix);
    onClose();
  };

  const renderTierForm = (tierKey: 'tier1' | 'tier2' | 'tier3', tierNumber: number) => {
    const tier = escalationMatrix[tierKey];
    
    return (
      <div key={tierKey} className="space-y-4 p-4 border rounded-lg">
        <h4 className="font-semibold text-lg">Tier {tierNumber} Escalation</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor={`${tierKey}-name`}>Name</Label>
            <Input
              id={`${tierKey}-name`}
              value={tier.name}
              onChange={(e) => handleTierChange(tierKey, 'name', e.target.value)}
              placeholder="Enter full name"
            />
          </div>
          
          <div>
            <Label htmlFor={`${tierKey}-role`}>Role</Label>
            <Input
              id={`${tierKey}-role`}
              value={tier.role}
              onChange={(e) => handleTierChange(tierKey, 'role', e.target.value)}
              placeholder="Enter role/position"
            />
          </div>
          
          <div>
            <Label htmlFor={`${tierKey}-phone`}>Phone Number</Label>
            <Input
              id={`${tierKey}-phone`}
              value={tier.phone_number}
              onChange={(e) => handleTierChange(tierKey, 'phone_number', e.target.value)}
              placeholder="Enter phone number"
            />
          </div>
          
          <div>
            <Label htmlFor={`${tierKey}-email`}>Email</Label>
            <Input
              id={`${tierKey}-email`}
              type="email"
              value={tier.email}
              onChange={(e) => handleTierChange(tierKey, 'email', e.target.value)}
              placeholder="Enter email address"
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Escalation Matrix Configuration</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Configure the three-tier escalation matrix for this installation. All fields are required.
          </p>
          
          {renderTierForm('tier1', 1)}
          {renderTierForm('tier2', 2)}
          {renderTierForm('tier3', 3)}
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Escalation Matrix
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};