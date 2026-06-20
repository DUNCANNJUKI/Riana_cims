import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Download, Eye, CheckCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/apiClient";
import { Client, Installation, User } from "@/types";

interface HandoverUpload {
  id: string;
  client_id: string;
  installation_id?: string;
  file_path: string;
  file_name: string;
  file_size: number;
  uploaded_by_user_id: string;
  upload_date: string;
  is_signed: boolean;
  notes?: string;
}

interface EHandoverUploadProps {
  user: User;
  client: Client;
  installation?: Installation;
  onUploadComplete?: () => void;
}

export const EHandoverUpload = ({ user, client, installation, onUploadComplete }: EHandoverUploadProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<HandoverUpload[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [uploadNotes, setUploadNotes] = useState("");
  const [isSigned, setIsSigned] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type (PDF only for E-handover)
    if (file.type !== 'application/pdf') {
      toast({
        title: "Invalid File Type",
        description: "Please upload a PDF file only",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "File size must be less than 10MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    
    try {
      const reader = new FileReader();
      
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          const uploadResponse = await apiClient.post('/upload', {
            fileName: file.name,
            base64Data,
            client_id: client.id,
            installation_id: installation?.id,
            uploaded_by_user_id: user.id,
            is_signed: isSigned,
            notes: uploadNotes
          });

          // Update installation status if needed
          if (installation?.id) {
            await apiClient.patch(`/installations/${installation.id}`, {
              status: 'completed',
              handover_status: isSigned ? 'signed' : 'uploaded',
              handover_file_path: uploadResponse.file_path,
              completion_date: new Date().toISOString().split('T')[0]
            });

            toast({
              title: "Installation Completed",
              description: "Installation has been automatically marked as completed with handover uploaded",
            });
          }

          toast({
            title: "Upload Successful",
            description: "E-handover document uploaded successfully",
          });

          onUploadComplete?.();
          setUploadNotes("");
          setIsSigned(false);
          setIsDialogOpen(false);
          loadFiles();
        } catch (error: any) {
          console.error('Inner upload error:', error);
          toast({
            title: "Upload failed",
            description: error.message || "Failed to process file upload",
            variant: "destructive",
          });
        } finally {
          setIsUploading(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
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

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload E-handover document",
        variant: "destructive",
      });
      setIsUploading(false);
    }
  };

  const loadFiles = async () => {
    try {
      const files = await apiClient.get(`/uploads?client_id=${client.id}${installation?.id ? `&installation_id=${installation.id}` : ''}`);
      setUploadedFiles(files || []);
    } catch (error) {
      console.error('Error loading files:', error);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [client.id, installation?.id]);

  const downloadFile = async (filePath: string, fileName: string) => {
    try {
      // For local files, we can just open them or download them
      // Assuming filePath is relative to server root or accessible via /uploads/:filename
      const url = `${import.meta.env.VITE_API_BASE_URL || ''}/api/download?path=${encodeURIComponent(filePath)}`;
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast({
        title: "Download Started",
        description: "E-handover document is being downloaded",
      });
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "Download Failed",
        description: "Failed to download the document",
        variant: "destructive",
      });
    }
  };

  const previewFile = async (filePath: string) => {
    try {
      const url = `${import.meta.env.VITE_API_BASE_URL || ''}/api/download?path=${encodeURIComponent(filePath)}`;
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error previewing file:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Card className="shadow-riana">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          E-Handover Documents
        </CardTitle>
        <CardDescription>
          Upload signed E-handover forms for {client.client_name}
          {client.branch && ` - ${client.branch}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-muted-foreground">
              Upload signed E-handover documents after client approval
            </p>
        </div>
          
          {/* Allow all authenticated users to upload E-Handover */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Upload className="h-4 w-4 mr-2" />
                Upload E-Handover
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload E-Handover Document</DialogTitle>
                <DialogDescription>
                  Upload the signed E-handover form for {client.client_name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="handover-file">Select PDF File *</Label>
                  <Input
                    id="handover-file"
                    type="file"
                    accept=".pdf"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
                  <p className="text-xs text-muted-foreground">
                    Only PDF files up to 10MB are allowed
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="is-signed"
                    checked={isSigned}
                    onChange={(e) => setIsSigned(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="is-signed" className="text-sm">
                    This document is signed by the client
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea
                    id="notes"
                    value={uploadNotes}
                    onChange={(e) => setUploadNotes(e.target.value)}
                    placeholder="Any additional notes about this handover document..."
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => fileInputRef.current?.click()} 
                    disabled={isUploading}
                    className="gradient-primary"
                  >
                    {isUploading ? 'Uploading...' : 'Select & Upload'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {uploadedFiles.length > 0 ? (
          <div className="space-y-3">
            <h4 className="font-medium">Uploaded Documents</h4>
            {uploadedFiles.map((upload) => (
              <div key={upload.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-primary" />
                  <div>
                    <p className="font-medium">{upload.file_name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{formatFileSize(upload.file_size)}</span>
                      <span>•</span>
                      <span>{new Date(upload.upload_date).toLocaleDateString()}</span>
                      {upload.is_signed && (
                        <>
                          <span>•</span>
                          <Badge variant="secondary" className="text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Signed
                          </Badge>
                        </>
                      )}
                    </div>
                    {upload.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{upload.notes}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => previewFile(upload.file_path)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadFile(upload.file_path, upload.file_name)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border-2 border-dashed rounded-lg">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No E-handover documents uploaded yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              Upload signed E-handover forms to track client approvals
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};