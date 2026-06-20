/**
 * Company Logo Management Utility
 * Provides unified logo handling for all PDF reports
 * Ensures consistent branding across all generated documents
 */

import jsPDF from 'jspdf';
import { 
  fetchImageAsBase64, 
  fetchImageAsGrayscaleBase64, 
  addBrandedFooter, 
  addProfessionalFooter,
  addWatermarkToAllPages
} from './pdfWatermark';

// Logo asset paths with fallbacks
const LOGO_PATHS = {
  primary: '/Riana_logo.png',
  fallback1: `${typeof window !== 'undefined' ? window.location.origin : ''}/Riana_logo.png`,
  fallback2: '/logo.png'
};

// Logo dimensions (in mm)
const LOGO_DIMENSIONS = {
  headerWidth: 45,
  headerHeight: 15,
  headerLeftMargin: 12,
  headerTopMargin: 10,
  headerBgWidth: 50,
  headerBgHeight: 20,
  footerWidth: 24,
  footerHeight: 8,
  watermarkWidth: 100,
  watermarkHeight: 35
};

// Company brand colors
export const COMPANY_COLORS = {
  primary: [59, 130, 246] as [number, number, number],        // RIANA Blue
  secondary: [16, 185, 129] as [number, number, number],      // Green
  accent: [0, 160, 175] as [number, number, number],          // Teal (Matches Logo)
  text: [51, 51, 51] as [number, number, number],             // Dark Gray
  textLight: [100, 100, 100] as [number, number, number],     // Medium Gray
  lightGray: [243, 244, 246] as [number, number, number],     // Light Gray
  white: [255, 255, 255] as [number, number, number],         // White
  darkBlue: [30, 60, 150] as [number, number, number]         // Dark Blue
};

/**
 * Load image from URL with timeout and fallback handling
 */
export const loadImage = async (
  src: string,
  timeout: number = 3000
): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      const timeoutId = setTimeout(() => {
        resolve(null);
      }, timeout);
      
      img.onload = () => {
        clearTimeout(timeoutId);
        if (img.complete && img.naturalWidth > 0) {
          resolve(img);
        } else {
          resolve(null);
        }
      };
      
      img.onerror = () => {
        clearTimeout(timeoutId);
        resolve(null);
      };
      
      img.src = src;
    } catch (error) {
      resolve(null);
    }
  });
};

/**
 * Load company logo with multiple fallback sources
 */
export const loadCompanyLogo = async (): Promise<HTMLImageElement | null> => {
  const paths = Object.values(LOGO_PATHS) as string[];
  
  for (const path of paths) {
    if (!path || path === window.location.origin) continue;
    const img = await loadImage(path);
    if (img) return img;
  }
  
  return null;
};

/**
 * Add header logo with white background box
 * Typically placed in top-left of header
 */
export const addHeaderLogo = async (
  doc: jsPDF,
  logoImg: HTMLImageElement | null,
  options?: {
    x?: number;
    y?: number;
    bgWidth?: number;
    bgHeight?: number;
    logoWidth?: number;
    logoHeight?: number;
    bgColor?: [number, number, number];
    borderRadius?: number;
  }
): Promise<void> => {
  if (!logoImg) return;
  
  const x = options?.x ?? LOGO_DIMENSIONS.headerLeftMargin;
  const y = options?.y ?? LOGO_DIMENSIONS.headerTopMargin;
  const bgWidth = options?.bgWidth ?? LOGO_DIMENSIONS.headerBgWidth;
  const bgHeight = options?.bgHeight ?? LOGO_DIMENSIONS.headerBgHeight;
  const logoWidth = options?.logoWidth ?? LOGO_DIMENSIONS.headerWidth;
  const logoHeight = options?.logoHeight ?? LOGO_DIMENSIONS.headerHeight;
  const bgColor = options?.bgColor ?? COMPANY_COLORS.white;
  const borderRadius = options?.borderRadius ?? 2;
  
  try {
    // Draw white background box with rounded corners
/* doc.setFillColor(...bgColor);
    doc.roundedRect(x - 1, y, bgWidth, bgHeight, borderRadius, borderRadius, 'F'); */
    
    // Add logo image
    doc.addImage(logoImg, 'PNG', x, y + 1, logoWidth, logoHeight);
  } catch (error) {
    console.warn('Could not add header logo:', error);
  }
};

/**
 * Add footer logo (smaller version, right-aligned)
 */
export const addFooterLogo = async (
  doc: jsPDF,
  logoImg: HTMLImageElement | null,
  pageWidth?: number,
  options?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }
): Promise<void> => {
  if (!logoImg || !pageWidth) return;
  
  const width = options?.width ?? LOGO_DIMENSIONS.footerWidth;
  const height = options?.height ?? LOGO_DIMENSIONS.footerHeight;
  const x = options?.x ?? pageWidth - 20;
  const y = options?.y ?? doc.internal.pageSize.getHeight() - 12;
  
  try {
    doc.addImage(logoImg, 'PNG', x, y, width, height);
  } catch (error) {
    console.warn('Could not add footer logo:', error);
  }
};

