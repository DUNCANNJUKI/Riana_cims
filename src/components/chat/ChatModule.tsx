import { useEffect, useRef, useState } from "react";
import { User } from "@/types";
import { ChatMessage, getChatAttachmentUrl, useChat } from "@/hooks/useChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { X, Send, Check, CheckCheck, Search, Users, MessageSquare, Phone, Video, Paperclip, Download, Image as ImageIcon, FileText, Reply, PhoneOff, Mic, MonitorUp, MoreVertical, Copy, SmilePlus, Edit3, Trash2, BellOff } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { resolveAvatarUrl } from "@/utils/avatar";
import { useToast } from "@/hooks/use-toast";
import { playCallHangupSound, playCallPickupSound, playCallRingSound } from "@/utils/notificationSound";

interface ChatModuleProps {
  currentUser: User;
  chat: ReturnType<typeof useChat>;
  onClose?: () => void;
}

const formatUserName = (user?: Partial<User> | null) => {
  if (!user) return "Unknown user";
  const name = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return name || user.email || "Unknown user";
};

const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDateSeparator = (dateValue: string) => {
  const messageDate = new Date(dateValue);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (format(messageDate, "yyyy-MM-dd") === format(today, "yyyy-MM-dd")) return "Today";
  if (format(messageDate, "yyyy-MM-dd") === format(yesterday, "yyyy-MM-dd")) return "Yesterday";
  return format(messageDate, "MMM d, yyyy");
};

const formatLastSeen = (value?: string | null) => {
  if (!value) return "Last seen unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Last seen unavailable";
  const now = Date.now();
  const diffMinutes = Math.max(0, Math.round((now - date.getTime()) / 60000));
  if (diffMinutes < 1) return "Last seen just now";
  if (diffMinutes < 60) return `Last seen ${diffMinutes}m ago`;
  if (format(date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")) return `Last seen today at ${format(date, "h:mm a")}`;
  return `Last seen ${format(date, "MMM d, h:mm a")}`;
};

const readFileAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
  reader.onerror = () => reject(new Error("Unable to read the selected file."));
  reader.readAsDataURL(file);
});

const isImageAttachment = (message: ChatMessage) => String(message.attachment_content_type || "").startsWith("image/");
const isRtcStateConflict = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "");
  return (error instanceof DOMException && error.name === "InvalidStateError")
    || /wrong state|signalingstate|stable|closed/i.test(message);
};
const HOSTED_PLACEHOLDER_LINE_RE = /^[\s\u00a0]*(?:[oO0]|\u039f|\u03bf|\uff2f|\uff4f|\uff10|\u25cb|\u25ef)[\s\u00a0]*$/u;
const stripHostedPlaceholderLines = (value?: string | null) => String(value || "")
  .replace(/\r\n?/g, "\n")
  .split("\n")
  .filter((line) => !HOSTED_PLACEHOLDER_LINE_RE.test(line))
  .join("\n")
  .trim();

const isHostedPlaceholderMessage = (message: ChatMessage) => {
  const content = stripHostedPlaceholderLines(message.content);
  return !message.reply_to_message_id
    && !message.attachment_file_path
    && !content;
};

const EMOJI_SHORTCUTS = ["\u{1F600}", "\u{1F602}", "\u{1F60D}", "\u{1F44D}", "\u{1F64F}", "\u{1F389}", "\u2705", "\u{1F525}", "\u2764\uFE0F", "\u{1F622}", "\u{1F62E}", "\u{1F621}"];
const REACTION_OPTIONS = [
  { type: "like", label: "Like", icon: "\u{1F44D}" },
  { type: "love", label: "Love", icon: "\u2764\uFE0F" },
  { type: "laugh", label: "Laugh", icon: "\u{1F602}" },
  { type: "wow", label: "Wow", icon: "\u{1F62E}" },
  { type: "sad", label: "Sad", icon: "\u{1F622}" },
  { type: "angry", label: "Angry", icon: "\u{1F621}" },
];

