import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient, API_URL, getAuthToken } from '@/integrations/apiClient';
import { User } from '@/types';
import { playCallHangupSound, playCallRingSound, playMessageSound } from '@/utils/notificationSound';

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  message_kind?: 'text' | 'attachment' | 'call';
  reply_to_message_id?: string | null;
  reply_content?: string | null;
  reply_message_kind?: 'text' | 'attachment' | 'call' | null;
  reply_attachment_file_name?: string | null;
  reply_sender_first_name?: string | null;
  reply_sender_last_name?: string | null;
  attachment_file_name?: string | null;
  attachment_file_path?: string | null;
  attachment_content_type?: string | null;
  attachment_size?: number | null;
  call_type?: 'audio' | 'video' | null;
  call_status?: 'ringing' | 'accepted' | 'declined' | 'missed' | 'ended' | null;
  call_started_at?: string | null;
  call_ended_at?: string | null;
  call_participant_ids?: string[];
  call_participant_count?: number;
  is_read: boolean;
  read_at: string | null;
  is_edited?: boolean;
  edited_at?: string | null;
  is_deleted_for_everyone?: boolean;
  deleted_for_everyone_at?: string | null;
  reactions?: Array<{ reaction_type: string; count: number }>;
  my_reaction?: string | null;
  can_edit?: boolean;
  can_delete_for_everyone?: boolean;
  created_at: string;
  sender_first_name?: string;
  sender_last_name?: string;
  sender_avatar_url?: string | null;
  receiver_first_name?: string;
  receiver_last_name?: string;
  receiver_avatar_url?: string | null;
}

export interface ChatAttachmentInput {
  fileName: string;
  base64Data: string;
}

export interface ChatUser extends User {
  unread_count?: number;
  online?: boolean;
  last_seen_at?: string | null;
}

export interface CallSignalEvent {
  callId: string;
  senderId: string;
  signalType: 'offer' | 'answer' | 'ice-candidate';
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
  receivedAt: number;
  signalId?: string;
}

export const getChatAttachmentUrl = (filePath?: string | null, download = false) => {
  if (!filePath) return '';
  return `${API_URL}/chat/attachments/${encodeURIComponent(filePath)}${download ? '?download=1' : ''}`;
};

