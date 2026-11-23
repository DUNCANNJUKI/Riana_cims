import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { addCimsDocumentHeader, addLetterheadToDocument, DOCUMENT_LAYOUT, resolveDocumentBrand } from './pdfWatermark';

export async function brandedTableReport(options: {
  title: string;
  subsidiaryName?: string | null;
  landscape?: boolean;
  metadata?: Array<[string, string]>;
  columns: string[];
  rows: (string | number)[][];
  totals?: (string | number)[][];
}): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: options.landscape ? 'landscape' : 'portrait' });
  const brand = resolveDocumentBrand(options.subsidiaryName);
  await addCimsDocumentHeader(doc, {
    subtitle: 'Client Installation Management System', documentTitle: options.title, subsidiaryName: options.subsidiaryName,
  });
  const margin = { left: 14, right: 14, top: DOCUMENT_LAYOUT.continuationContentTop, bottom: DOCUMENT_LAYOUT.autoTableBottomMargin };
  let y = DOCUMENT_LAYOUT.firstPageContentTop;
  if (options.metadata?.length) {
    autoTable(doc, {
      startY: y, body: options.metadata, theme: 'plain', margin,
      styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 } },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }
  autoTable(doc, {
    startY: y, head: [options.columns], body: options.rows, foot: options.totals,
    margin, styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: brand.primary }, footStyles: { fillColor: brand.primary, fontStyle: 'bold' },
  });
  await addLetterheadToDocument(doc, '/Riana_logo.png', '/letterhead-new.jpg', { subsidiaryName: options.subsidiaryName, documentTitle: options.title });
  return doc;
}
