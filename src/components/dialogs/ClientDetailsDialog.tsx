import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { User, Client, Installation } from "@/types";

interface ClientDetailsDialogProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (client: Client) => void;
  isEditing?: boolean;
  user: User;
  departments?: any[];
  subsidiaries?: any[];
}

export const ClientDetailsDialog = ({ 
  client, 
  isOpen, 
  onClose, 
  onSave, 
  isEditing = false, 
  user,
  departments = [],
  subsidiaries = []
}: ClientDetailsDialogProps) => {
  const [editedClient, setEditedClient] = useState<Client | null>(client);

  const handleSave = () => {
    if (editedClient && onSave) {
      onSave(editedClient);
      onClose();
    }
  };

  if (!client) return null;

  const canEdit = user.role === 'Admin' && isEditing;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Client Details' : 'Client Details'}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update client information' : 'View client information'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="client_name">Client Name</Label>
            {canEdit ? (
              <Input
                id="client_name"
                value={editedClient?.client_name || ''}
                onChange={(e) => setEditedClient(prev => prev ? {...prev, client_name: e.target.value} : null)}
              />
            ) : (
              <div className="p-2 bg-muted rounded">{client.client_name}</div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="branch">Branch</Label>
            {canEdit ? (
              <Input
                id="branch"
                value={editedClient?.branch || ''}
                onChange={(e) => setEditedClient(prev => prev ? {...prev, branch: e.target.value} : null)}
              />
            ) : (
              <div className="p-2 bg-muted rounded">{client.branch || 'N/A'}</div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="contact_person_name">Contact Person</Label>
            {canEdit ? (
              <Input
                id="contact_person_name"
                value={editedClient?.contact_person_name || ''}
                onChange={(e) => setEditedClient(prev => prev ? {...prev, contact_person_name: e.target.value} : null)}
              />
            ) : (
              <div className="p-2 bg-muted rounded">{client.contact_person_name}</div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="contact_person_phone">Contact Phone</Label>
            {canEdit ? (
              <Input
                id="contact_person_phone"
                value={editedClient?.contact_person_phone || ''}
                onChange={(e) => setEditedClient(prev => prev ? {...prev, contact_person_phone: e.target.value} : null)}
              />
            ) : (
              <div className="p-2 bg-muted rounded">{client.contact_person_phone || 'N/A'}</div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="start_date">Start Date</Label>
            {canEdit ? (
              <Input
                id="start_date"
                type="date"
                value={editedClient?.start_date || ''}
                onChange={(e) => setEditedClient(prev => prev ? {...prev, start_date: e.target.value} : null)}
              />
            ) : (
              <div className="p-2 bg-muted rounded">{new Date(client.start_date).toLocaleDateString()}</div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="contract_type">Contract Type</Label>
            {canEdit ? (
              <Select 
                value={editedClient?.contract_type || ''} 
                onValueChange={(value) => setEditedClient(prev => prev ? {...prev, contract_type: value} : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select contract type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AMC">AMC</SelectItem>
                  <SelectItem value="WARRANTY">WARRANTY</SelectItem>
                  <SelectItem value="LEASE">LEASE</SelectItem>
                  <SelectItem value="POC">POC</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="p-2 bg-muted rounded">
                <Badge variant="outline">{client.contract_type}</Badge>
              </div>
            )}
          </div>
          
          <div className="col-span-2 space-y-2">
            <Label htmlFor="industry_classification">Industry Classification</Label>
            {canEdit ? (
              <Select 
                value={editedClient?.industry_classification || ''} 
                onValueChange={(value) => setEditedClient(prev => prev ? {...prev, industry_classification: value} : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Banking">Banking</SelectItem>
                  <SelectItem value="Healthcare">Healthcare</SelectItem>
                  <SelectItem value="Education">Education</SelectItem>
                  <SelectItem value="Government">Government</SelectItem>
                  <SelectItem value="Retail">Retail</SelectItem>
                  <SelectItem value="Technology">Technology</SelectItem>
                  <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="Hospitality">Hospitality</SelectItem>
                  <SelectItem value="Transportation">Transportation</SelectItem>
                  <SelectItem value="Telecommunications">Telecommunications</SelectItem>
                  <SelectItem value="Insurance">Insurance</SelectItem>
                  <SelectItem value="Real Estate">Real Estate</SelectItem>
                  <SelectItem value="Entertainment">Entertainment</SelectItem>
                  <SelectItem value="Utilities">Utilities</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="p-2 bg-muted rounded">{client.industry_classification}</div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            {isEditing ? 'Cancel' : 'Close'}
          </Button>
          {canEdit && (
            <Button onClick={handleSave} className="gradient-primary">
              Save Changes
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};