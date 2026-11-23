import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ChangeRequestWithRelations } from '@crms/hooks/useSupabaseData';
import { addCimsDocumentHeader, addLetterheadToDocument, DOCUMENT_LAYOUT, resolveDocumentBrand } from '../../../src/utils/pdfWatermark';
import { resolveDocumentSubsidiaryName } from '../../../src/utils/brandIdentity';
import { getCimsUser } from './cimsSession';

type AutoTableDocument = jsPDF & { lastAutoTable: { finalY: number } };
interface AuditLogEntry { action_label: string; created_at: string; details?: string; profiles?: { name: string } | null }
const date = (value?: string | null) => value && Number.isFinite(new Date(value).getTime()) ? format(new Date(value), 'MMMM d, yyyy') : 'N/A';
const modules = (value: ChangeRequestWithRelations['modules_affected']): string => {
  try { const list = Array.isArray(value) ? value : JSON.parse(value || '[]'); return Array.isArray(list) ? list.join(', ') : 'N/A'; }
  catch { return String(value || 'N/A'); }
};

// AutoTable wraps and paginates every section within the e-handover content area.
async function requestDocument(request: ChangeRequestWithRelations, auditLogs: AuditLogEntry[], completion: boolean): Promise<jsPDF> {
  const doc = new jsPDF();
  const subsidiaryName = resolveDocumentSubsidiaryName(request.client?.subsidiary_name, getCimsUser()?.subsidiary_name);
  const brand = resolveDocumentBrand(subsidiaryName);
  const title = completion ? 'Completion Report' : 'Change Request Form';
  await addCimsDocumentHeader(doc, { subtitle: title.toUpperCase(), documentTitle: 'Ticket: ' + request.ticket_number, subsidiaryName });
  let y = DOCUMENT_LAYOUT.firstPageContentTop;
  const ensure = (height: number) => {
    if (y + height > doc.internal.pageSize.getHeight() - DOCUMENT_LAYOUT.autoTableBottomMargin) {
      doc.addPage(); y = DOCUMENT_LAYOUT.continuationContentTop;
    }
  };
  const section = (heading: string, body: (string | number)[][], columns?: string[]) => {
    ensure(28);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...brand.primary);
    doc.setDrawColor(...brand.primary); doc.setLineWidth(0.5);
    doc.text(heading, 14, y); doc.line(14, y + 3, 196, y + 3);
    autoTable(doc, {
      startY: y + 7, head: columns ? [columns] : [], body,
      theme: columns ? 'striped' : 'plain',
      styles: { fontSize: 9, cellPadding: 3, textColor: [31, 41, 55], overflow: 'linebreak' },
      headStyles: { fillColor: brand.primary, textColor: [255, 255, 255] },
      columnStyles: columns ? {} : body[0]?.length === 2 ? { 0: { fontStyle: 'bold', cellWidth: 45, fillColor: [239, 248, 249] } } : {},
      margin: { left: 14, right: 14, top: DOCUMENT_LAYOUT.continuationContentTop, bottom: DOCUMENT_LAYOUT.autoTableBottomMargin },
    });
    y = (doc as AutoTableDocument).lastAutoTable.finalY + 12;
  };
  if (completion) {
    section('SUMMARY', [
      ['Client', request.client?.name || 'N/A'], ['Branch', request.client?.branch || 'N/A'],
      ['Ticket Number', request.ticket_number], ['Status', request.status.replace(/_/g, ' ').toUpperCase()],
      ['Date Requested', date(request.date_requested)], ['Commencement Date', date(request.commencement_date)],
      ['Completion Date', date(request.completion_date)], ['Senior Developer', request.senior_developer?.name || 'N/A'],
      ['Assigned Developer', request.assigned_developer?.name || 'N/A'], ['Priority', request.priority.toUpperCase()],
    ]);
  } else {
    section('CLIENT INFORMATION', [
      ['Client Name', request.client?.name || 'N/A'], ['Branch', request.client?.branch || 'N/A'],
      ['Contract Type', (request.client?.contract_type || 'N/A').toUpperCase()],
      ['Contact Person', request.client?.contact_person || 'N/A'], ['Contact Email', request.client?.contact_email || 'N/A'],
      ['Contact Phone', request.client?.contact_phone || 'N/A'],
    ]);
    section('REQUEST DETAILS', [
      ['Department', request.department], ['Date Requested', date(request.date_requested)], ['Priority', request.priority.toUpperCase()],
      ['Status', request.status.replace(/_/g, ' ').toUpperCase()], ['Estimated Completion', date(request.estimated_completion_date)],
      ['Request Source', request.source.charAt(0).toUpperCase() + request.source.slice(1)],
    ]);
  }
  section(completion ? 'WORK COMPLETED' : 'CHANGE DESCRIPTION', [[request.change_description]]);
  section(completion ? 'MODULES MODIFIED' : 'MODULES AFFECTED', [[modules(request.modules_affected) || 'N/A']]);
  if (auditLogs.length) {
    const logs = completion ? auditLogs : auditLogs.slice(0, 6);
    section(completion ? 'COMPLETE ACTIVITY TIMELINE' : 'ACTIVITY TIMELINE', logs.map(log => [
      format(new Date(log.created_at), 'MMM d, yyyy h:mm a'), log.action_label, log.profiles?.name || 'System',
      ...(completion ? [log.details || '-'] : []),
    ]), completion ? ['Date/Time', 'Action', 'By', 'Details'] : ['Date/Time', 'Action', 'By']);
  }
  if (completion && request.approval_comment) {
    section('APPROVAL NOTES', [
      ['Approval', request.approval_comment],
      ...(request.is_chargeable !== undefined ? [['Chargeable', request.is_chargeable ? 'Yes' : 'No']] : []),
      ...(request.sales_remarks ? [['Sales Remarks', request.sales_remarks]] : []),
    ]);
  }
  // Manual sign-off fields are retained for legacy documents. Verified reports
  // are downloaded from the authenticated API and embed the recorded evidence.
  section(completion ? 'SIGN-OFF & ACCEPTANCE' : 'SIGNATURES & AUTHORIZATION', [
    ...(!completion ? [['Senior Developer', request.senior_developer?.name || '___________________'], ['Signature / Date', '___________________ / ___________________']] : []),
    [completion ? 'Developer Sign-off' : 'Assigned Developer', request.assigned_developer?.name || '___________________'],
    ['Signature / Date', '___________________ / ___________________'],
    ...(completion ? [['Client Acceptance', 'I hereby confirm that the above changes have been implemented and tested to my satisfaction.']] : []),
    ['Client Representative', '___________________'], ['Designation', '___________________'],
    ['Signature / Date', '___________________ / ___________________'],
  ]);
  await addLetterheadToDocument(doc, '/Riana_logo.png', '/letterhead-new.jpg', { subsidiaryName, documentTitle: title });
  return doc;
}

