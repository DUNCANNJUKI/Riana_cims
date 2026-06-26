import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ChangeRequestWithRelations } from '@crms/hooks/useSupabaseData';

// Shared RIANA palette: teal for identity, restrained green only for status.
const BRAND_PRIMARY: [number, number, number] = [13, 131, 144];
const BRAND_DARK: [number, number, number] = [6, 78, 87];
const BRAND_LIGHT: [number, number, number] = [239, 248, 249];
const GREEN_PRIMARY: [number, number, number] = [22, 138, 85];
const GREEN_LIGHT: [number, number, number] = [239, 249, 244];

const assetUrl = (src: string) => {
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  if (typeof window === 'undefined') return src;
  return `${window.location.origin}${src.startsWith('/') ? '' : '/'}${src}`;
};

const fetchAssetAsBase64 = async (src: string): Promise<string | null> => {
  if (typeof fetch !== 'function' || typeof FileReader === 'undefined') return null;
  try {
    const response = await fetch(assetUrl(src));
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const addCimsLetterheadBranding = async (doc: jsPDF) => {
  const [logoBase64, watermarkBase64, footerBase64] = await Promise.all([
    fetchAssetAsBase64('/Riana_logo.png'),
    fetchAssetAsBase64('/report_watermark.png'),
    fetchAssetAsBase64('/report_footer.png'),
  ]);
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    if (watermarkBase64) {
      try {
        doc.saveGraphicsState();
        (doc as any).setGState(new (doc as any).GState({ opacity: 0.1 }));
        const width = pageWidth - 48;
        const height = width * 0.32;
        doc.addImage(watermarkBase64, 'PNG', (pageWidth - width) / 2, (pageHeight - height) / 2, width, height);
        doc.restoreGraphicsState();
      } catch {
        try { doc.restoreGraphicsState(); } catch {}
      }
    }
    if (page === 1 && logoBase64) {
      try {
        doc.addImage(logoBase64, 'PNG', 14, 9, 32, 22);
      } catch {
        // Existing text header remains the fallback.
      }
    }
    if (footerBase64) {
      try {
        const footerWidth = pageWidth - 20;
        const footerHeight = (footerWidth / 800) * 100;
        doc.addImage(footerBase64, 'PNG', 10, pageHeight - footerHeight - 12, footerWidth, footerHeight);
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.text(`Page ${page} of ${pageCount}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
      } catch {
        // Existing text footer remains the fallback.
      }
    }
  }
};

const addProfessionalFooters = (doc: jsPDF) => {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 275, 210, 22, 'F');
    doc.setDrawColor(...BRAND_PRIMARY);
    doc.setLineWidth(0.35);
    doc.line(14, 279, 196, 279);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND_DARK);
    doc.text(`RIANA CIMS | Confidential | Page ${page} of ${pageCount}`, 14, 286);
    doc.text(`Generated ${format(new Date(), 'MMM d, yyyy h:mm a')}`, 196, 286, { align: 'right' });
  }
};

interface AuditLogEntry {
  action_label: string;
  created_at: string;
  details?: string;
  profiles?: { name: string } | null;
}

export const generateChangeRequestPDF = async (
  request: ChangeRequestWithRelations,
  auditLogs: AuditLogEntry[] = []
): Promise<jsPDF> => {
  const doc = new jsPDF();

  // Header with Riana Group branding
  doc.setFillColor(BRAND_PRIMARY[0], BRAND_PRIMARY[1], BRAND_PRIMARY[2]);
  doc.rect(0, 0, 210, 45, 'F');

  // Header accent line
  doc.setFillColor(BRAND_DARK[0], BRAND_DARK[1], BRAND_DARK[2]);
  doc.rect(0, 42, 210, 3, 'F');

  // Add Company Logo
  try {
    // We'll use a placeholder for the logo in the PDF if the asset isn't easily embeddable 
    // as a base64 string directly from imports in this environment, 
    // but the standard way is to use doc.addImage
    // Since we are in a browser-like env, we might need to load it first or pass as base64
    // For now, I'll add the placeholder text and the user can confirm if they want the actual image embedded
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('RIANA GROUP', 105, 16, { align: 'center' });
  } catch (e) {
    console.error('Error adding logo to PDF', e);
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('CHANGE REQUEST FORM', 105, 26, { align: 'center' });

  doc.setFontSize(11);
  doc.text(`Ticket: ${request.ticket_number}`, 105, 36, { align: 'center' });

  // Reset text color
  doc.setTextColor(0, 0, 0);

  // Client Information Section
  let yPos = 55;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND_PRIMARY[0], BRAND_PRIMARY[1], BRAND_PRIMARY[2]);
  doc.text('CLIENT INFORMATION', 14, yPos);

  doc.setDrawColor(BRAND_PRIMARY[0], BRAND_PRIMARY[1], BRAND_PRIMARY[2]);
  doc.setLineWidth(0.8);
  doc.line(14, yPos + 3, 196, yPos + 3);

  autoTable(doc, {
    startY: yPos + 7,
    head: [],
    body: [
      ['Client Name', request.client?.name || 'N/A'],
      ['Branch', request.client?.branch || 'N/A'],
      ['Contract Type', (request.client?.contract_type || 'N/A').toUpperCase()],
      ['Contact Person', request.client?.contact_person || 'N/A'],
      ['Contact Email', request.client?.contact_email || 'N/A'],
      ['Contact Phone', request.client?.contact_phone || 'N/A'],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3, textColor: [30, 30, 30] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 45, fillColor: BRAND_LIGHT },
      1: { cellWidth: 135 },
    },
    alternateRowStyles: { fillColor: [255, 255, 255] },
  });

  // Request Details Section
  const currentY = (doc as any).lastAutoTable.finalY + 12;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND_PRIMARY[0], BRAND_PRIMARY[1], BRAND_PRIMARY[2]);
  doc.text('REQUEST DETAILS', 14, currentY);
  doc.line(14, currentY + 3, 196, currentY + 3);

  autoTable(doc, {
    startY: currentY + 7,
    head: [],
    body: [
      ['Department', request.department],
      ['Date Requested', format(new Date(request.date_requested), 'MMMM d, yyyy')],
      ['Priority', request.priority.toUpperCase()],
      ['Status', request.status.replace(/_/g, ' ').toUpperCase()],
      ['Estimated Completion', format(new Date(request.estimated_completion_date), 'MMMM d, yyyy')],
      ['Request Source', request.source.charAt(0).toUpperCase() + request.source.slice(1)],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3, textColor: [30, 30, 30] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 45, fillColor: BRAND_LIGHT },
      1: { cellWidth: 135 },
    },
  });

  // Change Description Section
  const descY = (doc as any).lastAutoTable.finalY + 12;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND_PRIMARY[0], BRAND_PRIMARY[1], BRAND_PRIMARY[2]);
  doc.text('CHANGE DESCRIPTION', 14, descY);
  doc.line(14, descY + 3, 196, descY + 3);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  const splitDescription = doc.splitTextToSize(request.change_description, 180);
  doc.text(splitDescription, 14, descY + 10);

  // Modules Affected Section
  const modulesY = descY + 10 + (splitDescription.length * 4) + 12;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND_PRIMARY[0], BRAND_PRIMARY[1], BRAND_PRIMARY[2]);
  doc.text('MODULES AFFECTED', 14, modulesY);
  doc.line(14, modulesY + 3, 196, modulesY + 3);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  const modulesAffected = (Array.isArray(request.modules_affected) ? request.modules_affected : JSON.parse(request.modules_affected || '[]'));
  doc.text(modulesAffected.join(' • '), 14, modulesY + 10);

  // Timeline Section (if audit logs provided)
  let sigY = modulesY + 25;

  if (auditLogs.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(BRAND_PRIMARY[0], BRAND_PRIMARY[1], BRAND_PRIMARY[2]);
    doc.text('ACTIVITY TIMELINE', 14, sigY);
    doc.line(14, sigY + 3, 196, sigY + 3);

    const timelineData = auditLogs.slice(0, 6).map(log => [
      format(new Date(log.created_at), 'MMM d, yyyy h:mm a'),
      log.action_label,
      log.profiles?.name || 'System',
    ]);

    autoTable(doc, {
      startY: sigY + 7,
      head: [['Date/Time', 'Action', 'By']],
      body: timelineData,
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: BRAND_PRIMARY, textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 45 },
        1: { cellWidth: 95 },
        2: { cellWidth: 40 },
      },
    });

    sigY = (doc as any).lastAutoTable.finalY + 15;
  }

  // Check if we need a new page for signatures
  if (sigY > 220) {
    doc.addPage();
    sigY = 20;
  }

  // Signature Section
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND_PRIMARY[0], BRAND_PRIMARY[1], BRAND_PRIMARY[2]);
  doc.text('SIGNATURES & AUTHORIZATION', 14, sigY);
  doc.line(14, sigY + 3, 196, sigY + 3);

  // Developer Signature Box
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);

  doc.text('Senior Developer:', 14, sigY + 15);
  doc.text(request.senior_developer?.name || '___________________', 55, sigY + 15);
  doc.text('Signature:', 14, sigY + 25);
  doc.setDrawColor(150, 150, 150);
  doc.line(55, sigY + 25, 95, sigY + 25);
  doc.text('Date:', 105, sigY + 25);
  doc.line(120, sigY + 25, 160, sigY + 25);

  // Assigned Developer
  doc.text('Assigned Developer:', 14, sigY + 38);
  doc.text(request.assigned_developer?.name || '___________________', 55, sigY + 38);
  doc.text('Signature:', 14, sigY + 48);
  doc.line(55, sigY + 48, 95, sigY + 48);
  doc.text('Date:', 105, sigY + 48);
  doc.line(120, sigY + 48, 160, sigY + 48);

  // Client Signature Box
  doc.text('Client Representative:', 14, sigY + 61);
  doc.line(55, sigY + 61, 95, sigY + 61);
  doc.text('Designation:', 105, sigY + 61);
  doc.line(135, sigY + 61, 180, sigY + 61);
  doc.text('Signature:', 14, sigY + 71);
  doc.line(55, sigY + 71, 95, sigY + 71);
  doc.text('Date:', 105, sigY + 71);
  doc.line(120, sigY + 71, 160, sigY + 71);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated on ${format(new Date(), 'MMMM d, yyyy h:mm a')}`, 105, 282, { align: 'center' });
  doc.text(`© ${new Date().getFullYear()} Riana Group. All rights reserved.`, 105, 288, { align: 'center' });

  addProfessionalFooters(doc);
  await addCimsLetterheadBranding(doc);
  return doc;
};

export const generateCompletionReportPDF = async (
  request: ChangeRequestWithRelations,
  auditLogs: AuditLogEntry[] = []
): Promise<jsPDF> => {
  const doc = new jsPDF();

  // Keep the shared RIANA header; green remains a semantic completion accent.
  doc.setFillColor(BRAND_PRIMARY[0], BRAND_PRIMARY[1], BRAND_PRIMARY[2]);
  doc.rect(0, 0, 210, 45, 'F');

  // Header accent line
  doc.setFillColor(GREEN_PRIMARY[0], GREEN_PRIMARY[1], GREEN_PRIMARY[2]);
  doc.rect(0, 42, 210, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('RIANA GROUP', 105, 16, { align: 'center' });

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text('COMPLETION REPORT', 105, 26, { align: 'center' });

  doc.setFontSize(11);
  doc.text(`Ticket: ${request.ticket_number}`, 105, 36, { align: 'center' });

  // Reset text color
  doc.setTextColor(0, 0, 0);

  // Status Badge
  doc.setFillColor(GREEN_PRIMARY[0], GREEN_PRIMARY[1], GREEN_PRIMARY[2]);
  doc.roundedRect(80, 50, 50, 10, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('COMPLETED', 105, 57, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // Summary Section
  let yPos = 70;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(BRAND_PRIMARY[0], BRAND_PRIMARY[1], BRAND_PRIMARY[2]);
  doc.text('SUMMARY', 14, yPos);
  doc.setDrawColor(BRAND_PRIMARY[0], BRAND_PRIMARY[1], BRAND_PRIMARY[2]);
  doc.setLineWidth(0.8);
  doc.line(14, yPos + 3, 196, yPos + 3);

  autoTable(doc, {
    startY: yPos + 7,
    head: [],
    body: [
      ['Client', request.client?.name || 'N/A'],
      ['Branch', request.client?.branch || 'N/A'],
      ['Ticket Number', request.ticket_number],
      ['Date Requested', format(new Date(request.date_requested), 'MMMM d, yyyy')],
      ['Commencement Date', request.commencement_date ? format(new Date(request.commencement_date), 'MMMM d, yyyy') : 'N/A'],
      ['Completion Date', request.completion_date ? format(new Date(request.completion_date), 'MMMM d, yyyy') : 'N/A'],
      ['Senior Developer', request.senior_developer?.name || 'N/A'],
      ['Assigned Developer', request.assigned_developer?.name || 'N/A'],
      ['Priority', request.priority.toUpperCase()],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 3, textColor: [30, 30, 30] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 45, fillColor: GREEN_LIGHT },
      1: { cellWidth: 135 },
    },
  });

  // Work Description Section
  const workY = (doc as any).lastAutoTable.finalY + 12;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(GREEN_PRIMARY[0], GREEN_PRIMARY[1], GREEN_PRIMARY[2]);
  doc.text('WORK COMPLETED', 14, workY);
  doc.setDrawColor(GREEN_PRIMARY[0], GREEN_PRIMARY[1], GREEN_PRIMARY[2]);
  doc.line(14, workY + 3, 196, workY + 3);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  const splitDescription = doc.splitTextToSize(request.change_description, 180);
  doc.text(splitDescription, 14, workY + 10);

  // Modules Modified
  const modulesY = workY + 10 + (splitDescription.length * 4) + 12;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(GREEN_PRIMARY[0], GREEN_PRIMARY[1], GREEN_PRIMARY[2]);
  doc.text('MODULES MODIFIED', 14, modulesY);
  doc.line(14, modulesY + 3, 196, modulesY + 3);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  const modulesAffected = (Array.isArray(request.modules_affected) ? request.modules_affected : JSON.parse(request.modules_affected || '[]'));
  doc.text(modulesAffected.join(' • '), 14, modulesY + 10);

  // Timeline Section
  let timelineY = modulesY + 25;

  if (auditLogs.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(GREEN_PRIMARY[0], GREEN_PRIMARY[1], GREEN_PRIMARY[2]);
    doc.text('COMPLETE ACTIVITY TIMELINE', 14, timelineY);
    doc.line(14, timelineY + 3, 196, timelineY + 3);

    const timelineData = auditLogs.map(log => [
      format(new Date(log.created_at), 'MMM d, yyyy h:mm a'),
      log.action_label,
      log.profiles?.name || 'System',
      log.details || '-',
    ]);

    autoTable(doc, {
      startY: timelineY + 7,
      head: [['Date/Time', 'Action', 'By', 'Details']],
      body: timelineData,
      theme: 'striped',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: GREEN_PRIMARY, textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 45 },
        2: { cellWidth: 30 },
        3: { cellWidth: 70 },
      },
    });

    timelineY = (doc as any).lastAutoTable.finalY + 12;
  }

  // Approval Information
  if (request.approval_comment) {
    if (timelineY > 220) {
      doc.addPage();
      timelineY = 20;
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(GREEN_PRIMARY[0], GREEN_PRIMARY[1], GREEN_PRIMARY[2]);
    doc.text('APPROVAL NOTES', 14, timelineY);
    doc.line(14, timelineY + 3, 196, timelineY + 3);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text(request.approval_comment, 14, timelineY + 10);

    if (request.is_chargeable !== undefined) {
      doc.text(`Chargeable: ${request.is_chargeable ? 'Yes' : 'No'}`, 14, timelineY + 18);
    }
    if (request.sales_remarks) {
      doc.text(`Sales Remarks: ${request.sales_remarks}`, 14, timelineY + 26);
    }

    timelineY += 35;
  }

  // Sign-off Section
  if (timelineY > 200) {
    doc.addPage();
    timelineY = 20;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(GREEN_PRIMARY[0], GREEN_PRIMARY[1], GREEN_PRIMARY[2]);
  doc.text('SIGN-OFF & ACCEPTANCE', 14, timelineY);
  doc.line(14, timelineY + 3, 196, timelineY + 3);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);

  // Developer Sign-off
  doc.text('Developer Sign-off:', 14, timelineY + 15);
  doc.text(request.assigned_developer?.name || '___________________', 55, timelineY + 15);
  doc.text('Signature:', 14, timelineY + 25);
  doc.setDrawColor(150, 150, 150);
  doc.line(55, timelineY + 25, 95, timelineY + 25);
  doc.text('Date:', 105, timelineY + 25);
  doc.line(120, timelineY + 25, 160, timelineY + 25);

  // Client Acceptance
  doc.text('Client Acceptance:', 14, timelineY + 40);
  doc.text('I hereby confirm that the above changes have been implemented and tested to my satisfaction.', 14, timelineY + 48);

  doc.text('Name:', 14, timelineY + 58);
  doc.line(35, timelineY + 58, 95, timelineY + 58);
  doc.text('Designation:', 105, timelineY + 58);
  doc.line(135, timelineY + 58, 180, timelineY + 58);

  doc.text('Signature:', 14, timelineY + 68);
  doc.line(55, timelineY + 68, 95, timelineY + 68);
  doc.text('Date:', 105, timelineY + 68);
  doc.line(120, timelineY + 68, 160, timelineY + 68);

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated on ${format(new Date(), 'MMMM d, yyyy h:mm a')}`, 105, 282, { align: 'center' });
  doc.text(`© ${new Date().getFullYear()} Riana Group. All rights reserved.`, 105, 288, { align: 'center' });

  addProfessionalFooters(doc);
  await addCimsLetterheadBranding(doc);
  return doc;
};

export const downloadPDF = (doc: jsPDF, filename: string) => {
  doc.save(filename);
};
