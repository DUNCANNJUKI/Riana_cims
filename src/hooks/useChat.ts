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

export const useChat = (currentUser: User | null) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeChatUserId, setActiveChatUserId] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

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
      data.forEach((u: any) => {
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
      if (data.some((m: ChatMessage) => m.receiver_id === currentUser?.id && !m.is_read)) {
        await apiClient.patch(`/chat/read-all/${userId}`, {});
        setUnreadCounts(prev => ({ ...prev, [userId]: 0 }));
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }, [currentUser?.id]);

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

  useEffect(() => {
    if (!currentUser) return;

    loadUsers();

    const connectSSE = () => {
      if (eventSourceRef.current) {
        console.log('[Chat] Closing existing SSE connection');
        eventSourceRef.current.close();
      }

      console.log(`[Chat] Connecting to SSE stream for user ${currentUser.id}...`);
      const url = `${API_URL}/chat/stream?userId=${encodeURIComponent(currentUser.id)}&token=${encodeURIComponent(getAuthToken() || '')}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        console.log('[Chat] SSE Connection established');
        setIsConnected(true);
      };
      
      es.onmessage = (event) => {
        // Ignore heartbeat pings (colon prefixed or empty)
        if (!event.data || event.data === ': heartbeat') return;
        
        try {
          const data = JSON.parse(event.data);
          console.log('[Chat] Received event:', data.type);
          
          if (data.type === 'new_message') {
            const msg = data.message;
            if (activeChatUserId === msg.sender_id) {
              setMessages(prev => [...prev, msg]);
              // Mark as read immediately if chat is open
              apiClient.patch(`/chat/messages/${msg.id}/read`, {});
            } else {
              setUnreadCounts(prev => ({
                ...prev,
                [msg.sender_id]: (prev[msg.sender_id] || 0) + 1
              }));
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
          }
        } catch (err) {
          console.error('[Chat] Failed to parse SSE event:', err, event.data);
        }
      };

      es.onerror = (err) => {
        console.error('[Chat] SSE Connection error:', err);
        setIsConnected(false);
        es.close();
        // Exponential backoff or simple retry
        console.log('[Chat] Retrying connection in 5s...');
        setTimeout(connectSSE, 5000);
      };
    };

    connectSSE();

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, [currentUser?.id, activeChatUserId, loadUsers, playNotificationSound]);

  return {
    messages,
    users,
    activeChatUserId,
    setActiveChatUserId: (id: string | null) => {
        setActiveChatUserId(id);
        if (id) loadMessages(id);
    },
    sendMessage,
    unreadCounts,
    isConnected,
    totalUnread: Object.values(unreadCounts).reduce((a, b) => a + b, 0)
  };
};
