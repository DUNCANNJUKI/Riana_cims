import { Installation, Client, Company, Subsidiary, EscalationMatrix } from "@/types";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addCimsDocumentHeader, addLetterheadToDocument, DOCUMENT_LAYOUT, resolveDocumentBrand } from "./pdfWatermark";
import { resolveDocumentSubsidiaryName } from "./brandIdentity";
import { escalationTierEntries } from "./escalationMatrix";
import { buildHandoverEquipmentRows } from "./equipmentConfiguration";

const parseHexColor = (hex: string): [number, number, number] => {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [13, 131, 144];
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
  subsidiary?: Subsidiary,
  generatedBySubsidiaryName?: string | null,
): Promise<void> => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const bottomMargin = DOCUMENT_LAYOUT.autoTableBottomMargin;
  let yPos = margin;
  const subsidiaryName = resolveDocumentSubsidiaryName(
    subsidiary?.subsidiary_name,
    client.subsidiary_name,
    generatedBySubsidiaryName,
  );
  const brand = resolveDocumentBrand(subsidiaryName);

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
  const companyPrimaryColor: [number, number, number] = brand.id === 'marezi'
    ? brand.primary
    : (company as any).primary_color
      ? parseHexColor((company as any).primary_color)
      : [13, 131, 144];

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
      yPos = DOCUMENT_LAYOUT.continuationContentTop;
    }
  };

  // ─── HEADER ─────────────────────────────────────────────────────────────
  // Company Logo (left side)
  const logoSrc = (company as any).logo_path
    ? ((company as any).logo_path.startsWith('http')
        ? (company as any).logo_path
        : ((company as any).logo_path.startsWith('/')
            ? `${window.location.protocol}//${window.location.hostname}:8090${(company as any).logo_path}`
            : `http://${window.location.hostname}:8081/uploads/${(company as any).logo_path}`))
    : `${window.location.protocol}//${window.location.hostname}:8090/Riana_logo.png`;

  await addCimsDocumentHeader(doc, {
    title: (company as any).company_name || company.name || 'RIANA CIMS',
    subtitle: 'E-HANDOVER FORM',
    documentTitle: 'Installation Completion & Handover Certificate',
    logoPath: logoSrc,
    metaLeft: `Ref: ${clientCode}`,
    metaRight: `Exported: ${formattedExportDate}`,
    headerHeight: brand.id === 'marezi' ? 52 : 50,
    subsidiaryName,
  });

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

  const equipmentData = buildHandoverEquipmentRows(installation, subsidiary?.equipment_configuration)
    .map((row) => [row.label, row.displayValue, row.status]);

  autoTable(doc, {
    startY: yPos,
    head: [['Equipment Type', 'Quantity/Details', 'Status']],
    body: equipmentData,
    margin: { left: margin, right: margin, top: DOCUMENT_LAYOUT.continuationContentTop, bottom: bottomMargin },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: companyPrimaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { fontStyle: 'bold' },
      2: { textColor: [22, 101, 52] }
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2 && data.cell.raw === 'Not installed') {
        data.cell.styles.textColor = [185, 28, 28];
        data.cell.styles.fontStyle = 'bold';
      }
    },
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
      margin: { left: margin, right: margin, top: DOCUMENT_LAYOUT.continuationContentTop, bottom: bottomMargin },
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
    
    const matrixData = escalationTierEntries(escalationMatrix).map(([key, tier]) => [
      `Tier ${Number(key.slice(4))}`,
      tier.name || 'N/A',
      tier.role || 'N/A',
      tier.email || 'N/A',
      tier.phone_number || 'N/A',
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Level', 'Contact Person', 'Role/Title', 'Email Address', 'Phone Number']],
      body: matrixData,
      margin: { left: margin, right: margin, top: DOCUMENT_LAYOUT.continuationContentTop, bottom: bottomMargin },
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
  const compName = brand.id === 'marezi'
    ? brand.name
    : ((company as any).company_name || company.name || 'RIANA Technologies');
  doc.setFillColor(250, 250, 250);
  doc.rect(margin + sigBoxWidth + 10, yPos, sigBoxWidth, sigBoxHeight, 'F');
  doc.rect(margin + sigBoxWidth + 10, yPos, sigBoxWidth, sigBoxHeight);
  addText(compName, margin + sigBoxWidth + 10 + sigBoxWidth / 2, yPos + 5, { fontSize: 10, color: companyPrimaryColor, fontStyle: 'bold', align: 'center' });
  doc.line(margin + sigBoxWidth + 20, yPos + 25, margin + 2 * sigBoxWidth, yPos + 25);
  addText('Technician Signature', margin + sigBoxWidth + 10 + sigBoxWidth / 2, yPos + 29, { fontSize: 8, color: mutedColor, align: 'center' });
  addText(`Date: ${formattedExportDate}`, margin + sigBoxWidth + 10 + sigBoxWidth / 2, yPos + 33, { fontSize: 8, color: mutedColor, align: 'center' });

  // ─── LETTERHEAD / WATERMARK ───────────────────────────────────────────────
  try {
    await addLetterheadToDocument(doc, logoSrc, '/letterhead-new.jpg', {
      subsidiaryName,
      documentTitle: 'Installation Completion & Handover Certificate',
      generatedAt: exportDate,
    });
  } catch (error) {
    console.log('Letterhead could not be added:', error);
  }

  // Save PDF
  const fileName = `E-Handover_${(client.client_name || 'Client').replace(/[^a-zA-Z0-9]/g, '_')}_${clientCode}.pdf`;
  doc.save(fileName);
};
