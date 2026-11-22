import { useEffect, useState } from 'react';
import { SiteLoaderArtwork } from '../../../../src/components/common/SiteLoaderArtwork';

const bundledLogo = new URL('../../../../public/Riana_mark_color_trimmed.png', import.meta.url).href;

export function CompanyLogoLoader({ className = '', size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  if (size !== 'sm') return <div className={className}><PageLoader /></div>;
  return <span role="status" aria-label="Loading" className={className + ' inline-flex h-5 w-5 items-center justify-center'}><img src={bundledLogo} alt="" className="h-full w-full object-contain motion-safe:animate-pulse" /></span>;
}

export function PageLoader() {
  const [brand, setBrand] = useState({ companyName: 'RIANA CIMS', companyLogo: bundledLogo });
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/public/company-branding', { signal: controller.signal, credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null).then(b => {
        if (b && !controller.signal.aborted) setBrand({ companyName: b.name || 'RIANA CIMS', companyLogo: b.logo_path || bundledLogo });
      }).catch(() => {});
    return () => controller.abort();
  }, []);
  return <SiteLoaderArtwork {...brand} status="Loading Developer workspace..." />;
}
