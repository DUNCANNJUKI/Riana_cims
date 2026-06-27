import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Maximize2, MessageCircle, Minimize2, Send, ShieldCheck, User as UserIcon, X } from 'lucide-react';
import { User } from '@/types';
import { useCimsAssistant } from '@/hooks/useCimsAssistant';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ChatbotWidgetProps {
  user?: User;
}

export const ChatbotWidget = ({ user }: ChatbotWidgetProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const { messages, suggestions, isSending, sendMessage } = useCimsAssistant(user);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const openAssistant = () => { setIsOpen(true); setIsMinimized(false); };
    window.addEventListener('open-assistant', openAssistant);
    return () => window.removeEventListener('open-assistant', openAssistant);
  }, []);

  useEffect(() => {
    if (isOpen && !isMinimized) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [isMinimized, isOpen, isSending, messages]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || isSending) return;
    setInput('');
    await sendMessage(message);
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button onClick={() => setIsOpen(true)} size="icon" className="h-14 w-14 rounded-full shadow-lg transition-transform hover:scale-105" aria-label="Open RIANA Assistant">
          <MessageCircle className="h-6 w-6" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] sm:w-96">
      <Card className={`overflow-hidden border-primary/20 shadow-2xl ${isMinimized ? '' : 'h-[520px]'}`}>
        <CardHeader className="border-b bg-primary px-4 py-3 text-primary-foreground">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex min-w-0 items-center gap-2 text-sm">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/15"><Bot className="h-4 w-4" /></span>
              <span className="min-w-0"><span className="block truncate">RIANA Assistant</span><span className="block text-[10px] font-normal text-primary-foreground/75">User guidance only</span></span>
            </CardTitle>
            <div className="flex shrink-0 gap-1">
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" onClick={() => setIsMinimized((value) => !value)} aria-label={isMinimized ? 'Expand assistant' : 'Minimize assistant'}>
                {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" onClick={() => setIsOpen(false)} aria-label="Close assistant"><X className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>

        {!isMinimized ? (
          <CardContent className="flex h-[456px] flex-col p-0">
            <div className="flex gap-2 border-b bg-primary/5 px-4 py-2.5 text-[11px] leading-4 text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              Safe workflow guidance. No source code, credentials, infrastructure, or database details.
            </div>
            <div className="flex gap-2 overflow-x-auto border-b px-3 py-2">
              {suggestions.slice(0, 2).map((question) => (
                <Button key={question} type="button" size="sm" variant="outline" className="h-auto shrink-0 py-1.5 text-[10px]" disabled={isSending} onClick={() => sendMessage(question)}>{question}</Button>
              ))}
            </div>
            <ScrollArea className="min-h-0 flex-1 px-3 py-3" aria-live="polite">
              <div className="space-y-3 pr-2">
                {messages.map((message) => (
                  <div key={message.id} className={`flex items-start gap-2 ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {message.sender === 'assistant' ? <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Bot className="h-3 w-3" /></span> : null}
                    <div className={`max-w-[78%] rounded-xl px-3 py-2 text-xs leading-5 ${message.sender === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                      <p className="whitespace-pre-wrap">{message.text}</p>
                      <p className={`mt-1 text-[9px] ${message.sender === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    {message.sender === 'user' ? <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><UserIcon className="h-3 w-3" /></span> : null}
                  </div>
                ))}
                {isSending ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Preparing guidance...</div> : null}
                <div ref={endRef} />
              </div>
            </ScrollArea>
            <form onSubmit={submit} className="border-t p-3">
              <div className="flex gap-2">
                <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask RIANA Assistant" maxLength={1000} disabled={isSending} className="h-9 text-xs" aria-label="Assistant question" />
                <Button type="submit" size="icon" className="h-9 w-9" disabled={!input.trim() || isSending} aria-label="Send question">{isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
              </div>
            </form>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
};
