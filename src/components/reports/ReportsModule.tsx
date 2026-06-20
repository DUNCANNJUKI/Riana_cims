import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Calendar, Filter, BarChart3, PieChart, TrendingUp, Loader2, Eye, FileDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { User, HandoverUpload } from "@/types";
import { generatePDFReport, generateCSVReport } from "@/utils/reportGenerator";
import { PDFPreviewModal } from "@/components/common/PDFPreviewModal";
import { apiClient } from "@/integrations/apiClient";
import { useDatabase } from "@/hooks/useDatabase";

interface ReportsModuleProps {
  user: User;
}

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  lastGenerated?: string;
}

const reportTemplates: ReportTemplate[] = [
  {
    id: 'clients-summary',
    name: 'Clients Summary Report',
    description: 'Complete overview of all clients with contact information and contract details',
    category: 'Clients',
    icon: FileText
  },
  {
    id: 'installations-overview',
    name: 'Installations Overview',
    description: 'Detailed report of all installations with equipment specifications',
    category: 'Installations',
    icon: BarChart3
  },
  {
    id: 'e-handover',
    name: 'E-Handover',
    description: 'Electronic handover documents with installation details, escalation matrix, and signatures',
    category: 'Handover',
    icon: FileText
  },
  {
    id: 'installation-progress',
    name: 'Installation Progress Report',
    description: 'Client assignments, technicians, progress status, and team leads tracking',
    category: 'Assignments',
    icon: TrendingUp
  },
  {
    id: 'monthly-analytics',
    name: 'Monthly Analytics',
    description: 'Monthly performance metrics and installation statistics',
    category: 'Analytics',
    icon: TrendingUp
  },
  {
    id: 'contract-distribution',
    name: 'Contract Type Distribution',
    description: 'Breakdown of clients by contract types and industry classification',
    category: 'Analytics',
    icon: PieChart
  },
  {
    id: 'user-activity',
    name: 'User Activity Report',
    description: 'System usage and user activity logs',
    category: 'System',
    icon: FileText
  },
  {
    id: 'installation-by-type',
    name: 'Installation Types Report',
    description: 'Analysis of installation types and equipment distribution',
    category: 'Installations',
    icon: BarChart3
  },
  {
    id: 'technician-performance',
    name: 'Technician Performance Report',
    description: 'Individual technician performance metrics and assignment completion rates',
    category: 'Assignments',
    icon: BarChart3
  }
];

