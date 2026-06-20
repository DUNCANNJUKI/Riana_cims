import { useState, useEffect, useRef } from "react";
import { User } from "@/types";
import { useChat, ChatMessage } from "@/hooks/useChat";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  X, Send, Check, CheckCheck, Search, Users, 
  MessageSquare, Clock, Phone, Video
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ChatModuleProps {
  currentUser: User;
  onClose?: () => void;
}

export const ChatModule = ({ currentUser, onClose }: ChatModuleProps) => {
  const { 
    messages, users, activeChatUserId, setActiveChatUserId, 
    sendMessage, unreadCounts, isConnected, totalUnread 
  } = useChat(currentUser);
  
  const [inputText, setInputText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeUser = users.find(u => u.id === activeChatUserId);
  
  const filteredUsers = users.filter(u => {
    const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim().toLowerCase();
    const email = (u.email || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    return fullName.includes(search) || email.includes(search);
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || !activeChatUserId) return;
    
    const text = inputText;
    setInputText("");
    try {
      await sendMessage(activeChatUserId, text);
    } catch (error) {
      setInputText(text); // Restore on failure
    }
  };

  return (
    <div className="flex h-[600px] w-full max-w-4xl border rounded-2xl shadow-2xl overflow-hidden glass-card">
      {/* Sidebar - User List */}
      <div className={cn(
        "flex flex-col border-r bg-background/20 transition-all duration-300",
        isSidebarOpen ? "w-[320px]" : "w-0 overflow-hidden"
      )}>
        <div className="p-5 border-b space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold flex items-center gap-2 text-primary">
              <MessageSquare className="h-5 w-5" />
              Messages
            </h2>
            <div className="flex items-center gap-2">
               <div className={cn(
                 "h-2.5 w-2.5 rounded-full animate-pulse",
                 isConnected ? "bg-green-500 shadow-[0_0_8px_hsl(var(--riana-success))]" : "bg-red-500"
               )} />
               <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                 {isConnected ? "Live" : "Connecting..."}
               </span>
            </div>
          </div>
          <div className="relative group">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-primary opacity-40 group-focus-within:opacity-100 transition-opacity" />
            <Input 
              placeholder="Search colleagues..." 
              className="pl-9 h-11 bg-background/50 border-primary/10 focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all rounded-xl text-foreground"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <ScrollArea className="flex-1">
          <div className="py-3 px-1 space-y-1">
            {filteredUsers.length > 0 ? (
              filteredUsers.map(user => (
                <button
                  key={user.id}
                  onClick={() => setActiveChatUserId(user.id)}
                  className={cn(
                    "chat-sidebar-item w-[calc(100%-16px)] flex items-center gap-3 p-3 text-left group",
                    activeChatUserId === user.id && "chat-sidebar-active"
                  )}
                >
                  <div className="relative">
                    <Avatar className="h-12 w-12 border-2 border-background shadow-sm group-hover:border-primary/20 transition-colors">
                      <AvatarFallback className="bg-primary/5 text-primary text-lg font-bold">
                        {(user.first_name?.[0] || user.email?.[0] || '?').toUpperCase()}
                        {(user.last_name?.[0] || '').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {(unreadCounts[user.id] || 0) > 0 && (
                      <Badge className="absolute -top-1 -right-1 h-6 w-6 flex items-center justify-center p-0 bg-red-500 text-white border-2 border-background rounded-full text-[10px] font-bold shadow-sm">
                        {unreadCounts[user.id]}
                      </Badge>
                    )}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span className="font-bold text-sm truncate pr-2 text-foreground">
                        {user.first_name || user.last_name ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : user.email}
                      </span>
                      <span className="text-[9px] opacity-40 whitespace-nowrap">
                        {new Date().toLocaleDateString([], { weekday: 'short' })}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate leading-relaxed">
                      {user.designation || user.role || 'Member'}
                    </div>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                <p className="text-xs italic">No colleagues found</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-muted/30 dark:bg-background/20 relative">
        {activeChatUserId ? (
          <>
            {/* Chat Header */}
            <header className="px-6 py-4 border-b flex items-center justify-between bg-background/80 backdrop-blur-md z-10">
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="md:hidden -ml-2"
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                >
                  <Users className="h-5 w-5" />
                </Button>
                <div className="relative">
                   <Avatar className="h-11 w-11 border-2 border-primary/10">
                    <AvatarFallback className="bg-primary/5 text-primary font-bold">
                      {(activeUser?.first_name?.[0] || activeUser?.email?.[0] || '?').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background shadow-sm"></div>
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight text-foreground">
                    {activeUser?.first_name || activeUser?.last_name 
                      ? `${activeUser?.first_name || ''} ${activeUser?.last_name || ''}`.trim() 
                      : activeUser?.email}
                  </h3>
                  <p className="text-[11px] text-primary/70 font-medium">
                    Online • {activeUser?.designation || activeUser?.role}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="text-primary/60 hover:text-primary hover:bg-primary/5 rounded-full"><Phone className="h-4.5 w-4.5" /></Button>
                <Button variant="ghost" size="icon" className="text-primary/60 hover:text-primary hover:bg-primary/5 rounded-full"><Video className="h-4.5 w-4.5" /></Button>
                {onClose && (
                  <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
                    <X className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </header>

            {/* Messages Area */}
            <ScrollArea className="flex-1 px-6 scroll-smooth">
              <div className="py-6 space-y-6">
                {messages.map((msg, index) => {
                  const isMe = msg.sender_id === currentUser.id;
                  const prevMsg = messages[index - 1];
                  const showDate = !prevMsg || format(new Date(msg.created_at), 'yyyy-MM-dd') !== format(new Date(prevMsg.created_at), 'yyyy-MM-dd');

                  return (
                    <div key={msg.id} className="space-y-4">
                       {showDate && (
                         <div className="flex justify-center my-6">
                           <span className="text-[11px] font-bold tracking-widest uppercase bg-muted/50 px-3 py-1 rounded-full text-muted-foreground/60">
                             {format(new Date(msg.created_at), 'MMM d, yyyy')}
                           </span>
                         </div>
                       )}
                       <div className={cn(
                        "flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
                        isMe ? "justify-end" : "justify-start"
                      )}>
                        {!isMe && (
                           <Avatar className="h-8 w-8 mr-2 mt-auto border border-border shadow-sm">
                             <AvatarFallback className="text-[10px] font-bold opacity-60">
                               {msg.sender_first_name?.[0] || '?'}
                             </AvatarFallback>
                           </Avatar>
                        )}
                        <div className={cn(
                          "max-w-[80%] px-4 py-3 shadow-md relative",
                          isMe ? "chat-bubble-me text-white" : "chat-bubble-other text-slate-900"
                        )}>
                          <p className="text-[14px] font-medium leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          <div className={cn(
                            "text-[10px] flex items-center justify-end gap-1.5 mt-1.5",
                            isMe ? "text-white/80" : "text-slate-500"
                          )}>
                            {format(new Date(msg.created_at), 'h:mm a')}
                            {isMe && (
                              <span className="ml-0.5">
                                {msg.is_read ? (
                                  <CheckCheck className="h-3.5 w-3.5 text-blue-200" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={scrollRef} className="h-4" />
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="p-6 bg-background/80 backdrop-blur-md border-t">
              <form onSubmit={handleSend} className="flex gap-3 items-end">
                <div className="flex-1 bg-muted/30 rounded-2xl border border-primary/10 focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/5 transition-all p-1">
                    <Input 
                     placeholder="Message..." 
                     value={inputText}
                     onChange={(e) => setInputText(e.target.value)}
                     className="border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 min-h-[44px] px-3 shadow-none text-foreground"
                     autoFocus
                   />
                </div>
                <Button 
                  type="submit" 
                  size="icon" 
                  className="h-12 w-12 rounded-2xl gradient-primary shadow-riana hover:scale-105 active:scale-95 transition-all flex-shrink-0" 
                  disabled={!inputText.trim()}
                >
                  <Send className="h-5 w-5" />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted-foreground select-none">
            <div className="h-28 w-28 rounded-[2rem] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-8 rotate-3 shadow-inner">
               <div className="h-20 w-20 rounded-3xl bg-white dark:bg-slate-800 shadow-riana flex items-center justify-center text-primary animate-bounce-slow">
                 <MessageSquare className="h-10 w-10 fill-current opacity-80" />
               </div>
            </div>
            <h3 className="text-2xl font-black text-foreground tracking-tight">RIANA INSTANT MESSAGING</h3>
            <p className="max-w-xs mt-3 text-sm leading-relaxed opacity-60">
              Connect with your team instantly. Start a secure, real-time conversation by selecting a colleague.
            </p>
            <Button 
              className="mt-10 px-8 py-6 rounded-2xl font-bold bg-primary hover:bg-primary/90 text-white shadow-riana flex items-center gap-2 group" 
              onClick={() => setIsSidebarOpen(true)}
            >
              <Users className="h-5 w-5 transition-transform group-hover:scale-110" />
              Browse Colleagues
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
