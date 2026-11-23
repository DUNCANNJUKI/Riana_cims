const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { GState } = require('jspdf');

// Only fixed, packaged assets are read. Review tokens and request data never become paths or URLs.
const asset = async (name, grayscale = false) => {
  for (const root of ['../../dist', '../../public']) {
    try {
      const source = await fs.readFile(path.resolve(__dirname, root, name));
      const image = grayscale ? await sharp(source).grayscale().png().toBuffer() : source;
      return `data:image/png;base64,${image.toString('base64')}`;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  throw new Error(`Required report branding asset is unavailable: ${name}`);
};

async function completionDocumentBranding(doc, row) {
  const core = await import('./documentBranding.mjs');
  const marezi = [row.client_subsidiary, row.manager_subsidiary].some(value => /(^|[^a-z])marezi([^a-z]|$)/i.test(String(value || '')));
  const brand = core.DOCUMENT_BRANDS[marezi ? 'marezi' : 'riana'];
  const [logo, footer, watermark, letterhead] = marezi
    ? [null, null, null, await asset('marezi-letterhead.png')]
    : await Promise.all([asset('Riana_mark_transparent.png'), asset('report_footer.png'), asset('report_watermark.png', true), Promise.resolve(null)]);
  const title = 'Client Completion Report';
  core.drawDocumentHeader(doc, { brand, logo, letterhead, subtitle: 'CLIENT COMPLETION REPORT', documentTitle: `${row.ticket_number} | Version ${row.version_number}` });
  return {
    layout: core.DOCUMENT_LAYOUT,
    primary: brand.primary,
    finish() {
      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
        if (marezi) {
          if (page > 1) {
            doc.addImage(letterhead, 'PNG', 0, 0, width, height);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...brand.primary);
            doc.text(title, width / 2, 32.5, { align: 'center' });
          }
          core.drawMareziFooter(doc, page, pages, new Date());
        } else {
          if (page > 1) core.drawContinuationHeader(doc, logo, title);
          doc.saveGraphicsState(); doc.setGState(new GState({ opacity: 0.12 }));
          const box = core.watermarkBox(width, height);
          doc.addImage(watermark, 'PNG', box.x, box.y, box.width, box.height);
          doc.restoreGraphicsState();
          core.drawBrandedFooter(doc, footer, page, pages);
        }
      }
    },
  };
}

module.exports = { completionDocumentBranding };
