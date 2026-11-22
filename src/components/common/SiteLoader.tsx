import { useEffect, useRef, useState } from "react";

import { SiteLoaderArtwork } from "./SiteLoaderArtwork";

interface SiteLoaderProps {
  isLoading: boolean;
  minDuration?: number;
  status?: string;
}

export const SiteLoader = ({
  isLoading,
  minDuration = 0,
  status = "Initializing workspace...",
}: SiteLoaderProps) => {
  const [showLoader, setShowLoader] = useState(isLoading);
  const [companyName, setCompanyName] = useState("RIANA CIMS");
  const [companyLogo, setCompanyLogo] = useState("/Riana_mark_color_trimmed.png");
  const visibleSince = useRef(isLoading ? Date.now() : 0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/public/company-branding", { credentials: "same-origin", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((branding) => {
        if (!branding || controller.signal.aborted) return;
        if (typeof branding.name === "string" && branding.name.trim()) setCompanyName(branding.name.trim());
        if (typeof branding.logo_path === "string" && branding.logo_path.trim()) {
          const logoPath = branding.logo_path.trim();
          setCompanyLogo(["/Riana_logo_transparent.png", "/Riana_mark_transparent.png"].includes(logoPath)
            ? "/Riana_mark_color_trimmed.png"
            : logoPath);
        }
      })
      .catch(() => {
        // Keep the bundled RIANA logo and name when public branding is unavailable.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (isLoading) {
      visibleSince.current = Date.now();
      setShowLoader(true);
      return;
    }

    const remainingDuration = Math.max(0, minDuration - (Date.now() - visibleSince.current));
    if (remainingDuration === 0) {
      setShowLoader(false);
      return;
    }

    const timer = window.setTimeout(() => setShowLoader(false), remainingDuration);
    return () => window.clearTimeout(timer);
  }, [isLoading, minDuration]);

  if (!showLoader) return null;

  return <SiteLoaderArtwork companyName={companyName} companyLogo={companyLogo} status={status} />;
};
