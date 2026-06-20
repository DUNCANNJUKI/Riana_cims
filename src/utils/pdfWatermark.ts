import jsPDF from "jspdf";

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

// RIANA brand colors (Matching #0D8390)
const RIANA_TEAL = [13, 131, 144];
const RIANA_BLUE = [13, 131, 144]; // Unified with brand teal

/**
 * Loads an image and returns it, or null if loading fails
 */
/**
 * Fetches an image and returns it as a base64 string
 */
export const fetchImageAsBase64 = async (src: string): Promise<string | null> => {
  try {
    const isAbsolute = src.startsWith('http://') || src.startsWith('https://');
    const url = isAbsolute ? src : `${window.location.origin}${src.startsWith('/') ? '' : '/'}${src}`;
    
    // Attempt fetch
    let response = await fetch(url).catch(() => null);
    
    // Fallback order: relative, absolute, root riana-logo, or fallback API
    if (!response || !response.ok) {
      if (src !== '/Riana_logo.png') {
        response = await fetch(`${window.location.origin}/Riana_logo.png`).catch(() => null);
      }
    }
    
    if (!response || !response.ok) return null;
    
    const blob = await response.blob();
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
  letterheadPath: string = '/letterhead-new.jpg'
): Promise<void> => {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Try to load logo for watermark and new branding assets
  const logoBase64 = await fetchImageAsGrayscaleBase64(logoPath);
  const watermarkBase64 = await fetchImageAsGrayscaleBase64('/report_watermark.png');
  const footerBase64 = await fetchImageAsBase64('/report_footer.png');
  const letterheadBase64 = await fetchImageAsBase64(letterheadPath) || await fetchImageAsBase64('/letterhead.jpg');

  // Apply to each page
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

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
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  
  // Header background
  doc.setFillColor(RIANA_BLUE[0], RIANA_BLUE[1], RIANA_BLUE[2]);
  doc.rect(0, 0, pageWidth, 42, 'F');
  
  // Try to add logo on the left side
  const logoBase64 = await fetchImageAsBase64(logoPath);
  if (logoBase64) {
    try {
      // Add white background circle/square behind logo for visibility
/* doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin - 2, 6, 32, 30, 3, 3, 'F'); */
      doc.addImage(logoBase64, 'PNG', margin, 8, 28, 26);
    } catch (e) {
      console.log('Logo could not be added to header');
    }
  }
  
  // Company name - centered but offset for logo
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('RIANA CIMS', pageWidth / 2, 20, { align: 'center' });
  
  // Tagline
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Client Installation Management System', pageWidth / 2, 30, { align: 'center' });
  
  // Thin accent line under header
  doc.setDrawColor(RIANA_TEAL[0], RIANA_TEAL[1], RIANA_TEAL[2]);
  doc.setLineWidth(1.5);
  doc.line(0, 42, pageWidth, 42);
  
  return 50; // Return Y position after header
};

/**
 * Generate PDF and return as Blob for preview
 */
export const getPDFAsBlob = (doc: jsPDF): Blob => {
  return doc.output('blob');
};