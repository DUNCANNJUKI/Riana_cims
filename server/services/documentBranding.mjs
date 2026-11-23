// Drawing primitives shared by browser reports and API-generated completion PDFs.
// Asset loading belongs to each runtime; this module performs no I/O.
export const DOCUMENT_BRANDS = {
  riana: { id: 'riana', name: 'RIANA Group', systemName: 'RIANA CIMS', website: 'www.riana.co', primary: [29, 130, 151], accent: [29, 130, 151] },
  marezi: { id: 'marezi', name: 'MAREZI', systemName: 'RIANA CIMS', website: 'www.marezi.co', primary: [15, 106, 129], accent: [217, 37, 45], letterheadPath: '/marezi-letterhead.png' },
};
export const DOCUMENT_LAYOUT = Object.freeze({
  firstPageContentTop: 58,
  continuationContentTop: 40,
  contentBottom: 252,
  autoTableBottomMargin: 45,
});

export function watermarkBox(width, height) {
  const ratio = (297 / 210) * 0.4;
  const maxHeight = height - DOCUMENT_LAYOUT.autoTableBottomMargin - DOCUMENT_LAYOUT.firstPageContentTop;
  const w = Math.min(width - 40, maxHeight / ratio), h = w * ratio;
  return { x: (width - w) / 2, y: Math.max(DOCUMENT_LAYOUT.firstPageContentTop, (height - h) / 2), width: w, height: h };
}

export function imageContained(doc, image, x, y, maxWidth, maxHeight) {
  const props = doc.getImageProperties(image);
  const ratio = props.width / props.height;
  const width = Math.min(maxWidth, maxHeight * ratio);
  const height = width / ratio;
  doc.addImage(image, /^data:image\/jpe?g/i.test(image) ? 'JPEG' : 'PNG', x + (maxWidth - width) / 2, y + (maxHeight - height) / 2, width, height);
}

export function drawDocumentHeader(doc, { brand, logo, letterhead, ...options }) {
  const width = doc.internal.pageSize.getWidth();
  const height = options.headerHeight ?? (brand.id === 'marezi' ? 52 : 48);
  const primary = options.primaryColor ?? brand.primary;
  const accent = options.accentColor ?? brand.accent;
  if (brand.id === 'marezi') {
    if (letterhead) doc.addImage(letterhead, 'PNG', 0, 0, width, doc.internal.pageSize.getHeight());
    else {
      doc.setDrawColor(...primary); doc.setLineWidth(0.6); doc.line(8, 27.5, width - 47, 27.5);
      doc.setDrawColor(...accent); doc.line(width - 47, 27.5, width - 8, 27.5);
    }
    doc.setTextColor(...primary); doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    if (options.metaLeft) doc.text(options.metaLeft, 14, 32);
    if (options.metaRight) doc.text(options.metaRight, width - 14, 32, { align: 'right' });
    doc.setFontSize(14); doc.text(options.title || 'RIANA CIMS', width / 2, 38, { align: 'center' });
    if (options.subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text(options.subtitle, width / 2, 44, { align: 'center' }); }
    if (options.documentTitle) { doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(options.documentTitle, width / 2, 50, { align: 'center' }); }
    return height + 3;
  }
  doc.setFillColor(...primary); doc.rect(0, 0, width, height, 'F');
  if (logo) {
    try { imageContained(doc, logo, 10, (height - 26) / 2, 20, 26); }
    catch { /* Preserve the text identity if a configured logo cannot be decoded. */ }
  }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
  if (options.metaLeft) doc.text(options.metaLeft, 14, 7.5);
  if (options.metaRight) doc.text(options.metaRight, width - 14, 7.5, { align: 'right' });
  doc.setFontSize(21); doc.text(options.title || 'RIANA CIMS', width / 2, 17, { align: 'center' });
  if (options.subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(11.5); doc.text(options.subtitle, width / 2, 28, { align: 'center' }); }
  if (options.documentTitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.text(options.documentTitle, width / 2, 38, { align: 'center' }); }
  doc.setDrawColor(...accent); doc.setLineWidth(1.5); doc.line(0, height, width, height);
  return height + 10;
}

export function drawContinuationHeader(doc, logo, title) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(29, 130, 151); doc.rect(0, 0, width, 22, 'F');
  if (logo) {
    try { imageContained(doc, logo, 10, 2, 14, 18); }
    catch { /* The report title remains available on continuation pages. */ }
  }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text('RIANA CIMS', width / 2, 9, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text(title || 'Official System Document', width / 2, 15, { align: 'center' });
}

export function drawBrandedFooter(doc, footer, page, pages) {
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  const footerWidth = Math.min(width - 20, 200), footerHeight = footerWidth / 8;
  doc.addImage(footer, 'PNG', (width - footerWidth) / 2, height - footerHeight - 12, footerWidth, footerHeight);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 120, 120);
  doc.text(`Page ${page} of ${pages}`, width - 15, height - 10, { align: 'right' });
}

export function drawMareziFooter(doc, page, pages, generatedAt = new Date()) {
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
  doc.setFillColor(255, 255, 255); doc.rect(10, height - 23, width - 20, 6.5, 'F');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(70, 70, 70);
  doc.text('MAREZI | Official & Confidential', 14, height - 19);
  doc.text(`Generated ${generatedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, width / 2, height - 19, { align: 'center' });
  doc.text(`Page ${page} of ${pages}`, width - 14, height - 19, { align: 'right' });
}
