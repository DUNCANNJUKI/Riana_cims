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

export const BRAND_IDENTITIES: Record<BrandId, BrandIdentity> = {
  riana: {
    id: 'riana',
    name: 'RIANA Group',
    systemName: 'RIANA CIMS',
    website: 'www.riana.co',
    primary: [29, 130, 151],
    accent: [29, 130, 151],
  },
  marezi: {
    id: 'marezi',
    name: 'MAREZI',
    systemName: 'RIANA CIMS',
    website: 'www.marezi.co',
    primary: [15, 106, 129],
    accent: [217, 37, 45],
    letterheadPath: '/marezi-letterhead.png',
  },
};

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
