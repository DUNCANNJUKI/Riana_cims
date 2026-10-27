import { API_URL } from "@/integrations/apiClient";

const apiRoot = API_URL.replace(/\/api$/i, "");

export const resolveAvatarUrl = (avatarUrl?: string | null) => {
  const clean = String(avatarUrl || "").trim();
  if (!clean) return undefined;
  if (/^(https?:|data:|blob:)/i.test(clean)) return clean;

  const uploadPath = clean.startsWith("/uploads/")
    ? clean
    : `/uploads/${clean.replace(/^uploads\//i, "").replace(/^\/+/, "")}`;

  return apiRoot ? `${apiRoot}${uploadPath}` : uploadPath;
};