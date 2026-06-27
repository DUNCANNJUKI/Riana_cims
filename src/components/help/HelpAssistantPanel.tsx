import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, Info, Loader2, Send, User as UserIcon } from 'lucide-react';
import { User } from '@/types';
import { useCimsAssistant } from '@/hooks/useCimsAssistant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface HelpAssistantPanelProps {
  user: User;
}

export const HelpAssistantPanel = ({ user }: HelpAssistantPanelProps) => {
  const [input, setInput] = useState('');
  const { messages, suggestions, isSending, error, sendMessage } = useCimsAssistant(user);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, isSending]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || isSending) return;
    setInput('');
    await sendMessage(message);
  };

  const ask = async (question: string) => {
    if (isSending) return;
    setInput('');
    await sendMessage(question);
  };

  return (
    <section className="flex min-h-[590px] flex-col rounded-xl border bg-card shadow-sm" aria-labelledby="assistant-title">
      <div className="border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="assistant-title" className="text-lg font-semibold text-foreground">RIANA Assistant</h2>
            <p className="text-sm text-muted-foreground">Guidance for approved CIMS workflows</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2 rounded-lg border border-primary/15 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p>The assistant explains how to use RIANA CIMS. It does not expose source code, credentials, private infrastructure, or database details.</p>
        </div>
      </div>

      <div className="px-5 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested questions</p>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((question) => (
            <Button
              key={question}
              type="button"
              variant="outline"
              size="sm"
              className="h-auto whitespace-normal py-2 text-left text-xs"
              disabled={isSending}
              onClick={() => ask(question)}
            >
              {question}
            </Button>
          ))}
        </div>
      </div>

      <ScrollArea className="my-4 min-h-0 flex-1 px-5" aria-live="polite">
        <div className="space-y-4 pr-3">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-2 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              {message.sender === 'assistant' ? (
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
              ) : null}
              <div className={`max-w-[86%] rounded-xl px-3.5 py-3 text-sm leading-relaxed ${message.sender === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                <p className="whitespace-pre-wrap">{message.text}</p>
                <p className={`mt-1.5 text-[10px] ${message.sender === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              {message.sender === 'user' ? (
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <UserIcon className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
              ) : null}
            </div>
          ))}
          {isSending ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
              Preparing guidance...
            </div>
          ) : null}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <form onSubmit={submit} className="border-t p-4">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about a workflow, report, role, or notification"
            maxLength={1000}
            disabled={isSending}
            aria-label="Ask RIANA Assistant"
          />
          <Button type="submit" size="icon" disabled={!input.trim() || isSending} aria-label="Send question">
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{error ? 'Use the knowledge base or contact support while the assistant reconnects.' : 'Press Enter to send.'}</span>
          <span>{input.length}/1000</span>
        </div>
      </form>
    </section>
  );
};
