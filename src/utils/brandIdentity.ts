import { DOCUMENT_BRANDS } from '../../server/services/documentBranding.mjs';

export type BrandId = 'riana' | 'marezi';

export interface BrandIdentity {
  id: BrandId;
  name: string;
  systemName: string;
  website: string;
  primary: [number, number, number];
  accent: [number, number, number];
  letterheadPath?: string;
}

export const BRAND_IDENTITIES = DOCUMENT_BRANDS as Record<BrandId, BrandIdentity>;

export const isMareziSubsidiary = (subsidiaryName?: string | null): boolean => (
  /(^|[^a-z])marezi([^a-z]|$)/i.test(String(subsidiaryName || '').trim())
);

export const resolveBrandIdentity = (...subsidiaryNames: Array<string | null | undefined>): BrandIdentity => (
  subsidiaryNames.some(isMareziSubsidiary) ? BRAND_IDENTITIES.marezi : BRAND_IDENTITIES.riana
);

export const resolveDocumentSubsidiaryName = (
  ...subsidiaryNames: Array<string | null | undefined>
): string | null => {
  if (subsidiaryNames.some(isMareziSubsidiary)) return 'MAREZI';
  return subsidiaryNames.find((name) => String(name || '').trim()) || null;
};
