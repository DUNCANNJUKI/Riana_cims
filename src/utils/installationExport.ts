import { Installation, Client, Company, Subsidiary, EscalationMatrix } from "@/types";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addLetterheadToDocument } from "./pdfWatermark";

const loadImageAsBase64 = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${src}`));
    img.src = src;
  });

const parseHexColor = (hex: string): [number, number, number] => {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [30, 58, 138];
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
};

export const generateInstallationReport = async (
  installation: Installation,
  client: Client,
  company: Company,
  subsidiary?: Subsidiary
): Promise<void> => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const bottomMargin = 30; // space for footer
  let yPos = margin;

  // Export date = today
  const exportDate = new Date();
  const formattedExportDate = exportDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // Generate unique reference code
  const clientName = client.client_name || "CLT";
  const clientInitials = clientName.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 3);
  const dateCode = exportDate.toISOString().slice(2, 10).replace(/-/g, '');
  const uniqueId = installation.id?.substring(0, 4).toUpperCase() || "0000";
  const clientCode = `EHO-${clientInitials}-${dateCode}-${uniqueId}`;

  // Derive primary color from company settings (primary_color field) or default to Riana deep blue
  const companyPrimaryColor: [number, number, number] = (company as any).primary_color
    ? parseHexColor((company as any).primary_color)
    : [30, 58, 138];

  const textColor: [number, number, number] = [31, 41, 55];
  const mutedColor: [number, number, number] = [107, 114, 128];
  const lightBg: [number, number, number] = [240, 247, 255];

  const addText = (text: string, x: number, y: number, opts: {
    fontSize?: number; color?: [number, number, number];
    fontStyle?: string; align?: 'left' | 'center' | 'right'
  } = {}) => {
    const safeText = String(text ?? '');
    doc.setFontSize(opts.fontSize || 10);
    doc.setTextColor(...(opts.color || textColor));
    doc.setFont('helvetica', opts.fontStyle || 'normal');
    doc.text(safeText, x, y, { align: opts.align || 'left' });
  };

  const addSectionHeader = (title: string, y: number) => {
    doc.setFillColor(...lightBg);
    doc.rect(margin, y - 2, pageWidth - 2 * margin, 7, 'F');
    doc.setDrawColor(...companyPrimaryColor);
    doc.setLineWidth(0.5);
    doc.line(margin, y - 2, margin, y + 5);
    addText(title, margin + 3, y + 3, { fontSize: 11, color: companyPrimaryColor, fontStyle: 'bold' });
    return y + 10;
  };

  const ensureSpace = (needed: number) => {
    if (yPos + needed > pageHeight - bottomMargin) {
      doc.addPage();
      yPos = margin;
    }
  };

  // ─── HEADER ─────────────────────────────────────────────────────────────
  // Draw header background
  doc.setFillColor(...companyPrimaryColor);
  doc.rect(0, 0, pageWidth, 50, 'F');

  // Serial Number top-left
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(`Ref: ${clientCode}`, 5, 6);

  // Date top-right
  doc.setFontSize(8);
  doc.text(`Exported: ${formattedExportDate}`, pageWidth - 5, 6, { align: 'right' });

  // Company Logo (left side)
  let logoLoaded = false;
  const logoSrc = (company as any).logo_path
    ? ((company as any).logo_path.startsWith('http')
        ? (company as any).logo_path
        : ((company as any).logo_path.startsWith('/')
            ? `${window.location.protocol}//${window.location.hostname}:8090${(company as any).logo_path}`
            : `http://${window.location.hostname}:8081/uploads/${(company as any).logo_path}`))
    : `${window.location.protocol}//${window.location.hostname}:8090/Riana_logo.png`;

  try {
    const logoImg = await loadImageAsBase64(logoSrc);
    doc.addImage(logoImg, 'PNG', margin, 12, 25, 25);
    logoLoaded = true;
  } catch {
    try {
      const logoImg = await loadImageAsBase64('/Riana_logo.png');
      doc.addImage(logoImg, 'PNG', margin, 12, 25, 25);
      logoLoaded = true;
    } catch {
      console.log('Could not load company logo');
    }
  }

  // Company Name & Title — centred in the space AFTER the logo area
  const textStartX = logoLoaded ? margin + 35 : pageWidth / 2;
  const textWidth = logoLoaded ? pageWidth - textStartX - margin : pageWidth;
  const titleCenterX = logoLoaded ? textStartX + textWidth / 2 : pageWidth / 2;

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text((company as any).company_name || company.name || 'RIANA Technologies', titleCenterX, 22, { align: 'center' });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('E-HANDOVER FORM', titleCenterX, 31, { align: 'center' });

  doc.setFontSize(9);
  doc.text('Installation Completion & Handover Certificate', titleCenterX, 39, { align: 'center' });

  yPos = 58;

  // ─── CLIENT INFORMATION ──────────────────────────────────────────────────
  doc.setDrawColor(...companyPrimaryColor);
  doc.setLineWidth(0.8);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 5;

  yPos = addSectionHeader('CLIENT INFORMATION', yPos);

  const col1X = margin;
  const col2X = pageWidth / 2 + 5;
  const lineHeight = 6;

  // Assigned date: prefer assigned_date, fall back to installation_start_date, then created_at
  const rawAssignedDate = installation.assigned_date || (installation as any).installation_start_date || (installation as any).created_at;
  const assignedDateFormatted = rawAssignedDate
    ? new Date(rawAssignedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : formattedExportDate;  // ultimate fallback: export date

  // Completion date = export date (document was exported today for signing)
  const completionDateFormatted = formattedExportDate;

  const clientDetails = [
    ['Client Name:', client.client_name || 'N/A'],
    ['Branch:', client.branch || 'Main Branch'],
    ['Contact Person:', client.contact_person_name || 'N/A'],
    ['Phone:', client.contact_person_phone || 'N/A'],
    ['Email:', client.contact_person_email || 'N/A'],
  ];

  console.log('Generating report for:', { client, installation });

  const installDetails = [
    ['Industry:', client.industry_classification || 'N/A'],
    ['Contract Type:', client.contract_type || 'N/A'],
    ['Assigned Date:', assignedDateFormatted],
    ['Completion Date:', completionDateFormatted],
    ['Status:', (installation.status || 'COMPLETE').toUpperCase()],
  ];

  clientDetails.forEach((item, idx) => {
    addText(item[1], col1X + 32, yPos + idx * lineHeight, { fontSize: 9 });
    addText(item[0], col1X, yPos + idx * lineHeight, { fontStyle: 'bold', fontSize: 9 });
  });

  installDetails.forEach((item, idx) => {
    addText(item[0], col2X, yPos + idx * lineHeight, { fontStyle: 'bold', fontSize: 9 });
    const isStatus = item[0] === 'Status:';
    addText(item[1], col2X + 34, yPos + idx * lineHeight, {
      fontSize: 9,
      color: isStatus ? [22, 101, 52] : textColor,
      fontStyle: isStatus ? 'bold' : 'normal',
    });
  });

  yPos += clientDetails.length * lineHeight + 8;

  // ─── EQUIPMENT DETAILS ───────────────────────────────────────────────────
  ensureSpace(60);
  yPos = addSectionHeader('EQUIPMENT DETAILS', yPos);

  const equipmentData = [
    ['Kiosk Type', installation.kiosk_type || 'N/A', 'Configured'],
    ['Kiosk Count', String(installation.kiosk_count || 0), 'Installed'],
    ['LED Displays', String(installation.led_count || 0), 'Installed'],
    ['Tripleplay Devices', String(installation.counter_count || 0), 'Installed'],
    ['Screen Size', installation.screen_with_size || 'N/A', 'Configured'],
    ['Service Points', String(installation.service_points || 0), 'Active'],
    ['UPS Units', String(installation.ups_count || 0), 'Installed'],
    ['Speakers', String(installation.speakers || 0), 'Installed'],
    ['Amplifiers', String(installation.amplifiers || 0), 'Configured'],
    ['Media Controllers', String(installation.media_controllers || 0), 'Configured'],
    ['Tablets', String(installation.tablets || 0), 'Setup Complete'],
    ['Digital Signage', String(installation.digital_signage_system || 0), 'Operational'],
    ['HDMI Cables', String(installation.hdmis || 0), 'Connected'],
    ['Splitters', String(installation.splitters || 0), 'Installed'],
    ['Staff Trained', `${installation.staff_trained || 0} personnel`, 'Completed'],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [['Equipment Type', 'Quantity/Details', 'Status']],
    body: equipmentData,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: companyPrimaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { fontStyle: 'bold' },
      2: { textColor: [22, 101, 52] }
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + 8;

  // ─── LED DISPLAY NAMES ───────────────────────────────────────────────────
  const ledNames = (installation as any).led_names as string[] | string | null;
  const parsedLedNames: string[] = Array.isArray(ledNames)
    ? ledNames
    : typeof ledNames === 'string'
      ? JSON.parse(ledNames)
      : [];

  if ((installation.led_count || 0) > 0 && parsedLedNames.length > 0) {
    ensureSpace(30);
    yPos = addSectionHeader('LED DISPLAY NAMES', yPos);

    // Split into chunks that fit within a page - use autoTable with page-break support
    const ledData = parsedLedNames.map((name, idx) => [
      `LED ${idx + 1}`,
      name || `LED Display ${idx + 1}`,
      'Installed'
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['LED #', 'Display Name', 'Status']],
      body: ledData,
      margin: { left: margin, right: margin, bottom: bottomMargin },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: companyPrimaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 20 },
        2: { textColor: [22, 101, 52], cellWidth: 30 }
      },
      // Allow table to break across pages automatically
      pageBreak: 'auto',
      showHead: 'everyPage',
    });

    yPos = (doc as any).lastAutoTable.finalY + 8;
  }

  // ─── REMARKS ─────────────────────────────────────────────────────────────
  ensureSpace(40);
  yPos = addSectionHeader('REMARKS & NOTES', yPos);

  const remarks = installation.remarks || 'No additional notes provided.';
  const splitRemarks = doc.splitTextToSize(remarks, pageWidth - 2 * margin - 10);
  const remarksHeight = Math.max(15, splitRemarks.length * 5 + 5);

  doc.setFillColor(249, 250, 251);
  doc.rect(margin, yPos - 3, pageWidth - 2 * margin, remarksHeight, 'F');
  doc.setDrawColor(209, 213, 219);
  doc.rect(margin, yPos - 3, pageWidth - 2 * margin, remarksHeight);
  
  doc.setFontSize(9);
  doc.setTextColor(...mutedColor);
  doc.text(splitRemarks, margin + 5, yPos + 4);
  
  yPos += remarksHeight + 5;

  // ─── ESCALATION MATRIX ───────────────────────────────────────────────────
  let escalationMatrix: EscalationMatrix | null = null;
  
  // 1. Try subsidiary default matrix
  if (subsidiary?.default_escalation_matrix) {
    try {
      escalationMatrix = typeof subsidiary.default_escalation_matrix === 'string' 
        ? JSON.parse(subsidiary.default_escalation_matrix) 
        : subsidiary.default_escalation_matrix;
    } catch (e) {
      console.warn("Failed to parse subsidiary escalation matrix", e);
    }
  }
  
  // 2. Fallback to installation-specific matrix if available
  if (!escalationMatrix && installation.escalation_matrix) {
    escalationMatrix = installation.escalation_matrix;
  }

  if (escalationMatrix) {
    ensureSpace(60);
    yPos = addSectionHeader('ESCALATION MATRIX', yPos);
    
    const matrixData = [
      ['Tier 1', escalationMatrix.tier1?.name || 'N/A', escalationMatrix.tier1?.role || 'N/A', escalationMatrix.tier1?.email || 'N/A', escalationMatrix.tier1?.phone_number || 'N/A'],
      ['Tier 2', escalationMatrix.tier2?.name || 'N/A', escalationMatrix.tier2?.role || 'N/A', escalationMatrix.tier2?.email || 'N/A', escalationMatrix.tier2?.phone_number || 'N/A'],
      ['Tier 3', escalationMatrix.tier3?.name || 'N/A', escalationMatrix.tier3?.role || 'N/A', escalationMatrix.tier3?.email || 'N/A', escalationMatrix.tier3?.phone_number || 'N/A'],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Level', 'Contact Person', 'Role/Title', 'Email Address', 'Phone Number']],
      body: matrixData,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: companyPrimaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 20 },
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 8;
  }

  // ─── SIGNATURE SECTION ───────────────────────────────────────────────────
  ensureSpace(50);

  const sigBoxWidth = (pageWidth - 2 * margin - 10) / 2;
  const sigBoxHeight = 35;

  // Client signature box
  doc.setFillColor(250, 250, 250);
  doc.rect(margin, yPos, sigBoxWidth, sigBoxHeight, 'F');
  doc.setDrawColor(209, 213, 219);
  doc.rect(margin, yPos, sigBoxWidth, sigBoxHeight);
  addText('Client Representative', margin + sigBoxWidth / 2, yPos + 5, { fontSize: 10, color: companyPrimaryColor, fontStyle: 'bold', align: 'center' });
  doc.line(margin + 10, yPos + 25, margin + sigBoxWidth - 10, yPos + 25);
  addText('Name & Signature', margin + sigBoxWidth / 2, yPos + 29, { fontSize: 8, color: mutedColor, align: 'center' });
  addText(`Date: ${formattedExportDate}`, margin + sigBoxWidth / 2, yPos + 33, { fontSize: 8, color: mutedColor, align: 'center' });

  // Company signature box
  const compName = (company as any).company_name || company.name || 'RIANA Technologies';
  doc.setFillColor(250, 250, 250);
  doc.rect(margin + sigBoxWidth + 10, yPos, sigBoxWidth, sigBoxHeight, 'F');
  doc.rect(margin + sigBoxWidth + 10, yPos, sigBoxWidth, sigBoxHeight);
  addText(compName, margin + sigBoxWidth + 10 + sigBoxWidth / 2, yPos + 5, { fontSize: 10, color: companyPrimaryColor, fontStyle: 'bold', align: 'center' });
  doc.line(margin + sigBoxWidth + 20, yPos + 25, margin + 2 * sigBoxWidth, yPos + 25);
  addText('Technician Signature', margin + sigBoxWidth + 10 + sigBoxWidth / 2, yPos + 29, { fontSize: 8, color: mutedColor, align: 'center' });
  addText(`Date: ${formattedExportDate}`, margin + sigBoxWidth + 10 + sigBoxWidth / 2, yPos + 33, { fontSize: 8, color: mutedColor, align: 'center' });

  // ─── LETTERHEAD / WATERMARK ───────────────────────────────────────────────
  try {
    await addLetterheadToDocument(doc, logoSrc, '/letterhead-new.jpg');
  } catch (error) {
    console.log('Letterhead could not be added:', error);
  }

  // Save PDF
  const fileName = `E-Handover_${(client.client_name || 'Client').replace(/[^a-zA-Z0-9]/g, '_')}_${clientCode}.pdf`;
  doc.save(fileName);
};