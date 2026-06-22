import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database } from '@crms/integrations/supabase/types';

const API_URL = '/api/crms';
const DEFAULT_STALE_TIME = 60_000;
const DEFAULT_GC_TIME = 5 * 60_000;

async function fetchJson<T>(url: string, message: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || message);
  }
  return res.json() as Promise<T>;
}

type Client = Database['public']['Tables']['clients']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'] & {
  password?: string;
  status: 'active' | 'suspended';
};
type ChangeRequest = Database['public']['Tables']['change_requests']['Row'];
type AuditLog = Database['public']['Tables']['audit_logs']['Row'];
type Notification = Database['public']['Tables']['notifications']['Row'];
type UserRole = Database['public']['Tables']['user_roles']['Row'];

export interface ChangeRequestWithRelations extends ChangeRequest {
  client?: Client;
  assigned_developer?: Profile;
  senior_developer?: Profile;
}

export interface AuditLogWithRelations extends AuditLog {
  user?: Profile;
  profiles?: Profile;
  change_request?: { ticket_number: string };
}

// Clients
export function useClients() {
  return useQuery({
    queryKey: ['clients'],
    queryFn: () => fetchJson<Client[]>(`${API_URL}/clients`, 'Failed to fetch clients'),
    staleTime: DEFAULT_STALE_TIME,
    gcTime: DEFAULT_GC_TIME,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (client: Database['public']['Tables']['clients']['Insert']) => {
      const res = await fetch(`${API_URL}/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(client),
      });
      if (!res.ok) throw new Error('Failed to create client');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Client>) => {
      const res = await fetch(`${API_URL}/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update client');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

// Profiles
export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => fetchJson<Profile[]>(`${API_URL}/profiles`, 'Failed to fetch profiles'),
    staleTime: DEFAULT_STALE_TIME,
    gcTime: DEFAULT_GC_TIME,
  });
}

export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profile: Database['public']['Tables']['profiles']['Insert'] & { password?: string }) => {
      const res = await fetch(`${API_URL}/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error('Failed to create profile');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Profile>) => {
      const res = await fetch(`${API_URL}/profiles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update profile');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
}

export function useDeleteProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/profiles/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete profile');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['users_with_roles'] });
    },
  });
}

// User Roles
export function useUserRoles() {
  return useQuery({
    queryKey: ['user_roles'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/user_roles`);
      if (!res.ok) throw new Error('Failed to fetch user roles');
      return res.json() as Promise<UserRole[]>;
    },
  });
}

export function useCreateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (role: Database['public']['Tables']['user_roles']['Insert']) => {
      const res = await fetch(`${API_URL}/user_roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(role),
      });
      if (!res.ok) throw new Error('Failed to create user role');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_roles'] });
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Database['public']['Enums']['app_role'] }) => {
      const res = await fetch(`${API_URL}/user_roles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error('Failed to update user role');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user_roles'] });
    },
  });
}

// Change Requests
export function useChangeRequests() {
  return useQuery({
    queryKey: ['change_requests'],
    queryFn: () => fetchJson<ChangeRequestWithRelations[]>(`${API_URL}/change_requests`, 'Failed to fetch change requests'),
    staleTime: DEFAULT_STALE_TIME,
    gcTime: DEFAULT_GC_TIME,
  });
}

export function useChangeRequest(id: string) {
  return useQuery({
    queryKey: ['change_requests', id],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/change_requests/${id}`);
      if (!res.ok) throw new Error('Failed to fetch change request');
      return res.json() as Promise<ChangeRequestWithRelations | null>;
    },
    enabled: !!id,
  });
}

export function useCreateChangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: Omit<Database['public']['Tables']['change_requests']['Insert'], 'ticket_number'>) => {
      const res = await fetch(`${API_URL}/change_requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) throw new Error('Failed to create change request');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['change_requests'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
    },
  });
}

export function useUpdateChangeRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ChangeRequest>) => {
      const res = await fetch(`${API_URL}/change_requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update change request');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['change_requests'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
    },
  });
}

// Dashboard Stats
export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard_stats'],
    queryFn: () => fetchJson<{
      totalRequests: number;
      pendingApproval: number;
      inProgress: number;
      completed: number;
      overdue: number;
      avgCompletionDays: number;
    }>(`${API_URL}/dashboard/stats`, 'Failed to fetch stats'),
    staleTime: DEFAULT_STALE_TIME,
    gcTime: DEFAULT_GC_TIME,
  });
}

// Audit Logs
export function useAuditLogs() {
  return useQuery({
    queryKey: ['audit_logs'],
    queryFn: () => fetchJson<AuditLogWithRelations[]>(`${API_URL}/audit_logs?limit=25`, 'Failed to fetch audit logs'),
    staleTime: DEFAULT_STALE_TIME,
    gcTime: DEFAULT_GC_TIME,
    retry: 1,
  });
}

export function useCreateAuditLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (log: Database['public']['Tables']['audit_logs']['Insert']) => {
      const res = await fetch(`${API_URL}/audit_logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log),
      });
      if (!res.ok) throw new Error('Failed to create audit log');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit_logs'] });
    },
  });
}

// Notifications
export function useNotifications(userId?: string) {
  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      const url = userId ? `${API_URL}/notifications/${userId}` : `${API_URL}/notifications`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch notifications');
      return res.json() as Promise<Notification[]>;
    },
    enabled: !!userId,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
      if (!res.ok) throw new Error('Failed to mark notification as read');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// Assigned Requests (for developer)
export function useAssignedRequests(developerId?: string) {
  return useQuery({
    queryKey: ['assigned_requests', developerId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/change_requests`);
      if (!res.ok) throw new Error('Failed to fetch assigned requests');
      const data = await res.json() as ChangeRequestWithRelations[];
      return data.filter(r => r.assigned_developer_id === developerId);
    },
    enabled: !!developerId,
  });
}

// Users with Roles
export function useUsersWithRoles() {
  return useQuery({
    queryKey: ['users_with_roles'],
    queryFn: async () => {
      const [pRes, rRes] = await Promise.all([
        fetch(`${API_URL}/profiles`),
        fetch(`${API_URL}/user_roles`),
      ]);

      if (!pRes.ok || !rRes.ok) throw new Error('Failed to fetch users or roles');

      const profiles = await pRes.json() as Profile[];
      const roles = await rRes.json() as UserRole[];

      return profiles.map(profile => ({
        ...profile,
        roles: roles.filter(r => r.user_id === profile.id),
      }));
    },
  });
}
