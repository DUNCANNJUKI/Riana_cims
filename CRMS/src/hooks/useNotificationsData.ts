import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database } from '@/integrations/supabase/types';
import { useEffect, useState } from 'react';

type Notification = Database['public']['Tables']['notifications']['Row'];

const API_URL = '/api/crms';

export function useCurrentUser() {
  const [userId, setUserId] = useState<string | null>(localStorage.getItem('crms-user-id'));
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Listen for local storage changes (login/logout)
    const handleStorageChange = () => {
      setUserId(localStorage.getItem('crms-user-id'));
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
      const res = await fetch(`${API_URL}/notifications/${userId}`);
      if (!res.ok) throw new Error('Failed to fetch notifications');
      return res.json() as Promise<Notification[]>;
    },
    enabled: !!userId,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
}

export function useUnreadNotificationCount() {
  const { userId } = useCurrentUser();

  return useQuery({
    queryKey: ['notifications_unread_count', userId],
    queryFn: async () => {
      if (!userId) return 0;
      const res = await fetch(`${API_URL}/notifications/${userId}`);
      if (!res.ok) throw new Error('Failed to fetch notifications');
      const data = await res.json() as Notification[];
      return data.filter(n => !n.read).length;
    },
    enabled: !!userId,
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
      // Note: This would ideally be a bulk update on backend, 
      // but for now we can iterate or keep it simple if backend supports it.
      // Assuming backend needs individual updates for now or simple fetch
      const res = await fetch(`${API_URL}/notifications/${userId}/read-all`, {
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
