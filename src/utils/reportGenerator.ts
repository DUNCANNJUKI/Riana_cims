import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { apiClient } from '@/integrations/apiClient';
import { addCimsDocumentHeader, DOCUMENT_LAYOUT, getPDFAsBlob, generateReportSerial, RIANA_DOCUMENT_TEAL, resolveDocumentBrand } from './pdfWatermark';
import { applyCompanyBranding } from './companyLogo';


interface ReportData {
  title: string;
  dateRange?: { from: string; to: string };
  generatedBy: string;
  data: any[];
}

// Company branding colors (RIANA colors)
const COLORS = {
  primary: RIANA_DOCUMENT_TEAL, // Matches the official RIANA logo edge tone
  secondary: [16, 185, 129] as [number, number, number], // Green
  text: [51, 51, 51] as [number, number, number], // Dark gray
  lightGray: [243, 244, 246] as [number, number, number],
  white: [255, 255, 255] as [number, number, number]
};

export interface GeneratePDFOptions {
  preview?: boolean; // If true, returns Blob instead of downloading
  subsidiaryName?: string | null;
}

export const generatePDFReport = async (
  reportType: string, 
  dateRange?: { from: string; to: string },
  options?: GeneratePDFOptions
): Promise<Blob | void> => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const documentTitle = getReportTitle(reportType);
  const brand = resolveDocumentBrand(options?.subsidiaryName);
  
  await addCimsDocumentHeader(doc, {
    subtitle: 'Client Installation Management System',
    documentTitle,
    subsidiaryName: options?.subsidiaryName,
  });

  // The report name is already rendered in the branded header.
  let yPosition = 55;

  // Date range and metadata
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(128, 128, 128);
  
  // doc.text(`Generated: ${currentDate}`, margin, yPosition); // Removed as it's in footer
  
  // Serialization
  const reportCode = reportType.split('-').map(w => w[0]).join('').toUpperCase().substring(0, 4);
  const serial = generateReportSerial(reportCode);
  doc.text(`Serial: ${serial}`, pageWidth - margin, yPosition, { align: 'right' });
  
  if (dateRange && dateRange.from && dateRange.to) {
    yPosition += 5;
    doc.text(`Period: ${dateRange.from} to ${dateRange.to}`, margin, yPosition);
  }
  
  yPosition += 8;

  // Fetch and render data based on report type
  const reportData = await fetchReportData(reportType, dateRange);
  
  if (reportData.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.text);
    doc.text('No data available for this report', margin, yPosition + 10);
  } else {
    // Generate table based on report type
    autoTable(doc, {
      startY: yPosition,
      head: [getTableHeaders(reportType)],
      body: formatTableData(reportType, reportData),
      theme: 'grid',
      headStyles: {
        fillColor: brand.primary,
        textColor: COLORS.white,
        fontSize: 9,
        fontStyle: 'bold',
        halign: 'left',
        cellPadding: 3
      },
      bodyStyles: {
        fontSize: 8,
        textColor: COLORS.text,
        cellPadding: 2
      },
      alternateRowStyles: {
        fillColor: COLORS.lightGray
      },
      margin: { left: margin, right: margin, top: DOCUMENT_LAYOUT.continuationContentTop, bottom: DOCUMENT_LAYOUT.autoTableBottomMargin },
      styles: {
        cellPadding: 3,
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
        overflow: 'linebreak'
      },
      pageBreak: 'auto',
      showHead: 'everyPage'
    });
  }

  // Add letterhead and watermarks to all pages for authenticity
  try {
    await applyCompanyBranding(doc, {
      subsidiaryName: options?.subsidiaryName,
      documentTitle,
    });
  } catch (error) {
    console.log('Branding could not be added:', error);
  }

  // Return blob for preview or download
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `${reportType}_${dateStr}.pdf`;
  
  if (options?.preview) {
    return getPDFAsBlob(doc);
  }
  
  doc.save(fileName);
};

