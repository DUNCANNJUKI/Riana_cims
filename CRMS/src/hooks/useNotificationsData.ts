import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database } from '@crms/integrations/supabase/types';
import { useEffect, useState } from 'react';
import { getCimsUser } from '@crms/lib/cimsSession';

type Notification = Database['public']['Tables']['notifications']['Row'];

const API_URL = '/api/crms';
const NOTIFICATION_STALE_TIME = 30_000;

async function fetchNotificationJson<T>(url: string, fallbackMessage: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || fallbackMessage);
  }
  return res.json() as Promise<T>;
}

export function useCurrentUser() {
  const [userId, setUserId] = useState<string | null>(() => getCimsUser()?.id || null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Listen for local storage changes (login/logout)
    const handleStorageChange = () => {
      setUserId(getCimsUser()?.id || null);
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return { userId, isLoading };
}

export function useUserNotifications() {
  const { userId } = useCurrentUser();

  return useQuery({
    queryKey: ['notifications', userId],
    queryFn: async () => {
      if (!userId) return [];
      return fetchNotificationJson<Notification[]>(`${API_URL}/notifications`, 'Failed to fetch notifications');
    },
    enabled: !!userId,
    staleTime: NOTIFICATION_STALE_TIME,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}

export function useUnreadNotificationCount() {
  const { userId } = useCurrentUser();

  return useQuery({
    queryKey: ['notifications_unread_count', userId],
    queryFn: async () => {
      if (!userId) return 0;
      const data = await fetchNotificationJson<Notification[]>(`${API_URL}/notifications`, 'Failed to fetch notifications');
      return data.filter(n => !n.read).length;
    },
    enabled: !!userId,
    staleTime: NOTIFICATION_STALE_TIME,
    retry: 1,
  });
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();
  const { userId } = useCurrentUser();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await fetch(`${API_URL}/notifications/${notificationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
      if (!res.ok) throw new Error('Failed to mark notification read');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
      queryClient.invalidateQueries({ queryKey: ['notifications_unread_count', userId] });
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();
  const { userId } = useCurrentUser();

  return useMutation({
    mutationFn: async () => {
      if (!userId) return;
      const res = await fetch(`${API_URL}/notifications/read-all`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Failed to mark all notifications read');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
      queryClient.invalidateQueries({ queryKey: ['notifications_unread_count', userId] });
    },
  });
}

// Hook for realtime notification updates - Disabling for local dev to avoid console clutter
export function useRealtimeNotifications() {
  useEffect(() => {
    // Realtime disabled in local fallback
    return () => { };
  }, []);
}
