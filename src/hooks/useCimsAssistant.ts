import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/integrations/apiClient';
import { User } from '@/types';

export interface AssistantMessage {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
}

interface AssistantContext {
  entity?: string;
  reference?: string;
  status?: string;
  branch?: string;
}

const DEFAULT_SUGGESTIONS = [
  'How do I find pending work?',
  'How do I preview a report?',
  'How do notifications work?',
];

const messageId = () => (
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
);

const greetingFor = (user?: User) => {
  const name = user?.first_name?.trim() || user?.email?.split('@')[0] || 'there';
  return `Hello ${name}. How can I help with Riana CIMS today?`;
};

export const useCimsAssistant = (user?: User) => {
  const [messages, setMessages] = useState<AssistantMessage[]>(() => [{
    id: messageId(),
    text: greetingFor(user),
    sender: 'assistant',
    timestamp: new Date(),
  }]);
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS);
  const [conversationContext, setConversationContext] = useState<AssistantContext | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMessages([{
      id: messageId(),
      text: greetingFor(user),
      sender: 'assistant',
      timestamp: new Date(),
    }]);
    setSuggestions(DEFAULT_SUGGESTIONS);
    setConversationContext(null);
    setError(null);
  }, [user?.id]);

  const sendMessage = useCallback(async (rawMessage: string) => {
    const text = rawMessage.trim();
    if (!text || text.length > 1000 || isSending) return false;

    setError(null);
    setMessages((current) => [...current, {
      id: messageId(),
      text,
      sender: 'user',
      timestamp: new Date(),
    }]);
    setIsSending(true);

    try {
      const data = await apiClient.post('/chat/assistant', { message: text, context: conversationContext });
      setMessages((current) => [...current, {
        id: messageId(),
        text: String(data.reply || 'I could not find that guidance. Please contact RIANA Support.'),
        sender: 'assistant',
        timestamp: new Date(),
      }]);
      if (data.context && typeof data.context === 'object') {
        setConversationContext(data.context as AssistantContext);
      }
      if (Array.isArray(data.suggestions)) {
        setSuggestions(data.suggestions.filter((item: unknown): item is string => typeof item === 'string').slice(0, 3));
      }
      return true;
    } catch {
      const fallback = 'The assistant is temporarily unavailable. You can still search the knowledge base or contact RIANA Support.';
      setMessages((current) => [...current, {
        id: messageId(),
        text: fallback,
        sender: 'assistant',
        timestamp: new Date(),
      }]);
      setError(fallback);
      return false;
    } finally {
      setIsSending(false);
    }
  }, [conversationContext, isSending]);

  return { messages, suggestions, isSending, error, sendMessage };
};