export const ChatModule = ({ currentUser, chat, onClose }: ChatModuleProps) => {
  const {
    messages, users, activeChatUserId, setActiveChatUserId,
    sendMessage, editMessage, setReaction, removeReaction, deleteMessageForMe, deleteMessageForEveryone, setTyping, typingUsers, unreadCounts, isConnected,
    incomingCall, activeCall, callSignals, startCall, updateCallStatus,
    sendCallSignal, clearCallSignals, clearCallState, onlineUserCount, isLoadingUsers, usersError, loadUsers,
  } = chat;
  const { toast } = useToast();
  const [inputText, setInputText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [selectedCallParticipantIds, setSelectedCallParticipantIds] = useState<string[]>([]);
  const [isRingtoneSilenced, setIsRingtoneSilenced] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const peerRefs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedSignalsRef = useRef<Set<string>>(new Set());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const ringtoneTimerRef = useRef<number | null>(null);

  const visibleUsers = users.filter(user => user.id !== currentUser.id);
  const activeUser = visibleUsers.find(u => u.id === activeChatUserId);
  const activeCallParticipantIds = activeCall
    ? Array.from(new Set([activeCall.sender_id, activeCall.receiver_id, ...(activeCall.call_participant_ids || [])].filter(Boolean)))
    : [];
  const activeCallOtherParticipants = activeCallParticipantIds.filter(id => id !== currentUser.id);
  const activeCallUsers = activeCallOtherParticipants.map(id => users.find(user => user.id === id)).filter(Boolean) as User[];
  const activeCallLabel = activeCallOtherParticipants.length > 1
    ? `${activeCall.call_type === "video" ? "Group video" : "Group phone"} call (${activeCallOtherParticipants.length + 1})`
    : `${activeCall?.call_type === "video" ? "Video" : "Phone"} call with ${formatUserName(activeCallUsers[0])}`;
  const selectedCallTargets = activeChatUserId
    ? Array.from(new Set([activeChatUserId, ...selectedCallParticipantIds])).filter(id => id && id !== currentUser.id && visibleUsers.some(user => user.id === id))
    : [];

  const filteredUsers = visibleUsers.filter(u => {
    const fullName = `${u.first_name || ""} ${u.last_name || ""}`.trim().toLowerCase();
    const email = (u.email || "").toLowerCase();
    const search = searchTerm.toLowerCase();
    return fullName.includes(search) || email.includes(search);
  });
  const displayMessages = messages.filter(message => !isHostedPlaceholderMessage(message));
  const getSenderAvatarUrl = (message: ChatMessage) => {
    if (message.sender_avatar_url) return message.sender_avatar_url;
    if (String(message.sender_id) === String(currentUser.id)) return currentUser.avatar_url;
    return users.find(user => user.id === message.sender_id)?.avatar_url;
  };
  const unreadConversationCount = visibleUsers.filter(user => (unreadCounts[user.id] || 0) > 0).length;
  const onlineCount = onlineUserCount || visibleUsers.filter(user => user.online).length;
  const activeUserPresenceLabel = typingUsers[activeChatUserId || ""]
    ? "Typing..."
    : activeUser?.online
      ? "Online"
      : formatLastSeen(activeUser?.last_seen_at);

  const stopStreams = () => {
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    setRemoteStream(null);
    localStreamRef.current = null;
  };

  const stopRingtone = () => {
    if (ringtoneTimerRef.current) window.clearInterval(ringtoneTimerRef.current);
    ringtoneTimerRef.current = null;
  };

  const closePeer = () => {
    peerRefs.current.forEach(connection => connection.close());
    peerRefs.current.clear();
    processedSignalsRef.current.clear();
    pendingIceCandidatesRef.current.clear();
  };

  const endLocalCallState = () => {
    closePeer();
    stopStreams();
    clearCallSignals(activeCall?.id || incomingCall?.id);
    setCallError(null);
  };

  const getCallPeerId = (call: ChatMessage) => call.sender_id === currentUser.id ? call.receiver_id : call.sender_id;

  const attachLocalStreamToPeer = (connection: RTCPeerConnection, stream: MediaStream) => {
    const existingTrackIds = new Set(connection.getSenders().map(sender => sender.track?.id).filter(Boolean));
    stream.getTracks().forEach(track => {
      if (!existingTrackIds.has(track.id)) connection.addTrack(track, stream);
    });
  };

  const createPeerConnection = (call: ChatMessage, targetUserId: string) => {
    const existingPeer = peerRefs.current.get(targetUserId);
    if (existingPeer) {
      if (localStreamRef.current) attachLocalStreamToPeer(existingPeer, localStreamRef.current);
      return existingPeer;
    }
    const connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    connection.onicecandidate = event => {
      if (event.candidate) void sendCallSignal(call.id, targetUserId, "ice-candidate", event.candidate.toJSON());
    };
    connection.ontrack = event => {
      const [stream] = event.streams;
      if (stream) setRemoteStream(stream);
    };
    connection.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(connection.connectionState)) {
        setCallError(connection.connectionState === "failed" ? "Call connection failed." : null);
      }
    };
    peerRefs.current.set(targetUserId, connection);
    if (localStreamRef.current) attachLocalStreamToPeer(connection, localStreamRef.current);
    return connection;
  };

  const flushPendingIceCandidates = async (targetUserId: string, connection: RTCPeerConnection) => {
    const pending = pendingIceCandidatesRef.current.get(targetUserId) || [];
    if (!pending.length || !connection.remoteDescription) return;
    pendingIceCandidatesRef.current.delete(targetUserId);
    for (const candidate of pending) {
      await connection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  };

  const openMedia = async (withVideo: boolean) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support secure audio/video calling.");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo });
    localStreamRef.current = stream;
    peerRefs.current.forEach(connection => attachLocalStreamToPeer(connection, stream));
    setLocalStream(stream);
    return stream;
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!activeChatUserId) return;
    const canChatWithActiveUser = activeChatUserId !== currentUser.id && users.some(user => user.id === activeChatUserId && user.id !== currentUser.id);
    if (!canChatWithActiveUser) {
      setActiveChatUserId(null);
      setSelectedCallParticipantIds([]);
    }
  }, [activeChatUserId, currentUser.id, users, setActiveChatUserId]);

  useEffect(() => () => {
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    if (activeChatUserId) void setTyping(activeChatUserId, false);
    closePeer();
    stopStreams();
  }, [activeChatUserId, setTyping]);

  useEffect(() => {
    if (!localVideoRef.current) return;
    localVideoRef.current.srcObject = localStream;
    if (localStream) void localVideoRef.current.play().catch(() => undefined);
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      if (remoteStream) void remoteVideoRef.current.play().catch(() => undefined);
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
      if (remoteStream) void remoteAudioRef.current.play().catch(() => undefined);
    }
  }, [remoteStream]);

  useEffect(() => {
    if (!incomingCall || activeCall || isRingtoneSilenced) {
      stopRingtone();
      return;
    }
    stopRingtone();
    playCallRingSound();
    ringtoneTimerRef.current = window.setInterval(() => playCallRingSound(), 2200);
    return stopRingtone;
  }, [incomingCall?.id, activeCall?.id, isRingtoneSilenced]);

  useEffect(() => {
    if (!incomingCall) setIsRingtoneSilenced(false);
  }, [incomingCall?.id]);

  useEffect(() => {
    if (!activeCall) {
      if (!incomingCall) endLocalCallState();
      return;
    }
    if (["ended", "declined", "missed"].includes(String(activeCall.call_status))) {
      endLocalCallState();
    }
  }, [activeCall?.id, activeCall?.call_status, incomingCall?.id]);

  useEffect(() => {
    const processSignals = async () => {
      const call = activeCall;
      if (!call) return;
      for (const signal of callSignals) {
        const key = signal.signalId || `${signal.callId}:${signal.senderId}:${signal.signalType}:${JSON.stringify(signal.payload).slice(0, 240)}`;
        if (signal.callId !== call.id || processedSignalsRef.current.has(key)) continue;
        processedSignalsRef.current.add(key);
        const targetUserId = signal.senderId;
        try {
          const connection = createPeerConnection(call, targetUserId);
          if (signal.signalType === "offer") {
            if (connection.remoteDescription || connection.signalingState !== "stable") continue;
            await connection.setRemoteDescription(new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit));
            if (connection.signalingState !== "have-remote-offer") continue;
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            await sendCallSignal(call.id, targetUserId, "answer", connection.localDescription || answer);
            await flushPendingIceCandidates(targetUserId, connection);
          } else if (signal.signalType === "answer") {
            if (connection.signalingState !== "have-local-offer") continue;
            await connection.setRemoteDescription(new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit));
            await flushPendingIceCandidates(targetUserId, connection);
          } else if (signal.signalType === "ice-candidate") {
            if (!connection.remoteDescription) {
              const pending = pendingIceCandidatesRef.current.get(targetUserId) || [];
              pending.push(signal.payload as RTCIceCandidateInit);
              pendingIceCandidatesRef.current.set(targetUserId, pending);
              continue;
            }
            await connection.addIceCandidate(new RTCIceCandidate(signal.payload as RTCIceCandidateInit));
          }
        } catch (error) {
          if (isRtcStateConflict(error)) {
            console.warn("[Chat] Ignored stale WebRTC signal.", error);
            continue;
          }
          setCallError(error instanceof Error ? error.message : "Unable to process call signal.");
        }
      }
    };
    void processSignals();
  }, [activeCall, callSignals, sendCallSignal]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Chat attachments must be 10 MB or smaller.", variant: "destructive" });
      event.target.value = "";
      return;
    }
    setSelectedFile(file);
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isDesktop = typeof window === "undefined" || window.innerWidth >= 768;
    if (event.key !== "Enter" || event.shiftKey || !isDesktop || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void handleSend();
  };
  const handleSend = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if ((!inputText.trim() && !selectedFile) || !activeChatUserId || isSending) return;
    if (activeChatUserId === currentUser.id) {
      toast({ title: "Select a colleague", description: "You cannot send a chat message to your own account.", variant: "destructive" });
      setActiveChatUserId(null);
      return;
    }
    if (editingMessage) {
      const editedText = inputText.trim();
      if (!editedText) return;
      setIsSending(true);
      try {
        await editMessage(editingMessage.id, editedText);
        setInputText("");
        setEditingMessage(null);
        toast({ title: "Message updated", description: "Your edit was saved before the recipient read it." });
      } catch (error) {
        toast({ title: "Message not edited", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
      } finally {
        setIsSending(false);
      }
      return;
    }
    const text = inputText.trim();
    const file = selectedFile;
    const replyId = replyingTo?.id || null;
    setInputText("");
    setSelectedFile(null);
    setReplyingTo(null);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    void setTyping(activeChatUserId, false);
    setIsSending(true);
    try {
      const attachment = file ? { fileName: file.name, base64Data: await readFileAsBase64(file) } : null;
      await sendMessage(activeChatUserId, text, { attachment, replyToMessageId: replyId });
    } catch (error) {
      setInputText(text);
      setSelectedFile(file);
      toast({ title: "Message not sent", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const startOutgoingCall = async (callType: "audio" | "video") => {
    if (!selectedCallTargets.length) return;
    try {
      setCallError(null);
      await openMedia(callType === "video");
      const call = await startCall(selectedCallTargets, callType);
      await Promise.all(selectedCallTargets.map(async targetId => {
        const connection = createPeerConnection(call, targetId);
        if (connection.signalingState !== "stable" || connection.localDescription) return;
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await sendCallSignal(call.id, targetId, "offer", connection.localDescription || offer);
      }));
    } catch (error) {
      endLocalCallState();
      clearCallState();
      toast({ title: "Call failed", description: error instanceof Error ? error.message : "Unable to start the call.", variant: "destructive" });
    }
  };

  const acceptIncomingCall = async () => {
    if (!incomingCall) return;
    try {
      setCallError(null);
      stopRingtone();
      await openMedia(incomingCall.call_type === "video");
      const call = await updateCallStatus(incomingCall.id, "accepted");
      createPeerConnection(call, call.sender_id);
      playCallPickupSound();
    } catch (error) {
      endLocalCallState();
      toast({ title: "Unable to answer", description: error instanceof Error ? error.message : "Check microphone/camera permissions.", variant: "destructive" });
    }
  };

  const declineIncomingCall = async () => {
    if (!incomingCall) return;
    stopRingtone();
    playCallHangupSound();
    await updateCallStatus(incomingCall.id, "declined").catch(() => undefined);
    clearCallState();
    endLocalCallState();
  };

  const silenceIncomingCall = () => {
    setIsRingtoneSilenced(true);
    stopRingtone();
  };

  const hangUpCall = async () => {
    const callId = activeCall?.id || incomingCall?.id;
    stopRingtone();
    playCallHangupSound();
    if (callId) await updateCallStatus(callId, "ended").catch(() => undefined);
    clearCallState();
    endLocalCallState();
  };


  const handleMessageReaction = async (message: ChatMessage, reactionType: string) => {
    try {
      if (message.my_reaction === reactionType) await removeReaction(message.id);
      else await setReaction(message.id, reactionType);
    } catch (error) {
      toast({ title: "Reaction failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const handleEditMessage = (message: ChatMessage) => {
    setEditingMessage(message);
    setReplyingTo(null);
    setSelectedFile(null);
    setInputText(message.content || "");
  };

  const handleDeleteForMe = async (message: ChatMessage) => {
    if (!window.confirm("Delete this message only from your chat history? Other participants will still see it.")) return;
    try {
      await deleteMessageForMe(message.id);
      toast({ title: "Message deleted for you" });
    } catch (error) {
      toast({ title: "Delete failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const handleDeleteForEveryone = async (message: ChatMessage) => {
    if (!window.confirm("Delete this message for everyone? The original content will no longer be visible to participants.")) return;
    try {
      await deleteMessageForEveryone(message.id);
      toast({ title: "Message deleted for everyone" });
    } catch (error) {
      toast({ title: "Delete failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const copyMessage = async (message: ChatMessage) => {
    await navigator.clipboard?.writeText(message.content || "");
    toast({ title: "Copied" });
  };

  const renderReactionBar = (message: ChatMessage, isMe: boolean) => {
    const reactions = message.reactions || [];
    if (message.is_deleted_for_everyone && reactions.length === 0) return null;
    return (
      <div className={cn("mt-2 flex flex-wrap gap-1", isMe ? "justify-end" : "justify-start")}>
        {reactions.map((reaction) => {
          const option = REACTION_OPTIONS.find(item => item.type === reaction.reaction_type);
          return (
            <button
              key={reaction.reaction_type}
              type="button"
              onClick={() => void handleMessageReaction(message, reaction.reaction_type)}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors",
                message.my_reaction === reaction.reaction_type ? "border-primary bg-primary/10 text-primary" : isMe ? "border-white/20 bg-white/10 text-white/80" : "border-border bg-background text-muted-foreground",
              )}
              title={option?.label || reaction.reaction_type}
            >
              <span>{option?.icon || "\u{1F44D}"}</span>
              <span>{reaction.count}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderMessageActions = (message: ChatMessage, isMe: boolean) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className={cn("h-8 w-8 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100", isMe ? "hover:bg-white/10" : "hover:bg-muted")} title="Message actions" aria-label="Message actions">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={isMe ? "end" : "start"} className="w-48">
        <DropdownMenuItem onClick={() => setReplyingTo(message)}><Reply className="mr-2 h-4 w-4" />Reply</DropdownMenuItem>
        <DropdownMenuItem onClick={() => void copyMessage(message)}><Copy className="mr-2 h-4 w-4" />Copy</DropdownMenuItem>
        {isMe && Boolean(message.can_edit) && <DropdownMenuItem onClick={() => handleEditMessage(message)}><Edit3 className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>}
        <DropdownMenuSeparator />
        {REACTION_OPTIONS.map((reaction) => (
          <DropdownMenuItem key={reaction.type} onClick={() => void handleMessageReaction(message, reaction.type)}>
            <span className="mr-2 w-4 text-center">{reaction.icon}</span>{message.my_reaction === reaction.type ? "Remove" : reaction.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handleDeleteForMe(message)}><Trash2 className="mr-2 h-4 w-4" />Delete for me</DropdownMenuItem>
        {isMe && Boolean(message.can_delete_for_everyone) && <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void handleDeleteForEveryone(message)}><Trash2 className="mr-2 h-4 w-4" />Delete for everyone</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const renderAttachment = (message: ChatMessage, isMe: boolean) => {
    if (!message.attachment_file_path) return null;
    const viewUrl = getChatAttachmentUrl(message.attachment_file_path);
    const downloadUrl = getChatAttachmentUrl(message.attachment_file_path, true);
    return (
      <div className={cn("mt-2 overflow-hidden rounded-lg border", isMe ? "border-white/20 bg-white/10" : "border-border bg-background") }>
        {isImageAttachment(message) ? (
          <a href={viewUrl} target="_blank" rel="noreferrer" className="block">
            <img src={viewUrl} alt={message.attachment_file_name || "Attachment"} className="max-h-64 w-full object-cover" />
          </a>
        ) : null}
        <div className="flex items-center gap-3 p-3">
          {isImageAttachment(message) ? <ImageIcon className="h-5 w-5 shrink-0" /> : <FileText className="h-5 w-5 shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{message.attachment_file_name}</p>
            <p className={cn("text-[10px]", isMe ? "text-white/70" : "text-muted-foreground")}>{formatFileSize(message.attachment_size)}</p>
          </div>
          <a href={downloadUrl} download={message.attachment_file_name || true} target="_blank" rel="noreferrer" className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md", isMe ? "hover:bg-white/15" : "hover:bg-muted") } title="Download attachment">
            <Download className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  };

  const renderCallMessage = (message: ChatMessage, isMe: boolean) => (
    <div className="flex items-center gap-2 text-sm font-medium">
      {message.call_type === "video" ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
      <span>{message.call_type === "video" ? "Video call" : "Phone call"}</span>
      <span className={cn("rounded-full px-2 py-0.5 text-[10px] uppercase", isMe ? "bg-white/15 text-white/80" : "bg-muted text-muted-foreground")}>{message.call_status || "ringing"}</span>
    </div>
  );

  return (
    <div className="chat-shell flex h-full min-h-0 w-full max-w-6xl overflow-hidden rounded-2xl border border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-surface))] shadow-2xl">
      <div className={cn("flex flex-col border-r border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-panel))] backdrop-blur transition-all duration-300", isSidebarOpen ? "w-full md:w-[336px]" : "w-0 overflow-hidden")}>
        <div className="space-y-3 border-b border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-panel-elevated))] p-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold text-primary"><MessageSquare className="h-5 w-5" /> Messages</h2>
            <div className="flex items-center gap-2">
              <div className={cn("h-2.5 w-2.5 rounded-full animate-pulse", isConnected ? "bg-green-500" : "bg-red-500")} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{isConnected ? "Live" : "Reconnecting"}</span>
            </div>
          </div>
          <div className="relative group">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-primary opacity-40" />
            <Input placeholder="Search colleagues..." className="h-11 rounded-xl border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-surface))] pl-9 text-sm shadow-sm placeholder:text-muted-foreground/80 focus-visible:ring-primary/25" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} aria-label="Search conversations" />
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Conversation filters">
            <span className="rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground shadow-sm">All</span>
            <span className="rounded-full border border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-surface))] px-3 py-1 text-[11px] font-semibold text-muted-foreground">Unread {unreadConversationCount || ""}</span>
            <span className="rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-[11px] font-semibold text-green-700 dark:text-green-300">Online {onlineCount}</span>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-1 px-2 py-3">
            {filteredUsers.length > 0 ? filteredUsers.map(user => (
              <button key={user.id} onClick={() => { setActiveChatUserId(user.id); setSelectedCallParticipantIds([]); if (typeof window !== "undefined" && window.innerWidth < 768) setIsSidebarOpen(false); }} className={cn("chat-sidebar-item group flex w-full items-center gap-3 p-3 text-left", activeChatUserId === user.id && "chat-sidebar-active")}>
                <div className="relative">
                  <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                    <AvatarImage src={resolveAvatarUrl(user.avatar_url)} alt={formatUserName(user)} />
                    <AvatarFallback className="bg-primary/5 text-lg font-bold text-primary">{(user.first_name?.[0] || user.email?.[0] || "?").toUpperCase()}{(user.last_name?.[0] || "").toUpperCase()}</AvatarFallback>
                  </Avatar>
                  {(unreadCounts[user.id] || 0) > 0 && <Badge className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-red-500 p-0 text-[10px] text-white">{unreadCounts[user.id]}</Badge>}
                  <span className={cn("absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background", user.online ? "bg-green-500" : "bg-slate-400")} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-baseline justify-between">
                    <span className="truncate pr-2 text-sm font-bold text-foreground">{formatUserName(user)}</span>
                  </div>
                  <div className="truncate text-[11px] leading-relaxed text-muted-foreground">{user.online ? "Online" : formatLastSeen(user.last_seen_at)}</div>
                  <div className="truncate text-[10px] leading-relaxed text-muted-foreground/80">{user.designation || user.role || "Member"}</div>
                </div>
              </button>
            )) : isLoadingUsers ? (
              <div className="p-8 text-center text-xs font-medium text-muted-foreground">Loading colleagues...</div>
            ) : usersError ? (
              <div className="mx-2 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-center">
                <p className="text-xs font-semibold text-destructive">Unable to load colleagues</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{usersError}</p>
                <Button type="button" size="sm" variant="outline" className="mt-3 rounded-full" onClick={() => void loadUsers()}>
                  Retry
                </Button>
              </div>
            ) : (
              <div className="p-8 text-center text-xs italic text-muted-foreground">
                {visibleUsers.length === 0 ? "No active colleagues available" : "No colleagues match your search"}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className={cn("relative min-w-0 flex-1 flex-col bg-[hsl(var(--comm-page))]", isSidebarOpen ? "hidden md:flex" : "flex")}>
        {activeChatUserId ? (
          <>
            <header className="z-[var(--z-sticky)] flex min-w-0 items-center justify-between gap-2 border-b border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-panel-elevated))] px-3 py-3 shadow-sm backdrop-blur-xl sm:px-5">
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <Button variant="ghost" size="icon" className="-ml-2 h-11 w-11 rounded-full md:hidden" onClick={() => setIsSidebarOpen(!isSidebarOpen)} aria-label="Back to conversations"><Users className="h-5 w-5" /></Button>
                <div className="relative">
                  <Avatar className="h-11 w-11 border-2 border-primary/10">
                    <AvatarImage src={resolveAvatarUrl(activeUser?.avatar_url)} alt={formatUserName(activeUser)} />
                    <AvatarFallback className="bg-primary/5 font-bold text-primary">{(activeUser?.first_name?.[0] || activeUser?.email?.[0] || "?").toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className={cn("absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background", activeUser?.online ? "bg-green-500" : "bg-slate-400")} />
                </div>
                <div>
                  <h3 className="text-base font-bold leading-tight text-foreground">{formatUserName(activeUser)}</h3>
                  <p className="text-[11px] font-medium text-primary/70">{activeUserPresenceLabel}<span className="mx-1 text-muted-foreground/60">/</span>{activeUser?.designation || activeUser?.role}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full text-primary/80 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/30" title="Select call participants" aria-label="Select call participants"><Users className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Add colleagues to this call</div>
                    <DropdownMenuSeparator />
                    {visibleUsers.filter(user => user.id !== activeChatUserId).slice(0, 12).map(user => (
                      <DropdownMenuItem key={user.id} onSelect={(event) => event.preventDefault()} className="gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={selectedCallParticipantIds.includes(user.id)}
                          onChange={(event) => setSelectedCallParticipantIds(current => event.target.checked ? [...current, user.id] : current.filter(id => id !== user.id))}
                        />
                        <span className="truncate text-sm">{formatUserName(user)}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full text-primary/80 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/30" onClick={() => void startOutgoingCall("audio")} title={selectedCallTargets.length > 1 ? "Start group phone call" : "Start phone call"} aria-label={selectedCallTargets.length > 1 ? "Start group phone call" : "Start phone call"}><Phone className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full text-primary/80 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/30" onClick={() => void startOutgoingCall("video")} title={selectedCallTargets.length > 1 ? "Start group video call" : "Start video call"} aria-label={selectedCallTargets.length > 1 ? "Start group video call" : "Start video call"}><Video className="h-4 w-4" /></Button>
                {onClose && <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full text-muted-foreground hover:bg-red-50 hover:text-red-500"><X className="h-5 w-5" /></Button>}
              </div>
            </header>

            {incomingCall && !activeCall && (
              <div className="call-panel mx-3 mt-3 overflow-hidden rounded-xl border border-[hsl(var(--comm-border-strong))] p-4 shadow-lg sm:mx-6 sm:mt-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="call-avatar-ring flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-riana">
                      {incomingCall.call_type === "video" ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground">Incoming {incomingCall.call_type === "video" ? "video" : "phone"} call</p>
                      <p className="truncate text-xs text-muted-foreground">{incomingCall.sender_first_name || "A colleague"} is calling you</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="rounded-full px-4 shadow-riana" onClick={() => void acceptIncomingCall()}><Phone className="mr-2 h-4 w-4" />Answer</Button>
                    <Button size="sm" variant="outline" className="rounded-full" onClick={silenceIncomingCall}><BellOff className="mr-2 h-4 w-4" />Silence</Button>
                    <Button size="sm" variant="destructive" className="rounded-full px-4" onClick={() => void declineIncomingCall()}><PhoneOff className="mr-2 h-4 w-4" />Decline</Button>
                  </div>
                </div>
              </div>
            )}

            {activeCall && (
              <div className="call-panel mx-3 mt-3 rounded-xl border border-[hsl(var(--comm-border-strong))] p-4 shadow-lg sm:mx-6 sm:mt-4">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3 text-sm font-semibold">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      {activeCall.call_type === "video" ? <Video className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-foreground">{activeCallLabel}</p>
                      <p className="text-[11px] font-medium text-muted-foreground">Secure team call</p>
                    </div>
                    <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 capitalize">{activeCall.call_status || "ringing"}</Badge>
                  </div>
                  <Button size="sm" variant="destructive" className="rounded-full px-4" onClick={() => void hangUpCall()}><PhoneOff className="mr-2 h-4 w-4" />Hang up</Button>
                </div>
                {callError && <p className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{callError}</p>}
                <div className="grid gap-3 sm:grid-cols-2" aria-label="Active call media">
                  <div className="min-h-32 rounded-xl border border-white/10 bg-background/60 p-2 shadow-inner">
                    {activeCall.call_type === "video" ? <video ref={localVideoRef} autoPlay muted playsInline className="aspect-video h-auto max-h-64 w-full rounded-lg bg-black object-cover" /> : <div className="flex h-36 items-center justify-center gap-3 rounded-lg bg-muted/60 text-sm font-medium text-muted-foreground"><Mic className="h-5 w-5 text-primary" /> Your microphone is active</div>}
                  </div>
                  <div className="min-h-32 rounded-xl border border-white/10 bg-background/60 p-2 shadow-inner">
                    {activeCall.call_type === "video" ? <div className="relative"><video ref={remoteVideoRef} autoPlay playsInline className="aspect-video h-auto max-h-64 w-full rounded-lg bg-black object-cover" />{!remoteStream && <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/55 text-xs font-semibold text-white">Waiting for live video</div>}</div> : <div className="flex h-36 items-center justify-center gap-3 rounded-lg bg-muted/60 text-sm font-medium text-muted-foreground"><MonitorUp className="h-5 w-5 text-primary" /> Waiting for remote audio</div>}
                    <audio ref={remoteAudioRef} autoPlay />
                  </div>
                </div>
              </div>
            )}

            <ScrollArea className="min-h-0 flex-1 scroll-smooth px-3 sm:px-6">
              <div className="space-y-5 py-5">
                {displayMessages.length === 0 && (
                  <div className="flex min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed bg-background/60 px-6 text-center text-muted-foreground">
                    <MessageSquare className="mb-3 h-9 w-9 text-primary/60" />
                    <p className="text-sm font-semibold text-foreground">No messages yet</p>
                    <p className="mt-1 max-w-sm text-xs">Start the conversation with {formatUserName(activeUser)}.</p>
                  </div>
                )}
                {displayMessages.map((msg, index) => {
                  const isMe = msg.sender_id === currentUser.id;
                  const prevMsg = displayMessages[index - 1];
                  const messageText = msg.is_deleted_for_everyone || msg.message_kind === "call" ? "" : stripHostedPlaceholderLines(msg.content);
                  const showDate = !prevMsg || format(new Date(msg.created_at), "yyyy-MM-dd") !== format(new Date(prevMsg.created_at), "yyyy-MM-dd");
                  return (
                    <div key={msg.id} className="space-y-4">
                      {showDate && <div className="my-6 flex justify-center"><span className="rounded-full border border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-panel-elevated))] px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground shadow-sm">{formatDateSeparator(msg.created_at)}</span></div>}
                      <div className={cn("flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300", isMe ? "justify-end" : "justify-start")}>
                        {!isMe && <Avatar className="chat-message-avatar mr-2 mt-auto h-9 w-9"><AvatarImage src={resolveAvatarUrl(getSenderAvatarUrl(msg))} alt={formatUserName({ first_name: msg.sender_first_name, last_name: msg.sender_last_name })} /><AvatarFallback className="chat-message-avatar-fallback text-[11px] font-bold">{(msg.sender_first_name?.[0] || msg.sender_last_name?.[0] || "?").toUpperCase()}</AvatarFallback></Avatar>}
                        <div className={cn("group relative max-w-[min(88%,38rem)] px-3 py-2.5 shadow-sm transition-all hover:shadow-md sm:px-4 sm:py-3", isMe ? "chat-bubble-me text-white" : "chat-bubble-other text-card-foreground")}>
                          {msg.reply_to_message_id && <div className={cn("mb-2 rounded-md border-l-2 px-2 py-1 text-xs", isMe ? "border-white/50 bg-white/10 text-white/80" : "border-primary/40 bg-muted text-muted-foreground")}><span className="font-semibold">{msg.reply_sender_first_name || "Reply"}: </span>{msg.reply_attachment_file_name || stripHostedPlaceholderLines(msg.reply_content) || "Original message"}</div>}
                          {msg.is_deleted_for_everyone ? <p className={cn("whitespace-pre-wrap break-words text-[14px] italic leading-relaxed", isMe ? "text-white/80" : "text-muted-foreground")}>This message was deleted.</p> : msg.message_kind === "call" ? renderCallMessage(msg, isMe) : messageText ? <p className="whitespace-pre-wrap break-words text-[14px] font-medium leading-relaxed">{messageText}</p> : null}
                          {Boolean(msg.is_edited) && !Boolean(msg.is_deleted_for_everyone) && <p className={cn("mt-1 text-[10px] italic", isMe ? "text-white/70" : "text-muted-foreground")}>Edited</p>}
                          {renderAttachment(msg, isMe)}
                          {renderReactionBar(msg, isMe)}
                          <div className={cn("mt-1.5 flex items-center justify-end gap-1.5 text-[10px]", isMe ? "text-white/80" : "text-muted-foreground")}>
                            <div className="mr-auto">{renderMessageActions(msg, isMe)}</div>
                            {format(new Date(msg.created_at), "h:mm a")}
                            {isMe && (msg.is_read ? <CheckCheck className="h-3.5 w-3.5 text-blue-200" /> : <Check className="h-3.5 w-3.5" />)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={scrollRef} className="h-4 sm:h-6" />
              </div>
            </ScrollArea>

            <div className="chat-composer border-t border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-panel-elevated))] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_30px_rgba(15,108,117,0.08)] backdrop-blur-xl sm:p-4">
              {editingMessage && <div className="mb-3 flex items-center justify-between rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs"><div className="min-w-0"><p className="font-semibold text-foreground">Editing message</p><p className="truncate text-muted-foreground">{editingMessage.content}</p></div><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingMessage(null); setInputText(""); }} aria-label="Cancel editing"><X className="h-4 w-4" /></Button></div>}
              {replyingTo && !editingMessage && <div className="mb-3 flex items-center justify-between rounded-lg border border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-surface))] px-3 py-2 text-xs"><div className="min-w-0"><p className="font-semibold text-foreground">Replying to {replyingTo.sender_id === currentUser.id ? "your message" : replyingTo.sender_first_name || "message"}</p><p className="truncate text-muted-foreground">{replyingTo.attachment_file_name || stripHostedPlaceholderLines(replyingTo.content) || replyingTo.message_kind}</p></div><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setReplyingTo(null)} aria-label="Cancel reply"><X className="h-4 w-4" /></Button></div>}
              {selectedFile && <div className="mb-3 flex items-center justify-between rounded-lg border border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-surface))] px-3 py-2 text-xs"><div className="flex min-w-0 items-center gap-2"><Paperclip className="h-4 w-4 shrink-0 text-primary" /><span className="truncate font-medium text-foreground">{selectedFile.name}</span><span className="shrink-0 text-muted-foreground">{formatFileSize(selectedFile.size)}</span></div><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedFile(null)} aria-label="Remove attachment"><X className="h-4 w-4" /></Button></div>}
              <form onSubmit={handleSend} className="flex items-end gap-1.5 sm:gap-2">
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/csv,.docx,.xlsx,.pptx" />
                <Button type="button" variant="outline" size="icon" className="chat-composer-tool h-11 w-11 shrink-0 rounded-full" onClick={() => fileInputRef.current?.click()} title="Attach file" aria-label="Attach file" disabled={Boolean(editingMessage)}><Paperclip className="h-4 w-4" /></Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="icon" className="chat-composer-tool h-11 w-11 shrink-0 rounded-full" title="Insert emoji" aria-label="Insert emoji"><SmilePlus className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="grid w-56 grid-cols-6 gap-1 p-2">
                    {EMOJI_SHORTCUTS.map((emoji) => (
                      <button key={emoji} type="button" className="flex h-9 w-9 items-center justify-center rounded-md text-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => setInputText(current => `${current}${emoji}`)} aria-label={`Insert ${emoji}`}>{emoji}</button>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="chat-composer-input min-w-0 flex-1 rounded-xl p-1 transition-all focus-within:ring-4 focus-within:ring-primary/20">
                  <Textarea placeholder="Write a message..." value={inputText} onKeyDown={handleComposerKeyDown} onChange={(event) => { const nextValue = event.target.value; setInputText(nextValue); if (!activeChatUserId || activeChatUserId === currentUser.id) return; if (!inputText && nextValue) void setTyping(activeChatUserId, true); if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current); typingTimerRef.current = window.setTimeout(() => void setTyping(activeChatUserId, false), 1200); }} onBlur={() => activeChatUserId && activeChatUserId !== currentUser.id && void setTyping(activeChatUserId, false)} className="max-h-32 min-h-11 resize-none border-none bg-transparent px-3 py-2.5 text-sm font-medium text-foreground shadow-none placeholder:text-[hsl(var(--comm-placeholder))] focus-visible:ring-0 focus-visible:ring-offset-0" aria-label="Message text" autoFocus />
                </div>
                <Button type="submit" size="icon" className="chat-composer-send h-11 w-11 flex-shrink-0 rounded-full gradient-primary shadow-riana transition-transform hover:scale-105 active:scale-95" disabled={isSending || activeChatUserId === currentUser.id || (!inputText.trim() && !selectedFile)} aria-label={editingMessage ? "Save edited message" : "Send message"}>{isSending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send className="h-4 w-4" />}</Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex flex-1 select-none flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <div className="mb-8 flex h-28 w-28 rotate-3 items-center justify-center rounded-[2rem] bg-gradient-to-br from-primary/20 to-primary/5 shadow-inner"><div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white text-primary shadow-riana dark:bg-slate-800"><MessageSquare className="h-10 w-10 fill-current opacity-80" /></div></div>
            <h3 className="text-2xl font-black tracking-tight text-foreground">RIANA Instant Messaging</h3>
            <p className="mt-3 max-w-xs text-sm leading-relaxed opacity-60">Send secure messages, attachments, replies, and start audio or video calls with your team.</p>
            <Button className="mt-10 flex items-center gap-2 rounded-2xl bg-primary px-8 py-6 font-bold text-white shadow-riana hover:bg-primary/90" onClick={() => setIsSidebarOpen(true)}><Users className="h-5 w-5" /> Browse Colleagues</Button>
          </div>
        )}
      </div>
    </div>
  );
};