/**
 * Add watermark logo across all pages
 */
export const addLogoWatermark = async (
  doc: jsPDF,
  logoImg: HTMLImageElement | null,
  opacity: number = 0.05
): Promise<void> => {
  if (!logoImg) return;
  
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  const width = LOGO_DIMENSIONS.watermarkWidth;
  const height = LOGO_DIMENSIONS.watermarkHeight;
  const x = (pageWidth - width) / 2;
  const y = (pageHeight - height) / 2;
  
  try {
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.saveGraphicsState();
      (doc as any).setGState(new (doc as any).GState({ opacity }));
      
      doc.addImage(logoImg, 'PNG', x, y, width, height);
      
      doc.restoreGraphicsState();
    }
  } catch (error) {
    console.warn('Could not add watermark logo:', error);
  }
};

/**
 * Main function: Apply complete professional branding to document
 * Includes: header logo, watermark, and company branding
 */
export const applyCompanyBranding = async (
  doc: jsPDF,
  options?: {
    headerLogoPath?: string;
    addWatermark?: boolean;
    addFooterLogo?: boolean;
    headerBgColor?: [number, number, number];
  }
): Promise<HTMLImageElement | null> => {
  const logoPath = options?.headerLogoPath ?? LOGO_PATHS.primary;
  const addWatermark = options?.addWatermark ?? true;
  
  // Load logo images as base64
  const logoBase64 = await fetchImageAsBase64(logoPath);
  const watermarkBase64 = await fetchImageAsGrayscaleBase64('/report_watermark.png');
  const footerBase64 = await fetchImageAsBase64('/report_footer.png');
  
  if (!logoBase64) {
    return null;
  }
  
  // Header Logo Box is usually already handled by the caller or addOfficialHeader
  // But we can add the logo image if needed
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageCount = doc.getNumberOfPages();

  // Apply to all pages
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Header Logo (only on first page for standard reports, but usually standard)
    if (i === 1) {
      try {
        // Position it similarly to addHeaderLogo
        const lx = LOGO_DIMENSIONS.headerLeftMargin;
        const ly = LOGO_DIMENSIONS.headerTopMargin;
        const lw = LOGO_DIMENSIONS.headerWidth;
        const lh = LOGO_DIMENSIONS.headerHeight;
        doc.addImage(logoBase64, 'PNG', lx, ly + 1, lw, lh);
      } catch (e) {
        console.warn('Could not add header logo in applyCompanyBranding:', e);
      }
    }
    
    // Watermark
    if (addWatermark) {
      if (watermarkBase64) {
        doc.saveGraphicsState();
        (doc as any).setGState(new (doc as any).GState({ opacity: 0.12 }));
        const w = pageWidth - 40;
        const h = (w / 210) * 297 * 0.4;
        doc.addImage(watermarkBase64, 'PNG', (pageWidth - w) / 2, (pageHeight - h) / 2, w, h);
        doc.restoreGraphicsState();
      }
    }
    
    // Footer
    if (footerBase64) {
      addBrandedFooter(doc, footerBase64, pageWidth, pageHeight, i, pageCount);
    } else {
      addProfessionalFooter(doc, pageWidth, pageHeight, i, pageCount);
    }
  }
  
  return {} as HTMLImageElement; // Mock return for compatibility
};

/**
 * Fallback text logo when image fails to load
 */
export const addTextLogo = (
  doc: jsPDF,
  x?: number,
  y?: number,
  options?: {
    fontSize?: number;
    color?: [number, number, number];
    align?: 'left' | 'center' | 'right';
  }
): void => {
  const posX = x ?? 14;
  const posY = y ?? 15;
  const fontSize = options?.fontSize ?? 18;
  const color = options?.color ?? COMPANY_COLORS.primary;
  const align = options?.align ?? 'left';
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.setTextColor(...color);
  doc.text('RIANA', posX, posY, { align: align as any });
};

/**
 * Add RIANA watermark text (fallback for when logo image fails)
 */
export const addTextWatermark = (
  doc: jsPDF,
  pageWidth?: number,
  pageHeight?: number,
  opacity: number = 0.05
): void => {
  const width = pageWidth ?? doc.internal.pageSize.getWidth();
  const height = pageHeight ?? doc.internal.pageSize.getHeight();
  
  doc.saveGraphicsState();
  doc.setTextColor(240, 240, 240);
  doc.setFontSize(60);
  doc.setFont('helvetica', 'bold');
  
  // Add text watermark at 45 degree angle
  doc.text('RIANA CIMS', width / 2, height / 2, {
    align: 'center',
    angle: -35
  });
  
  doc.restoreGraphicsState();
};

/**
 * Export logo for use as file download
 */
export const getLogoDataUrl = (): string => {
  return LOGO_PATHS.primary;
};
