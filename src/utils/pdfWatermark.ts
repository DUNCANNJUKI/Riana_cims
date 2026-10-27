import jsPDF from "jspdf";
import { BrandIdentity, isMareziSubsidiary, resolveBrandIdentity } from './brandIdentity';

// Company address and website from letterhead
const COMPANY_ADDRESS = "6th Floor, Allianz Plaza, 96 Riverside Drive, Nairobi, Kenya";
const COMPANY_WEBSITE = "www.riana.co";
const COMPANY_PHONE = "+254 (0) 720 000 000";

// Subsidiary companies with colors
const SUBSIDIARIES = [
  { name: "AfyaServe", color: [227, 38, 54] as [number, number, number] },
  { name: "Q-SYS", color: [0, 122, 179] as [number, number, number] },
  { name: "SecuViz", color: [76, 175, 80] as [number, number, number] },
  { name: "TIDANCE", color: [255, 152, 0] as [number, number, number] },
  { name: "USS", color: [183, 28, 28] as [number, number, number] }
];

// Measured from the official raster assets so header backgrounds and logos blend.
const RIANA_TEAL = [29, 130, 151];
const RIANA_BLUE = [29, 130, 151]; // Matched to the edge tone of the official logo
export const RIANA_DOCUMENT_TEAL = RIANA_TEAL as [number, number, number];
export const RIANA_TRANSPARENT_HEADER_LOGO = '/Riana_mark_transparent.png';

const LEGACY_RIANA_LOGO_PATTERN = /riana_(?:logo|logoz)\.png(?:[?#].*)?$/i;

/**
 * Keep custom company branding intact while replacing the legacy RIANA raster,
 * whose teal background produced a visible rectangle inside report headers.
 */
export const resolveRianaHeaderLogoPath = (logoPath?: string | null): string => {
  const normalizedPath = String(logoPath || '').trim();
  return !normalizedPath || LEGACY_RIANA_LOGO_PATTERN.test(normalizedPath)
    ? RIANA_TRANSPARENT_HEADER_LOGO
    : normalizedPath;
};

export interface DocumentBrandingOptions {
  subsidiaryName?: string | null;
  documentTitle?: string;
  generatedAt?: Date;
}

export const DOCUMENT_LAYOUT = {
  firstPageContentTop: 55,
  continuationContentTop: 40,
  contentBottom: 252,
  autoTableBottomMargin: 45,
} as const;

export { isMareziSubsidiary };
export const resolveDocumentBrand = (
  ...subsidiaryNames: Array<string | null | undefined>
): BrandIdentity => (
  resolveBrandIdentity(...subsidiaryNames)
);

const imageFormat = (dataUrl: string): 'PNG' | 'JPEG' => (
  /^data:image\/jpe?g/i.test(dataUrl) ? 'JPEG' : 'PNG'
);

export const addImageContained = (
  doc: jsPDF,
  imageData: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
): void => {
  const props = doc.getImageProperties(imageData);
  const aspectRatio = props.width && props.height ? props.width / props.height : maxWidth / maxHeight;
  let width = maxWidth;
  let height = width / aspectRatio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }
  const drawX = x + (maxWidth - width) / 2;
  const drawY = y + (maxHeight - height) / 2;
  doc.addImage(imageData, imageFormat(imageData), drawX, drawY, width, height);
};

export const addCimsDocumentHeader = async (
  doc: jsPDF,
  options: {
    title?: string;
    subtitle?: string;
    documentTitle?: string;
    logoPath?: string;
    primaryColor?: [number, number, number];
    accentColor?: [number, number, number];
    metaLeft?: string;
    metaRight?: string;
    headerHeight?: number;
    subsidiaryName?: string | null;
  } = {},
): Promise<number> => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const brand = resolveDocumentBrand(options.subsidiaryName);
  const headerHeight = options.headerHeight ?? (brand.id === 'marezi' ? 52 : 45);
  const primaryColor = options.primaryColor ?? brand.primary;
  const accentColor = options.accentColor ?? brand.accent;
  const margin = 14;

  if (brand.id === 'marezi') {
    const letterhead = await fetchImageAsBase64(brand.letterheadPath!);
    if (letterhead) {
      doc.addImage(letterhead, 'PNG', 0, 0, pageWidth, pageHeight);
    } else {
      doc.setDrawColor(...brand.primary);
      doc.setLineWidth(0.6);
      doc.line(8, 27.5, pageWidth - 47, 27.5);
      doc.setDrawColor(...brand.accent);
      doc.line(pageWidth - 47, 27.5, pageWidth - 8, 27.5);
    }

    doc.setTextColor(...brand.primary);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    if (options.metaLeft) doc.text(options.metaLeft, margin, 32);
    if (options.metaRight) doc.text(options.metaRight, pageWidth - margin, 32, { align: 'right' });

    doc.setFontSize(14);
    doc.text(options.title || 'RIANA CIMS', pageWidth / 2, 38, { align: 'center' });
    if (options.subtitle) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text(options.subtitle, pageWidth / 2, 44, { align: 'center' });
    }
    if (options.documentTitle) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text(options.documentTitle, pageWidth / 2, 50, { align: 'center' });
    }
    return headerHeight + 3;
  }

  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');

  // 10 mm is approximately 38 CSS pixels. The transparent mark is 18% taller
  // than the previous logo while its narrow slot avoids invisible side whitespace.
  const logoSlot = {
    x: 10,
    y: (headerHeight - 26) / 2,
    width: 20,
    height: 26,
  };

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  if (options.metaLeft) doc.text(options.metaLeft, margin, 7.5);
  if (options.metaRight) doc.text(options.metaRight, pageWidth - margin, 7.5, { align: 'right' });

  const headerLogoPath = resolveRianaHeaderLogoPath(options.logoPath);
  const logoBase64 = await fetchImageAsBase64(headerLogoPath, RIANA_TRANSPARENT_HEADER_LOGO);
  if (logoBase64) {
    try {
      addImageContained(doc, logoBase64, logoSlot.x, logoSlot.y, logoSlot.width, logoSlot.height);
    } catch {
      // The centered text identity remains the deterministic fallback.
    }
  }

  // The logo owns the left branding zone; the title block remains at the true
  // page center so its visual alignment is stable across A4 and Letter sizes.
  const textCenter = pageWidth / 2;

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  doc.text(options.title || 'RIANA CIMS', textCenter, 17, { align: 'center' });

  if (options.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11.5);
    doc.text(options.subtitle, textCenter, 28, { align: 'center' });
  }

  if (options.documentTitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.text(options.documentTitle, textCenter, 38, { align: 'center' });
  }

  doc.setDrawColor(...accentColor);
  doc.setLineWidth(1.5);
  doc.line(0, headerHeight, pageWidth, headerHeight);

  return headerHeight + 10;
};

