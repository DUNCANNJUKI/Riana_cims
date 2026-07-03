import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient, API_URL, getAuthToken } from '@/integrations/apiClient';
import { User } from '@/types';

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  sender_first_name?: string;
  sender_last_name?: string;
  receiver_first_name?: string;
  receiver_last_name?: string;
}

export interface ChatUser extends User {
  unread_count?: number;
  online?: boolean;
}

export const useChat = (currentUser: User | null) => {
  const currentUserId = currentUser?.id;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [activeChatUserId, setActiveChatUserId] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [isConnected, setIsConnected] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const activeChatUserIdRef = useRef<string | null>(null);

  const playNotificationSound = useCallback(() => {
    // Use a reliable remote URL for the notification sound
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3');
    audio.play().catch(e => console.warn('Could not play notification sound:', e));
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const data = await apiClient.get('/chat/users');
      setUsers(data);
      
      // Initialize unread counts from server data
      const counts: Record<string, number> = {};
      data.forEach((u: ChatUser) => {
        if (u.unread_count > 0) {
          counts[u.id] = u.unread_count;
        }
      });
      setUnreadCounts(counts);
    } catch (error) {
      console.error('Error loading chat users:', error);
    }
  }, []);

  const loadMessages = useCallback(async (userId: string) => {
    try {
      const data = await apiClient.get(`/chat/messages/${userId}`);
      setMessages(data);
      // Mark all as read when opening chat
      if (data.some((m: ChatMessage) => m.receiver_id === currentUserId && !m.is_read)) {
        await apiClient.patch(`/chat/read-all/${userId}`, {});
        setUnreadCounts(prev => ({ ...prev, [userId]: 0 }));
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }, [currentUserId]);

  const sendMessage = async (receiverId: string, content: string) => {
    try {
      const newMessage = await apiClient.post('/chat/messages', {
        receiver_id: receiverId,
        content
      });
      setMessages(prev => [...prev, newMessage]);
      return newMessage;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  const setTyping = useCallback(async (receiverId: string, isTyping: boolean) => {
    try {
      await apiClient.post('/chat/typing', { receiver_id: receiverId, is_typing: isTyping });
    } catch (error) {
      console.warn('[Chat] Typing status could not be synchronized.', error);
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    loadUsers();

    let disposed = false;

    const handleStreamMessage = (rawData: string) => {
      if (!rawData) return;
      try {
        const data = JSON.parse(rawData);
        if (data.type === 'new_message') {
          const msg = data.message as ChatMessage;
          if (activeChatUserIdRef.current === msg.sender_id) {
            setMessages(prev => prev.some(item => item.id === msg.id) ? prev : [...prev, msg]);
            void apiClient.patch(`/chat/messages/${msg.id}/read`, {});
          } else {
            setUnreadCounts(prev => ({ ...prev, [msg.sender_id]: (prev[msg.sender_id] || 0) + 1 }));
            playNotificationSound();
          }
        } else if (data.type === 'message_read') {
          setMessages(prev => prev.map(m =>
            m.id === data.messageId ? { ...m, is_read: true, read_at: new Date().toISOString() } : m
          ));
        } else if (data.type === 'all_read') {
          setMessages(prev => prev.map(m =>
            m.receiver_id === data.receiverId ? { ...m, is_read: true, read_at: new Date().toISOString() } : m
          ));
        } else if (data.type === 'presence') {
          setUsers((current) => current.map((user) =>
            user.id === data.userId ? { ...user, online: data.online === true } : user
          ));
        } else if (data.type === 'typing') {
          setTypingUsers((current) => ({ ...current, [data.userId]: data.isTyping === true }));
        }
      } catch (error) {
        console.error('[Chat] Failed to parse stream event:', error);
      }
    };

    const connectStream = async () => {
      streamAbortRef.current?.abort();
      const controller = new AbortController();
      streamAbortRef.current = controller;
      try {
        const token = getAuthToken();
        if (!token) throw new Error('Authentication required');
        const response = await fetch(`${API_URL}/chat/stream`, {
          headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok || !response.body) throw new Error(`Chat stream unavailable (${response.status})`);
        setIsConnected(true);
        void loadUsers();
        if (activeChatUserIdRef.current) void loadMessages(activeChatUserIdRef.current);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!disposed) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';
          for (const event of events) {
            const data = event.split('\n')
              .filter(line => line.startsWith('data:'))
              .map(line => line.slice(5).trimStart())
              .join('\n');
            handleStreamMessage(data);
          }
        }
      } catch (error) {
        if (!controller.signal.aborted && !disposed) console.warn('[Chat] Stream disconnected; retrying.', error);
      } finally {
        if (!disposed && !controller.signal.aborted) {
          setIsConnected(false);
          reconnectTimerRef.current = window.setTimeout(() => void connectStream(), 5000);
        }
      }
    };

    void connectStream();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      streamAbortRef.current?.abort();
    };
  }, [currentUserId, loadMessages, loadUsers, playNotificationSound]);

  return {
    messages,
    users,
    activeChatUserId,
    setActiveChatUserId: (id: string | null) => {
      activeChatUserIdRef.current = id;
      setActiveChatUserId(id);
      if (id) void loadMessages(id);
    },
    sendMessage,
    setTyping,
    typingUsers,
    unreadCounts,
    isConnected,
    totalUnread: Object.values(unreadCounts).reduce((a, b) => a + b, 0)
  };
};

export type ChatController = ReturnType<typeof useChat>;
