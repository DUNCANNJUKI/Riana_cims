import { API_URL, clearAuthToken, getAuthToken } from "@/integrations/apiClient";

export type SecureFileStatus = "uploading" | "processing" | "active" | "failed" | "quarantined" | "deleted";

export interface SecureFileMetadata {
  id: number;
  originalName: string;
  mimeType: string;
  detectedMimeType?: string | null;
  fileSize: number;
  fileSizeLabel?: string;
  category: string;
  status: SecureFileStatus;
  visibility?: "private" | "organization" | "public";
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  uploadedBy?: { id: string; name?: string };
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  image?: { width?: number | null; height?: number | null } | null;
  variants?: Array<{
    type: "original" | "optimized" | "thumbnail";
    mimeType: string;
    fileSize: number;
    width?: number | null;
    height?: number | null;
    viewUrl: string;
  }>;
  viewUrl: string;
  downloadUrl: string;
  permissions?: {
    canView: boolean;
    canDownload: boolean;
    canDelete: boolean;
    canReplace: boolean;
    canRestore: boolean;
  };
}

export interface UploadSecureFilesOptions {
  files: File[];
  category: string;
  relatedEntityType?: string;
  relatedEntityId?: string | number;
  visibility?: "private" | "organization" | "public";
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

const authenticatedHeaders = () => {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

const handleUnauthorized = () => {
  clearAuthToken();
  localStorage.removeItem("riana_user");
  window.location.assign("/");
};

export const authorizedFileUrl = (endpoint: string) => `${API_URL}${endpoint}`;

export const uploadSecureFiles = ({
  files,
  category,
  relatedEntityType,
  relatedEntityId,
  visibility = "private",
  signal,
  onProgress,
}: UploadSecureFilesOptions): Promise<SecureFileMetadata[]> => new Promise((resolve, reject) => {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  formData.set("category", category);
  formData.set("visibility", visibility);
  if (relatedEntityType) formData.set("relatedEntityType", relatedEntityType);
  if (relatedEntityId !== undefined && relatedEntityId !== null) formData.set("relatedEntityId", String(relatedEntityId));

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${API_URL}/files/upload`);
  xhr.withCredentials = true;
  Object.entries(authenticatedHeaders()).forEach(([key, value]) => xhr.setRequestHeader(key, value));
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
  };
  xhr.onerror = () => reject(new Error("The file upload could not be completed."));
  xhr.onload = () => {
    if (xhr.status === 401) {
      handleUnauthorized();
      return;
    }
    const body = JSON.parse(xhr.responseText || "{}");
    if (xhr.status < 200 || xhr.status >= 300) {
      reject(new Error(body.error || "The file upload could not be completed."));
      return;
    }
    resolve(body.files || []);
  };
  signal?.addEventListener("abort", () => {
    xhr.abort();
    reject(new DOMException("Upload cancelled.", "AbortError"));
  }, { once: true });
  xhr.send(formData);
});

export const replaceSecureFile = (fileId: number, file: File, onProgress?: (percent: number) => void): Promise<SecureFileMetadata> => new Promise((resolve, reject) => {
  const formData = new FormData();
  formData.append("file", file);
  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${API_URL}/files/${fileId}/replace`);
  xhr.withCredentials = true;
  Object.entries(authenticatedHeaders()).forEach(([key, value]) => xhr.setRequestHeader(key, value));
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
  };
  xhr.onerror = () => reject(new Error("The replacement upload could not be completed."));
  xhr.onload = () => {
    if (xhr.status === 401) {
      handleUnauthorized();
      return;
    }
    const body = JSON.parse(xhr.responseText || "{}");
    if (xhr.status < 200 || xhr.status >= 300) {
      reject(new Error(body.error || "The replacement upload could not be completed."));
      return;
    }
    resolve(body);
  };
  xhr.send(formData);
});

export const thumbnailUrlFor = (file: SecureFileMetadata) => {
  const thumbnail = file.variants?.find((variant) => variant.type === "thumbnail");
  return authorizedFileUrl(thumbnail?.viewUrl || `${file.viewUrl}?variant=thumbnail`);
};

export const previewUrlFor = (file: SecureFileMetadata) => {
  const optimized = file.variants?.find((variant) => variant.type === "optimized");
  return authorizedFileUrl(optimized?.viewUrl || file.viewUrl);
};

export const downloadUrlFor = (file: SecureFileMetadata) => authorizedFileUrl(file.downloadUrl);