export const generateCSVReport = async (reportType: string, dateRange?: { from: string; to: string }) => {
  const reportData = await fetchReportData(reportType, dateRange);
  
  if (reportData.length === 0) {
    alert('No data available for this report');
    return;
  }

  const headers = getTableHeaders(reportType);
  const formattedData = formatTableData(reportType, reportData);
  
  // Create CSV content
  let csvContent = headers.join(',') + '\n';
  
  formattedData.forEach(row => {
    const rowData = row.map((cell: any) => {
      // Escape quotes and wrap in quotes if contains comma
      const cellStr = String(cell || '');
      if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        return '"' + cellStr.replace(/"/g, '""') + '"';
      }
      return cellStr;
    });
    csvContent += rowData.join(',') + '\n';
  });

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${reportType}_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const getReportTitle = (reportType: string): string => {
  const titles: Record<string, string> = {
    'clients-summary': 'Clients Summary Report',
    'installations-overview': 'Installations Overview Report',
    'e-handover': 'E-Handover Report',
    'installation-progress': 'Installation Progress Report',
    'monthly-analytics': 'Monthly Analytics Report',
    'contract-distribution': 'Contract Type Distribution Report',
    'user-activity': 'User Activity Report',
    'installation-by-type': 'Installation Types Report',
    'technician-performance': 'Technician Performance Report'
  };
  return titles[reportType] || 'System Report';
};

const getTableHeaders = (reportType: string): string[] => {
  const headers: Record<string, string[]> = {
    'clients-summary': ['Client Name', 'Contact Person', 'Phone', 'Email', 'Contract', 'Industry', 'Start Date'],
    'installations-overview': ['Client', 'Kiosks', 'Displays', 'Tablets', 'UPS', 'Status', 'Completion'],
    'e-handover': ['Client', 'Upload Date', 'File Name', 'Signed', 'Status', 'Notes'],
    'installation-progress': ['Client', 'Start Date', 'Hardware Tech', 'Software Tech', 'End Date', 'Status'],
    'monthly-analytics': ['Month', 'New Clients', 'Installations', 'Avg. Duration', 'Satisfaction'],
    'contract-distribution': ['Contract Type', 'Client Count', 'Percentage'],
    'user-activity': ['User', 'Action', 'Details', 'Date/Time'],
    'installation-by-type': ['Equipment Type', 'Total Count', 'Avg per Installation'],
    'technician-performance': ['Technician', 'Assignments', 'Completed', 'In Progress', 'Avg. Time']
  };
  return headers[reportType] || ['Data'];
};

const fetchReportData = async (reportType: string, dateRange?: { from: string; to: string }) => {
  try {
    switch (reportType) {
      case 'clients-summary': {
        const data = await apiClient.get('/clients');
        let filtered = data || [];
        if (dateRange?.from) filtered = filtered.filter((c: any) => c.start_date >= dateRange.from);
        if (dateRange?.to) filtered = filtered.filter((c: any) => c.start_date <= dateRange.to);
        return filtered;
      }
      
      case 'installations-overview': {
        const data = await apiClient.get('/installations');
        let filtered = data || [];
        if (dateRange?.from) filtered = filtered.filter((i: any) => i.created_at >= dateRange.from);
        if (dateRange?.to) filtered = filtered.filter((i: any) => i.created_at <= dateRange.to);
        return filtered;
      }
      
      case 'e-handover': {
        const data = await apiClient.get('/handover_uploads');
        let filtered = data || [];
        if (dateRange?.from) filtered = filtered.filter((h: any) => h.upload_date >= dateRange.from);
        if (dateRange?.to) filtered = filtered.filter((h: any) => h.upload_date <= dateRange.to);
        return filtered;
      }
      
      case 'installation-progress': {
        const data = await apiClient.get('/client_assignments');
        let filtered = data || [];
        if (dateRange?.from) filtered = filtered.filter((a: any) => a.installation_start_date >= dateRange.from);
        if (dateRange?.to) filtered = filtered.filter((a: any) => a.installation_start_date <= dateRange.to);
        return filtered;
      }
      
      case 'monthly-analytics': {
        const [installations, clients, feedback] = await Promise.all([
          apiClient.get('/installations'),
          apiClient.get('/clients'),
          apiClient.get('/installation_feedback')
        ]);
        
        const monthlyData: any = {};
        clients?.forEach((client: any) => {
          const month = new Date(client.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
          if (!monthlyData[month]) monthlyData[month] = { month, newClients: 0, newInstallations: 0, completed: 0, totalDays: 0, count: 0 };
          monthlyData[month].newClients++;
        });

        installations?.forEach((inst: any) => {
          const month = new Date(inst.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
          if (!monthlyData[month]) monthlyData[month] = { month, newClients: 0, newInstallations: 0, completed: 0, totalDays: 0, count: 0 };
          monthlyData[month].newInstallations++;
          if (inst.status === 'completed') {
            monthlyData[month].completed++;
            if (inst.completion_date) {
              const days = Math.floor((new Date(inst.completion_date).getTime() - new Date(inst.created_at).getTime()) / (1000 * 60 * 60 * 24));
              monthlyData[month].totalDays += Math.max(0, days);
              monthlyData[month].count++;
            }
          }
        });

        feedback?.forEach((fb: any) => {
          const month = new Date(fb.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
          if (monthlyData[month]) {
            monthlyData[month].satisfaction = (monthlyData[month].satisfaction || 0) + fb.overall_satisfaction;
            monthlyData[month].feedbackCount = (monthlyData[month].feedbackCount || 0) + 1;
          }
        });

        return Object.values(monthlyData);
      }
      
      case 'user-activity': {
        const data = await apiClient.get(`/system_logs?limit=100`);
        let filtered = data || [];
        if (dateRange?.from) filtered = filtered.filter((l: any) => l.created_at >= dateRange.from);
        if (dateRange?.to) filtered = filtered.filter((l: any) => l.created_at <= dateRange.to);
        return filtered;
      }
      
      case 'contract-distribution': {
        const data = await apiClient.get('/clients');
        const distribution = (data || []).reduce((acc: any, client: any) => {
          const type = client.contract_type || 'OTHER';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {});
        const total = data?.length || 0;
        return Object.entries(distribution).map(([type, count]) => ({
          contract_type: type,
          count,
          percentage: total > 0 ? ((count as number / total) * 100).toFixed(1) : 0
        }));
      }
      
      case 'installation-by-type': {
        const data = await apiClient.get('/installations');
        const total = data?.length || 1;
        const equipmentTotals = {
          'Kiosks': data?.reduce((sum: number, i: any) => sum + (i.kiosk_count || 0), 0) || 0,
          'LED Displays': data?.reduce((sum: number, i: any) => sum + (i.led_count || 0), 0) || 0,
          'Tablets': data?.reduce((sum: number, i: any) => sum + (i.tablets || 0), 0) || 0,
          'UPS Units': data?.reduce((sum: number, i: any) => sum + (i.ups_count || 0), 0) || 0,
          'Speakers': data?.reduce((sum: number, i: any) => sum + (i.speakers || 0), 0) || 0,
          'Media Controllers': data?.reduce((sum: number, i: any) => sum + (i.media_controllers || 0), 0) || 0,
          'Digital Signage': data?.reduce((sum: number, i: any) => sum + (i.digital_signage_system || 0), 0) || 0,
          'Service Points': data?.reduce((sum: number, i: any) => sum + (i.service_points || 0), 0) || 0,
          'Amplifiers': data?.reduce((sum: number, i: any) => sum + (i.amplifiers || 0), 0) || 0,
          'HDMI Cables': data?.reduce((sum: number, i: any) => sum + (i.hdmis || 0), 0) || 0,
          'Splitters': data?.reduce((sum: number, i: any) => sum + (i.splitters || 0), 0) || 0
        };
        return Object.entries(equipmentTotals).map(([type, count]) => ({
          equipment_type: type,
          total_count: count,
          average: (count / total).toFixed(2)
        }));
      }
      
      case 'technician-performance': {
        const assignments = await apiClient.get('/client_assignments');
        const techStats: any = {};
        assignments?.forEach((assignment: any) => {
          [assignment.hardware_tech, assignment.software_tech].forEach((tech: any) => {
            if (tech && (tech.id || tech.first_name)) {
              const techId = tech.id || `${tech.first_name}-${tech.last_name}`;
              if (!techStats[techId]) {
                techStats[techId] = {
                  name: `${tech.first_name || ''} ${tech.last_name || ''}`.trim() || 'Unknown',
                  total: 0, completed: 0, inProgress: 0, totalDays: 0, count: 0
                };
              }
              techStats[techId].total++;
              if (assignment.status === 'completed') {
                techStats[techId].completed++;
                if (assignment.scheduled_end_date && assignment.installation_start_date) {
                  const days = Math.floor((new Date(assignment.scheduled_end_date).getTime() - new Date(assignment.installation_start_date).getTime()) / (1000 * 60 * 60 * 24));
                  techStats[techId].totalDays += Math.max(0, days);
                  techStats[techId].count++;
                }
              } else if (['in_progress', 'assigned'].includes(assignment.status)) {
                techStats[techId].inProgress++;
              }
            }
          });
        });
        return Object.values(techStats);
      }
    }
  } catch (error) {

    console.error('Error fetching report data:', error);
    return [];
  }
};


const formatTableData = (reportType: string, data: any[]): any[][] => {
  switch (reportType) {
    case 'clients-summary':
      return data.map(client => [
        client.client_name || '',
        client.contact_person_name || '',
        client.contact_person_phone || '',
        client.contact_person_email || 'N/A',
        client.contract_type || '',
        client.industry_classification || '',
        client.start_date ? new Date(client.start_date).toLocaleDateString('en-GB') : ''
      ]);
    
    case 'installations-overview':
      return data.map(installation => [
        `${installation.clients?.client_name || ''} ${installation.clients?.branch ? '(' + installation.clients.branch + ')' : ''}`.trim(),
        installation.kiosk_count || 0,
        installation.led_count || 0,
        installation.tablets || 0,
        installation.ups_count || 0,
        installation.status?.toUpperCase() || '',
        installation.completion_date ? new Date(installation.completion_date).toLocaleDateString('en-GB') : 'In Progress'
      ]);
    
    case 'e-handover':
      return data.map(handover => [
        handover.clients?.client_name || '',
        handover.upload_date ? new Date(handover.upload_date).toLocaleDateString('en-GB') : '',
        handover.file_name || 'N/A',
        handover.is_signed ? 'Yes' : 'No',
        handover.installations?.status?.toUpperCase() || 'N/A',
        handover.notes || '-'
      ]);
    
    case 'installation-progress':
      return data.map(assignment => [
        `${assignment.clients?.client_name || ''} ${assignment.clients?.branch ? '(' + assignment.clients.branch + ')' : ''}`.trim(),
        assignment.installation_start_date ? new Date(assignment.installation_start_date).toLocaleDateString('en-GB') : '',
        assignment.hardware_tech ? `${assignment.hardware_tech.first_name} ${assignment.hardware_tech.last_name}` : 'N/A',
        assignment.software_tech ? `${assignment.software_tech.first_name} ${assignment.software_tech.last_name}` : 'N/A',
        assignment.scheduled_end_date ? new Date(assignment.scheduled_end_date).toLocaleDateString('en-GB') : 'TBD',
        assignment.status?.toUpperCase() || ''
      ]);
    
    case 'monthly-analytics':
      return data.map((month: any) => [
        month.month,
        month.newClients || 0,
        month.newInstallations || 0,
        month.count > 0 ? `${(month.totalDays / month.count).toFixed(1)} days` : 'N/A',
        month.feedbackCount > 0 ? `${(month.satisfaction / month.feedbackCount).toFixed(1)}/5` : 'N/A'
      ]);
    
    case 'user-activity':
      return data.map(log => [
        log.user_profiles ? `${log.user_profiles.first_name} ${log.user_profiles.last_name}` : log.user_id?.substring(0, 8) || 'System',
        log.action || '',
        log.details?.substring(0, 50) || 'N/A',
        new Date(log.created_at).toLocaleString('en-GB')
      ]);
    
    case 'contract-distribution':
      return data.map(item => [
        item.contract_type,
        item.count,
        `${item.percentage}%`
      ]);
    
    case 'installation-by-type':
      return data.map((item: any) => [
        item.equipment_type,
        item.total_count,
        item.average
      ]);
    
    case 'technician-performance':
      return data.map((tech: any) => [
        tech.name,
        tech.total || 0,
        tech.completed || 0,
        tech.inProgress || 0,
        tech.count > 0 ? `${(tech.totalDays / tech.count).toFixed(1)} days` : 'N/A'
      ]);
    
    default:
      return [];
  }
};