/**
 * Loads an image and returns it, or null if loading fails
 */
/**
 * Fetches an image and returns it as a base64 string
 */
export const fetchImageAsBase64 = async (
  src: string,
  fallbackSrc: string | null = '/Riana_logo.png',
): Promise<string | null> => {
  try {
    if (/^data:image\//i.test(src)) return src;
    const isAbsolute = src.startsWith('http://') || src.startsWith('https://');
    const url = isAbsolute ? src : `${window.location.origin}${src.startsWith('/') ? '' : '/'}${src}`;
    
    // Attempt fetch
    let response = await fetch(url).catch(() => null);
    
    // Preserve the caller's requested fallback without changing other image roles.
    if ((!response || !response.ok) && fallbackSrc && src !== fallbackSrc) {
      response = await fetch(
        `${window.location.origin}${fallbackSrc.startsWith('/') ? '' : '/'}${fallbackSrc}`,
      ).catch(() => null);
    }
    
    if (!response || !response.ok) return null;
    
    const blob = await response.blob();
    if (!/^image\//i.test(blob.type || '')) return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    return null;
  }
};

/**
 * Fetches an image, draws it to an isolated canvas, and returns a grayscale base64 string
 */
export const fetchImageAsGrayscaleBase64 = async (src: string): Promise<string | null> => {
  try {
    const isAbsolute = src.startsWith('http://') || src.startsWith('https://');
    const url = isAbsolute ? src : `${window.location.origin}${src.startsWith('/') ? '' : '/'}${src}`;
    
    let response = await fetch(url).catch(() => null);
    if (!response || !response.ok) {
      if (src !== '/Riana_logo.png') {
        response = await fetch(`${window.location.origin}/Riana_logo.png`).catch(() => null);
      }
    }
    
    if (!response || !response.ok) return null;
    
    const blob = await response.blob();
    if (!/^image\//i.test(blob.type || '')) return null;
    const objectUrl = URL.createObjectURL(blob);
    
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          data[i] = avg;
          data[i + 1] = avg;
          data[i + 2] = avg;
        }
        
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      };
      img.src = objectUrl;
    });
  } catch (err) {
    return null;
  }
};

