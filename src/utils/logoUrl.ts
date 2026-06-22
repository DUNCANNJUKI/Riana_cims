const DEFAULT_LOGO_PATH = "/Riana_logo.png";

const withCacheVersion = (url: string, version?: string | number) => {
  if (!version || url.startsWith("data:") || url.startsWith("blob:")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(String(version))}`;
};

export const resolveCompanyLogoUrl = (logoPath?: string | null, version?: string | number) => {
  const value = String(logoPath || "").trim();
  if (!value) return withCacheVersion(DEFAULT_LOGO_PATH, version);
  if (/^(https?:|data:|blob:)/i.test(value)) return withCacheVersion(value, version);
  if (value.startsWith("/uploads/")) return withCacheVersion(value, version);
  if (value.startsWith("/")) return withCacheVersion(value, version);
  return withCacheVersion(`/uploads/${value.replace(/^uploads\//, "")}`, version);
};

export const dispatchCompanyBrandingUpdated = (logoPath?: string | null) => {
  window.dispatchEvent(new CustomEvent("riana-company-branding-updated", {
    detail: {
      logoPath,
      version: Date.now(),
    },
  }));
};

export const getCompanyBrandingEventDetail = (event: Event) => {
  const detail = (event as CustomEvent<{ logoPath?: string | null; version?: number }>).detail;
  return {
    logoPath: detail?.logoPath,
    version: detail?.version || Date.now(),
  };
};
