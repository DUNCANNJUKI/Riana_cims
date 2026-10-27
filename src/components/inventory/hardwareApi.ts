import { apiClient, apiFetch } from "@/integrations/apiClient";
import type { User } from "@/types";

export const hardwareActorKey = (user: User) =>
  JSON.stringify([
    user.id,
    user.subsidiary_id,
    user.role,
    user.permissions || [],
    user.extra_permissions || [],
  ]);

export type HardwareAsset = {
  id: string;
  serial_number: string | null;
  model_id: string;
  model_number: string;
  equipment_field?: string | null;
  selectable?:boolean;
  unavailable_reason?:string | null;
  family: string;
  nickname: string;
  subsidiary_id: string;
  subsidiary_name: string;
  location_id: string | null;
  location_name: string | null;
  status: string;
  condition_grade: string | null;
  approval_status: string;
  manufacturer_serial: string | null;
  physical_verified: number;
  reconciliation_status: string;
  registration_source: string;
  manufacturing_year: number | null;
  warranty_expires: string | null;
  notes: string | null;
  installation_id: string | null;
  client_name: string | null;
  branch_name: string | null;
  active_assignment_id: string | null;
  custodian_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  installed_at: string | null;
  assignments?: Array<{
    id: string;
    installation_id: string;
    assigned_at: string;
    installed_at: string;
    closed_at: string | null;
  }>;
  events?: Array<{
    id: string;
    action: string;
    created_at: string;
    details: Record<string, unknown>;
    actor_id?: string;
    actor_name?: string;
  }>;
  technical_configuration?: Record<string, unknown> | null;
};
export type HardwareCatalog = {
  variants: Array<{
    id: string;
    family: string;
    nickname: string;
    description: string;
    retired: number;
    variant?:string;
    dependency_count?:number;
  }>;
  models: Array<{
    id: string;
    model_number: string;
    model_year: number;
    approval_status: string;
    historical_only: number;
    equipment_field?: string | null;
    family: string;
    nickname: string;
  }>;
  locations: Array<{ id: string; subsidiary_id: string; name: string }>;
  subsidiaries: Array<{ id: string; subsidiary_name: string }>;
  clients?: Array<{ id: string; client_name: string }>;
  branches?: Array<{ id: string; client_id: string; branch_name: string }>;
  technicians?: Array<{
    id: string;
    first_name: string;
    last_name: string;
    subsidiary_id: string;
  }>;
  installations?: Array<{
    id: string;
    client_id: string;
    client_name: string;
    branch_name: string;
    subsidiary_id: string;
    status: string;
  }>;
  policy: {
    issuance_approved: number;
    field_approval_required: number;
    sequence_partition: string;
    approval_reference: string | null;
  };
  statuses: string[];
  equipment_fields?: Array<{field:string;label:string}>;
  equipment_fields_by_subsidiary?: Record<string,Array<{field:string;label:string}>>;
  conditions: string[];
};
export const hardwareQuery = (
  values: Record<string, string | number | undefined>,
) => {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  return query.toString();
};
export const hardwareGet = (path: string) => apiClient.get(`/hardware${path}`);
const pendingRequests = new Map<
  string,
  { key: string; promise?: Promise<any> }
>();
export const hardwarePost = (
  path: string,
  body: unknown,
  key?: string,
): Promise<any> => {
  const payload = JSON.stringify(body);
  const fingerprint = `${path}:${payload}`;
  const pending = pendingRequests.get(fingerprint) || {
    key: key || crypto.randomUUID(),
  };
  if (pending.promise) return pending.promise;
  pending.promise = apiFetch(`/hardware${path}`, {
    method: "POST",
    headers: { "Idempotency-Key": pending.key },
    body: payload,
  })
    .then((value) => {
      pendingRequests.delete(fingerprint);
      return value;
    })
    .catch((error) => {
      pending.promise = undefined;
      if (error.status >= 400 && error.status < 500)
        pendingRequests.delete(fingerprint);
      throw error;
    });
  pendingRequests.set(fingerprint, pending);
  return pending.promise;
};
export const assetQrUrl = (id: string) => {
  if(!/^[A-Za-z0-9-]{1,36}$/.test(id))throw new Error('A registered asset ID is required for a QR label.');
  const url=new URL(`/asset/${encodeURIComponent(id)}`,window.location.origin);
  return url.href;
};
export const assetIdFromScan = (raw: string) => {
  try {
    const url = new URL(raw);
    if (url.origin !== window.location.origin || url.username || url.password) return raw;
    const assetPath = url.pathname.match(/^\/asset\/([A-Za-z0-9-]{1,36})$/);
    if (assetPath) return assetPath[1];
    return url.pathname==='/' ? url.searchParams.get("hardware") || raw : raw;
  } catch {
    return raw;
  }
};