export const generateChangeRequestPDF = (request: ChangeRequestWithRelations, auditLogs: AuditLogEntry[] = []): Promise<jsPDF> => requestDocument(request, auditLogs, false);
export const generateCompletionReportPDF = (request: ChangeRequestWithRelations, auditLogs: AuditLogEntry[] = []): Promise<jsPDF> => requestDocument(request, auditLogs, true);

export const downloadPDF = (doc: jsPDF, filename: string) => {
  doc.save(filename);
};

export const generateRequestSummaryPDF = async (requests: ChangeRequestWithRelations[]): Promise<jsPDF> => {
  const doc = new jsPDF({ orientation: 'landscape' });
  const subsidiaryName = resolveDocumentSubsidiaryName(getCimsUser()?.subsidiary_name);
  const brand = resolveDocumentBrand(subsidiaryName);
  await addCimsDocumentHeader(doc, {
    subtitle: 'CHANGE REQUEST REPORT',
    documentTitle: `${requests.length} matching requests`,
    subsidiaryName,
  });
  autoTable(doc, {
    startY: DOCUMENT_LAYOUT.firstPageContentTop,
    head: [['Ticket', 'Client', 'Description', 'Priority', 'Status', 'Assigned To', 'Requested', 'Due Date']],
    body: requests.map((request) => [
      request.ticket_number, request.client?.name || 'N/A', request.change_description,
      request.priority, request.status.replace(/_/g, ' '), request.assigned_developer?.name || 'Unassigned',
      request.date_requested, request.estimated_completion_date,
    ]),
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: brand.primary },
    margin: { top: DOCUMENT_LAYOUT.continuationContentTop, bottom: DOCUMENT_LAYOUT.autoTableBottomMargin },
    columnStyles: { 2: { cellWidth: 65 } },
  });
  await addLetterheadToDocument(doc, '/Riana_logo.png', '/letterhead-new.jpg', {
    subsidiaryName,
    documentTitle: 'Change Request Report',
  });
  return doc;
};
