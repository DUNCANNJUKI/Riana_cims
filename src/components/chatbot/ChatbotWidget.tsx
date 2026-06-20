import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, User, Minimize2, Maximize2, ChevronDown, ChevronUp } from "lucide-react";
import { User as UserType } from "@/types";
import { apiClient } from "@/integrations/apiClient";

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  isExpanded?: boolean;
}

interface ChatbotWidgetProps {
  user?: UserType;
}

const MAX_SUMMARY_LENGTH = 150;

export const ChatbotWidget = ({ user }: ChatbotWidgetProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [robotMood, setRobotMood] = useState<'normal' | 'thinking' | 'excited' | 'error'>('normal');
  
  const getGreeting = () => {
    const hour = new Date().getHours();
    const userName = user ? `${user.first_name || user.email.split('@')[0]}` : 'there';
    
    let timeGreeting = '';
    if (hour < 12) timeGreeting = 'Good morning';
    else if (hour < 17) timeGreeting = 'Good afternoon';
    else timeGreeting = 'Good evening';
    
    return `${timeGreeting}, ${userName}! 👋 I'm your RIANA CIMS assistant. How can I help you today?`;
  };

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: getGreeting(),
      sender: 'bot',
      timestamp: new Date(),
      isExpanded: true
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const summarizeText = (text: string): { summary: string; isTruncated: boolean } => {
    if (text.length <= MAX_SUMMARY_LENGTH) {
      return { summary: text, isTruncated: false };
    }
    // Find a good breaking point
    const breakPoint = text.lastIndexOf(' ', MAX_SUMMARY_LENGTH);
    const summary = text.substring(0, breakPoint > 0 ? breakPoint : MAX_SUMMARY_LENGTH) + '...';
    return { summary, isTruncated: true };
  };

  const toggleMessageExpand = (messageId: string) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, isExpanded: !msg.isExpanded } : msg
    ));
  };

  const generateBotResponse = async (userMessage: string): Promise<string> => {
    try {
      const data = await apiClient.post('/chat/assistant', {
        message: userMessage
      });

      return data.reply || 'I apologize, but I couldn\'t generate a response. Please try again.';
    } catch (error) {
      console.error('Error in chatbot:', error);
      return 'I apologize, but I\'m experiencing technical difficulties. Please try again.';
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
      isExpanded: true
    };

    const currentInput = inputValue;
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);
    setRobotMood('thinking');

    try {
      const response = await generateBotResponse(currentInput);
      const botResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: response,
        sender: 'bot',
        timestamp: new Date(),
        isExpanded: false // Start collapsed for long messages
      };
      
      setMessages(prev => [...prev, botResponse]);
      setIsTyping(false);
      
      // Set mood based on response type
      if (response.includes('error') || response.includes('sorry') || response.includes('apologize')) {
        setRobotMood('error');
        setTimeout(() => setRobotMood('normal'), 2000);
      } else if (response.includes('help') || response.includes('assist')) {
        setRobotMood('excited');
        setTimeout(() => setRobotMood('normal'), 2000);
      } else {
        setRobotMood('normal');
      }
    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      setIsTyping(false);
      setRobotMood('error');
      setTimeout(() => setRobotMood('normal'), 2000);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  const getMoodColor = () => {
    switch (robotMood) {
      case 'thinking': return 'hsl(200, 100%, 60%)';
      case 'excited': return 'hsl(45, 93%, 47%)';
      case 'error': return 'hsl(0, 84%, 60%)';
      default: return 'hsl(142, 76%, 46%)';
    }
  };

  const renderMessageContent = (message: Message) => {
    const { summary, isTruncated } = summarizeText(message.text);
    const showFull = message.isExpanded || !isTruncated;
    
    return (
      <div className="space-y-1">
        <p className="text-xs leading-relaxed whitespace-pre-wrap">
          {showFull ? message.text : summary}
        </p>
        {isTruncated && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleMessageExpand(message.id)}
            className="h-5 px-2 text-[10px] text-cyan-400 hover:text-cyan-300 hover:bg-transparent"
          >
            {message.isExpanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Read more
              </>
            )}
          </Button>
        )}
        <p className="text-[10px] opacity-60">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    );
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          className="rounded-full w-14 h-14 gradient-primary shadow-lg hover:scale-110 transition-all duration-300"
        >
          <div className="relative">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center">
              <div className="flex gap-0.5">
                <div 
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: getMoodColor() }}
                />
                <div 
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: getMoodColor() }}
                />
              </div>
            </div>
          </div>
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Card className={`shadow-xl border-primary/20 transition-all duration-300 bg-gradient-to-br from-slate-900 to-slate-800 text-white ${isMinimized ? 'w-80 h-12' : 'w-80 h-[420px]'}`}>
        <CardHeader className="py-2 px-3 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-xs">
              <div className={`w-6 h-6 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center border border-slate-500 ${isTyping ? 'animate-pulse' : ''}`}>
                <div className="flex gap-0.5">
                  <div 
                    className="w-1 h-1 rounded-full transition-colors duration-300"
                    style={{ backgroundColor: getMoodColor() }}
                  />
                  <div 
                    className="w-1 h-1 rounded-full transition-colors duration-300"
                    style={{ backgroundColor: getMoodColor() }}
                  />
                </div>
              </div>
              <div>
                <div className="text-cyan-300 font-medium text-xs">RIANA Assistant</div>
                <div className="text-[9px] text-slate-400">RIANA Automations</div>
              </div>
              <Badge 
                variant="outline" 
                className="text-[9px] px-1 py-0 border-green-500 text-green-400 bg-green-500/10"
              >
                Online
              </Badge>
            </CardTitle>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMinimized(!isMinimized)}
                className="h-5 w-5 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
              >
                {isMinimized ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-5 w-5 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
              >
                ×
              </Button>
            </div>
          </div>
        </CardHeader>
        
        {!isMinimized && (
          <CardContent className="p-0 flex flex-col h-[360px] bg-slate-900/50">
            <ScrollArea className="flex-1 px-2 py-2">
              <div className="space-y-2">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex items-start gap-1.5 ${
                      message.sender === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.sender === 'bot' && (
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center flex-shrink-0 border border-slate-500">
                        <div className="flex gap-0.5">
                          <div className="w-0.5 h-0.5 rounded-full bg-green-400" />
                          <div className="w-0.5 h-0.5 rounded-full bg-green-400" />
                        </div>
                      </div>
                    )}
                    <div
                      className={`max-w-[220px] px-2 py-1.5 rounded-lg shadow ${
                        message.sender === 'user'
                          ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white'
                          : 'bg-gradient-to-r from-slate-700 to-slate-600 text-slate-100 border border-slate-500'
                      }`}
                    >
                      {renderMessageContent(message)}
                    </div>
                    {message.sender === 'user' && (
                      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0">
                        <User className="h-2.5 w-2.5 text-white" />
                      </div>
                    )}
                  </div>
                ))}
                
                {isTyping && (
                  <div className="flex items-start gap-1.5">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center border border-slate-500 animate-pulse">
                      <div className="flex gap-0.5">
                        <div className="w-0.5 h-0.5 rounded-full bg-blue-400" />
                        <div className="w-0.5 h-0.5 rounded-full bg-blue-400" />
                      </div>
                    </div>
                    <div className="bg-gradient-to-r from-slate-700 to-slate-600 px-2 py-1.5 rounded-lg border border-slate-500">
                      <div className="flex space-x-1">
                        <div className="w-1 h-1 bg-slate-300 rounded-full animate-bounce"></div>
                        <div className="w-1 h-1 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-1 h-1 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
            
            <div className="p-2 border-t border-slate-700 bg-slate-800/50">
              <div className="flex gap-1.5">
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  className="flex-1 text-xs h-7 bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus:border-cyan-400"
                />
                <Button
                  onClick={handleSendMessage}
                  size="sm"
                  className="px-2 h-7 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 border border-cyan-500 transition-all hover:scale-105 active:scale-95"
                  disabled={!inputValue.trim() || isTyping}
                >
                  <Send className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};
