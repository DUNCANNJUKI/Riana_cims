import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Calendar } from "lucide-react";
import { Installation, Client, User, HandoverEquipmentItem } from "@/types";
import { normalizeHandoverEquipmentConfiguration, equipmentQuantity } from '@/utils/equipmentConfiguration';
import { InstallationHardware } from '@/components/inventory/InstallationHardware';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/integrations/apiClient';
import { EquipmentIcon } from '@/components/inventory/EquipmentIcon';
import { installationEquipmentIconKind } from '@/utils/equipmentImages';

interface InstallationDetailsDialogProps {
  installation: Installation | null;
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  user: User;
  equipmentConfiguration?: HandoverEquipmentItem[] | string | null;
}

export const InstallationDetailsDialog = ({ 
  installation, 
  client,
  isOpen, 
  onClose,
  user,
  equipmentConfiguration,
}: InstallationDetailsDialogProps) => {
  const feedback = useQuery<{ overall_satisfaction: number | null; client_comments: string | null; client_improvement_suggestions: string | null } | null>({
    queryKey: ['business', 'installation-feedback', user.id, user.subsidiary_id, installation?.id],
    queryFn: () => apiClient.get(`/installation_feedback/latest?${new URLSearchParams({ client_id: installation?.client_id || '', installation_id: installation?.id || '' })}`),
    enabled: user.role === 'HeadOfBusiness' && isOpen && Boolean(installation?.id),
  });
  if (!installation) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'status-complete';
      case 'in_progress': return 'status-progress';
      case 'waiting': return 'status-waiting';
      case 'pending': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const equipmentList = normalizeHandoverEquipmentConfiguration(equipmentConfiguration)
    .filter((item)=>!['kiosk_type','screen_with_size','staff_trained'].includes(item.field))
    .map((item) => ({
      ...item,
      value: equipmentQuantity(installation, item.field),
      kind: installationEquipmentIconKind(item.field, installation.kiosk_type),
    }));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Installation Details
          </DialogTitle>
          <DialogDescription>
            Complete installation information and equipment specifications
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {client?.subsidiary_id && <InstallationHardware user={user} installation={installation} subsidiaryId={client.subsidiary_id}/>}
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Client</label>
                  <div className="font-medium">{client?.client_name || 'Unknown Client'}</div>
                  {client?.branch && (
                    <div className="text-sm text-muted-foreground">{client.branch}</div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <div>
                    <Badge className={getStatusColor(installation.status)}>
                      {installation.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Kiosk Type</label>
                  <div className="font-medium">{installation.kiosk_type}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Screen Size</label>
                  <div className="font-medium">{installation.screen_with_size || 'N/A'}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Number of TVs</label>
                  <div className="font-medium">{installation.screen_count || 0}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Equipment Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Equipment Summary</CardTitle>
              <CardDescription>
                Complete list of installed equipment and specifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {equipmentList.map((equipment) => (
                  <div key={equipment.field} className="flex min-w-0 items-center gap-2 p-3 bg-muted/50 rounded-lg">
                    {equipment.kind ? <EquipmentIcon kind={equipment.kind} /> : <Package className="size-5 shrink-0 text-primary" />}
                    <div className="min-w-0 break-words">
                      <div className="font-medium">{equipment.value}</div>
                      <div className="text-sm text-muted-foreground">{equipment.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {user.role === 'HeadOfBusiness' && <Card>
            <CardHeader><CardTitle className="text-lg">Client Feedback</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {feedback.isPending ? <p>Loading feedback</p> : feedback.isError ? <p role="alert">Unable to load feedback.</p> : feedback.data ? <>
                {feedback.data.overall_satisfaction != null && <p>Overall satisfaction · {feedback.data.overall_satisfaction}</p>}
                {feedback.data.client_comments && <p className="whitespace-pre-wrap break-words">{feedback.data.client_comments}</p>}
                {feedback.data.client_improvement_suggestions && <p className="whitespace-pre-wrap break-words">{feedback.data.client_improvement_suggestions}</p>}
              </> : <p className="text-muted-foreground">No feedback recorded for this installation.</p>}
            </CardContent>
          </Card>}
          {/* Training & Handover */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Training & Handover</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Staff Trained</label>
                  <div className="font-medium">{installation.staff_trained} personnel</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Handover File</label>
                  <div className="font-medium">
                    {installation.handover_file_path ? (
                      <Badge className="bg-success/10 text-success border-success/20">
                        Uploaded
                      </Badge>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground border-muted-foreground/20">
                        Not Uploaded
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          {(installation.assigned_date || installation.completion_date) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {installation.assigned_date && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Assigned Date</label>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(installation.assigned_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  )}
                  {installation.completion_date && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Completion Date</label>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>{new Date(installation.completion_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Remarks */}
          {installation.remarks && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Remarks</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-3 bg-muted/50 rounded-lg">
                  {installation.remarks}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex justify-end mt-6">
          <Button onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
