import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, FileText, Search, Calendar, AlertCircle, CheckCircle2, Loader2, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDatabase } from "@/hooks/useDatabase";
import { apiClient, downloadAuthenticatedFile, previewAuthenticatedFile } from "@/integrations/apiClient";
import { User, Client, Installation } from "@/types";

interface HandoverUploadModuleProps {
  user: User;
}

export const HandoverUploadModule = ({ user }: HandoverUploadModuleProps) => {
  const [handovers, setHandovers] = useState<any[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const { getClients, getInstallations, loading } = useDatabase();

  useEffect(() => {
    loadData();
  }, []);
  const loadData = async () => {
    try {
      const [clientsData, installationsData] = await Promise.all([
        getClients(),
        getInstallations()
      ]);
      
      setClients(clientsData || []);
      setInstallations(installationsData || []);

      const handoverData = await apiClient.get('/uploads');
      setHandovers(handoverData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive",
      });
    }
  };

  const isClientEligible = (clientId: string) => {
    return installations.some(installation => installation.client_id === clientId);
  };

  const eligibleClients = clients.filter(client => isClientEligible(client.id));

  const filteredHandovers = handovers.filter(handover => {
    const client = clients.find(c => c.id === handover.client_id);
    return client?.client_name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF or image file (JPEG, PNG)",
          variant: "destructive",
        });
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please upload a file smaller than 10MB",
          variant: "destructive",
        });
        return;
      }
      
      setSelectedFile(file);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedClientId || !selectedFile) {
      toast({
        title: "Error",
        description: "Please select a client and file to upload",
        variant: "destructive",
      });
      return;
    }

    if (!isClientEligible(selectedClientId)) {
      toast({
        title: "Client not eligible",
        description: "Selected client does not have an installation record",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    
    const installation = installations.find(i => i.client_id === selectedClientId);
    if (!installation) {
      toast({
        title: "Installation not found",
        description: "Could not find an installation record for this client",
        variant: "destructive",
      });
      setIsUploading(false);
      return;
    }

    try {
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          const uploadResponse = await apiClient.post('/upload', {
            fileName: selectedFile.name,
            base64Data,
            client_id: selectedClientId,
            installation_id: installation.id,
            uploaded_by_user_id: user.id,
            is_signed: true,
            notes: 'Signed E-Handover form uploaded after installation completion'
          });

          const handoverId = uploadResponse.id;

          // Update installation status
          await apiClient.patch(`/installations/${installation.id}`, {
            status: 'completed',
            handover_status: 'signed',
            handover_file_path: uploadResponse.file_path,
            completion_date: new Date().toISOString().split('T')[0]
          });

          setHandovers(prev => [uploadResponse, ...prev]);
          setSelectedClientId("");
          setSelectedFile(null);
          setIsUploadDialogOpen(false);
          
          const fileInput = document.getElementById('handover-file') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
          
          toast({
            title: "Success",
            description: "Signed E-Handover document uploaded successfully",
          });

          await loadData();
        } catch (error: any) {
          console.error('Inner upload error:', error);
          toast({
            title: "Upload failed",
            description: error.message || "Failed to process file upload",
            variant: "destructive",
          });
        } finally {
          setIsUploading(false);
        }
      };

      reader.onerror = (error) => {
        console.error('FileReader error:', error);
        toast({
          title: "Read Failed",
          description: "Failed to read the selected file",
          variant: "destructive",
        });
        setIsUploading(false);
      };
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to initiate upload",
        variant: "destructive",
      });
      setIsUploading(false);
    }
  };
  const handleDownload = async (handover: any) => {
    try {
      const fileName = handover.file_name || handover.file_path.split('/').pop() || 'handover-document';
      await downloadAuthenticatedFile(`/download?path=${encodeURIComponent(handover.file_path)}`, fileName);
      
      toast({
        title: "Download Started",
        description: "Handover document is being downloaded",
      });
    } catch (error: any) {
      console.error('Download error:', error);
      toast({
        title: "Download Failed",
        description: error.message || "Failed to download handover document",
        variant: "destructive",
      });
    }
  };

  const handlePreview = async (handover: any) => {
    try {
      await previewAuthenticatedFile(`/download?path=${encodeURIComponent(handover.file_path)}&disposition=inline`);
    } catch (error: any) {
      console.error('Preview error:', error);
      toast({
        title: "Preview Failed",
        description: error.message || "Failed to preview handover document",
        variant: "destructive",
      });
    }
  };

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.client_name || 'Unknown Client';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Handover Documents</h1>
          <p className="text-muted-foreground">Upload signed E-Handover forms after installation completion</p>
        </div>
        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gradient-primary">
              <Upload className="h-4 w-4 mr-2" />
              Upload Signed E-Handover
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Signed E-Handover Form</DialogTitle>
              <DialogDescription>
                Upload signed E-Handover forms after installation completion
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="client">Select Client *</Label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a client" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleClients.length > 0 ? (
                      eligibleClients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.client_name} {client.branch ? `- ${client.branch}` : ''}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-clients" disabled>No eligible clients found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {selectedClientId && !isClientEligible(selectedClientId) && (
                  <div className="flex items-center gap-2 text-sm text-orange-600">
                    <AlertCircle className="h-4 w-4" />
                    This client does not have an installation record
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="handover-file">Signed E-Handover Document *</Label>
                <Input
                  id="handover-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                  disabled={isUploading}
                />
                <p className="text-sm text-muted-foreground">
                  Accepted formats: PDF, JPEG, PNG (Max size: 10MB)
                </p>
              </div>
              
              {selectedFile && (
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)} disabled={isUploading}>
                Cancel
              </Button>
              <Button 
                onClick={handleFileUpload} 
                className="gradient-primary"
                disabled={!selectedClientId || !selectedFile || isUploading || !isClientEligible(selectedClientId)}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Document
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-riana">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Uploaded Handover Documents
          </CardTitle>
          <CardDescription>
            View and download signed E-Handover forms
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by client name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Upload Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHandovers.map((handover) => (
                <TableRow key={handover.id}>
                  <TableCell>
                    <div className="font-medium">{getClientName(handover.client_id)}</div>
                    <div className="text-sm text-muted-foreground">
                      {clients.find(c => c.id === handover.client_id)?.branch}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{handover.file_name || handover.file_path.split('/').pop()}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(handover.upload_date).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {(user.role === 'SuperAdmin' || user.role === 'Admin' || user.role === 'Teamlead') && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePreview(handover)}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Preview
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(handover)}
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredHandovers.length === 0 && (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No handover documents found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