/**
 * Generates a unique serial number for reports
 * Format: Ria-[CODE]-YYYYMMDD-XXXX
 */
export const generateReportSerial = (abbreviation: string = 'GEN'): string => {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const unique = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `Ria-${abbreviation.toUpperCase()}-${dateStr}-${unique}`;
};

/**
 * Adds official letterhead with logo watermark and professional footer
 * Content area: Y 50mm-250mm (leaving 50mm header and 47mm footer)
 */
export const addLetterheadToDocument = async (
  doc: jsPDF,
  logoPath: string = '/Riana_logo.png',
  letterheadPath: string = '/letterhead-new.jpg',
  options: DocumentBrandingOptions = {},
): Promise<void> => {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const brand = resolveDocumentBrand(options.subsidiaryName);

  if (brand.id === 'marezi') {
    const mareziLetterhead = await fetchImageAsBase64(brand.letterheadPath!);
    const generatedAt = options.generatedAt || new Date();

    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      if (mareziLetterhead) {
        doc.addImage(mareziLetterhead, 'PNG', 0, 0, pageWidth, pageHeight);
      }
      if (page > 1 && options.documentTitle) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...brand.primary);
        doc.text(options.documentTitle, pageWidth / 2, 32.5, { align: 'center' });
      }
      addMareziFooterMetadata(doc, pageWidth, pageHeight, page, pageCount, generatedAt);
    }
    return;
  }

  // Try to load logo for watermark and new branding assets
  const logoBase64 = await fetchImageAsGrayscaleBase64(logoPath);
  const headerLogoPath = resolveRianaHeaderLogoPath(logoPath);
  const headerLogoBase64 = await fetchImageAsBase64(
    headerLogoPath,
    RIANA_TRANSPARENT_HEADER_LOGO,
  );
  const watermarkBase64 = await fetchImageAsGrayscaleBase64('/report_watermark.png');
  const footerBase64 = await fetchImageAsBase64('/report_footer.png');
  const letterheadBase64 = await fetchImageAsBase64(letterheadPath) || await fetchImageAsBase64('/letterhead.jpg');

  // Apply to each page
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    if (i > 1) {
      addRianaContinuationHeader(doc, headerLogoBase64, pageWidth, options.documentTitle);
    }

    // Add NEW FULL-PAGE watermark (Visible B/W)
    if (watermarkBase64) {
      doc.saveGraphicsState();
      (doc as any).setGState(new (doc as any).GState({ opacity: 0.12 }));
      
      const imgWidth = pageWidth - 40;
      const imgHeight = (imgWidth / 210) * 297 * 0.4; // Maintain aspect ratio approx
      const centerX = (pageWidth - imgWidth) / 2;
      const centerY = (pageHeight - imgHeight) / 2;
      
      try {
        doc.addImage(watermarkBase64, 'PNG', centerX, centerY, imgWidth, imgHeight);
      } catch (e) {
        addTextWatermark(doc, pageWidth, pageHeight);
      }
      
      doc.restoreGraphicsState();
    } else if (logoBase64) {
      doc.saveGraphicsState();
      (doc as any).setGState(new (doc as any).GState({ opacity: 0.15 }));
      
      const logoWidth = 80;
      const logoHeight = 65;
      const centerX = (pageWidth - logoWidth) / 2;
      const centerY = (pageHeight - logoHeight) / 2;
      
      try {
        doc.addImage(logoBase64, 'PNG', centerX, centerY, logoWidth, logoHeight);
      } catch (e) {
        addTextWatermark(doc, pageWidth, pageHeight);
      }
      
      doc.restoreGraphicsState();
    } else if (letterheadBase64) {
      doc.saveGraphicsState();
      (doc as any).setGState(new (doc as any).GState({ opacity: 0.03 }));
      
      const watermarkSize = 70;
      const centerX = (pageWidth - watermarkSize) / 2;
      const centerY = (pageHeight - watermarkSize) / 2;
      
      try {
        doc.addImage(letterheadBase64, 'JPEG', centerX, centerY, watermarkSize, watermarkSize * 0.7);
      } catch (e) {
        addTextWatermark(doc, pageWidth, pageHeight);
      }
      
      doc.restoreGraphicsState();
    } else {
      addTextWatermark(doc, pageWidth, pageHeight);
    }

    // Add professional footer (using new Footer image if available)
    if (footerBase64) {
      addBrandedFooter(doc, footerBase64, pageWidth, pageHeight, i, pageCount);
    } else {
      addProfessionalFooter(doc, pageWidth, pageHeight, i, pageCount);
    }
  }
};