export const ReportsModule = ({ user }: ReportsModuleProps) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<string>('');
  const [isPreviewing, setIsPreviewing] = useState<string>('');
  const [handoverUploads, setHandoverUploads] = useState<any[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string>('');
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const { toast } = useToast();
  const { getClients } = useDatabase();

  useEffect(() => {
    loadHandoverUploads();
  }, []);

  const loadHandoverUploads = async () => {
    setLoadingUploads(true);
    try {
      const [uploads, clients] = await Promise.all([
        apiClient.get('/handover_uploads'),
        getClients()
      ]);

      const enrichedUploads = (uploads || []).map((upload: any) => {
        const client = clients?.find((c: any) => c.id === upload.client_id);
        return {
          ...upload,
          client_name: client ? `${client.client_name}${client.branch ? ` - ${client.branch}` : ''}` : 'Unknown Client'
        };
      });

      setHandoverUploads(enrichedUploads);
    } catch (error) {
      console.error('Error loading handover uploads:', error);
    } finally {
      setLoadingUploads(false);
    }
  };

  const handleGenerateReport = async (reportId: string, format: 'pdf' | 'csv') => {
    setIsGenerating(reportId);
    
    try {
      const dateRangeFilter = dateFrom && dateTo ? { from: dateFrom, to: dateTo } : undefined;
      
      if (format === 'pdf') {
        await generatePDFReport(reportId, dateRangeFilter);
      } else {
        await generateCSVReport(reportId, dateRangeFilter);
      }
      
      toast({
        title: "Report Generated Successfully",
        description: `${format.toUpperCase()} report has been downloaded to your browser`,
      });
    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: "Error Generating Report",
        description: "There was an error generating the report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating('');
    }
  };

  const handlePreviewReport = async (reportId: string, reportName: string) => {
    setIsPreviewing(reportId);
    
    try {
      const dateRangeFilter = dateFrom && dateTo ? { from: dateFrom, to: dateTo } : undefined;
      const blob = await generatePDFReport(reportId, dateRangeFilter, { preview: true });
      
      if (blob) {
        setPreviewBlob(blob);
        setPreviewFileName(`${reportId}_${new Date().toLocaleDateString().replace(/\//g, '-')}.pdf`);
        setPreviewTitle(reportName);
        setIsPreviewOpen(true);
      }
    } catch (error) {
      console.error('Error generating preview:', error);
    } finally {
      setIsPreviewing('');
    }
  };

  const handlePreviewHandover = (upload: any) => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const fileUrl = upload.file_path.startsWith('http') 
      ? upload.file_path 
      : `${baseUrl}/uploads/${upload.file_path}`;
    window.open(fileUrl, '_blank');
  };

  const handleDownloadHandover = async (upload: any) => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const fileUrl = upload.file_path.startsWith('http') 
      ? upload.file_path 
      : `${baseUrl}/uploads/${upload.file_path}`;
    
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = upload.file_name || 'handover.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const categories = Array.from(new Set(reportTemplates.map(report => report.category)));

  const getIconColor = (category: string) => {
    switch (category) {
      case 'Clients': return 'text-blue-600';
      case 'Installations': return 'text-green-600';
      case 'Analytics': return 'text-purple-600';
      case 'System': return 'text-orange-600';
      case 'Assignments': return 'text-primary';
      case 'Handover': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary">Reports</h1>
          <p className="text-muted-foreground">Generate and download system reports in PDF or Excel format</p>
        </div>
      </div>

      <Card className="shadow-riana">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Report Filters
          </CardTitle>
          <CardDescription>
            Configure date range and filters for report generation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(category => (
                    <SelectItem key={category} value={category}>{category}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date_from">Date From</Label>
              <Input
                id="date_from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date_to">Date To</Label>
              <Input
                id="date_to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button 
                onClick={() => {
                  setSelectedCategory('');
                  setDateFrom('');
                  setDateTo('');
                }}
                variant="outline"
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {(selectedCategory ? reportTemplates.filter(r => r.category === selectedCategory) : reportTemplates).map((report) => {
          const Icon = report.icon;
          return (
            <Card key={report.id} className="shadow-riana hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted`}>
                    <Icon className={`h-6 w-6 ${getIconColor(report.category)}`} />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">{report.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{report.category}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {report.description}
                </p>
                
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePreviewReport(report.id, report.name)}
                    disabled={isGenerating === report.id || isPreviewing === report.id}
                    className="flex-1"
                  >
                    {isPreviewing === report.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Eye className="h-3 w-3 mr-1" />}
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleGenerateReport(report.id, 'pdf')}
                    disabled={isGenerating === report.id || isPreviewing === report.id}
                    className="flex-1"
                  >
                    <FileText className="h-3 w-3 mr-1" />
                    PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleGenerateReport(report.id, 'csv')}
                    disabled={isGenerating === report.id || isPreviewing === report.id}
                    className="flex-1"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    CSV
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {(selectedCategory === '' || selectedCategory === 'Handover') && (
        <Card className="shadow-riana">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-red-600" />
              Uploaded E-Handover Forms
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingUploads ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : handoverUploads.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client Name</TableHead>
                    <TableHead>File Name</TableHead>
                    <TableHead>Upload Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {handoverUploads.map((upload) => (
                    <TableRow key={upload.id}>
                      <TableCell className="font-medium">{upload.client_name}</TableCell>
                      <TableCell>{upload.file_name}</TableCell>
                      <TableCell>{new Date(upload.upload_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant={upload.is_signed ? "default" : "secondary"}>
                          {upload.is_signed ? 'Signed' : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => handlePreviewHandover(upload)}>
                            <Eye className="h-3 w-3 mr-1" /> Preview
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDownloadHandover(upload)}>
                            <FileDown className="h-3 w-3 mr-1" /> Download
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No handover forms uploaded yet.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <PDFPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        pdfBlob={previewBlob}
        fileName={previewFileName}
        title={previewTitle}
        description="Review your report before downloading"
      />
    </div>
  );
};