export const useChat = (currentUser: User | null) => {
  const currentUserId = currentUser?.id;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [activeChatUserId, setActiveChatUserIdState] = useState<string | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<ChatMessage | null>(null);
  const [activeCall, setActiveCall] = useState<ChatMessage | null>(null);
  const [missedCalls, setMissedCalls] = useState<ChatMessage[]>([]);
  const [callSignals, setCallSignals] = useState<CallSignalEvent[]>([]);
  const [onlineUserCount, setOnlineUserCount] = useState(0);
  const streamAbortRef = useRef<AbortController | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const activeChatUserIdRef = useRef<string | null>(null);
  const notifiedMissedCallIdsRef = useRef<Set<string>>(new Set());


  const loadUsers = useCallback(async () => {
    try {
      setIsLoadingUsers(true);
      setUsersError(null);
      const data = await apiClient.get('/chat/users');
      const nextUsers = Array.isArray(data) ? data : [];
      setUsers(nextUsers);
      setOnlineUserCount(nextUsers.filter((u: ChatUser) => u.online).length);
      const counts: Record<string, number> = {};
      nextUsers.forEach((u: ChatUser) => {
        if ((u.unread_count || 0) > 0) counts[u.id] = Number(u.unread_count || 0);
      });
      setUnreadCounts(counts);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : 'Unable to load colleagues.');
      console.error('Error loading chat users:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  }, []);

  const loadMessages = useCallback(async (userId: string) => {
    try {
      const data = await apiClient.get(`/chat/messages/${userId}`);
      setMessages(data);
      if (data.some((m: ChatMessage) => m.receiver_id === currentUserId && !m.is_read)) {
        await apiClient.patch(`/chat/read-all/${userId}`, {});
        setUnreadCounts(prev => ({ ...prev, [userId]: 0 }));
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }, [currentUserId]);

  const appendOrReplaceMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => {
      const existing = prev.findIndex(item => item.id === message.id);
      if (existing >= 0) return prev.map(item => item.id === message.id ? { ...item, ...message } : item);
      return [...prev, message];
    });
  }, []);

  const mergeMissedCalls = useCallback((calls: ChatMessage[]) => {
    const missed = calls.filter(call => call.message_kind === 'call' && call.call_status === 'missed');
    if (!missed.length) return;
    setMissedCalls(prev => {
      const next = [...prev];
      missed.forEach(call => {
        const existing = next.findIndex(item => item.id === call.id);
        if (existing >= 0) next[existing] = { ...next[existing], ...call };
        else next.unshift(call);
      });
      return next.slice(0, 10);
    });
    const fresh = missed.filter(call => !notifiedMissedCallIdsRef.current.has(call.id));
    fresh.forEach(call => notifiedMissedCallIdsRef.current.add(call.id));
    if (fresh.length) playCallHangupSound();
  }, []);

  const loadMissedCalls = useCallback(async () => {
    try {
      const data = await apiClient.get('/chat/missed-calls');
      const calls = Array.isArray(data) ? data as ChatMessage[] : [];
      setMissedCalls(calls);
      mergeMissedCalls(calls);
    } catch (error) {
      console.error('Error loading missed calls:', error);
    }
  }, [mergeMissedCalls]);

  const sendMessage = async (
    receiverId: string,
    content: string,
    options: { attachment?: ChatAttachmentInput | null; replyToMessageId?: string | null } = {},
  ) => {
    try {
      const newMessage = await apiClient.post('/chat/messages', {
        receiver_id: receiverId,
        content,
        reply_to_message_id: options.replyToMessageId || null,
        attachment: options.attachment || null,
      });
      appendOrReplaceMessage(newMessage);
      return newMessage as ChatMessage;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };


  const editMessage = async (messageId: string, content: string) => {
    const updated = await apiClient.patch(`/chat/messages/${messageId}/edit`, { content }) as ChatMessage;
    appendOrReplaceMessage(updated);
    return updated;
  };

  const setReaction = async (messageId: string, reactionType: string) => {
    const updated = await apiClient.put(`/chat/messages/${messageId}/reaction`, { reaction_type: reactionType }) as ChatMessage;
    appendOrReplaceMessage(updated);
    return updated;
  };

  const removeReaction = async (messageId: string) => {
    await apiClient.delete(`/chat/messages/${messageId}/reaction`);
    setMessages(prev => prev.map(message => message.id === messageId ? { ...message, my_reaction: null } : message));
  };

  const deleteMessageForMe = async (messageId: string) => {
    await apiClient.post(`/chat/messages/${messageId}/delete-for-me`, {});
    setMessages(prev => prev.filter(message => message.id !== messageId));
  };

  const deleteMessageForEveryone = async (messageId: string, reason?: string) => {
    const updated = await apiClient.post(`/chat/messages/${messageId}/delete-for-everyone`, { reason: reason || null }) as ChatMessage;
    appendOrReplaceMessage(updated);
    return updated;
  };
  const setTyping = useCallback(async (receiverId: string, isTyping: boolean) => {
    try {
      await apiClient.post('/chat/typing', { receiver_id: receiverId, is_typing: isTyping });
    } catch (error) {
      console.warn('[Chat] Typing status could not be synchronized.', error);
    }
  }, []);

  const startCall = useCallback(async (receiverIds: string | string[], callType: 'audio' | 'video') => {
    const targetIds = Array.isArray(receiverIds) ? receiverIds : [receiverIds];
    const call = await apiClient.post('/chat/calls', { receiver_id: targetIds[0], receiver_ids: targetIds, call_type: callType }) as ChatMessage;
    setActiveCall(call);
    appendOrReplaceMessage(call);
    return call;
  }, [appendOrReplaceMessage]);

  const updateCallStatus = useCallback(async (callId: string, status: 'accepted' | 'declined' | 'ended' | 'missed') => {
    const call = await apiClient.patch(`/chat/calls/${callId}`, { status }) as ChatMessage;
    setActiveCall(['declined', 'ended', 'missed'].includes(status) ? null : call);
    setIncomingCall(current => current?.id === callId ? null : current);
    appendOrReplaceMessage(call);
    return call;
  }, [appendOrReplaceMessage]);

  const sendCallSignal = useCallback(async (
    callId: string,
    receiverId: string,
    signalType: 'offer' | 'answer' | 'ice-candidate',
    payload: RTCSessionDescriptionInit | RTCIceCandidateInit,
  ) => {
    await apiClient.post('/chat/call-signal', {
      call_id: callId,
      receiver_id: receiverId,
      signal_type: signalType,
      payload,
    });
  }, []);

  const clearCallSignals = useCallback((callId?: string) => {
    setCallSignals(current => callId ? current.filter(signal => signal.callId !== callId) : []);
  }, []);

  const clearCallState = useCallback(() => {
    setIncomingCall(null);
    setActiveCall(null);
    setCallSignals([]);
  }, []);

  useEffect(() => {
    if (!currentUserId) return;

    loadUsers();
    loadMissedCalls();
    let disposed = false;

    const handleStreamMessage = (rawData: string) => {
      if (!rawData) return;
      try {
        const data = JSON.parse(rawData);
        if (data.type === 'new_message') {
          const msg = data.message as ChatMessage;
          const otherUserId = msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id;
          if (activeChatUserIdRef.current === otherUserId) {
            appendOrReplaceMessage(msg);
            if (msg.receiver_id === currentUserId) void apiClient.patch(`/chat/messages/${msg.id}/read`, {});
          } else if (msg.receiver_id === currentUserId) {
            setUnreadCounts(prev => ({ ...prev, [msg.sender_id]: (prev[msg.sender_id] || 0) + 1 }));
            playMessageSound();
          }
        } else if (data.type === 'message_updated') {
          appendOrReplaceMessage(data.message as ChatMessage);
        } else if (data.type === 'message_hidden') {
          setMessages(prev => prev.filter(message => message.id !== data.messageId));
        } else if (data.type === 'incoming_call') {
          const call = data.call as ChatMessage;
          setIncomingCall(call);
          appendOrReplaceMessage(call);
          playCallRingSound();
        } else if (data.type === 'call_updated') {
          const call = data.call as ChatMessage;
          appendOrReplaceMessage(call);
          setIncomingCall(current => current?.id === call.id ? null : current);
          setActiveCall(['declined', 'ended', 'missed'].includes(String(call.call_status)) ? null : call);
          if (call.call_status === 'missed' && call.receiver_id === currentUserId) mergeMissedCalls([call]);
        } else if (data.type === 'missed_call') {
          const call = data.call as ChatMessage;
          appendOrReplaceMessage(call);
          setIncomingCall(current => current?.id === call.id ? null : current);
          mergeMissedCalls([call]);
        } else if (data.type === 'call_signal') {
          setCallSignals(current => [...current, {
            callId: data.callId,
            senderId: data.senderId,
            signalType: data.signalType,
            payload: data.payload,
            receivedAt: Date.now(),
            signalId: data.signalId,
          }]);
        } else if (data.type === 'message_read') {
          setMessages(prev => prev.map(m =>
            m.id === data.messageId ? { ...m, is_read: true, read_at: new Date().toISOString() } : m
          ));
        } else if (data.type === 'all_read') {
          setMessages(prev => prev.map(m =>
            m.receiver_id === data.receiverId ? { ...m, is_read: true, read_at: new Date().toISOString() } : m
          ));
        } else if (data.type === 'presence') {
          if (typeof data.onlineUserCount === 'number') setOnlineUserCount(data.onlineUserCount);
          setUsers(current => current.map(user =>
            user.id === data.userId ? { ...user, online: data.online === true, last_seen_at: data.lastSeenAt || user.last_seen_at } : user
          ));
        } else if (data.type === 'typing') {
          setTypingUsers(current => ({ ...current, [data.userId]: data.isTyping === true }));
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
        void loadMissedCalls();
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
  }, [appendOrReplaceMessage, currentUserId, loadMessages, loadMissedCalls, loadUsers, mergeMissedCalls]);

  return {
    messages,
    users,
    isLoadingUsers,
    usersError,
    activeChatUserId,
    setActiveChatUserId: (id: string | null) => {
      activeChatUserIdRef.current = id;
      setActiveChatUserIdState(id);
      if (id) void loadMessages(id);
    },
    sendMessage,
    editMessage,
    setReaction,
    removeReaction,
    deleteMessageForMe,
    deleteMessageForEveryone,
    setTyping,
    typingUsers,
    unreadCounts,
    isConnected,
    incomingCall,
    activeCall,
    callSignals,
    startCall,
    updateCallStatus,
    sendCallSignal,
    clearCallSignals,
    clearCallState,
    missedCalls,
    loadUsers,
    loadMissedCalls,
    dismissMissedCall: async (callId: string) => {
      setMissedCalls(prev => prev.filter(call => call.id !== callId));
      try {
        await apiClient.post(`/chat/missed-calls/${callId}/dismiss`, {});
      } catch (error) {
        console.error('Error dismissing missed call:', error);
      }
    },
    onlineUserCount,
    totalUnread: Object.values(unreadCounts).reduce((a, b) => a + b, 0),
  };
};

export type ChatController = ReturnType<typeof useChat>;