const addRianaContinuationHeader = (
  doc: jsPDF,
  logoBase64: string | null,
  pageWidth: number,
  documentTitle?: string,
): void => {
  doc.setFillColor(...RIANA_DOCUMENT_TEAL);
  doc.rect(0, 0, pageWidth, 22, 'F');
  if (logoBase64) {
    try {
      addImageContained(doc, logoBase64, 10, 2, 14, 18);
    } catch {
      // Text identity below remains the deterministic fallback.
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('RIANA CIMS', pageWidth / 2, 9, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(documentTitle || 'Official System Document', pageWidth / 2, 15, { align: 'center' });
};

const addMareziFooterMetadata = (
  doc: jsPDF,
  pageWidth: number,
  pageHeight: number,
  currentPage: number,
  totalPages: number,
  generatedAt: Date,
): void => {
  doc.setFillColor(255, 255, 255);
  doc.rect(10, pageHeight - 23, pageWidth - 20, 6.5, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(70, 70, 70);
  doc.text('MAREZI | Official & Confidential', 14, pageHeight - 19);
  doc.text(
    `Generated ${generatedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    pageWidth / 2,
    pageHeight - 19,
    { align: 'center' },
  );
  doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - 14, pageHeight - 19, { align: 'right' });
};

/**
 * Adds the full letterhead background for E-Handover forms
 */
export const addLetterheadBackground = async (
  doc: jsPDF,
  letterheadPath: string = '/letterhead-new.jpg'
): Promise<void> => {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const letterheadBase64 = await fetchImageAsBase64(letterheadPath) || await fetchImageAsBase64('/letterhead.jpg');

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    if (letterheadBase64) {
      doc.saveGraphicsState();
      (doc as any).setGState(new (doc as any).GState({ opacity: 0.04 }));
      
      const watermarkSize = 60;
      const centerX = (pageWidth - watermarkSize) / 2;
      const centerY = (pageHeight - watermarkSize) / 2;
      
      try {
        doc.addImage(letterheadBase64, 'JPEG', centerX, centerY, watermarkSize, watermarkSize);
      } catch (e) {
        // Silent fail
      }
      
      doc.restoreGraphicsState();
    }
  }
};

/**
 * Adds diagonal company logo watermark across all pages
 */
export const addWatermarkToAllPages = async (
  doc: jsPDF,
  logoPath: string = '/report_watermark.png',
  opacity: number = 0.12
) => {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const logoBase64 = await fetchImageAsGrayscaleBase64(logoPath);

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    if (logoBase64) {
      doc.saveGraphicsState();
      (doc as any).setGState(new (doc as any).GState({ opacity }));
      
      const logoWidth = 55;
      const logoHeight = 45;
      const centerX = (pageWidth - logoWidth) / 2;
      const centerY = (pageHeight - logoHeight) / 2;
      
      try {
        doc.addImage(logoBase64, 'PNG', centerX, centerY, logoWidth, logoHeight);
      } catch (e) {
        // Silent fail
      }
      
      doc.restoreGraphicsState();
    } else {
      addTextWatermark(doc, pageWidth, pageHeight);
    }
  }
};

/**
 * Adds text watermark as fallback - very subtle to avoid content overlap
 */
const addTextWatermark = (doc: jsPDF, pageWidth: number, pageHeight: number): void => {
  doc.saveGraphicsState();
  
  // Very faint text watermark - almost invisible
  doc.setTextColor(248, 248, 248);
  doc.setFontSize(55);
  doc.setFont('helvetica', 'bold');
  
  doc.text('RIANA CIMS', pageWidth / 2, pageHeight / 2, { align: 'center', angle: -35 });
  
  doc.restoreGraphicsState();
};

/**
 * Adds the new standard graphical footer
 */
export const addBrandedFooter = (
  doc: jsPDF,
  footerBase64: string,
  pageWidth: number,
  pageHeight: number,
  currentPage: number,
  totalPages: number
): void => {
  const footerWidth = pageWidth - 20;
  const footerHeight = (footerWidth / 800) * 100; // Estimated aspect ratio
  const x = (pageWidth - footerWidth) / 2;
  const y = pageHeight - footerHeight - 12;

  try {
    doc.addImage(footerBase64, 'PNG', x, y, footerWidth, footerHeight);
    
    // Page number still added for clarity
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - 15, pageHeight - 10, { align: 'right' });
  } catch (e) {
    addProfessionalFooter(doc, pageWidth, pageHeight, currentPage, totalPages);
  }
};

/**
 * Adds professional footer with company info, subsidiaries, and page numbers
 */
export const addProfessionalFooter = (
  doc: jsPDF, 
  pageWidth: number, 
  pageHeight: number,
  currentPage: number,
  totalPages: number
): void => {
  const margin = 15;
  const footerStartY = pageHeight - 32;
  const currentYear = new Date().getFullYear();
  
  // White background for footer to ensure content visibility
  doc.setFillColor(255, 255, 255);
  doc.rect(0, footerStartY - 2, pageWidth, 35, 'F');
  
  // Footer separator line - RIANA teal color
  doc.setDrawColor(RIANA_TEAL[0], RIANA_TEAL[1], RIANA_TEAL[2]);
  doc.setLineWidth(0.8);
  doc.line(margin, footerStartY, pageWidth - margin, footerStartY);
  
  // Company address and website - centered
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.text(`${COMPANY_ADDRESS}  |  ${COMPANY_WEBSITE}`, pageWidth / 2, footerStartY + 5, { align: 'center' });
  
  // Subsidiary logos as colored text - evenly spaced
  const subsidiaryY = footerStartY + 11;
  const totalWidth = pageWidth - 2 * margin;
  const spacing = totalWidth / (SUBSIDIARIES.length + 1);
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  
  SUBSIDIARIES.forEach((subsidiary, index) => {
    const x = margin + spacing * (index + 1);
    doc.setTextColor(...subsidiary.color);
    doc.text(subsidiary.name, x, subsidiaryY, { align: 'center' });
  });
  
  // Bottom row: Copyright, Generated timestamp, Page numbers
  const bottomY = footerStartY + 17;
  doc.setFontSize(5.5);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text(`© ${currentYear} RIANA Group. All rights reserved.`, margin, bottomY);
  doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - margin, bottomY, { align: 'right' });
  
  // Generated timestamp - absolute bottom to be below everything
  const generatedDate = new Date().toLocaleDateString('en-GB', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  doc.text(`Generated: ${generatedDate}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
};

/**
 * Adds a single centered watermark on a specific page
 */
export const addCenteredWatermark = (
  doc: jsPDF,
  pageNum: number,
  text: string = 'RIANA GROUP - CONFIDENTIAL'
): void => {
  doc.setPage(pageNum);
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  doc.saveGraphicsState();
  doc.setTextColor(240, 240, 240);
  doc.setFontSize(35);
  doc.setFont('helvetica', 'bold');
  
  doc.text(text, pageWidth / 2, pageHeight / 2, { 
    align: 'center',
    angle: -35
  });
  
  doc.restoreGraphicsState();
};

/**
 * Adds official header with logo to first page
 * Returns the Y position after the header for content to start
 */
export const addOfficialHeader = async (
  doc: jsPDF,
  logoPath: string = '/Riana_logo.png'
): Promise<number> => {
  return addCimsDocumentHeader(doc, {
    logoPath,
    subtitle: 'Client Installation Management System',
    headerHeight: 42,
  });
};

/**
 * Generate PDF and return as Blob for preview
 */
export const getPDFAsBlob = (doc: jsPDF): Blob => {
  return doc.output('blob');
};
