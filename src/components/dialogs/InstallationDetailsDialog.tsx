import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Monitor, Smartphone, Wifi, Calendar, User as UserIcon } from "lucide-react";
import { Installation, Client, User } from "@/types";

interface InstallationDetailsDialogProps {
  installation: Installation | null;
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  user: User;
}

export const InstallationDetailsDialog = ({ 
  installation, 
  client,
  isOpen, 
  onClose,
  user 
}: InstallationDetailsDialogProps) => {
  if (!installation) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'waiting': return 'bg-orange-100 text-orange-800';
      case 'pending': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const equipmentList = [
    { label: 'Kiosks', value: installation.kiosk_count, icon: Package },
    { label: 'LED Displays', value: installation.led_count, icon: Monitor },
    { label: 'Tripleplay/Counters', value: installation.counter_count, icon: Package },
    { label: 'Service Points', value: installation.service_points, icon: Smartphone },
    { label: 'UPS Units', value: installation.ups_count, icon: Package },
    { label: 'Speakers', value: installation.speakers, icon: Wifi },
    { label: 'Media Controllers', value: installation.media_controllers, icon: Wifi },
    { label: 'Tablets', value: installation.tablets, icon: Smartphone },
    { label: 'Digital Signage', value: installation.digital_signage_system, icon: Monitor },
  ];

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
                  <label className="text-sm font-medium text-muted-foreground">Screen Details</label>
                  <div className="font-medium">{installation.screen_with_size || 'N/A'}</div>
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
                {equipmentList.map((equipment, index) => {
                  const Icon = equipment.icon;
                  return (
                    <div key={index} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                      <Icon className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-medium">{equipment.value}</div>
                        <div className="text-sm text-muted-foreground">{equipment.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

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