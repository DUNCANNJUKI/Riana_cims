const DEFAULT_LOGO_PATH = "/Riana_logo.png";

export const resolveCompanyLogoUrl = (logoPath?: string | null, version?: string | number) => {
  const value = String(logoPath || "").trim();
  let resolved = DEFAULT_LOGO_PATH;

  if (/^(https?:|data:|blob:)/i.test(value)) resolved = value;
  else if (value.startsWith("/uploads/")) resolved = value;
  else if (value.startsWith("/")) resolved = value;
  else if (value) resolved = `/uploads/${value.replace(/^uploads\//, "")}`;

  if (!version || resolved.startsWith("data:") || resolved.startsWith("blob:")) return resolved;
  return `${resolved}${resolved.includes("?") ? "&" : "?"}v=${encodeURIComponent(String(version))}`;
};

export const fetchCompanyBranding = async () => {
  const response = await fetch("/api/public/company-branding", { credentials: "include" });
  if (!response.ok) return null;
  return response.json();
};
