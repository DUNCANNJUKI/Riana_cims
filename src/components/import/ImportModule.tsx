import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Download, Eye, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { User } from "@/types";
import { apiClient } from "@/integrations/apiClient";

interface ImportModuleProps {
  user: User;
}

interface ImportResult {
  id: string;
  filename: string;
  uploadDate: string;
  recordsProcessed: number;
  recordsSuccess: number;
  recordsError: number;
  status: 'success' | 'partial' | 'error';
  errorDetails?: string[];
}

export const ImportModule = ({ user }: ImportModuleProps) => {
  const [importHistory, setImportHistory] = useState<ImportResult[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importType, setImportType] = useState<'clients' | 'installations' | ''>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { toast } = useToast();

  // Only Admin and Teamlead can access this module
  if (user.role !== 'Admin' && user.role !== 'Teamlead') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Access denied. Insufficient permissions.</p>
        </div>
      </div>
    );
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.csv') && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        toast({
          title: "Invalid File Type",
          description: "Please select a CSV or Excel file (.csv, .xlsx, .xls)",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const records: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
      if (values.length === headers.length) {
        const record: any = {};
        headers.forEach((header, index) => {
          record[header] = values[index];
        });
        records.push(record);
      }
    }
    
    return records;
  };

  const handleImport = async () => {
    if (!selectedFile || !importType) {
      toast({
        title: "Missing Information",
        description: "Please select a file and import type",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      // Read file content
      const text = await selectedFile.text();
      setUploadProgress(30);
      
      const records = parseCSV(text);
      if (records.length === 0) {
        throw new Error('No valid records found in the file');
      }
      
      setUploadProgress(50);
      
      let successCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      if (importType === 'clients') {
        for (let i = 0; i < records.length; i++) {
          const record = records[i];
          try {
            await apiClient.post('/clients', {
              client_name: record.client_name || record.name,
              contact_person_name: record.contact_person_name || record.contact_name || 'Unknown',
              contact_person_phone: record.contact_person_phone || record.phone || 'N/A',
              contact_person_email: record.contact_person_email || record.email,
              contract_type: record.contract_type || 'LEASE',
              industry_classification: record.industry_classification || record.industry || 'OTHER',
              branch: record.branch,
              start_date: record.start_date || new Date().toISOString().split('T')[0],
              added_by_user_id: user.id
            });
            
            successCount++;
          } catch (err: any) {
            errors.push(`Row ${i + 2}: ${err.message}`);
            errorCount++;
          }
          setUploadProgress(50 + Math.floor((i / records.length) * 40));
        }
      } else if (importType === 'installations') {
        // For installations, we need to match client names to IDs
        const clients = await apiClient.get('/clients');
        const clientMap = new Map(clients?.map((c: any) => [`${c.client_name}-${c.branch || ''}`, c.id]) || []);
        
        for (let i = 0; i < records.length; i++) {
          const record = records[i];
          const clientKey = `${record.client_name}-${record.branch || ''}`;
          const clientId = clientMap.get(clientKey);
          
          if (!clientId) {
            errors.push(`Row ${i + 2}: Client "${record.client_name}" not found`);
            errorCount++;
            continue;
          }
          
          try {
            // Parse LED names from semicolon-separated string
            const ledNames: string[] = record.led_names 
              ? record.led_names.split(';').map((name: string) => name.trim()).filter((name: string) => name.length > 0)
              : [];
            const ledCount = parseInt(record.led_count) || ledNames.length;
            
            await apiClient.post('/installations', {
              client_id: clientId,
              kiosk_type: record.kiosk_type || 'Queue Management',
              kiosk_count: parseInt(record.kiosk_count) || 0,
              counter_count: parseInt(record.counter_count) || 0,
              led_count: ledCount,
              led_names: ledNames,
              service_points: parseInt(record.service_points) || 0,
              ups_count: parseInt(record.ups_count) || 0,
              speakers: parseInt(record.speakers) || 0,
              tablets: parseInt(record.tablets) || 0,
              digital_signage_system: parseInt(record.digital_signage_system) || 0,
              staff_trained: parseInt(record.staff_trained) || 0,
              status: 'pending',
              account_manager_id: user.id
            });
            
            successCount++;
          } catch (err: any) {
            errors.push(`Row ${i + 2}: ${err.message}`);
            errorCount++;
          }
          setUploadProgress(50 + Math.floor((i / records.length) * 40));
        }
      }

      setUploadProgress(100);
      
      const newImport: ImportResult = {
        id: Date.now().toString(),
        filename: selectedFile.name,
        uploadDate: new Date().toISOString(),
        recordsProcessed: records.length,
        recordsSuccess: successCount,
        recordsError: errorCount,
        status: errorCount === 0 ? 'success' : errorCount === records.length ? 'error' : 'partial',
        errorDetails: errors.slice(0, 10)
      };
      
      setImportHistory([newImport, ...importHistory]);
      setSelectedFile(null);
      setImportType('');
      
      toast({
        title: "Import Completed",
        description: `Successfully processed ${successCount} of ${records.length} records`,
        variant: errorCount > 0 ? "destructive" : "default",
      });
    } catch (error: any) {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to process the file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const downloadTemplate = (type: 'clients' | 'installations') => {
    let csvContent = '';
    
    if (type === 'clients') {
      csvContent = 'client_name,contact_person_name,contact_person_phone,contact_person_email,contract_type,industry_classification,branch,start_date\n';
      csvContent += 'Example Corp,John Doe,+254700000000,john@example.com,LEASE,BANKING,Nairobi,2024-01-01\n';
    } else {
      csvContent = 'client_name,branch,kiosk_type,kiosk_count,counter_count,led_count,led_names,service_points,ups_count,speakers,tablets\n';
      csvContent += 'Example Corp,Nairobi,Queue Management,5,10,3,"LED 1; LED 2; LED 3",5,2,4,3\n';
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${type}_template.csv`;
    link.click();
  };

  const exportData = async (type: 'clients' | 'installations') => {
    try {
      let data: any[] = [];
      let headers: string[] = [];
      
      if (type === 'clients') {
        const clients = await apiClient.get('/clients');
        data = clients || [];
        headers = ['client_name', 'contact_person_name', 'contact_person_phone', 'contact_person_email', 'contract_type', 'industry_classification', 'branch', 'start_date'];
      } else {
        const installations = await apiClient.get('/installations');
        data = (installations || []).map((i: any) => ({
          ...i,
          client_name: i.clients?.client_name,
          branch: i.clients?.branch,
          led_names: Array.isArray(i.led_names) ? i.led_names.join('; ') : ''
        }));
        headers = ['client_name', 'branch', 'kiosk_type', 'kiosk_count', 'counter_count', 'led_count', 'led_names', 'service_points', 'ups_count', 'speakers', 'tablets', 'status'];
      }
      
      let csvContent = headers.join(',') + '\n';
      data.forEach(row => {
        const values = headers.map(h => {
          const val = row[h] || '';
          return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
        });
        csvContent += values.join(',') + '\n';
      });
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${type}_export_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      
      toast({
        title: "Export Successful",
        description: `Exported ${data.length} ${type} records`,
      });
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-600';
      case 'partial': return 'text-orange-600';
      case 'error': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'partial': case 'error': return <AlertCircle className="h-4 w-4 text-orange-600" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Data Import/Export</h1>
          <p className="text-muted-foreground">Import and export client and installation data</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <Card className="shadow-riana">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import Data
            </CardTitle>
            <CardDescription>
              Import client or installation data from CSV file
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import_type">Import Type</Label>
              <select
                id="import_type"
                value={importType}
                onChange={(e) => setImportType(e.target.value as 'clients' | 'installations')}
                className="w-full p-2 border rounded-md bg-background"
                disabled={isUploading}
              >
                <option value="">Select import type</option>
                <option value="clients">Clients Data</option>
                <option value="installations">Installations Data</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="file_upload">CSV File</Label>
              <Input
                id="file_upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                disabled={isUploading}
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>

            {isUploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="w-full" />
              </div>
            )}

            <Alert>
              <FileSpreadsheet className="h-4 w-4" />
              <AlertDescription>
                <strong>File Requirements:</strong>
                <ul className="mt-2 text-sm list-disc list-inside">
                  <li>CSV format with comma-separated values</li>
                  <li>First row must contain column headers</li>
                  <li>Maximum 1000 records per file</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Button 
              onClick={handleImport} 
              disabled={!selectedFile || !importType || isUploading}
              className="w-full gradient-primary"
            >
              {isUploading ? "Processing..." : "Import Data"}
            </Button>
          </CardContent>
        </Card>

        {/* Export & Templates */}
        <Card className="shadow-riana">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export & Templates
            </CardTitle>
            <CardDescription>
              Download templates or export existing data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <h4 className="font-medium">Download Templates</h4>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h5 className="font-medium">Clients Template</h5>
                  <p className="text-sm text-muted-foreground">CSV template for client data</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadTemplate('clients')}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
              
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h5 className="font-medium">Installations Template</h5>
                  <p className="text-sm text-muted-foreground">CSV template for installation data</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadTemplate('installations')}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              <h4 className="font-medium">Export Existing Data</h4>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h5 className="font-medium">Export Clients</h5>
                  <p className="text-sm text-muted-foreground">Download all client records</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => exportData('clients')}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
              
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <h5 className="font-medium">Export Installations</h5>
                  <p className="text-sm text-muted-foreground">Download all installation records</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => exportData('installations')}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Import History */}
      <Card className="shadow-riana">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Import History
          </CardTitle>
          <CardDescription>
            Recent import operations and their status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {importHistory.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Upload Date</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importHistory.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-primary" />
                        <span className="font-medium">{item.filename}</span>
                      </div>
                    </TableCell>
                    <TableCell>{new Date(item.uploadDate).toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>Total: {item.recordsProcessed}</div>
                        <div className="text-green-600">Success: {item.recordsSuccess}</div>
                        {item.recordsError > 0 && (
                          <div className="text-red-600">Errors: {item.recordsError}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {Math.round((item.recordsSuccess / item.recordsProcessed) * 100)}%
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(item.status)}
                        <span className={getStatusColor(item.status)}>
                          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No import history yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};