import { useCallback, useEffect, useRef, useState } from "react";
import { User } from "@/types";
import { ChatMessage, CallRecordingItem, getCallRecordingMediaUrl, getChatAttachmentUrl, useChat } from "@/hooks/useChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { X, Send, Check, CheckCheck, Search, Users, UserPlus, MessageSquare, Phone, Video, VideoOff, Paperclip, Download, Image as ImageIcon, FileText, Reply, PhoneOff, Mic, MicOff, MonitorUp, MoreVertical, MoreHorizontal, RotateCw, FlipHorizontal, Copy, SmilePlus, Edit3, Trash2, BellOff, ScreenShare, ScreenShareOff, LayoutGrid, PanelTop, Settings2, Maximize2, Minimize2, Minus, Hand, Pin, PinOff, PictureInPicture2, ChevronLeft, ChevronRight, CircleDot, Square, Film, Play, Upload, ShieldAlert, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { resolveAvatarUrl } from "@/utils/avatar";
import { isHostedPlaceholderMessage, stripHostedPlaceholderLines } from "@/utils/chatMessageVisibility";
import { useToast } from "@/hooks/use-toast";
import { playCallHangupSound, playCallPickupSound, playCallRingSound } from "@/utils/notificationSound";
import { CALL_VIDEO_BACKGROUND_OPTIONS, createCallVideoBackground, createRotatedVideoTrack, type CallVideoBackground } from "@/utils/callVideoBackground";
import { startCallRecordingSession, type CallRecordingSession } from "@/utils/callRecordingComposer";

const formatRecordingDuration = (seconds?: number | null) => {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

interface ChatModuleProps {
  currentUser: User;
  chat: ReturnType<typeof useChat>;
  onClose?: () => void;
  onMinimize?: () => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
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
const EMOJI_SHORTCUTS = ["\u{1F600}", "\u{1F602}", "\u{1F60D}", "\u{1F44D}", "\u{1F64F}", "\u{1F389}", "\u2705", "\u{1F525}", "\u2764\uFE0F", "\u{1F622}", "\u{1F62E}", "\u{1F621}"];
const REACTION_OPTIONS = [
  { type: "like", label: "Like", icon: "\u{1F44D}" },
  { type: "love", label: "Love", icon: "\u2764\uFE0F" },
  { type: "laugh", label: "Laugh", icon: "\u{1F602}" },
  { type: "wow", label: "Wow", icon: "\u{1F62E}" },
  { type: "sad", label: "Sad", icon: "\u{1F622}" },
  { type: "angry", label: "Angry", icon: "\u{1F621}" },
];
const MEETING_REACTIONS = [
  "\u{1F44D}",
  "\u2764\uFE0F",
  "\u{1F44F}",
  "\u{1F602}",
  "\u{1F389}",
  "\u{1F60A}",
] as const;
type MeetingReaction = { id: string; userId: string; emoji: string; expiresAt: number };

type SinkSelectableMediaElement = HTMLMediaElement & { setSinkId?: (deviceId: string) => Promise<void> };

const RemoteCallMedia = ({ stream, video, label, avatarUrl, outputDeviceId, videoEnabled, screenSharing, layout }: { stream: MediaStream; video: boolean; label: string; avatarUrl?: string; outputDeviceId: string; videoEnabled?: boolean; screenSharing?: boolean; layout: "gallery" | "speaker" }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [hasLiveVideo, setHasLiveVideo] = useState(() => stream.getVideoTracks().some(track => track.readyState === "live" && track.enabled && !track.muted));

  useEffect(() => {
    const element = video ? videoRef.current : audioRef.current;
    if (!element) return;
    element.srcObject = stream;
    void element.play().then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true));
    return () => { element.srcObject = null; };
  }, [stream, video]);

  useEffect(() => {
    if (!video) return;
    const updateVideoState = () => setHasLiveVideo(stream.getVideoTracks().some(track => track.readyState === "live" && track.enabled && !track.muted));
    const tracks = stream.getVideoTracks();
    updateVideoState();
    tracks.forEach(track => {
      track.addEventListener("mute", updateVideoState);
      track.addEventListener("unmute", updateVideoState);
      track.addEventListener("ended", updateVideoState);
    });
    stream.addEventListener("addtrack", updateVideoState);
    stream.addEventListener("removetrack", updateVideoState);
    return () => {
      tracks.forEach(track => {
        track.removeEventListener("mute", updateVideoState);
        track.removeEventListener("unmute", updateVideoState);
        track.removeEventListener("ended", updateVideoState);
      });
      stream.removeEventListener("addtrack", updateVideoState);
      stream.removeEventListener("removetrack", updateVideoState);
    };
  }, [stream, video]);

  useEffect(() => {
    const element = (video ? videoRef.current : audioRef.current) as SinkSelectableMediaElement | null;
    if (!element?.setSinkId || !outputDeviceId) return;
    void element.setSinkId(outputDeviceId).catch(() => setPlaybackBlocked(true));
  }, [outputDeviceId, video]);

  const resumePlayback = () => {
    const element = video ? videoRef.current : audioRef.current;
    if (element) {
      void element.play()
        .then(() => setPlaybackBlocked(false))
        .catch(() => setPlaybackBlocked(true));
    }
  };

  return <div className="relative h-full w-full">
    {video
      ? <div className={cn("relative h-full w-full overflow-hidden rounded-lg bg-slate-950", screenSharing && "aspect-video")}><video ref={videoRef} autoPlay playsInline aria-label={screenSharing ? `${label} shared screen` : `${label} video`} className={cn("h-full w-full bg-slate-950 object-contain object-center", (!hasLiveVideo || videoEnabled === false) && "invisible")} />{(!hasLiveVideo || videoEnabled === false) && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/95"><Avatar className="h-20 w-20 border-4 border-background shadow-lg"><AvatarImage src={resolveAvatarUrl(avatarUrl)} alt={label} /><AvatarFallback className="bg-primary text-xl font-bold text-primary-foreground">{label.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><span className="text-xs font-semibold text-slate-300">{videoEnabled === false ? "Camera off" : "Video unavailable"}</span></div>}</div>
      : <><audio ref={audioRef} autoPlay aria-label={`${label} audio`} /><div className="flex h-36 items-center justify-center rounded-lg bg-muted/60 text-sm text-muted-foreground">Audio connected</div></>}
    {playbackBlocked && <Button type="button" size="sm" className="absolute inset-x-4 bottom-4" onClick={resumePlayback}>Play {label}&apos;s audio</Button>}
  </div>;
};

export const ChatModule = ({ currentUser, chat, onClose, onMinimize, onToggleFullscreen, isFullscreen = false }: ChatModuleProps) => {
  const {
    messages, users, activeChatUserId, setActiveChatUserId,
    sendMessage, editMessage, setReaction, removeReaction, deleteMessageForMe, deleteMessageForEveryone, setTyping, typingUsers, unreadCounts, isConnected,
    incomingCall, activeCall, callSignals, startCall, updateCallStatus,
    sendCallSignal, clearCallSignals, clearCallState, inviteCallParticipants, cancelCallInvitation, getCallIceServers, onlineUserCount, isLoadingUsers, usersError, loadUsers,
    callRecordings, isLoadingRecordings, loadCallRecordings, startCallRecording, stopCallRecording, failCallRecording, deleteCallRecording,
  } = chat;
  const { toast } = useToast();
  const [inputText, setInputText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [conversationFilter, setConversationFilter] = useState<"all" | "unread" | "online">("all");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [callError, setCallError] = useState<string | null>(null);
  const [selectedCallParticipantIds, setSelectedCallParticipantIds] = useState<string[]>([]);
  const [isRingtoneSilenced, setIsRingtoneSilenced] = useState(false);
  const [isMicrophoneMuted, setIsMicrophoneMuted] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [hasLiveLocalVideo, setHasLiveLocalVideo] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [cameraRotation, setCameraRotation] = useState<0 | 90 | 180 | 270>(() => {
    try {
      const saved = Number(localStorage.getItem("riana_cims_camera_rotation"));
      return saved === 90 || saved === 180 || saved === 270 ? (saved as 0 | 90 | 180 | 270) : 0;
    } catch {
      return 0;
    }
  });
  const cameraRotationRef = useRef<0 | 90 | 180 | 270>(cameraRotation);
  cameraRotationRef.current = cameraRotation;

  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">(() => {
    try {
      const saved = localStorage.getItem("riana_cims_camera_facing");
      return saved === "environment" ? "environment" : "user";
    } catch {
      return "user";
    }
  });
  const cameraFacingModeRef = useRef<"user" | "environment">(cameraFacingMode);
  cameraFacingModeRef.current = cameraFacingMode;

  const [callVideoBackground, setCallVideoBackground] = useState<CallVideoBackground | "none">("none");
  const [isChangingCallBackground, setIsChangingCallBackground] = useState(false);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [callLayout, setCallLayout] = useState<"gallery" | "speaker">("gallery");
  const [galleryPage, setGalleryPage] = useState(0);
  const [mediaDevices, setMediaDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioInputDeviceId, setAudioInputDeviceId] = useState("");
  const [videoInputDeviceId, setVideoInputDeviceId] = useState("");
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState("");
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [showInvitePanel, setShowInvitePanel] = useState(false);
  const [meetingInviteSearchTerm, setMeetingInviteSearchTerm] = useState("");
  const [meetingInviteSelection, setMeetingInviteSelection] = useState<string[]>([]);
  const [isInvitingParticipants, setIsInvitingParticipants] = useState(false);
  const [isTestingMicrophone, setIsTestingMicrophone] = useState(false);
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [raisedHands, setRaisedHands] = useState<Record<string, boolean>>({});
  const [raisedHandOrder, setRaisedHandOrder] = useState<Record<string, number>>({});
  const [remoteMediaStates, setRemoteMediaStates] = useState<Record<string, { audioEnabled: boolean; videoEnabled: boolean; screenSharing: boolean }>>({});
  const [spotlightParticipantId, setSpotlightParticipantId] = useState<string | null>(null);
  const [pinnedParticipantId, setPinnedParticipantId] = useState<string | null>(null);
  const [isSelfViewPip, setIsSelfViewPip] = useState(false);
  const [pipPosition, setPipPosition] = useState({ left: 62, top: 58 });
  const [mobileMeetingView, setMobileMeetingView] = useState<"gallery" | "participants" | "chat">("gallery");
  const [isDesktopChatOpen, setIsDesktopChatOpen] = useState(false);
  const [isDesktopParticipantsOpen, setIsDesktopParticipantsOpen] = useState(false);
  const [meetingReactions, setMeetingReactions] = useState<MeetingReaction[]>([]);
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState<CallVideoBackground | null>(null);
  const [showRecordingsPanel, setShowRecordingsPanel] = useState(false);
  const [activePlaybackRecording, setActivePlaybackRecording] = useState<CallRecordingItem | null>(null);
  const [isRecordingConfirmOpen, setIsRecordingConfirmOpen] = useState(false);
  const [isStopRecordingConfirmOpen, setIsStopRecordingConfirmOpen] = useState(false);
  const [isLocalRecording, setIsLocalRecording] = useState(false);
  const [isSavingRecording, setIsSavingRecording] = useState(false);
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState(0);
  const recordingSessionRef = useRef<CallRecordingSession | null>(null);
  const activeRecordingIdRef = useRef<string | null>(null);
  const recordingCallIdRef = useRef<string | null>(null);
  const notifiedRecordingCallIdRef = useRef<string | null>(null);
  const customBgInputRef = useRef<HTMLInputElement>(null);
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
  const remoteMediaStatesRef = useRef<Record<string, { audioEnabled: boolean; videoEnabled: boolean; screenSharing: boolean }>>({});
  const activeSpeakerIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const peerRefs = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const sourceCameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const videoBackgroundStopRef = useRef<() => void>(() => undefined);
  const callVideoBackgroundRef = useRef<CallVideoBackground | "none">("none");
  const videoBackgroundRequestRef = useRef(0);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const processedSignalsRef = useRef<Set<string>>(new Set());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const ringtoneTimerRef = useRef<number | null>(null);
  const endLocalCallStateRef = useRef<() => void>(() => undefined);
  const createPeerConnectionRef = useRef<(call: ChatMessage, targetUserId: string) => RTCPeerConnection>(() => {
    throw new Error("Call connection is not initialized.");
  });
  const microphoneTestCleanupRef = useRef<() => void>(() => undefined);
  const lastMeetingReactionAtRef = useRef(0);
  const raisedHandsRef = useRef<Record<string, boolean>>({});
  const screenSharingRef = useRef(false);
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: "stun:stun.l.google.com:19302" }]);
  const iceRestartTimersRef = useRef<Map<string, number>>(new Map());
  const iceRestartAttemptsRef = useRef<Set<string>>(new Set());
  const mediaGalleryRef = useRef<HTMLDivElement>(null);
  const pipDragRef = useRef<{ pointerId: number; startX: number; startY: number; left: number; top: number } | null>(null);
  const attachLocalVideoElement = useCallback((element: HTMLVideoElement | null) => {
    localVideoRef.current = element;
    if (!element) return;
    element.srcObject = localStream;
    if (localStream) void element.play().catch(() => undefined);
  }, [localStream]);

  const visibleUsers = users.filter(user => user.id !== currentUser.id);
  raisedHandsRef.current = raisedHands;
  screenSharingRef.current = isScreenSharing;
  const activeCallId = activeCall?.id;
  const activeUser = visibleUsers.find(u => u.id === activeChatUserId);
  const activeCallParticipantIds = activeCall
    ? Array.from(new Set(Array.isArray(activeCall.call_participants)
      ? activeCall.call_participants.filter(participant => String(participant.status) === "accepted").map(participant => participant.user_id)
      : [activeCall.sender_id, activeCall.receiver_id, ...(activeCall.call_participant_ids || [])].filter(Boolean)))
    : [];
  const activeCallPendingInviteIds = activeCall?.call_participants?.filter(participant => ["invited", "ringing"].includes(String(participant.status))).map(participant => participant.user_id) || [];
  const activeCallOtherParticipants = activeCallParticipantIds.filter(id => id !== currentUser.id);
  const activeCallUsers = activeCallOtherParticipants.map(id => users.find(user => user.id === id)).filter(Boolean) as User[];
  const orderedCallParticipantIds = [...activeCallOtherParticipants].sort((left, right) => {
    if (spotlightParticipantId === left) return -1;
    if (spotlightParticipantId === right) return 1;
    if (pinnedParticipantId === left) return -1;
    if (pinnedParticipantId === right) return 1;
    return 0;
  });
  const activeCallParticipantKey = activeCallParticipantIds.join("|");
  remoteStreamsRef.current = remoteStreams;
  remoteMediaStatesRef.current = remoteMediaStates;
  activeSpeakerIdRef.current = activeSpeakerId;
  const galleryPageSize = 8;
  const canRecordActiveCall = Boolean(
    activeCall && (
      String(activeCall.sender_id) === String(currentUser.id) ||
      ["SuperAdmin", "Admin", "Management", "Teamlead", "super_admin", "admin"].includes(String(currentUser.role || ""))
    ),
  );
  const canCurrentUserRecord = canRecordActiveCall;
  const isCallRecordingActive = Boolean(activeCall?.recording_active || isLocalRecording);
  const isLocalRecordingOwner = Boolean(
    isLocalRecording ||
    (activeCall?.recording_active && String(activeCall.recording_started_by) === String(currentUser.id)) ||
    canRecordActiveCall
  );
  const recordingElapsedSeconds = recordingDurationSeconds;
  const recordingInitiatorLabel = activeCall?.recording_started_by
    ? (String(activeCall.recording_started_by) === String(currentUser.id)
      ? `${formatUserName(currentUser)} (You)`
      : (activeCall.recording_started_by_name || formatUserName(users.find(u => u.id === activeCall.recording_started_by))))
    : formatUserName(currentUser);
  const galleryPageCount = Math.max(1, Math.ceil(orderedCallParticipantIds.length / galleryPageSize));
  const visibleGalleryParticipantIds = orderedCallParticipantIds.slice(galleryPage * galleryPageSize, (galleryPage + 1) * galleryPageSize);
  const totalGalleryTiles = (isSelfViewPip ? 0 : 1) + visibleGalleryParticipantIds.length;
  const isSpeakerViewStage = callLayout === "speaker" && totalGalleryTiles > 1;
  const primarySpeakerTileId = isSpeakerViewStage
    ? (spotlightParticipantId || pinnedParticipantId || (activeSpeakerId && activeSpeakerId !== currentUser.id ? activeSpeakerId : null) || visibleGalleryParticipantIds[0] || currentUser.id)
    : (spotlightParticipantId || pinnedParticipantId || null);
  const adaptiveGalleryGridClass = totalGalleryTiles <= 1
    ? "grid-cols-1 grid-rows-[minmax(0,1fr)] place-items-center"
    : isSpeakerViewStage
      ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 grid-rows-[minmax(0,1fr)_auto] items-stretch"
      : totalGalleryTiles === 2
        ? "grid-cols-1 md:grid-cols-2 auto-rows-fr items-stretch"
        : totalGalleryTiles <= 4
          ? "grid-cols-1 sm:grid-cols-2 auto-rows-fr items-stretch"
          : totalGalleryTiles <= 6
            ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 auto-rows-fr items-stretch"
            : "grid-cols-2 sm:grid-cols-3 auto-rows-fr items-stretch";
  const hasConnectedRemoteStream = Object.values(remoteStreams).some(stream =>
    stream.getTracks().some(track => track.readyState === "live"),
  );
  const isReconnectingCall = Boolean(callError && /reconnect/i.test(callError));
  const rawCallStatus = String(activeCall?.call_status || "ringing").toLowerCase();
  const activeCallDisplayStatus: {
    label: "Calling" | "Ringing" | "Connecting" | "Connected" | "Reconnecting" | "Ended";
    badgeClass: string;
    dotClass: string;
  } = !activeCall || ["ended", "declined", "missed"].includes(rawCallStatus)
    ? { label: "Ended", badgeClass: "border-border bg-muted/60 text-muted-foreground", dotClass: "bg-slate-400" }
    : isReconnectingCall
      ? { label: "Reconnecting", badgeClass: "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300", dotClass: "bg-amber-500 animate-pulse" }
      : hasConnectedRemoteStream
        ? { label: "Connected", badgeClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300", dotClass: "bg-emerald-500" }
        : rawCallStatus === "accepted" || activeCallOtherParticipants.length > 0
          ? { label: "Connecting", badgeClass: "border-primary/40 bg-primary/15 text-primary", dotClass: "bg-primary animate-pulse" }
          : String(activeCall.sender_id) === String(currentUser.id)
            ? { label: "Calling", badgeClass: "border-primary/35 bg-primary/10 text-primary", dotClass: "bg-primary animate-pulse" }
            : { label: "Ringing", badgeClass: "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300", dotClass: "bg-amber-500 animate-pulse" };
  const meetingParticipantIds = activeCall?.call_participants?.map(participant => participant.user_id) || activeCallParticipantIds;
  const meetingParticipants = Array.from(new Set(meetingParticipantIds)).map(userId => {
    const profile = userId === currentUser.id ? currentUser : users.find(user => user.id === userId);
    const participant = activeCall?.call_participants?.find(item => String(item.user_id) === String(userId));
    return { userId, profile, status: participant?.status || "accepted", handRaised: Boolean(raisedHands[userId]), raisedAt: raisedHandOrder[userId] || Number.MAX_SAFE_INTEGER };
  }).sort((left, right) => Number(right.handRaised) - Number(left.handRaised) || left.raisedAt - right.raisedAt || formatUserName(left.profile).localeCompare(formatUserName(right.profile)));
  const activeCallLabel = activeCallOtherParticipants.length > 1
    ? `${activeCall.call_type === "video" ? "Group video" : "Group phone"} call (${activeCallOtherParticipants.length + 1})`
    : `${activeCall?.call_type === "video" ? "Video" : "Phone"} call with ${formatUserName(activeCallUsers[0] || users.find(user => user.id === (activeCallPendingInviteIds[0] || (activeCall?.sender_id === currentUser.id ? activeCall?.receiver_id : activeCall?.sender_id))) || activeUser)}`;
  const selectedCallTargets = activeChatUserId
    ? Array.from(new Set([activeChatUserId, ...selectedCallParticipantIds])).filter(id => id && id !== currentUser.id && visibleUsers.some(user => user.id === id))
    : [];

  const broadcastMeetingEvent = async (signalType: "reaction" | "hand-state", payload: { emoji: string } | { raised: boolean; targetUserId?: string }) => {
    if (!activeCall) return;
    // Engagement events are intentionally best-effort while invitees are still joining.
    // Media/signaling errors remain surfaced through the established call error path.
    await Promise.allSettled(activeCallOtherParticipants.map(participantId => sendCallSignal(activeCall.id, participantId, signalType, payload)));
  };

  const publishLocalMediaState = (call: ChatMessage, participantIds: string[]) => {
    const audioEnabled = Boolean(localStreamRef.current?.getAudioTracks().some(track => track.readyState === "live" && track.enabled));
    const videoEnabled = Boolean(localStreamRef.current?.getVideoTracks().some(track => track.readyState === "live" && track.enabled));
    return Promise.allSettled(participantIds.filter(id => id && id !== currentUser.id).map(id => sendCallSignal(call.id, id, "media-state", { audioEnabled, videoEnabled, screenSharing: screenSharingRef.current })));
  };

  const toggleRaisedHand = () => {
    if (!activeCall) return;
    const raised = !raisedHands[currentUser.id];
    setRaisedHands(current => ({ ...current, [currentUser.id]: raised }));
    setRaisedHandOrder(current => {
      const next = { ...current };
      if (raised) next[currentUser.id] = Date.now();
      else delete next[currentUser.id];
      return next;
    });
    void broadcastMeetingEvent("hand-state", { raised });
  };

  const setMeetingSpotlight = (participantId: string | null) => {
    if (!activeCall || String(activeCall.sender_id) !== String(currentUser.id)) return;
    setSpotlightParticipantId(participantId);
    setGalleryPage(0);
    void Promise.allSettled(activeCallOtherParticipants.map(id => sendCallSignal(activeCall.id, id, "spotlight", { userId: participantId })));
  };

  const handlePipPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isSelfViewPip || !mediaGalleryRef.current) return;
    pipDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, ...pipPosition };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePipPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = pipDragRef.current;
    const bounds = mediaGalleryRef.current?.getBoundingClientRect();
    if (!isSelfViewPip || !drag || drag.pointerId !== event.pointerId || !bounds?.width || !bounds.height) return;
    const left = drag.left + ((event.clientX - drag.startX) / bounds.width) * 100;
    const top = drag.top + ((event.clientY - drag.startY) / bounds.height) * 100;
    setPipPosition({ left: Math.min(64, Math.max(0, left)), top: Math.min(76, Math.max(0, top)) });
  };

  const handleMeetingChatToggle = () => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setMobileMeetingView(current => current === "chat" ? "gallery" : "chat");
      return;
    }
    setIsDesktopChatOpen(current => { const next = !current; if (next) { setIsDesktopParticipantsOpen(false); setShowInvitePanel(false); setShowDeviceSettings(false); } return next; });
  };

  const handleMeetingParticipantsToggle = () => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setMobileMeetingView(current => current === "participants" ? "gallery" : "participants");
      return;
    }
    setIsDesktopParticipantsOpen(current => { const next = !current; if (next) { setIsDesktopChatOpen(false); setShowInvitePanel(false); setShowDeviceSettings(false); setShowRecordingsPanel(false); } return next; });
  };

  useEffect(() => {
    if (!activeCallId) {
      notifiedRecordingCallIdRef.current = null;
      return;
    }
    if (typeof window !== "undefined" && window.innerWidth < 1280) {
      setIsSidebarOpen(false);
    }
  }, [activeCallId]);

  useEffect(() => {
    if (
      activeCall?.id &&
      activeCall.recording_active &&
      !isLocalRecording &&
      String(activeCall.recording_started_by) !== String(currentUser.id) &&
      notifiedRecordingCallIdRef.current !== activeCall.id
    ) {
      notifiedRecordingCallIdRef.current = activeCall.id;
      toast({
        title: "Meeting recording in progress",
        description: `This meeting is being recorded by ${activeCall.recording_started_by_name || "the meeting host"}.`,
      });
    }
  }, [activeCall?.id, activeCall?.recording_active, activeCall?.recording_started_by, activeCall?.recording_started_by_name, currentUser.id, isLocalRecording, toast]);

  useEffect(() => {
    if (!isCallRecordingActive) {
      setRecordingDurationSeconds(0);
      return;
    }
    const computeElapsed = () => {
      if (recordingSessionRef.current) {
        return recordingSessionRef.current.getDurationSeconds();
      }
      if (activeCall?.recording_started_at) {
        const startMs = new Date(activeCall.recording_started_at).getTime();
        if (Number.isFinite(startMs)) {
          return Math.max(1, Math.round((Date.now() - startMs) / 1000));
        }
      }
      return 1;
    };
    setRecordingDurationSeconds(computeElapsed());
    const timer = window.setInterval(() => {
      setRecordingDurationSeconds(computeElapsed());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isCallRecordingActive, activeCall?.recording_started_at]);

  const handleStartRecordingConfirmed = async () => {
    if (!activeCall || !canRecordActiveCall || isLocalRecording || isSavingRecording) return;
    setIsRecordingConfirmOpen(false);
    try {
      const serverSession = await startCallRecording(activeCall.id);
      activeRecordingIdRef.current = serverSession.id;
      recordingCallIdRef.current = activeCall.id;
      const composer = startCallRecordingSession(() => {
        const localSource = {
          id: currentUser.id,
          name: formatUserName(currentUser),
          stream: localStreamRef.current,
          videoEnabled: Boolean(localStreamRef.current?.getVideoTracks().some(t => t.readyState === "live" && t.enabled)),
          audioEnabled: Boolean(localStreamRef.current?.getAudioTracks().some(t => t.readyState === "live" && t.enabled)),
          isScreenSharing: screenSharingRef.current,
          isActiveSpeaker: false,
          isLocal: true,
        };
        const remoteSources = Object.entries(remoteStreamsRef.current).map(([participantId, stream]) => {
          const participantUser = users.find(u => u.id === participantId);
          const mediaState = remoteMediaStatesRef.current[participantId];
          return {
            id: participantId,
            name: formatUserName(participantUser),
            stream,
            videoEnabled: mediaState?.videoEnabled !== false && stream.getVideoTracks().some(t => t.readyState === "live" && t.enabled),
            audioEnabled: mediaState?.audioEnabled !== false && stream.getAudioTracks().some(t => t.readyState === "live" && t.enabled),
            isScreenSharing: Boolean(mediaState?.screenSharing),
            isActiveSpeaker: activeSpeakerIdRef.current === participantId,
            isLocal: false,
          };
        });
        return [localSource, ...remoteSources];
      });
      recordingSessionRef.current = composer;
      setIsLocalRecording(true);
      void Promise.allSettled(
        activeCallOtherParticipants.map(participantId =>
          sendCallSignal(activeCall.id, participantId, "recording-state", {
            active: true,
            recordingId: serverSession.id,
            startedBy: currentUser.id,
            startedByName: formatUserName(currentUser),
            startedAt: serverSession.started_at,
          }),
        ),
      );
      toast({
        title: "Meeting recording started",
        description: "All participants have been notified. Recording indicators are excluded from the saved video.",
      });
    } catch (error) {
      if (activeRecordingIdRef.current && activeCall) {
        void failCallRecording(activeCall.id, activeRecordingIdRef.current);
      }
      activeRecordingIdRef.current = null;
      recordingCallIdRef.current = null;
      recordingSessionRef.current?.cancel();
      recordingSessionRef.current = null;
      setIsLocalRecording(false);
      toast({
        title: "Recording could not start",
        description: error instanceof Error ? error.message : "Unable to start meeting recording.",
        variant: "destructive",
      });
    }
  };

  const finalizeActiveRecording = async (callIdToSave: string) => {
    const composer = recordingSessionRef.current;
    const recordingId = activeRecordingIdRef.current || activeCall?.recording_id;
    if (!composer || !recordingId) return;
    recordingSessionRef.current = null;
    activeRecordingIdRef.current = null;
    recordingCallIdRef.current = null;
    setIsLocalRecording(false);
    setIsSavingRecording(true);
    try {
      const completed = await composer.stop();
      const saved = await stopCallRecording(
        callIdToSave,
        recordingId,
        completed.blob,
        completed.mimeType,
        completed.durationSeconds,
      );
      void Promise.allSettled(
        activeCallOtherParticipants.map(participantId =>
          sendCallSignal(callIdToSave, participantId, "recording-state", {
            active: false,
            recordingId: null,
          }),
        ),
      );
      toast({
        title: "Meeting recording saved",
        description: `${saved.file_name || "Recording"} (${formatRecordingDuration(saved.duration_seconds)}) is now available in Recordings.`,
      });
    } catch (error) {
      void failCallRecording(callIdToSave, recordingId);
      toast({
        title: "Recording failed to save",
        description: error instanceof Error ? error.message : "An error occurred while saving the recording.",
        variant: "destructive",
      });
    } finally {
      setIsSavingRecording(false);
    }
  };

  const handleStopRecordingConfirmed = async () => {
    setIsStopRecordingConfirmOpen(false);
    if (!activeCall) return;
    await finalizeActiveRecording(activeCall.id);
  };

  const handleCustomBackgroundFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 8 * 1024 * 1024) {
      toast({ title: "Invalid background image", description: "Select an image file under 8 MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "") as CallVideoBackground;
      if (dataUrl.startsWith("data:image/")) {
        setCustomBackgroundUrl(dataUrl);
        void changeCallVideoBackground(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const _unusedClose = () => {
  };

  const lowerRaisedHand = (userId: string) => {
    if (!activeCall || String(activeCall.sender_id) !== String(currentUser.id)) return;
    setRaisedHands(current => ({ ...current, [userId]: false }));
    setRaisedHandOrder(current => { const next = { ...current }; delete next[userId]; return next; });
    void broadcastMeetingEvent("hand-state", { raised: false, targetUserId: userId });
  };

  const sendMeetingReaction = (emoji: typeof MEETING_REACTIONS[number]) => {
    if (!activeCall) return;
    const now = Date.now();
    if (now - lastMeetingReactionAtRef.current < 800) return;
    lastMeetingReactionAtRef.current = now;
    const reaction: MeetingReaction = { id: crypto.randomUUID(), userId: currentUser.id, emoji, expiresAt: now + 5000 };
    setMeetingReactions(current => [...current.slice(-7), reaction]);
    void broadcastMeetingEvent("reaction", { emoji });
  };

  const filteredUsers = visibleUsers.filter(u => {
    const fullName = `${u.first_name || ""} ${u.last_name || ""}`.trim().toLowerCase();
    const email = (u.email || "").toLowerCase();
    const search = searchTerm.toLowerCase();
    const matchesSearch = fullName.includes(search) || email.includes(search);
    if (!matchesSearch) return false;
    if (conversationFilter === "unread") return (unreadCounts[u.id] || 0) > 0;
    if (conversationFilter === "online") return Boolean(u.online);
    return true;
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
    videoBackgroundRequestRef.current += 1;
    screenStreamRef.current?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    videoBackgroundStopRef.current();
    videoBackgroundStopRef.current = () => undefined;
    if (sourceCameraTrackRef.current) {
      sourceCameraTrackRef.current.onended = null;
      sourceCameraTrackRef.current.stop();
      sourceCameraTrackRef.current = null;
    }
    localStreamRef.current?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    screenStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams({});
    localStreamRef.current = null;
    callVideoBackgroundRef.current = "none";
    setCallVideoBackground("none");
    setIsChangingCallBackground(false);
    setIsScreenSharing(false);
    setIsMicrophoneMuted(false);
    setIsCameraEnabled(true);
  };

  const stopRingtone = () => {
    if (ringtoneTimerRef.current) window.clearInterval(ringtoneTimerRef.current);
    ringtoneTimerRef.current = null;
  };

  const closePeer = () => {
    iceRestartTimersRef.current.forEach(timer => window.clearTimeout(timer));
    iceRestartTimersRef.current.clear();
    iceRestartAttemptsRef.current.clear();
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
  endLocalCallStateRef.current = endLocalCallState;

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
    const connection = new RTCPeerConnection({ iceServers: iceServersRef.current });
    connection.onicecandidate = event => {
      if (event.candidate) void sendCallSignal(call.id, targetUserId, "ice-candidate", event.candidate.toJSON());
    };
    connection.ontrack = event => {
      const [eventStream] = event.streams;
      setRemoteStreams(previous => {
        const stream = eventStream || previous[targetUserId] || new MediaStream();
        if (!stream.getTracks().some(track => track.id === event.track.id)) stream.addTrack(event.track);
        return { ...previous, [targetUserId]: stream };
      });
    };
    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      if (state === "failed" || state === "disconnected") {
        setCallError(state === "failed" ? "Call connection failed. Trying to reconnect…" : "Connection interrupted. Trying to reconnect…");
        const existingTimer = iceRestartTimersRef.current.get(targetUserId);
        if (existingTimer) window.clearTimeout(existingTimer);
        const timer = window.setTimeout(() => {
          if (connection.connectionState === "closed" || iceRestartAttemptsRef.current.has(targetUserId)) return;
          iceRestartAttemptsRef.current.add(targetUserId);
          void getCallIceServers().then(servers => {
            if (servers.length) {
              iceServersRef.current = servers;
              connection.setConfiguration({ iceServers: servers });
            }
            return connection.createOffer({ iceRestart: true });
          }).then(async offer => {
            await connection.setLocalDescription(offer);
            await sendCallSignal(call.id, targetUserId, "offer", connection.localDescription || offer);
          }).catch(() => setCallError("Unable to reconnect this participant. Check the network and try rejoining."));
        }, state === "failed" ? 300 : 1800);
        iceRestartTimersRef.current.set(targetUserId, timer);
      } else if (state === "connected") {
        const timer = iceRestartTimersRef.current.get(targetUserId);
        if (timer) window.clearTimeout(timer);
        iceRestartTimersRef.current.delete(targetUserId);
        iceRestartAttemptsRef.current.delete(targetUserId);
        setCallError(null);
        if (localStreamRef.current) void publishLocalMediaState(call, [targetUserId]);
        if (raisedHandsRef.current[currentUser.id]) void sendCallSignal(call.id, targetUserId, "hand-state", { raised: true });
        if (String(call.sender_id) === String(currentUser.id)) void sendCallSignal(call.id, targetUserId, "spotlight", { userId: spotlightParticipantId });
        if (recordingSessionRef.current && activeRecordingIdRef.current) {
          void sendCallSignal(call.id, targetUserId, "recording-state", {
            active: true,
            recordingId: activeRecordingIdRef.current,
            startedBy: currentUser.id,
            startedByName: formatUserName(currentUser),
            startedAt: call.recording_started_at || new Date().toISOString(),
          });
        }
      }
    };
    peerRefs.current.set(targetUserId, connection);
    if (localStreamRef.current) attachLocalStreamToPeer(connection, localStreamRef.current);
    return connection;
  };
  createPeerConnectionRef.current = createPeerConnection;

  const flushPendingIceCandidates = async (targetUserId: string, connection: RTCPeerConnection) => {
    const pending = pendingIceCandidatesRef.current.get(targetUserId) || [];
    if (!pending.length || !connection.remoteDescription) return;
    pendingIceCandidatesRef.current.delete(targetUserId);
    for (const candidate of pending) {
      await connection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  };

  const createOutgoingVideoTrack = async (sourceTrack: MediaStreamTrack) => {
    const rotation = cameraRotationRef.current;
    if (callVideoBackgroundRef.current === "none") {
      if (rotation === 0) return { track: sourceTrack, stop: () => undefined };
      return createRotatedVideoTrack(sourceTrack, rotation, true);
    }
    return createCallVideoBackground(sourceTrack, callVideoBackgroundRef.current, rotation, true);
  };

  const openMedia = async (withVideo: boolean) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support secure audio/video calling.");
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: audioInputDeviceId ? { exact: audioInputDeviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: { ideal: 1 } },
      video: withVideo ? { ...(videoInputDeviceId ? { deviceId: { exact: videoInputDeviceId } } : { facingMode: { ideal: cameraFacingModeRef.current } }), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } } : false,
    });
    const audioTrack = stream.getAudioTracks()[0];
    const sourceVideoTrack = stream.getVideoTracks()[0];
    sourceCameraTrackRef.current = sourceVideoTrack || null;
    let outgoingVideoTrack = sourceVideoTrack;
    if (sourceVideoTrack) {
      try {
        const processor = await createOutgoingVideoTrack(sourceVideoTrack);
        outgoingVideoTrack = processor.track;
        videoBackgroundStopRef.current = processor.stop;
      } catch {
        callVideoBackgroundRef.current = "none";
        setCallVideoBackground("none");
        setCallError("Background effects could not start on this device. Continuing with your camera.");
      }
    }
    const outgoingStream = new MediaStream([...stream.getAudioTracks(), ...(outgoingVideoTrack ? [outgoingVideoTrack] : [])]);
    localStreamRef.current = outgoingStream;
    setIsMicrophoneMuted(Boolean(audioTrack && !audioTrack.enabled));
    setIsCameraEnabled(Boolean(sourceVideoTrack?.enabled));
    if (audioTrack) {
      audioTrack.onmute = () => setIsMicrophoneMuted(true);
      audioTrack.onunmute = () => setIsMicrophoneMuted(!audioTrack.enabled);
      audioTrack.onended = () => {
        setIsMicrophoneMuted(true);
        setCallError("The selected microphone disconnected. Trying the system default microphone.");
        void replaceLocalDeviceTrack("audio", "").catch(() => setCallError("No working microphone is available. Connect or select another microphone."));
      };
    }
    if (sourceVideoTrack) {
      sourceVideoTrack.onmute = () => setIsCameraEnabled(false);
      sourceVideoTrack.onunmute = () => setIsCameraEnabled(sourceVideoTrack.enabled);
      sourceVideoTrack.onended = () => {
        setIsCameraEnabled(false);
        if (activeCall) void replaceLocalDeviceTrack("video", "").catch(() => setCallError("No working camera is available. Connect or select another camera."));
      };
    }
    peerRefs.current.forEach(connection => attachLocalStreamToPeer(connection, outgoingStream));
    setLocalStream(outgoingStream);
    if (navigator.mediaDevices.enumerateDevices) {
      void navigator.mediaDevices.enumerateDevices().then(setMediaDevices).catch(() => undefined);
    }
    return outgoingStream;
  };

  const replaceLocalDeviceTrack = async (kind: "audio" | "video", deviceId: string, preferredFacing?: "user" | "environment") => {
    if (!activeCall || !navigator.mediaDevices?.getUserMedia) return;
    const requestId = videoBackgroundRequestRef.current;
    const targetFacing = preferredFacing || cameraFacingModeRef.current;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(kind === "audio"
        ? { audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }
        : {
            audio: false,
            video: deviceId
              ? { deviceId: { ideal: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
              : { facingMode: { ideal: targetFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          });
    } catch {
      if (kind === "video") {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: targetFacing },
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
    }
    const sourceReplacement = kind === "audio" ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
    if (!sourceReplacement) throw new Error(`The selected ${kind === "audio" ? "microphone" : "camera"} is unavailable.`);
    if (requestId !== videoBackgroundRequestRef.current) { sourceReplacement.stop(); return; }
    let replacement = sourceReplacement;
    let nextProcessorStop = () => undefined;
    if (kind === "video") {
      sourceReplacement.enabled = isCameraEnabled;
      try {
        const processor = await createOutgoingVideoTrack(sourceReplacement);
        replacement = processor.track;
        nextProcessorStop = processor.stop;
        if (requestId !== videoBackgroundRequestRef.current) {
          processor.stop();
          sourceReplacement.stop();
          return;
        }
      } catch (error) {
        sourceReplacement.stop();
        throw error;
      }
    } else {
      sourceReplacement.enabled = !isMicrophoneMuted;
    }
    const current = kind === "audio" ? localStreamRef.current?.getAudioTracks()[0] : localStreamRef.current?.getVideoTracks()[0];
    const previousCameraSource = kind === "video" ? sourceCameraTrackRef.current : null;
    const replacedProcessorStop = kind === "video" ? videoBackgroundStopRef.current : () => undefined;
    if (!localStreamRef.current) localStreamRef.current = new MediaStream();
    localStreamRef.current.removeTrack(current || sourceReplacement);
    if (kind === "video") sourceCameraTrackRef.current = sourceReplacement;
    localStreamRef.current.addTrack(replacement);
    if (kind !== "video" || !screenSharingRef.current) {
      await Promise.all(Array.from(peerRefs.current.values()).map(async connection => {
        const sender = connection.getSenders().find(item => item.track?.kind === kind);
        if (sender) await sender.replaceTrack(replacement);
      }));
    }
    if (kind === "video") videoBackgroundStopRef.current = nextProcessorStop;
    if (!localStreamRef.current) localStreamRef.current = new MediaStream();
    if (current && current !== sourceCameraTrackRef.current) {
      current.onended = null;
      if (current !== sourceReplacement) current.stop();
    }
    if (kind === "video") {
      replacedProcessorStop();
      if (previousCameraSource && previousCameraSource !== sourceReplacement) {
        previousCameraSource.onended = null;
        previousCameraSource.stop();
      }
    }
    sourceReplacement.onended = () => {
      setCallError(`The selected ${kind === "audio" ? "microphone" : "camera"} disconnected. Trying the system default device.`);
      if (kind === "audio") setIsMicrophoneMuted(true);
      else setIsCameraEnabled(false);
      void replaceLocalDeviceTrack(kind, "").catch(() => setCallError(`No working ${kind === "audio" ? "microphone" : "camera"} is available. Connect or select another device.`));
    };
    if (!screenSharingRef.current) setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    setCallError(null);
  };

  const changeInputDevice = async (kind: "audio" | "video", deviceId: string) => {
    if (kind === "audio") setAudioInputDeviceId(deviceId);
    else setVideoInputDeviceId(deviceId);
    if (!activeCall) return;
    if (kind === "video") setIsChangingCallBackground(true);
    try {
      await replaceLocalDeviceTrack(kind, deviceId);
    } catch (error) {
      setCallError(error instanceof Error ? error.message : "Unable to switch media device.");
    } finally {
      if (kind === "video") setIsChangingCallBackground(false);
    }
  };

  const switchCamera = async () => {
    if (!activeCall || isChangingCallBackground) return;
    const cameras = mediaDevices.filter(device => device.kind === "videoinput");
    const nextFacing = cameraFacingModeRef.current === "user" ? "environment" : "user";
    cameraFacingModeRef.current = nextFacing;
    setCameraFacingMode(nextFacing);
    try {
      localStorage.setItem("riana_cims_camera_facing", nextFacing);
    } catch {
      // Ignore
    }

    if (cameras.length >= 2) {
      const currentId = sourceCameraTrackRef.current?.getSettings().deviceId || videoInputDeviceId;
      const currentIndex = cameras.findIndex(device => device.deviceId === currentId);
      const nextDevice = cameras[(currentIndex + 1 + cameras.length) % cameras.length];
      if (nextDevice) {
        await changeInputDevice("video", nextDevice.deviceId);
        return;
      }
    }

    setIsChangingCallBackground(true);
    try {
      await replaceLocalDeviceTrack("video", "", nextFacing);
    } catch (error) {
      setCallError(error instanceof Error ? error.message : "Unable to switch camera.");
    } finally {
      setIsChangingCallBackground(false);
    }
  };

  const rotateCamera = async () => {
    const nextRotation = ((cameraRotationRef.current + 90) % 360) as 0 | 90 | 180 | 270;
    cameraRotationRef.current = nextRotation;
    setCameraRotation(nextRotation);
    try {
      localStorage.setItem("riana_cims_camera_rotation", String(nextRotation));
    } catch {
      // Ignore
    }

    const sourceTrack = sourceCameraTrackRef.current;
    if (!sourceTrack || !activeCall) return;

    setIsChangingCallBackground(true);
    let preparedProcessor: { track: MediaStreamTrack; stop: () => void } | null = null;
    try {
      preparedProcessor = await createOutgoingVideoTrack(sourceTrack);
      const previousTrack = localStreamRef.current?.getVideoTracks()[0];
      await Promise.all(Array.from(peerRefs.current.values()).map(async connection => {
        const sender = connection.getSenders().find(item => item.track?.kind === "video");
        if (sender) await sender.replaceTrack(preparedProcessor!.track);
      }));
      if (!localStreamRef.current) localStreamRef.current = new MediaStream();
      if (previousTrack) localStreamRef.current.removeTrack(previousTrack);
      localStreamRef.current.addTrack(preparedProcessor.track);
      if (previousTrack && previousTrack !== sourceTrack) previousTrack.stop();
      videoBackgroundStopRef.current();
      videoBackgroundStopRef.current = preparedProcessor.stop;
      preparedProcessor = null;
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      setCallError(null);
    } catch (error) {
      preparedProcessor?.stop();
      setCallError(error instanceof Error ? error.message : "Unable to rotate camera orientation.");
    } finally {
      setIsChangingCallBackground(false);
    }
  };

  const changeCallVideoBackground = async (background: CallVideoBackground | "none") => {
    if (background === callVideoBackgroundRef.current || isChangingCallBackground) return;
    if (isScreenSharing) {
      setCallError("Stop screen sharing before changing your video background.");
      return;
    }
    const sourceTrack = sourceCameraTrackRef.current;
    const previousBackground = callVideoBackgroundRef.current;
    const requestId = ++videoBackgroundRequestRef.current;
    callVideoBackgroundRef.current = background;
    setCallVideoBackground(background);
    if (!sourceTrack) return;
    setIsChangingCallBackground(true);
    let preparedProcessor: { track: MediaStreamTrack; stop: () => void } | null = null;
    try {
      preparedProcessor = background === "none"
        ? (cameraRotationRef.current === 0
            ? { track: sourceTrack, stop: () => undefined }
            : await createRotatedVideoTrack(sourceTrack, cameraRotationRef.current, true))
        : await createCallVideoBackground(sourceTrack, background, cameraRotationRef.current, true);
      if (requestId !== videoBackgroundRequestRef.current || sourceTrack.readyState !== "live") {
        preparedProcessor.stop();
        return;
      }
      const previousTrack = localStreamRef.current?.getVideoTracks()[0];
      await Promise.all(Array.from(peerRefs.current.values()).map(async connection => {
        const sender = connection.getSenders().find(item => item.track?.kind === "video");
        if (sender) await sender.replaceTrack(preparedProcessor!.track);
      }));
      if (!localStreamRef.current) localStreamRef.current = new MediaStream();
      if (previousTrack) localStreamRef.current.removeTrack(previousTrack);
      localStreamRef.current.addTrack(preparedProcessor.track);
      if (previousTrack && previousTrack !== sourceTrack) previousTrack.stop();
      videoBackgroundStopRef.current();
      videoBackgroundStopRef.current = preparedProcessor.stop;
      preparedProcessor = null;
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      setCallError(null);
    } catch (error) {
      preparedProcessor?.stop();
      callVideoBackgroundRef.current = previousBackground;
      setCallVideoBackground(previousBackground);
      const rawMessage = error instanceof Error ? error.message : "Unable to apply the selected background effect.";
      const displayMessage = rawMessage.includes("WebAssembly") || rawMessage.includes("Content Security policy")
        ? "Virtual background requires WebAssembly execution. Please verify your browser security settings or refresh."
        : rawMessage;
      setCallError(displayMessage);
    } finally {
      if (requestId === videoBackgroundRequestRef.current) setIsChangingCallBackground(false);
    }
  };

  const testMicrophone = async () => {
    microphoneTestCleanupRef.current();
    if (isTestingMicrophone) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: audioInputDeviceId ? { exact: audioInputDeviceId } : undefined }, video: false });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const levels = new Uint8Array(analyser.frequencyBinCount);
      const timer = window.setInterval(() => {
        analyser.getByteFrequencyData(levels);
        setMicrophoneLevel(Math.min(100, Math.round((levels.reduce((sum, value) => sum + value, 0) / levels.length) * 1.5)));
      }, 120);
      microphoneTestCleanupRef.current = () => {
        window.clearInterval(timer);
        stream.getTracks().forEach(track => track.stop());
        void context.close();
        setIsTestingMicrophone(false);
        setMicrophoneLevel(0);
      };
      setIsTestingMicrophone(true);
    } catch (error) {
      setCallError(error instanceof Error ? error.message : "Unable to test the microphone.");
    }
  };

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const refreshDevices = () => {
      void navigator.mediaDevices.enumerateDevices().then(devices => {
        setMediaDevices(devices);
        const ids = new Set(devices.map(device => device.deviceId));
        if (audioInputDeviceId && !ids.has(audioInputDeviceId)) setAudioInputDeviceId("");
        if (videoInputDeviceId && !ids.has(videoInputDeviceId)) setVideoInputDeviceId("");
        if (audioOutputDeviceId && !ids.has(audioOutputDeviceId)) setAudioOutputDeviceId("");
      }).catch(() => undefined);
    };
    refreshDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", refreshDevices);
  }, [audioInputDeviceId, audioOutputDeviceId, videoInputDeviceId]);

  useEffect(() => () => microphoneTestCleanupRef.current(), []);

  const toggleMicrophone = () => {
    const tracks = localStreamRef.current?.getAudioTracks() || [];
    if (!tracks.length) return;
    const nextMuted = !isMicrophoneMuted;
    tracks.forEach(track => { track.enabled = !nextMuted; });
    setIsMicrophoneMuted(nextMuted);
    if (activeCall) void publishLocalMediaState(activeCall, activeCallOtherParticipants);
  };

  const toggleCamera = () => {
    const tracks = localStreamRef.current?.getVideoTracks() || [];
    if (!tracks.length) return;
    const nextEnabled = !isCameraEnabled;
    tracks.forEach(track => { track.enabled = nextEnabled; });
    if (sourceCameraTrackRef.current) sourceCameraTrackRef.current.enabled = nextEnabled;
    setIsCameraEnabled(nextEnabled);
    if (activeCall) void publishLocalMediaState(activeCall, activeCallOtherParticipants);
  };

  const stopScreenShare = async () => {
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null;
    await Promise.all(Array.from(peerRefs.current.values()).map(async connection => {
      const sender = connection.getSenders().find(item => item.track?.kind === "video");
      if (sender) await sender.replaceTrack(cameraTrack);
    }));
    screenStreamRef.current?.getTracks().forEach(track => track.stop());
    screenStreamRef.current = null;
    setLocalStream(localStreamRef.current);
    setIsScreenSharing(false);
    screenSharingRef.current = false;
    if (activeCall) void publishLocalMediaState(activeCall, activeCallOtherParticipants);
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setCallError("Screen sharing is not supported by this browser.");
      return;
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) throw new Error("No screen source was selected.");
      await Promise.all(Array.from(peerRefs.current.values()).map(async connection => {
        const sender = connection.getSenders().find(item => item.track?.kind === "video");
        if (sender) await sender.replaceTrack(screenTrack);
      }));
      screenStreamRef.current = displayStream;
      const previewStream = new MediaStream([screenTrack, ...(localStreamRef.current?.getAudioTracks() || [])]);
      setLocalStream(previewStream);
      setIsScreenSharing(true);
      screenSharingRef.current = true;
      if (activeCall) void publishLocalMediaState(activeCall, activeCallOtherParticipants);
      screenTrack.onended = () => { void stopScreenShare(); };
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") return;
      setCallError(error instanceof Error ? error.message : "Unable to share the selected screen.");
    }
  };

  useEffect(() => {
    const handleCallControl = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (action === "microphone") toggleMicrophone();
      else if (action === "camera") toggleCamera();
      else if (action === "hangup") void hangUpCall();
    };
    window.addEventListener("riana-call-control", handleCallControl);
    return () => window.removeEventListener("riana-call-control", handleCallControl);
  });

  useEffect(() => {
    if (!activeCall || Object.keys(remoteStreams).length === 0) {
      setActiveSpeakerId(null);
      return;
    }
    const AudioContextConstructor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor();
    const meters = Object.entries(remoteStreams).flatMap(([participantId, stream]) => {
      if (!stream.getAudioTracks().some(track => track.readyState === "live")) return [];
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      return [{ participantId, analyser, samples: new Uint8Array(analyser.fftSize) }];
    });
    let previousSpeaker: string | null = null;
    const interval = window.setInterval(() => {
      let loudestId: string | null = null;
      let loudestLevel = 0.04;
      meters.forEach(meter => {
        meter.analyser.getByteTimeDomainData(meter.samples);
        const rms = Math.sqrt(meter.samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / meter.samples.length);
        if (rms > loudestLevel) { loudestLevel = rms; loudestId = meter.participantId; }
      });
      if (loudestId && loudestId !== previousSpeaker) {
        previousSpeaker = loudestId;
        setActiveSpeakerId(loudestId);
      }
    }, 350);
    return () => {
      window.clearInterval(interval);
      void context.close();
    };
  }, [activeCall, remoteStreams]);

  useEffect(() => {
    setRaisedHands({});
    setRaisedHandOrder({});
    setMeetingReactions([]);
    setRemoteMediaStates({});
    setSpotlightParticipantId(null);
    setPinnedParticipantId(null);
    setIsSelfViewPip(false);
    setMobileMeetingView("gallery");
    setIsDesktopParticipantsOpen(false); setIsDesktopChatOpen(false);
    setShowInvitePanel(false);
    setMeetingInviteSelection([]);
  }, [activeCall?.id]);

  useEffect(() => {
    setGalleryPage(page => Math.min(page, Math.max(0, Math.ceil(activeCallOtherParticipants.length / galleryPageSize) - 1)));
  }, [activeCallOtherParticipants.length]);

  useEffect(() => {
    if (!activeCall) return;
    const nextHands: Record<string, boolean> = {};
    const nextHandOrder: Record<string, number> = {};
    const nextMediaStates: Record<string, { audioEnabled: boolean; videoEnabled: boolean; screenSharing: boolean }> = {};
    activeCall.call_participants?.forEach(participant => {
      if (participant.hand_raised) {
        nextHands[participant.user_id] = true;
        const raisedAt = participant.hand_raised_at ? new Date(participant.hand_raised_at).getTime() : Date.now();
        nextHandOrder[participant.user_id] = Number.isFinite(raisedAt) ? raisedAt : Date.now();
      }
      if (typeof participant.audio_enabled === "boolean" && typeof participant.video_enabled === "boolean") {
        nextMediaStates[participant.user_id] = { audioEnabled: participant.audio_enabled, videoEnabled: participant.video_enabled, screenSharing: participant.screen_sharing === true };
      }
    });
    setRaisedHands(nextHands);
    setRaisedHandOrder(nextHandOrder);
    setRemoteMediaStates(nextMediaStates);
    setSpotlightParticipantId(activeCall.spotlight_user_id || null);
  }, [activeCall]);

  useEffect(() => {
    if (!activeCallId) return;
    const activeIds = new Set(activeCallParticipantKey ? activeCallParticipantKey.split("|") : []);
    setRaisedHands(current => Object.fromEntries(Object.entries(current).filter(([userId]) => activeIds.has(userId))));
    setRaisedHandOrder(current => Object.fromEntries(Object.entries(current).filter(([userId]) => activeIds.has(userId))));
    setRemoteMediaStates(current => Object.fromEntries(Object.entries(current).filter(([userId]) => activeIds.has(userId))));
    if (spotlightParticipantId && !activeIds.has(spotlightParticipantId)) setSpotlightParticipantId(null);
  }, [activeCallId, activeCallParticipantKey, spotlightParticipantId]);

  useEffect(() => {
    if (!activeCallId) return;
    let disposed = false;
    void getCallIceServers().then(servers => { if (!disposed && servers.length) iceServersRef.current = servers; }).catch(() => undefined);
    return () => { disposed = true; };
  }, [activeCallId, getCallIceServers]);

  useEffect(() => {
    if (meetingReactions.length === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setMeetingReactions(current => current.filter(reaction => reaction.expiresAt > now));
    }, 500);
    return () => window.clearInterval(timer);
  }, [meetingReactions.length]);

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
  }, [localStream, hasLiveLocalVideo, activeCallId]);

  useEffect(() => {
    const updateLocalVideo = () => setHasLiveLocalVideo(Boolean(localStream?.getVideoTracks().some(track => track.readyState === "live" && track.enabled && !track.muted)));
    updateLocalVideo();
    const tracks = localStream?.getVideoTracks() || [];
    tracks.forEach(track => {
      track.addEventListener("mute", updateLocalVideo);
      track.addEventListener("unmute", updateLocalVideo);
      track.addEventListener("ended", updateLocalVideo);
    });
    return () => tracks.forEach(track => {
      track.removeEventListener("mute", updateLocalVideo);
      track.removeEventListener("unmute", updateLocalVideo);
      track.removeEventListener("ended", updateLocalVideo);
    });
  }, [localStream]);

  const incomingCallId = incomingCall?.id;
  const shouldRing = Boolean(incomingCallId && !activeCallId && !isRingtoneSilenced);
  const shouldResetRingtoneSilence = !incomingCallId;
  const shouldEndLocalCall = (!activeCallId && !incomingCallId) || ["ended", "declined", "missed"].includes(String(activeCall?.call_status));

  useEffect(() => {
    if (!shouldRing) {
      stopRingtone();
      return;
    }
    stopRingtone();
    playCallRingSound();
    ringtoneTimerRef.current = window.setInterval(() => playCallRingSound(), 2200);
    return stopRingtone;
  }, [shouldRing]);

  useEffect(() => {
    if (shouldResetRingtoneSilence) setIsRingtoneSilenced(false);
  }, [shouldResetRingtoneSilence]);

  useEffect(() => {
    if (shouldEndLocalCall) endLocalCallStateRef.current();
  }, [shouldEndLocalCall]);

  useEffect(() => {
    const processSignals = async () => {
      const call = activeCall;
      if (!call) return;
      for (const signal of callSignals) {
        const key = signal.signalId || `${signal.callId}:${signal.senderId}:${signal.signalType}:${JSON.stringify(signal.payload).slice(0, 240)}`;
        if (signal.callId !== call.id || processedSignalsRef.current.has(key)) continue;
        processedSignalsRef.current.add(key);
        const targetUserId = signal.senderId;
        if (signal.signalType === "reaction") {
          const emoji = (signal.payload as { emoji?: unknown }).emoji;
          if (typeof emoji === "string" && (MEETING_REACTIONS as readonly string[]).includes(emoji)) {
            setMeetingReactions(current => [...current.slice(-7), { id: signal.signalId || `${targetUserId}-${Date.now()}`, userId: targetUserId, emoji, expiresAt: Date.now() + 5000 }]);
          }
          continue;
        }
        if (signal.signalType === "hand-state") {
          const handPayload = signal.payload as { raised?: unknown; targetUserId?: unknown };
          const raised = handPayload.raised;
          const handUserId = typeof handPayload.targetUserId === "string" ? handPayload.targetUserId : targetUserId;
          if (typeof raised === "boolean") {
            setRaisedHands(current => ({ ...current, [handUserId]: raised }));
            setRaisedHandOrder(current => {
              const next = { ...current };
              if (raised) next[handUserId] = next[handUserId] || Date.now();
              else delete next[handUserId];
              return next;
            });
          }
          continue;
        }
        if (signal.signalType === "media-state") {
          const mediaState = signal.payload as { audioEnabled?: unknown; videoEnabled?: unknown; screenSharing?: unknown };
          if (typeof mediaState.audioEnabled === "boolean" && typeof mediaState.videoEnabled === "boolean" && typeof mediaState.screenSharing === "boolean") {
            setRemoteMediaStates(current => ({ ...current, [targetUserId]: { audioEnabled: mediaState.audioEnabled as boolean, videoEnabled: mediaState.videoEnabled as boolean, screenSharing: mediaState.screenSharing as boolean } }));
          }
          continue;
        }
        if (signal.signalType === "spotlight") {
          const userId = (signal.payload as { userId?: unknown }).userId;
          setSpotlightParticipantId(typeof userId === "string" && activeCallParticipantKey.split("|").includes(userId) ? userId : null);
          continue;
        }
        if (signal.signalType === "recording-state") {
          const recPayload = signal.payload as { active?: unknown; startedByName?: unknown };
          if (recPayload.active === true) {
            toast({ title: "Meeting recording started", description: `${typeof recPayload.startedByName === "string" ? recPayload.startedByName : "A participant"} started recording this meeting.` });
          } else if (recPayload.active === false) {
            toast({ title: "Meeting recording stopped", description: "The meeting recording has been saved." });
            void loadCallRecordings(call.id);
          }
          continue;
        }
        if (signal.signalType === "rejoin") {
          try {
            const connection = createPeerConnectionRef.current(call, targetUserId);
            if (connection.signalingState !== "stable") continue;
            const offer = await connection.createOffer({ iceRestart: Boolean(connection.remoteDescription) });
            await connection.setLocalDescription(offer);
            await sendCallSignal(call.id, targetUserId, "offer", connection.localDescription || offer);
          } catch (error) {
            setCallError(error instanceof Error ? error.message : "Unable to restart a participant connection.");
          }
          continue;
        }
        try {
          const connection = createPeerConnectionRef.current(call, targetUserId);
          if (signal.signalType === "offer") {
            if (connection.signalingState !== "stable") continue;
            await connection.setRemoteDescription(new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit));
            // setRemoteDescription changes state, but TypeScript retains the pre-await narrowing.
            if ((connection.signalingState as RTCSignalingState) !== "have-remote-offer") continue;
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
  }, [activeCall, activeCallParticipantKey, callSignals, sendCallSignal]);

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
      const iceServers = await getCallIceServers();
      if (iceServers.length) iceServersRef.current = iceServers;
      await openMedia(callType === "video");
      const call = await startCall(selectedCallTargets, callType);
      await Promise.all(selectedCallTargets.map(async targetId => {
        const connection = createPeerConnection(call, targetId);
        if (connection.signalingState !== "stable" || connection.localDescription) return;
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await sendCallSignal(call.id, targetId, "offer", connection.localDescription || offer);
      }));
      await publishLocalMediaState(call, selectedCallTargets);
    } catch (error) {
      endLocalCallState();
      clearCallState();
      toast({ title: "Call failed", description: error instanceof Error ? error.message : "Unable to start the call.", variant: "destructive" });
    }
  };

  const inviteSelectedParticipants = async () => {
    if (!activeCall || !meetingInviteSelection.length || isInvitingParticipants) return;
    setIsInvitingParticipants(true);
    try {
      const result = await inviteCallParticipants(activeCall.id, meetingInviteSelection);
      await Promise.all(result.invited_user_ids.map(async targetId => {
        const connection = createPeerConnection(result.call, targetId);
        if (connection.signalingState !== "stable" || connection.localDescription) return;
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await sendCallSignal(result.call.id, targetId, "offer", connection.localDescription || offer);
      }));
      await publishLocalMediaState(result.call, result.invited_user_ids);
      setMeetingInviteSelection([]);
      setShowInvitePanel(false);
      toast({ title: "Invitations sent", description: result.invited_user_ids.length ? `${result.invited_user_ids.length} colleague${result.invited_user_ids.length === 1 ? " was" : "s were"} invited to the meeting.` : "Those colleagues are already invited or in the meeting." });
    } catch (error) {
      toast({ title: "Invitations not sent", description: error instanceof Error ? error.message : "Unable to invite colleagues.", variant: "destructive" });
    } finally {
      setIsInvitingParticipants(false);
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
      await publishLocalMediaState(call, call.call_participant_ids || [call.sender_id]);
      playCallPickupSound();
    } catch (error) {
      endLocalCallState();
      toast({ title: "Unable to answer", description: error instanceof Error ? error.message : "Check microphone/camera permissions.", variant: "destructive" });
    }
  };

  const rejoinCallMedia = async () => {
    if (!activeCall) return;
    try {
      setCallError(null);
      await openMedia(activeCall.call_type === "video");
      const connectedParticipantIds = activeCall.call_participants
        ?.filter(participant => participant.status === "accepted")
        .map(participant => participant.user_id)
        .filter(userId => userId !== currentUser.id) || activeCallOtherParticipants;
      for (const userId of connectedParticipantIds) {
        createPeerConnection(activeCall, userId);
        await sendCallSignal(activeCall.id, userId, "rejoin", {});
      }
      await publishLocalMediaState(activeCall, connectedParticipantIds);
    } catch (error) {
      setCallError(error instanceof Error ? error.message : "Unable to rejoin meeting media.");
      toast({ title: "Unable to reconnect media", description: error instanceof Error ? error.message : "Check your camera and microphone permissions.", variant: "destructive" });
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
    if (callId && recordingSessionRef.current && recordingCallIdRef.current === callId) {
      await finalizeActiveRecording(callId);
    }
    stopRingtone();
    playCallHangupSound();
    clearCallState();
    endLocalCallState();
    if (callId) await updateCallStatus(callId, "ended").catch(() => undefined);
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
                message.my_reaction === reaction.reaction_type ? (isMe ? "border-white/80 bg-white/25 font-semibold text-white" : "border-primary bg-primary/15 font-semibold text-primary") : isMe ? "border-white/20 bg-white/10 text-white/85" : "border-border bg-background text-muted-foreground",
              )}
              title={option?.label || reaction.reaction_type} aria-label={`${option?.label || reaction.reaction_type} (${reaction.count})`}
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
          <a href={downloadUrl} download={message.attachment_file_name || true} target="_blank" rel="noreferrer" className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md", isMe ? "hover:bg-white/15" : "hover:bg-muted") } title="Download attachment" aria-label="Download attachment">
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
      {((message.recordings_count || 0) > 0 || callRecordings.some(rec => (rec.call_message_id === message.id || (rec as unknown as { call_id?: string }).call_id === message.id) && (rec.status === "completed" || rec.status === "saved"))) && (
        <button
          type="button"
          onClick={() => {
            setShowRecordingsPanel(true);
            void loadCallRecordings(message.id);
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors",
            isMe ? "border-white/30 bg-white/20 text-white hover:bg-white/30" : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
          )}
          title="View meeting recording"
        >
          <Film className="h-3 w-3" />
          <span>Recording</span>
        </button>
      )}
    </div>
  );

  return (
    <div className={cn("chat-shell flex h-full min-h-0 w-full max-w-6xl overflow-hidden border border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-surface))] shadow-2xl sm:rounded-2xl", activeCall && "max-w-[1560px]", isFullscreen && "max-w-none rounded-none border-0 sm:rounded-none")}>
      <div className={cn("flex flex-col border-r border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-panel))] backdrop-blur transition-all duration-300", isSidebarOpen ? "w-full md:w-[320px] xl:w-[336px]" : "w-0 overflow-hidden border-r-0")}>
        <div className="space-y-3 border-b border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-panel-elevated))] p-3.5 sm:p-4">
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
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Conversation filters">
            <button
              type="button"
              onClick={() => setConversationFilter("all")}
              aria-pressed={conversationFilter === "all"}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                conversationFilter === "all"
                  ? "bg-primary font-bold text-primary-foreground shadow-sm"
                  : "border border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-surface))] text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              All {visibleUsers.length > 0 ? visibleUsers.length : ""}
            </button>
            <button
              type="button"
              onClick={() => setConversationFilter("unread")}
              aria-pressed={conversationFilter === "unread"}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                conversationFilter === "unread"
                  ? "bg-primary font-bold text-primary-foreground shadow-sm"
                  : "border border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-surface))] text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              Unread {unreadConversationCount}
            </button>
            <button
              type="button"
              onClick={() => setConversationFilter("online")}
              aria-pressed={conversationFilter === "online"}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                conversationFilter === "online"
                  ? "border border-green-500/40 bg-green-600 font-bold text-white shadow-sm"
                  : "border border-green-500/20 bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-300",
              )}
            >
              Online {onlineCount}
            </button>
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
                {visibleUsers.length === 0
                  ? "No active colleagues available"
                  : conversationFilter === "unread"
                    ? "No unread conversations"
                    : conversationFilter === "online"
                      ? "No colleagues are currently online"
                      : "No colleagues match your search"}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className={cn("chat-conversation-surface relative min-w-0 flex-1 flex-col bg-[hsl(var(--comm-page))]", isSidebarOpen ? "hidden md:flex" : "flex", activeCall && (isDesktopChatOpen ? "lg:grid lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)] lg:grid-rows-[auto_minmax(0,1fr)_auto]" : "lg:grid lg:grid-cols-1 lg:grid-rows-[auto_minmax(0,1fr)]"))}>
        {activeChatUserId ? (
          <>
            <header className={cn("z-[var(--z-sticky)] flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-panel-elevated))] px-3 py-2.5 shadow-sm backdrop-blur-xl sm:flex-nowrap sm:gap-2 sm:px-5 sm:py-3", activeCall && "lg:col-span-2 lg:col-start-1 lg:row-start-1")}>
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
                <Button variant="ghost" size="icon" className="-ml-2 h-11 w-11 rounded-full md:hidden" onClick={() => setIsSidebarOpen(!isSidebarOpen)} title="Back to conversations" aria-label="Back to conversations"><Users className="h-5 w-5" /></Button>
                <Button variant="ghost" size="icon" className="hidden h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary md:inline-flex" onClick={() => setIsSidebarOpen(!isSidebarOpen)} title={isSidebarOpen ? "Collapse conversations panel" : "Expand conversations panel"} aria-label={isSidebarOpen ? "Collapse conversations panel" : "Expand conversations panel"}>{isSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}</Button>
                <div className="relative shrink-0">
                  <Avatar className="h-11 w-11 border-2 border-primary/10">
                    <AvatarImage src={resolveAvatarUrl(activeUser?.avatar_url)} alt={formatUserName(activeUser)} />
                    <AvatarFallback className="bg-primary/5 font-bold text-primary">{(activeUser?.first_name?.[0] || activeUser?.email?.[0] || "?").toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className={cn("absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background", activeUser?.online ? "bg-green-500" : "bg-slate-400")} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-bold leading-tight text-foreground sm:text-base">{formatUserName(activeUser)}</h3>
                  <p className="truncate text-[10px] font-medium leading-snug text-primary/70 sm:text-[11px]">{activeUserPresenceLabel}<span className="mx-1 text-muted-foreground/60">/</span>{activeUser?.designation || activeUser?.role}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-primary/80 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/30" title="Select call participants" aria-label="Select call participants"><Users className="h-4 w-4" /></Button>
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
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-primary/80 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/30" onClick={() => void startOutgoingCall("audio")} title={selectedCallTargets.length > 1 ? "Start group phone call" : "Start phone call"} aria-label={selectedCallTargets.length > 1 ? "Start group phone call" : "Start phone call"}><Phone className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-primary/80 hover:bg-primary/10 hover:text-primary focus-visible:ring-primary/30" onClick={() => void startOutgoingCall("video")} title={selectedCallTargets.length > 1 ? "Start group video call" : "Start video call"} aria-label={selectedCallTargets.length > 1 ? "Start group video call" : "Start video call"}><Video className="h-4 w-4" /></Button>
                <Button variant={showRecordingsPanel ? "default" : "ghost"} size="sm" className={cn("h-8 rounded-lg px-2 text-xs", !showRecordingsPanel && "text-primary/80 hover:bg-primary/10 hover:text-primary")} onClick={() => { setShowRecordingsPanel(value => !value); void loadCallRecordings(); }} title="Meeting recordings library" aria-label="Meeting recordings library" aria-pressed={showRecordingsPanel}><Film className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Recordings</span>{callRecordings.length > 0 && <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.2 text-[10px] font-bold">{callRecordings.length}</span>}</Button>
                <span className="mx-1 h-4 w-px bg-[hsl(var(--comm-border))]" aria-hidden="true" />
                {onMinimize && <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary" onClick={onMinimize} title="Minimize messages" aria-label="Minimize messaging window"><Minus className="h-4 w-4" /></Button>}
                {onToggleFullscreen && <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary" onClick={onToggleFullscreen} title={isFullscreen ? "Exit full screen" : "Full screen"} aria-label={isFullscreen ? "Exit full screen messaging" : "Open messaging full screen"} aria-pressed={isFullscreen}>{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>}
                {onClose && <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Close messaging" aria-label="Close messaging"><X className="h-4 w-4" /></Button>}
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
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full border-slate-300 bg-white/95 px-4 text-xs font-semibold text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                      onClick={silenceIncomingCall}
                      title="Silence ringtone"
                      aria-label="Silence incoming call ringtone"
                    >
                      <BellOff className="mr-2 h-4 w-4 text-slate-700 dark:text-slate-200" />
                      Silence
                    </Button>
                    <Button size="sm" variant="destructive" className="rounded-full px-4" onClick={() => void declineIncomingCall()}><PhoneOff className="mr-2 h-4 w-4" />Decline</Button>
                  </div>
                </div>
              </div>
            )}

            {activeCall && (
              <div className="call-panel relative mx-2 my-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[hsl(var(--comm-border-strong))] p-3 shadow-lg sm:mx-3 sm:my-3 lg:col-start-1 lg:row-start-2 lg:row-span-2 lg:m-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2.5 text-sm font-semibold">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {activeCall.call_type === "video" ? <Video className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">{activeCallLabel}</p>
                      <p className="text-[11px] font-medium text-muted-foreground">
                        {activeCallDisplayStatus.label === "Calling" && activeCallPendingInviteIds.length > 0
                          ? `Waiting for ${activeCallPendingInviteIds.length === 1 ? "participant" : `${activeCallPendingInviteIds.length} participants`} to join…`
                          : "Secure enterprise meeting"}
                      </p>
                    </div>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", activeCallDisplayStatus.badgeClass)} role="status" aria-live="polite">
                      <span className={cn("h-2 w-2 rounded-full", activeCallDisplayStatus.dotClass)} />
                      {activeCallDisplayStatus.label}
                    </span>
                    <Badge variant="outline" className="rounded-full border-border bg-muted/40 text-[11px] font-medium">
                      {totalGalleryTiles} {totalGalleryTiles === 1 ? "participant" : "participants"}
                    </Badge>
                    {isCallRecordingActive && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-0.5 text-[11px] font-bold text-red-600 dark:text-red-400" role="status" aria-live="polite">
                        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        REC {formatRecordingDuration(recordingElapsedSeconds)}
                      </span>
                    )}
                    {Object.values(raisedHands).filter(Boolean).length > 0 && <Badge variant="secondary" className="rounded-full"><Hand className="mr-1 h-3 w-3" />{Object.values(raisedHands).filter(Boolean).length} raised</Badge>}
                  </div>
                </div>
                {isCallRecordingActive && (
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-700 dark:text-red-300" role="alert">
                    <div className="flex items-center gap-2 font-medium">
                      <CircleDot className="h-4 w-4 shrink-0 text-red-500 animate-pulse" />
                      <span>
                        <strong>Recording in progress</strong> ({formatRecordingDuration(recordingElapsedSeconds)}) — Started by {activeCall.recording_started_by_name || (String(activeCall.recording_started_by) === String(currentUser.id) ? "you" : "meeting host")}. All participants are notified; this banner is excluded from the saved video file.
                      </span>
                    </div>
                    {isLocalRecordingOwner && (
                      <Button type="button" size="sm" variant="destructive" className="h-7 rounded-md px-2.5 text-[11px]" onClick={() => setIsStopRecordingConfirmOpen(true)} disabled={isSavingRecording}>
                        <Square className="mr-1 h-3 w-3 fill-current" />
                        {isSavingRecording ? "Saving..." : "Stop Recording"}
                      </Button>
                    )}
                  </div>
                )}
                {isRecordingConfirmOpen && (
                  <div className="mb-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs shadow-md" role="dialog" aria-modal="false" aria-labelledby="start-recording-title">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div className="min-w-0 flex-1">
                        <p id="start-recording-title" className="font-bold text-foreground">Start recording this meeting?</p>
                        <p className="mt-0.5 text-muted-foreground">Every participant in this call will be notified that recording has started. Only meeting video, screen sharing, and audio will be captured in the saved recording (live REC badges and banners are excluded).</p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <Button type="button" size="sm" className="h-8 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700" onClick={() => void handleStartRecordingConfirmed()}>
                            <CircleDot className="mr-1.5 h-3.5 w-3.5" />Confirm & Start Recording
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg px-3 text-xs" onClick={() => setIsRecordingConfirmOpen(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {isStopRecordingConfirmOpen && (
                  <div className="mb-2.5 rounded-xl border border-border bg-background/95 p-3 text-xs shadow-md" role="dialog" aria-modal="false" aria-labelledby="stop-recording-title">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p id="stop-recording-title" className="font-bold text-foreground">Stop meeting recording?</p>
                        <p className="text-muted-foreground">The recording will be finalized and saved to the Meeting Recordings library for authorized participants.</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button type="button" size="sm" variant="destructive" className="h-8 rounded-lg px-3 text-xs" onClick={() => void handleStopRecordingConfirmed()} disabled={isSavingRecording}>
                          Stop & Save
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg px-3 text-xs" onClick={() => setIsStopRecordingConfirmOpen(false)}>
                          Continue Recording
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                {callError && (
                  <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-sm" role="alert">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />
                      <span>{callError}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {callVideoBackground !== "none" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 border-destructive/40 bg-background/80 px-2 text-[11px] text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            void changeCallVideoBackground("none");
                            setCallError(null);
                          }}
                        >
                          Use standard camera
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive/80 hover:bg-destructive/20 hover:text-destructive"
                        onClick={() => setCallError(null)}
                        title="Dismiss notice"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
                {!localStream?.getTracks().some(track => track.readyState === "live") && <Button type="button" size="sm" className="mb-3 rounded-full" onClick={() => void rejoinCallMedia()}><Video className="mr-2 h-4 w-4" />Reconnect camera and microphone</Button>}
                <div className="mb-2.5 flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto rounded-xl border border-[hsl(var(--comm-border))] bg-background/90 px-2 py-1.5 shadow-sm backdrop-blur-md sm:px-2.5" role="toolbar" aria-label="Call controls">
                  {/* Group 1: Audio and video */}
                  <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Audio and video">
                    <Button size="icon" variant={isMicrophoneMuted ? "destructive" : "outline"} className={cn("h-9 w-9 shrink-0 rounded-lg", !isMicrophoneMuted && "call-control-button")} onClick={toggleMicrophone} title={isMicrophoneMuted ? "Unmute microphone" : "Mute microphone"} aria-label={isMicrophoneMuted ? "Unmute microphone" : "Mute microphone"} aria-pressed={isMicrophoneMuted}>{isMicrophoneMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</Button>
                    {activeCall.call_type === "video" && <Button size="icon" variant={isCameraEnabled ? "outline" : "destructive"} className={cn("h-9 w-9 shrink-0 rounded-lg", isCameraEnabled && "call-control-button")} onClick={toggleCamera} title={isCameraEnabled ? "Turn camera off" : "Turn camera on"} aria-label={isCameraEnabled ? "Turn camera off" : "Turn camera on"} aria-pressed={!isCameraEnabled} disabled={isChangingCallBackground}>{isCameraEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}</Button>}
                  </div>

                  {/* Group 2: Meeting interaction */}
                  <div className="flex shrink-0 items-center gap-1.5 border-l border-[hsl(var(--comm-border))] pl-1.5 sm:pl-2" role="group" aria-label="Meeting interaction">
                    <Button size="icon" variant={isScreenSharing ? "default" : "outline"} className={cn("h-9 w-9 shrink-0 rounded-lg", isScreenSharing ? "call-control-active" : "call-control-button")} onClick={() => void toggleScreenShare()} title={isScreenSharing ? "Stop screen sharing" : "Share screen"} aria-label={isScreenSharing ? "Stop screen sharing" : "Share screen"} aria-pressed={isScreenSharing} disabled={isChangingCallBackground}>{isScreenSharing ? <ScreenShareOff className="h-4 w-4" /> : <ScreenShare className="h-4 w-4" />}</Button>
                    <Button size="icon" variant={raisedHands[currentUser.id] ? "default" : "outline"} className={cn("h-9 w-9 shrink-0 rounded-lg", raisedHands[currentUser.id] ? "call-control-active" : "call-control-button")} onClick={toggleRaisedHand} title={raisedHands[currentUser.id] ? "Lower hand" : "Raise hand"} aria-label={raisedHands[currentUser.id] ? "Lower hand" : "Raise hand"} aria-pressed={Boolean(raisedHands[currentUser.id])}><Hand className="h-4 w-4" /></Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="outline" className="call-control-button hidden h-9 w-9 shrink-0 rounded-lg sm:inline-flex" title="Send reaction" aria-label="Send meeting reaction"><SmilePlus className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-0">
                        <div className="flex gap-1 p-1">
                          {MEETING_REACTIONS.map(emoji => <button key={emoji} type="button" className="rounded-md p-2 text-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => sendMeetingReaction(emoji)} aria-label={`React ${emoji}`}>{emoji}</button>)}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Group 3: Meeting layout */}
                  <div className="hidden shrink-0 items-center gap-1.5 border-l border-[hsl(var(--comm-border))] pl-2 lg:flex" role="group" aria-label="Meeting layout">
                    <Button size="sm" variant={callLayout === "gallery" ? "default" : "outline"} className={cn("h-9 shrink-0 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap", callLayout === "gallery" ? "call-control-active" : "call-control-button")} onClick={() => setCallLayout("gallery")} title="Gallery view" aria-label="Gallery view" aria-pressed={callLayout === "gallery"}><LayoutGrid className="h-4 w-4 xl:mr-1.5" /><span className="hidden xl:inline">Gallery</span></Button>
                    <Button size="sm" variant={callLayout === "speaker" ? "default" : "outline"} className={cn("h-9 shrink-0 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap", callLayout === "speaker" ? "call-control-active" : "call-control-button")} onClick={() => setCallLayout("speaker")} title="Speaker view" aria-label="Speaker view" aria-pressed={callLayout === "speaker"}><PanelTop className="h-4 w-4 xl:mr-1.5" /><span className="hidden xl:inline">Speaker</span></Button>
                  </div>

                  {/* Group 4: Participants */}
                  <div className="hidden shrink-0 items-center gap-1.5 border-l border-[hsl(var(--comm-border))] pl-2 md:flex" role="group" aria-label="Participants">
                    <Button type="button" size="sm" variant={showInvitePanel ? "default" : "outline"} className={cn("h-9 shrink-0 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap", showInvitePanel ? "call-control-active" : "call-control-button")} onClick={() => setShowInvitePanel(value => { const next = !value; if (next) { setIsDesktopParticipantsOpen(false); setShowDeviceSettings(false); setIsDesktopChatOpen(false); setShowRecordingsPanel(false); } return next; })} title="Invite participants" aria-label="Invite participants" aria-expanded={showInvitePanel} aria-controls="meeting-invite-panel"><UserPlus className="h-4 w-4 xl:mr-1.5" /><span className="hidden xl:inline">Invite</span></Button>
                    <Button type="button" size="sm" variant={mobileMeetingView === "participants" || isDesktopParticipantsOpen ? "default" : "outline"} className={cn("h-9 shrink-0 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap", mobileMeetingView === "participants" || isDesktopParticipantsOpen ? "call-control-active" : "call-control-button")} onClick={handleMeetingParticipantsToggle} title="Participant list" aria-label="Show meeting participants" aria-pressed={mobileMeetingView === "participants" || isDesktopParticipantsOpen}><Users className="mr-1.5 h-4 w-4" /><span className="text-xs font-semibold">{totalGalleryTiles}</span><span className="ml-1 hidden xl:inline">People</span></Button>
                  </div>

                  {/* Group 5: Communication */}
                  <div className="hidden shrink-0 items-center gap-1.5 border-l border-[hsl(var(--comm-border))] pl-2 sm:flex" role="group" aria-label="Communication">
                    <Button type="button" size="sm" variant={mobileMeetingView === "chat" || isDesktopChatOpen ? "default" : "outline"} className={cn("h-9 shrink-0 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap", mobileMeetingView === "chat" || isDesktopChatOpen ? "call-control-active" : "call-control-button")} onClick={handleMeetingChatToggle} title="Meeting chat" aria-label="Show meeting chat" aria-pressed={mobileMeetingView === "chat" || isDesktopChatOpen}><MessageSquare className="h-4 w-4 xl:mr-1.5" /><span className="hidden xl:inline">Chat</span>{(unreadCounts[activeChatUserId || ""] || 0) > 0 && <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.2 text-[10px] font-bold text-white">{unreadCounts[activeChatUserId || ""]}</span>}</Button>
                  </div>

                  {/* Group 6: Meeting management */}
                  <div className="flex shrink-0 items-center gap-1.5 border-l border-[hsl(var(--comm-border))] pl-1.5 sm:pl-2" role="group" aria-label="Meeting management">
                    {canCurrentUserRecord && (
                      isCallRecordingActive ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="h-9 shrink-0 rounded-lg px-2.5 text-xs font-semibold whitespace-nowrap"
                          onClick={() => isLocalRecordingOwner ? setIsStopRecordingConfirmOpen(true) : toast({ title: "Recording in progress", description: `Started by ${activeCall.recording_started_by_name || "another participant"}.` })}
                          disabled={isSavingRecording}
                          title={isLocalRecordingOwner ? "Stop recording" : "Recording in progress"}
                          aria-label="Stop meeting recording"
                        >
                          <Square className="mr-1.5 h-3.5 w-3.5 fill-current" />
                          <span>{isSavingRecording ? "Saving..." : `REC ${formatRecordingDuration(recordingElapsedSeconds)}`}</span>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="call-control-button hidden h-9 shrink-0 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap sm:inline-flex"
                          onClick={() => setIsRecordingConfirmOpen(true)}
                          disabled={isSavingRecording}
                          title="Record meeting"
                          aria-label="Record meeting"
                        >
                          <CircleDot className="h-4 w-4 text-red-500 xl:mr-1.5" />
                          <span className="hidden xl:inline">Record</span>
                        </Button>
                      )
                    )}
                    <Button size="icon" variant={showDeviceSettings ? "default" : "outline"} className={cn("hidden h-9 w-9 shrink-0 rounded-lg md:inline-flex", showDeviceSettings ? "call-control-active" : "call-control-button")} onClick={() => setShowDeviceSettings(value => { const next = !value; if (next) { setIsDesktopParticipantsOpen(false); setShowInvitePanel(false); setIsDesktopChatOpen(false); setShowRecordingsPanel(false); } return next; })} title="Camera, background & audio settings" aria-label="Camera, background and audio settings" aria-expanded={showDeviceSettings}><Settings2 className="h-4 w-4" /></Button>
                    <Button type="button" size="sm" variant={showRecordingsPanel ? "default" : "outline"} className={cn("hidden h-9 shrink-0 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap xl:inline-flex", showRecordingsPanel ? "call-control-active" : "call-control-button")} onClick={() => setShowRecordingsPanel(value => { const next = !value; if (next) { setShowInvitePanel(false); setIsDesktopParticipantsOpen(false); setShowDeviceSettings(false); void loadCallRecordings(activeCall.id); } return next; })} title="Meeting recordings" aria-label="Meeting recordings" aria-pressed={showRecordingsPanel}><Film className="h-4 w-4 2xl:mr-1.5" /><span className="hidden 2xl:inline">Recordings</span>{callRecordings.length > 0 && <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.2 text-[10px] font-bold">{callRecordings.length}</span>}</Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="icon" variant="outline" className="call-control-button h-9 w-9 shrink-0 rounded-lg" title="More meeting options" aria-label="More meeting options"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-h-[min(70vh,32rem)] w-64 overflow-y-auto">
                        <div className="flex items-center justify-between px-2 py-1.5 text-xs text-muted-foreground sm:hidden">
                          <span>Reactions</span>
                          <div className="flex gap-1">{MEETING_REACTIONS.map(emoji => <button key={emoji} type="button" className="rounded p-1.5 text-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" onClick={() => sendMeetingReaction(emoji)} aria-label={`React ${emoji}`}>{emoji}</button>)}</div>
                        </div>
                        <DropdownMenuItem onSelect={() => setCallLayout("gallery")}><LayoutGrid className="mr-2 h-4 w-4" />Gallery view</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setCallLayout("speaker")}><PanelTop className="mr-2 h-4 w-4" />Speaker view</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setShowInvitePanel(value => { const next = !value; if (next) { setIsDesktopParticipantsOpen(false); setShowDeviceSettings(false); setIsDesktopChatOpen(false); setShowRecordingsPanel(false); } return next; })}><UserPlus className="mr-2 h-4 w-4" />{showInvitePanel ? "Close invite panel" : "Invite participants"}</DropdownMenuItem>
                        <DropdownMenuItem onSelect={handleMeetingParticipantsToggle}><Users className="mr-2 h-4 w-4" />Participants ({totalGalleryTiles})</DropdownMenuItem>
                        <DropdownMenuItem onSelect={handleMeetingChatToggle}><MessageSquare className="mr-2 h-4 w-4" />Meeting chat</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => setShowDeviceSettings(value => { const next = !value; if (next) { setIsDesktopParticipantsOpen(false); setShowInvitePanel(false); setIsDesktopChatOpen(false); setShowRecordingsPanel(false); } return next; })}><Settings2 className="mr-2 h-4 w-4" />Device & background settings</DropdownMenuItem>
                        {activeCall.call_type === "video" && (
                          <>
                            <DropdownMenuItem disabled={isChangingCallBackground} onSelect={() => void rotateCamera()}>
                              <RotateCw className="mr-2 h-4 w-4" />
                              Rotate camera ({cameraRotation}°)
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={isChangingCallBackground} onSelect={() => void switchCamera()}>
                              <FlipHorizontal className="mr-2 h-4 w-4" />
                              Switch camera {cameraFacingMode === "user" ? "(rear)" : "(front)"}
                            </DropdownMenuItem>
                          </>
                        )}
                        {activeCall.call_type === "video" && (
                          <DropdownMenuItem onSelect={() => setIsSelfViewPip(value => !value)}><PictureInPicture2 className="mr-2 h-4 w-4" />{isSelfViewPip ? "Dock self view in gallery" : "Float self view (PiP)"}</DropdownMenuItem>
                        )}
                        {canCurrentUserRecord && (
                          <DropdownMenuItem onSelect={() => isCallRecordingActive ? (isLocalRecordingOwner ? setIsStopRecordingConfirmOpen(true) : undefined) : setIsRecordingConfirmOpen(true)}>
                            {isCallRecordingActive ? <Square className="mr-2 h-4 w-4 text-red-500" /> : <CircleDot className="mr-2 h-4 w-4 text-red-500" />}
                            {isCallRecordingActive ? `Stop recording (${formatRecordingDuration(recordingElapsedSeconds)})` : "Start recording"}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => { setShowRecordingsPanel(value => { const next = !value; if (next) { setShowInvitePanel(false); setIsDesktopParticipantsOpen(false); setShowDeviceSettings(false); void loadCallRecordings(activeCall.id); } return next; }); }}><Film className="mr-2 h-4 w-4" />Meeting recordings ({callRecordings.length})</DropdownMenuItem>
                        {onMinimize && <DropdownMenuItem onSelect={onMinimize}><Minus className="mr-2 h-4 w-4" />Minimize call</DropdownMenuItem>}
                        {onToggleFullscreen && <DropdownMenuItem onSelect={onToggleFullscreen}>{isFullscreen ? <Minimize2 className="mr-2 h-4 w-4" /> : <Maximize2 className="mr-2 h-4 w-4" />}{isFullscreen ? "Exit full screen" : "Full screen"}</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Group 7: Call management */}
                  <div className="ml-auto flex shrink-0 items-center gap-1.5 border-l border-[hsl(var(--comm-border))] pl-1.5 sm:pl-2" role="group" aria-label="Call management">
                    {onMinimize && <Button size="icon" variant="outline" className="call-control-button hidden h-9 w-9 shrink-0 rounded-lg lg:inline-flex" onClick={onMinimize} title="Minimize call" aria-label="Minimize active call"><Minus className="h-4 w-4" /></Button>}
                    {onToggleFullscreen && <Button size="icon" variant="outline" className="call-control-button hidden h-9 w-9 shrink-0 rounded-lg lg:inline-flex" onClick={onToggleFullscreen} title={isFullscreen ? "Exit full screen" : "Full screen call"} aria-label={isFullscreen ? "Exit full screen call" : "Open call full screen"} aria-pressed={isFullscreen}>{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>}
                    <Button size="sm" variant="destructive" className="call-hangup h-9 shrink-0 rounded-lg px-3.5 text-xs font-semibold whitespace-nowrap" onClick={() => void hangUpCall()} title="End call" aria-label="Hang up call"><PhoneOff className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Hang up</span></Button>
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row-reverse">
                {showRecordingsPanel && (
                  <section className="flex max-h-[48dvh] w-full shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-[hsl(var(--comm-border))] bg-background/95 p-3.5 shadow-md sm:max-h-[54dvh] lg:max-h-full lg:w-[340px] xl:w-[360px]" aria-label="Meeting recordings library">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground"><Film className="h-3.5 w-3.5 text-primary" />Meeting Recordings ({callRecordings.length})</h4>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => setShowRecordingsPanel(false)} title="Close recordings panel" aria-label="Close recordings panel"><X className="h-3.5 w-3.5" /></Button>
                    </div>
                    {activePlaybackRecording && (
                      <div className="rounded-lg border border-primary/30 bg-black/95 p-2">
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-white">
                          <span className="truncate font-semibold">{activePlaybackRecording.meeting_title}</span>
                          <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-white/80 hover:text-white" onClick={() => setActivePlaybackRecording(null)} title="Close player"><X className="h-3.5 w-3.5" /></Button>
                        </div>
                        <video key={activePlaybackRecording.id} src={getCallRecordingMediaUrl(activePlaybackRecording.id)} controls autoPlay className="aspect-video w-full rounded bg-black" />
                      </div>
                    )}
                    {isLoadingRecordings ? (
                      <p className="py-4 text-center text-xs text-muted-foreground">Loading recordings...</p>
                    ) : callRecordings.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">No saved recordings for this meeting yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {callRecordings.map(rec => (
                          <li key={rec.id} className="rounded-lg border border-border/80 bg-muted/30 p-2.5 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold text-foreground">{rec.meeting_title}</p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  By {rec.initiator_name} · {format(new Date(rec.started_at), "MMM d, yyyy h:mm a")}
                                </p>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                  {(rec.status === "completed" || rec.status === "saved") ? `${formatRecordingDuration(rec.duration_seconds)} · ${formatFileSize(rec.file_size)}` : rec.status.toUpperCase()}
                                </p>
                              </div>
                              <Badge variant={rec.status === "completed" || rec.status === "saved" ? "outline" : "secondary"} className="shrink-0 text-[10px] capitalize">{rec.status}</Badge>
                            </div>
                            {(rec.status === "completed" || rec.status === "saved") && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <Button type="button" size="sm" variant="default" className="h-7 rounded-md px-2.5 text-[11px]" onClick={() => setActivePlaybackRecording(rec)}>
                                  <Play className="mr-1 h-3 w-3" />Play
                                </Button>
                                <a href={getCallRecordingMediaUrl(rec.id, true)} download={rec.file_name || `recording-${rec.id}.webm`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-[11px] font-medium hover:bg-muted">
                                  <Download className="h-3 w-3" />Download
                                </a>
                                {(String(rec.initiated_by) === String(currentUser.id) || String(rec.host_user_id) === String(currentUser.id) || ["super_admin", "admin"].includes(String(currentUser.role || "").toLowerCase())) && (
                                  <Button type="button" size="sm" variant="ghost" className="ml-auto h-7 rounded-md px-2 text-[11px] text-destructive hover:bg-destructive/10" onClick={() => void deleteCallRecording(rec.id).then(() => { if (activePlaybackRecording?.id === rec.id) setActivePlaybackRecording(null); toast({ title: "Recording deleted" }); }).catch(err => toast({ title: "Delete failed", description: err instanceof Error ? err.message : "Unable to delete recording.", variant: "destructive" }))}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
                {showInvitePanel && <section id="meeting-invite-panel" className="max-h-[48dvh] w-full shrink-0 overflow-y-auto rounded-xl border border-[hsl(var(--comm-border))] bg-background/95 p-3.5 shadow-md sm:max-h-[54dvh] lg:max-h-full lg:w-[320px] xl:w-[340px]" aria-label="Invite meeting participants"><div className="mb-2.5 flex items-center justify-between"><h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Invite people</h4><Button type="button" size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => setShowInvitePanel(false)} title="Close invite panel" aria-label="Close invite panel"><X className="h-3.5 w-3.5" /></Button></div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="grid min-w-0 flex-1 gap-1 text-xs font-semibold text-muted-foreground">Find colleagues<Input value={meetingInviteSearchTerm} onChange={event => setMeetingInviteSearchTerm(event.target.value)} placeholder="Search by name or email" className="h-10" aria-label="Search colleagues to invite" /></label>
                    <Button type="button" onClick={() => void inviteSelectedParticipants()} disabled={!meetingInviteSelection.length || isInvitingParticipants} className="h-10 rounded-full">{isInvitingParticipants ? "Inviting…" : `Invite ${meetingInviteSelection.length || "selected"}`}</Button>
                  </div>
                  <div className="mt-3 grid max-h-40 gap-1 overflow-y-auto sm:grid-cols-2">
                    {visibleUsers.filter(user => !activeCallParticipantIds.includes(user.id) && !activeCallPendingInviteIds.includes(user.id) && `${user.first_name || ""} ${user.last_name || ""} ${user.email || ""}`.toLowerCase().includes(meetingInviteSearchTerm.toLowerCase())).map(user => <label key={user.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted"><input type="checkbox" checked={meetingInviteSelection.includes(user.id)} onChange={event => setMeetingInviteSelection(current => event.target.checked ? [...new Set([...current, user.id])] : current.filter(id => id !== user.id))} aria-label={`Invite ${formatUserName(user)}`} /><Avatar className="h-8 w-8"><AvatarImage src={resolveAvatarUrl(user.avatar_url)} alt="" /><AvatarFallback>{(user.first_name?.[0] || user.email?.[0] || "?").toUpperCase()}</AvatarFallback></Avatar><span className="min-w-0 truncate text-sm">{formatUserName(user)}</span><span className="ml-auto text-xs text-muted-foreground">{user.online ? "Online" : "Offline"}</span></label>)}
                    {visibleUsers.filter(user => !activeCallParticipantIds.includes(user.id) && !activeCallPendingInviteIds.includes(user.id) && `${user.first_name || ""} ${user.last_name || ""} ${user.email || ""}`.toLowerCase().includes(meetingInviteSearchTerm.toLowerCase())).length === 0 && <p className="py-3 text-sm text-muted-foreground">No eligible colleagues found.</p>}
                  </div>
                </section>}
                {(mobileMeetingView === "participants" || isDesktopParticipantsOpen) && <section className="max-h-[52dvh] w-full shrink-0 overflow-y-auto rounded-xl border border-[hsl(var(--comm-border))] bg-background/95 p-3.5 shadow-md lg:max-h-full lg:w-[320px] xl:w-[340px]" aria-label="Meeting participants">
                  <div className="mb-2.5 flex items-center justify-between"><h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Participants ({activeCallParticipantIds.length})</h4><Button type="button" size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => { setMobileMeetingView("gallery"); setIsDesktopParticipantsOpen(false); }} title="Close participants panel" aria-label="Close participants panel"><X className="h-3.5 w-3.5" /></Button></div>
                  <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
                    {meetingParticipants.map(participant => <li key={participant.userId} className="flex min-w-0 items-center gap-2 rounded-lg border border-transparent px-2 py-2 hover:border-border hover:bg-muted/50">
                      <Avatar className="h-9 w-9 shrink-0"><AvatarImage src={resolveAvatarUrl(participant.profile?.avatar_url)} alt={formatUserName(participant.profile)} /><AvatarFallback>{formatUserName(participant.profile).split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{participant.userId === currentUser.id ? `${formatUserName(currentUser)} (You)` : formatUserName(participant.profile)}</p><p className="truncate text-[11px] text-muted-foreground">{participant.status === "accepted" ? participant.userId === currentUser.id || remoteStreams[participant.userId] ? "Connected" : "Connecting" : participant.status === "invited" ? "Invited" : participant.status === "ringing" ? "Ringing" : participant.status[0].toUpperCase() + participant.status.slice(1)}</p></div>
                      {participant.handRaised && <Hand className="h-4 w-4 shrink-0 text-amber-600" aria-label="Hand raised" />}
                      {remoteMediaStates[participant.userId]?.audioEnabled === false && <MicOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Microphone muted" />}
                      {remoteMediaStates[participant.userId]?.videoEnabled === false && <VideoOff className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Camera off" />}
                      {activeCallParticipantIds.includes(participant.userId) && <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setPinnedParticipantId(current => current === participant.userId ? null : participant.userId)} title={pinnedParticipantId === participant.userId ? "Unpin participant" : "Pin participant"} aria-label={pinnedParticipantId === participant.userId ? "Unpin participant" : `Pin ${formatUserName(participant.profile)}`} aria-pressed={pinnedParticipantId === participant.userId}>{pinnedParticipantId === participant.userId ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}</Button>}
                      {activeCallParticipantIds.includes(participant.userId) && String(activeCall.sender_id) === String(currentUser.id) && <Button type="button" size="icon" variant={spotlightParticipantId === participant.userId ? "default" : "ghost"} className="h-8 w-8 shrink-0" onClick={() => setMeetingSpotlight(spotlightParticipantId === participant.userId ? null : participant.userId)} title={spotlightParticipantId === participant.userId ? "Remove spotlight" : "Spotlight participant"} aria-label={spotlightParticipantId === participant.userId ? "Remove spotlight" : `Spotlight ${formatUserName(participant.profile)}`} aria-pressed={spotlightParticipantId === participant.userId}><PanelTop className="h-4 w-4" /></Button>}
                      {String(activeCall.sender_id) === String(currentUser.id) && ["invited", "ringing"].includes(participant.status) && <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 px-2" onClick={() => void cancelCallInvitation(activeCall.id, participant.userId).catch(error => toast({ title: "Invitation not cancelled", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" }))}>Cancel</Button>}
                      {String(activeCall.sender_id) === String(currentUser.id) && participant.handRaised && participant.userId !== currentUser.id && <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 px-2" onClick={() => lowerRaisedHand(participant.userId)}>Lower</Button>}
                    </li>)}
                  </ul>
                </section>}
                {showDeviceSettings && (
                  <div className="flex max-h-[48dvh] w-full shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-[hsl(var(--comm-border))] bg-background/95 p-3.5 shadow-md sm:max-h-[54dvh] lg:max-h-full lg:w-[320px] xl:w-[340px]" aria-label="Media device and background settings"><div className="flex items-center justify-between border-b border-border/60 pb-2"><h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Devices & Background Effects</h4><Button type="button" size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => setShowDeviceSettings(false)} title="Close settings" aria-label="Close settings"><X className="h-3.5 w-3.5" /></Button></div>
                    <div className="grid min-w-0 content-start gap-1 text-xs font-semibold text-muted-foreground">
                      <label htmlFor="call-microphone-device">Microphone</label>
                      <select id="call-microphone-device" className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground" value={audioInputDeviceId} onChange={event => void changeInputDevice("audio", event.target.value)}>
                        <option value="">System default</option>
                        {mediaDevices.filter(device => device.kind === "audioinput").map((device, index) => <option key={device.deviceId || `audio-${index}`} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
                      </select>
                      <span className="flex min-w-0 items-center gap-2">
                        <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => void testMicrophone()}>{isTestingMicrophone ? "Stop test" : "Test microphone"}</Button>
                        <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-label={`Microphone level ${microphoneLevel}%`}><span className="block h-full bg-primary transition-[width]" style={{ width: `${microphoneLevel}%` }} /></span>
                      </span>
                    </div>
                    {activeCall.call_type === "video" && <div className="grid min-w-0 content-start gap-1 text-xs font-semibold text-muted-foreground">
                      <label htmlFor="call-camera-device">Camera</label>
                      <select id="call-camera-device" className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground disabled:opacity-60" value={videoInputDeviceId} onChange={event => void changeInputDevice("video", event.target.value)} disabled={isChangingCallBackground}>
                        <option value="">System default</option>
                        {mediaDevices.filter(device => device.kind === "videoinput").map((device, index) => <option key={device.deviceId || `video-${index}`} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
                      </select>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 text-xs font-medium"
                          disabled={isChangingCallBackground}
                          onClick={() => void rotateCamera()}
                          title="Rotate camera feed 90 degrees clockwise"
                        >
                          <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                          Rotate ({cameraRotation}°)
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="flex-1 h-8 text-xs font-medium"
                          disabled={isChangingCallBackground}
                          onClick={() => void switchCamera()}
                          title="Switch camera device or toggle facing mode"
                        >
                          <FlipHorizontal className="mr-1.5 h-3.5 w-3.5" />
                          Switch
                        </Button>
                      </div>
                    </div>}
                    {activeCall.call_type === "video" && <div className="grid min-w-0 content-start gap-1 text-xs font-semibold text-muted-foreground">
                      <label htmlFor="call-video-background">Change Background</label>
                      <select id="call-video-background" className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground disabled:opacity-60" value={callVideoBackground} onChange={event => void changeCallVideoBackground(event.target.value as CallVideoBackground | "none")} disabled={!hasLiveLocalVideo || isChangingCallBackground || isScreenSharing}>
                        <option value="none">No effect</option>
                        <option value="blur">Blur background</option>
                        {CALL_VIDEO_BACKGROUND_OPTIONS.map(background => <option key={background.value} value={background.value}>{background.label}</option>)}
                        {customBackgroundUrl && <option value={customBackgroundUrl}>Custom uploaded background</option>}
                      </select>
                      {isChangingCallBackground && <span className="min-w-0 break-words font-normal">Preparing the on-device background effect...</span>}
                      {isScreenSharing && <span className="min-w-0 break-words font-normal">Stop screen sharing before changing the background.</span>}
                      <input ref={customBgInputRef} type="file" accept="image/*" className="hidden" onChange={handleCustomBackgroundFile} />
                      <div className="mt-1.5 grid grid-cols-3 gap-1.5" role="group" aria-label="Background presets"><button type="button" onClick={() => void changeCallVideoBackground("none")} disabled={!hasLiveLocalVideo || isChangingCallBackground || isScreenSharing} className={cn("flex h-12 flex-col items-center justify-center rounded-lg border text-[10px] font-semibold transition-all disabled:opacity-50", callVideoBackground === "none" ? "border-primary bg-primary/15 text-primary ring-1 ring-primary" : "border-border bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground")}>Off</button><button type="button" onClick={() => void changeCallVideoBackground("blur")} disabled={!hasLiveLocalVideo || isChangingCallBackground || isScreenSharing} className={cn("flex h-12 flex-col items-center justify-center rounded-lg border text-[10px] font-semibold backdrop-blur-md transition-all disabled:opacity-50", callVideoBackground === "blur" ? "border-primary bg-primary/15 text-primary ring-1 ring-primary" : "border-border bg-muted/60 text-muted-foreground hover:border-primary/40 hover:text-foreground")}>Blur</button><button type="button" onClick={() => customBgInputRef.current?.click()} disabled={!hasLiveLocalVideo || isChangingCallBackground || isScreenSharing} className={cn("flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed text-[10px] font-semibold transition-all disabled:opacity-50", customBackgroundUrl && callVideoBackground === customBackgroundUrl ? "border-primary bg-primary/15 text-primary ring-1 ring-primary" : "border-border bg-muted/30 text-muted-foreground hover:border-primary/40 hover:text-foreground")} title="Upload custom background image"><Upload className="h-3.5 w-3.5" /><span>Custom</span></button>{CALL_VIDEO_BACKGROUND_OPTIONS.map(background => <button key={background.value} type="button" onClick={() => void changeCallVideoBackground(background.value)} disabled={!hasLiveLocalVideo || isChangingCallBackground || isScreenSharing} title={background.label} className={cn("group relative h-12 overflow-hidden rounded-lg border transition-all disabled:opacity-50", callVideoBackground === background.value ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50")}><img src={`${import.meta.env.BASE_URL}call-backgrounds/${background.fileName}`} alt={background.label} className="h-full w-full object-cover transition-transform group-hover:scale-105" /><span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-1 py-0.5 text-[9px] font-medium text-white">{background.label.replace(/^RIANA\s+/i, "")}</span></button>)}</div>
                    </div>}
                    <div className="grid min-w-0 content-start gap-1 text-xs font-semibold text-muted-foreground">
                      <label htmlFor="call-speaker-device">Speaker</label>
                      <select id="call-speaker-device" className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm font-normal text-foreground disabled:opacity-60" value={audioOutputDeviceId} onChange={event => setAudioOutputDeviceId(event.target.value)} disabled={!mediaDevices.some(device => device.kind === "audiooutput")}>
                        <option value="">System default</option>
                        {mediaDevices.filter(device => device.kind === "audiooutput").map((device, index) => <option key={device.deviceId || `output-${index}`} value={device.deviceId}>{device.label || `Speaker ${index + 1}`}</option>)}
                      </select>
                      {!mediaDevices.some(device => device.kind === "audiooutput") && <span className="min-w-0 break-words font-normal">Output selection is not supported by this browser.</span>}
                    </div>
                  </div>
                )}
                <div ref={mediaGalleryRef} className={cn("relative grid min-h-[200px] min-w-0 flex-1 gap-2.5 overflow-y-auto sm:min-h-[240px] sm:gap-3", adaptiveGalleryGridClass, mobileMeetingView === "gallery" ? "grid" : "hidden lg:grid")} aria-label="Active call media">
                  <div
                    className={cn(
                      "relative flex h-full max-h-full min-h-[180px] w-full min-w-0 items-center justify-center overflow-hidden rounded-xl border bg-slate-950 p-1.5 shadow-sm transition-all duration-200 sm:min-h-[200px]",
                      totalGalleryTiles === 1 && !isSelfViewPip && "mx-auto max-w-5xl",
                      isSpeakerViewStage && !isSelfViewPip && (primarySpeakerTileId === currentUser.id ? "col-span-full order-first min-h-[220px] sm:min-h-[280px]" : "max-h-[176px] min-h-[116px] sm:min-h-[136px]"),
                      !isSpeakerViewStage && (spotlightParticipantId === currentUser.id || pinnedParticipantId === currentUser.id) && "col-span-full",
                      activeSpeakerId === currentUser.id ? "border-emerald-500/80 ring-2 ring-emerald-500/50" : pinnedParticipantId === currentUser.id ? "border-primary ring-2 ring-primary/50" : "border-[hsl(var(--comm-border))] dark:border-white/10",
                      isSelfViewPip && "absolute z-30 h-auto aspect-video min-h-0 w-[34%] max-w-56 cursor-move touch-none shadow-2xl",
                    )}
                    style={isSelfViewPip ? { left: `${pipPosition.left}%`, top: `${pipPosition.top}%` } : undefined}
                    onPointerDown={handlePipPointerDown}
                    onPointerMove={handlePipPointerMove}
                    onPointerUp={() => { pipDragRef.current = null; }}
                    onPointerCancel={() => { pipDragRef.current = null; }}
                  >
                    {activeCall.call_type === "video" && hasLiveLocalVideo ? (
                      <>
                        <video
                          ref={attachLocalVideoElement}
                          autoPlay
                          muted
                          playsInline
                          aria-label={isScreenSharing ? "Your shared screen preview" : "Your video preview"}
                          className={cn(
                            "h-full w-full rounded-lg bg-slate-950 object-contain object-center",
                            !isScreenSharing && callVideoBackground === "none" && cameraRotation === 0 && "-scale-x-100",
                          )}
                        />
                        <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="h-7 w-7 rounded-full border border-white/20 bg-slate-950/75 text-white shadow-md backdrop-blur-md transition-colors hover:bg-slate-900"
                            onClick={event => {
                              event.stopPropagation();
                              void rotateCamera();
                            }}
                            disabled={isChangingCallBackground}
                            title={`Rotate camera 90° (currently ${cameraRotation}°)`}
                            aria-label="Rotate camera 90 degrees"
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    ) : activeCall.call_type === "video" ? (
                      <div className="flex h-full w-full min-h-32 flex-col items-center justify-center gap-2.5 rounded-lg bg-slate-900/95 text-sm font-medium text-slate-300">
                        <Avatar className="h-16 w-16 border-4 border-background shadow-lg">
                          <AvatarImage src={resolveAvatarUrl(currentUser.avatar_url)} alt={formatUserName(currentUser)} />
                          <AvatarFallback className="bg-primary font-bold text-primary-foreground">{(currentUser.first_name?.[0] || currentUser.email?.[0] || "?").toUpperCase()}{(currentUser.last_name?.[0] || "").toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-semibold text-slate-300">{isCameraEnabled ? "Camera unavailable" : "Camera off"}</span>
                      </div>
                    ) : (
                      <div className="flex h-full w-full min-h-36 items-center justify-center gap-3 rounded-lg bg-slate-900/95 text-sm font-medium text-slate-300">
                        <Mic className="h-5 w-5 text-primary" />
                        <span>{isMicrophoneMuted ? "Microphone muted" : "Audio connected"}</span>
                      </div>
                    )}
                    <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-white/10 bg-slate-950/80 px-2.5 py-1 text-[11px] font-semibold text-white shadow-md backdrop-blur-md">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", activeSpeakerId === currentUser.id ? "bg-emerald-400 animate-pulse" : "bg-emerald-500")} />
                      <span className="truncate">{formatUserName(currentUser)} (You)</span>
                      <span className="mx-0.5 h-3 w-px shrink-0 bg-white/20" aria-hidden="true" />
                      <span className={cn("inline-flex shrink-0 items-center", isMicrophoneMuted ? "text-red-400" : "text-emerald-400")} title={isMicrophoneMuted ? "Microphone muted" : "Microphone active"}>
                        {isMicrophoneMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                      </span>
                      {activeCall.call_type === "video" && !isCameraEnabled && (
                        <span className="inline-flex shrink-0 items-center text-red-400" title="Camera off">
                          <VideoOff className="h-3.5 w-3.5" />
                        </span>
                      )}
                      {activeSpeakerId === currentUser.id && (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">Speaking</span>
                      )}
                    </div>
                    {pinnedParticipantId === currentUser.id && <span className="pointer-events-none absolute left-12 top-3 z-10 inline-flex items-center gap-1 rounded-lg bg-primary/90 px-2 py-1 text-[10px] font-bold text-primary-foreground shadow-sm"><Pin className="h-3 w-3" />Pinned</span>}
                    {raisedHands[currentUser.id] && <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-lg bg-amber-500/90 px-2.5 py-1 text-[10px] font-bold text-slate-950 shadow-sm"><Hand className="h-3 w-3" />Hand raised</span>}
                    {meetingReactions.filter(reaction => reaction.userId === currentUser.id).map(reaction => <span key={reaction.id} className="pointer-events-none absolute right-3 top-3 z-20 call-reaction-float rounded-full border bg-background/95 px-3 py-1.5 text-xl shadow-lg motion-reduce:animate-none" aria-label={`You reacted ${reaction.emoji}`}>{reaction.emoji}</span>)}
                    <Button type="button" size="icon" variant={pinnedParticipantId === currentUser.id ? "default" : "secondary"} className={cn("absolute left-3 top-3 z-10 h-8 w-8 rounded-lg border backdrop-blur-md transition-colors", pinnedParticipantId === currentUser.id ? "border-primary bg-primary text-primary-foreground" : "border-white/15 bg-slate-950/70 text-white/90 hover:bg-slate-950")} onPointerDown={event => event.stopPropagation()} onClick={() => setPinnedParticipantId(current => current === currentUser.id ? null : currentUser.id)} title={pinnedParticipantId === currentUser.id ? "Unpin self view" : "Pin self view"} aria-label={pinnedParticipantId === currentUser.id ? "Unpin self view" : "Pin self view"} aria-pressed={pinnedParticipantId === currentUser.id}>{pinnedParticipantId === currentUser.id ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}</Button>
                  </div>
                  {visibleGalleryParticipantIds.map(participantId => {
                    const participantLabel = formatUserName(users.find(user => user.id === participantId));
                    const stream = remoteStreams[participantId];
                    const isMuted = remoteMediaStates[participantId]?.audioEnabled === false;
                    const isCamOff = remoteMediaStates[participantId]?.videoEnabled === false;
                    const isPrimaryStageTile = isSpeakerViewStage
                      ? primarySpeakerTileId === participantId
                      : (spotlightParticipantId === participantId || pinnedParticipantId === participantId);
                    return (
                      <div key={participantId} className={cn("relative flex h-full max-h-full min-h-[180px] w-full min-w-0 items-center justify-center overflow-hidden rounded-xl border bg-slate-950 p-1.5 shadow-sm transition-all duration-200 sm:min-h-[200px]", activeSpeakerId === participantId ? "border-emerald-500/80 ring-2 ring-emerald-500/50" : spotlightParticipantId === participantId || pinnedParticipantId === participantId ? "border-primary ring-2 ring-primary/45" : "border-[hsl(var(--comm-border))] dark:border-white/10", isPrimaryStageTile && "col-span-full order-first", isSpeakerViewStage && (isPrimaryStageTile ? "min-h-[220px] sm:min-h-[280px]" : "max-h-[176px] min-h-[116px] sm:min-h-[136px]"))}>
                        <div className="pointer-events-none absolute left-12 top-3 z-10 flex items-center gap-1.5">
                          {spotlightParticipantId === participantId && <span className="rounded-lg bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground shadow-sm">Spotlight</span>}
                          {pinnedParticipantId === participantId && <span className="inline-flex items-center gap-1 rounded-lg bg-primary/90 px-2 py-1 text-[10px] font-bold text-primary-foreground shadow-sm"><Pin className="h-3 w-3" />Pinned</span>}
                        </div>
                        {stream ? <RemoteCallMedia stream={stream} video={activeCall.call_type === "video"} videoEnabled={remoteMediaStates[participantId]?.videoEnabled} screenSharing={remoteMediaStates[participantId]?.screenSharing} label={participantLabel} avatarUrl={users.find(user => user.id === participantId)?.avatar_url} outputDeviceId={audioOutputDeviceId} layout={callLayout} /> : (
                          <div className="flex h-full w-full min-h-[160px] min-w-0 flex-col items-center justify-center gap-3 rounded-lg bg-slate-900/95 px-3 text-center text-sm font-medium text-slate-300">
                            <Avatar className="h-16 w-16 border-4 border-background shadow-lg">
                              <AvatarImage src={resolveAvatarUrl(users.find(user => user.id === participantId)?.avatar_url)} alt={participantLabel} />
                              <AvatarFallback className="bg-primary text-lg font-bold text-primary-foreground">{participantLabel.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="max-w-full truncate text-xs text-slate-400">Connecting to {participantLabel}…</span>
                          </div>
                        )}
                        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-white/10 bg-slate-950/80 px-2.5 py-1 text-[11px] font-semibold text-white shadow-md backdrop-blur-md">
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", stream ? (activeSpeakerId === participantId ? "bg-emerald-400 animate-pulse" : "bg-emerald-500") : "bg-amber-400 animate-pulse")} />
                          <span className="truncate">{participantLabel}</span>
                          <span className="mx-0.5 h-3 w-px shrink-0 bg-white/20" aria-hidden="true" />
                          <span className={cn("inline-flex shrink-0 items-center", isMuted ? "text-red-400" : "text-emerald-400")} title={isMuted ? "Microphone muted" : "Microphone active"}>
                            {isMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                          </span>
                          {activeCall.call_type === "video" && isCamOff && (
                            <span className="inline-flex shrink-0 items-center text-red-400" title="Camera off">
                              <VideoOff className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {activeSpeakerId === participantId && (
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">Speaking</span>
                          )}
                        </div>
                        <Button type="button" size="icon" variant={pinnedParticipantId === participantId ? "default" : "secondary"} className={cn("absolute left-3 top-3 z-10 h-8 w-8 rounded-lg border backdrop-blur-md transition-colors", pinnedParticipantId === participantId ? "border-primary bg-primary text-primary-foreground" : "border-white/15 bg-slate-950/70 text-white/90 hover:bg-slate-950")} onClick={() => setPinnedParticipantId(current => current === participantId ? null : participantId)} title={pinnedParticipantId === participantId ? "Unpin participant" : "Pin participant"} aria-label={pinnedParticipantId === participantId ? "Unpin participant" : `Pin ${participantLabel}`} aria-pressed={pinnedParticipantId === participantId}>{pinnedParticipantId === participantId ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}</Button>
                        <div className="pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-1.5">
                          {remoteMediaStates[participantId]?.screenSharing && <span className="rounded-lg bg-slate-950/80 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-md">Sharing screen</span>}
                          {raisedHands[participantId] && <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/90 px-2.5 py-1 text-[10px] font-bold text-slate-950 shadow-sm"><Hand className="h-3 w-3" />Hand raised</span>}
                        </div>
                        {meetingReactions.filter(reaction => reaction.userId === participantId).map(reaction => <span key={reaction.id} className="pointer-events-none absolute right-3 top-3 z-20 call-reaction-float rounded-full border bg-background/95 px-3 py-1.5 text-xl shadow-lg motion-reduce:animate-none" aria-label={`${participantLabel} reacted ${reaction.emoji}`}>{reaction.emoji}</span>)}
                      </div>
                    );
                  })}
                </div>
                </div>{galleryPageCount > 1 && <nav className="mt-2 flex items-center justify-center gap-3" aria-label="Participant gallery pages"><Button type="button" size="sm" variant="outline" onClick={() => setGalleryPage(page => Math.max(0, page - 1))} disabled={galleryPage === 0} aria-label="Previous participant page"><ChevronLeft className="h-4 w-4" /></Button><span className="text-xs text-muted-foreground" aria-live="polite">Page {galleryPage + 1} of {galleryPageCount}</span><Button type="button" size="sm" variant="outline" onClick={() => setGalleryPage(page => Math.min(galleryPageCount - 1, page + 1))} disabled={galleryPage + 1 >= galleryPageCount} aria-label="Next participant page"><ChevronRight className="h-4 w-4" /></Button></nav>}
              </div>
            )}

            {!activeCall && showRecordingsPanel && (
              <section className="mx-3 mt-3 max-h-[60vh] overflow-y-auto rounded-xl border border-[hsl(var(--comm-border-strong))] bg-background/95 p-4 shadow-lg sm:mx-6 sm:mt-4" aria-label="Meeting recordings library">
                <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><Film className="h-4 w-4 text-primary" />Saved Meeting Recordings ({callRecordings.length})</h4>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7 rounded-lg" onClick={() => setShowRecordingsPanel(false)} title="Close recordings library" aria-label="Close recordings library"><X className="h-4 w-4" /></Button>
                </div>
                {activePlaybackRecording && (
                  <div className="mb-3 rounded-lg border border-primary/30 bg-black/95 p-2.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-white">
                      <span className="truncate font-semibold">{activePlaybackRecording.meeting_title}</span>
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-white/80 hover:text-white" onClick={() => setActivePlaybackRecording(null)} title="Close player"><X className="h-3.5 w-3.5" /></Button>
                    </div>
                    <video key={activePlaybackRecording.id} src={getCallRecordingMediaUrl(activePlaybackRecording.id)} controls autoPlay className="max-h-72 w-full rounded bg-black" />
                  </div>
                )}
                {isLoadingRecordings ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">Loading recordings...</p>
                ) : callRecordings.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">No saved meeting recordings found.</p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {callRecordings.map(rec => (
                      <li key={rec.id} className="rounded-lg border border-border/80 bg-muted/30 p-3 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-foreground">{rec.meeting_title}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">By {rec.initiator_name} · {format(new Date(rec.started_at), "MMM d, yyyy h:mm a")}</p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">{(rec.status === "completed" || rec.status === "saved") ? `${formatRecordingDuration(rec.duration_seconds)} · ${formatFileSize(rec.file_size)}` : rec.status.toUpperCase()}</p>
                          </div>
                          <Badge variant={rec.status === "completed" || rec.status === "saved" ? "outline" : "secondary"} className="shrink-0 text-[10px] capitalize">{rec.status}</Badge>
                        </div>
                        {(rec.status === "completed" || rec.status === "saved") && (
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <Button type="button" size="sm" variant="default" className="h-7 rounded-md px-2.5 text-[11px]" onClick={() => setActivePlaybackRecording(rec)}><Play className="mr-1 h-3 w-3" />Play</Button>
                            <a href={getCallRecordingMediaUrl(rec.id, true)} download={rec.file_name || `recording-${rec.id}.webm`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-[11px] font-medium hover:bg-muted"><Download className="h-3 w-3" />Download</a>
                            {(String(rec.initiated_by) === String(currentUser.id) || String(rec.host_user_id) === String(currentUser.id) || ["super_admin", "admin"].includes(String(currentUser.role || "").toLowerCase())) && (
                              <Button type="button" size="sm" variant="ghost" className="ml-auto h-7 rounded-md px-2 text-[11px] text-destructive hover:bg-destructive/10" onClick={() => void deleteCallRecording(rec.id).then(() => { if (activePlaybackRecording?.id === rec.id) setActivePlaybackRecording(null); toast({ title: "Recording deleted" }); }).catch(err => toast({ title: "Delete failed", description: err instanceof Error ? err.message : "Unable to delete recording.", variant: "destructive" }))}><Trash2 className="h-3 w-3" /></Button>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            <ScrollArea className={cn("min-h-0 flex-1 scroll-smooth px-3 sm:px-6", activeCall && "lg:col-start-2 lg:row-start-2 lg:border-l lg:border-[hsl(var(--comm-border))]", activeCall && mobileMeetingView !== "chat" && "hidden lg:flex", activeCall && !isDesktopChatOpen && "lg:hidden")}>
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
                          {msg.is_edited && !msg.is_deleted_for_everyone && <p className={cn("mt-1 text-[10px] italic", isMe ? "text-white/70" : "text-muted-foreground")}>Edited</p>}
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

            <div className={cn("chat-composer border-t border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-panel-elevated))] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_30px_rgba(15,108,117,0.08)] backdrop-blur-xl sm:p-4", activeCall && "lg:col-start-2 lg:row-start-3 lg:border-l lg:border-[hsl(var(--comm-border))]", activeCall && mobileMeetingView !== "chat" && "hidden lg:block", activeCall && !isDesktopChatOpen && "lg:hidden")}>
              {editingMessage && <div className="mb-3 flex items-center justify-between rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs"><div className="min-w-0"><p className="font-semibold text-foreground">Editing message</p><p className="truncate text-muted-foreground">{editingMessage.content}</p></div><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingMessage(null); setInputText(""); }} title="Cancel editing" aria-label="Cancel editing"><X className="h-4 w-4" /></Button></div>}
              {replyingTo && !editingMessage && <div className="mb-3 flex items-center justify-between rounded-lg border border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-surface))] px-3 py-2 text-xs"><div className="min-w-0"><p className="font-semibold text-foreground">Replying to {replyingTo.sender_id === currentUser.id ? "your message" : replyingTo.sender_first_name || "message"}</p><p className="truncate text-muted-foreground">{replyingTo.attachment_file_name || stripHostedPlaceholderLines(replyingTo.content) || replyingTo.message_kind}</p></div><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setReplyingTo(null)} title="Cancel reply" aria-label="Cancel reply"><X className="h-4 w-4" /></Button></div>}
              {selectedFile && <div className="mb-3 flex items-center justify-between rounded-lg border border-[hsl(var(--comm-border))] bg-[hsl(var(--comm-surface))] px-3 py-2 text-xs"><div className="flex min-w-0 items-center gap-2"><Paperclip className="h-4 w-4 shrink-0 text-primary" /><span className="truncate font-medium text-foreground">{selectedFile.name}</span><span className="shrink-0 text-muted-foreground">{formatFileSize(selectedFile.size)}</span></div><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedFile(null)} title="Remove attachment" aria-label="Remove attachment"><X className="h-4 w-4" /></Button></div>}
              <form onSubmit={handleSend} className="flex items-end gap-1.5 sm:gap-2">
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/csv,.docx,.xlsx,.pptx" />
                <Button type="button" variant="outline" size="icon" className="chat-composer-tool h-9 w-9 shrink-0 rounded-lg" onClick={() => fileInputRef.current?.click()} title="Attach file" aria-label="Attach file" disabled={Boolean(editingMessage)}><Paperclip className="h-4 w-4" /></Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="icon" className="chat-composer-tool h-9 w-9 shrink-0 rounded-lg" title="Insert emoji" aria-label="Insert emoji"><SmilePlus className="h-4 w-4" /></Button>
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
                <Button type="submit" size="icon" className="chat-composer-send h-9 w-9 flex-shrink-0 rounded-lg gradient-primary shadow-riana transition-transform hover:scale-105 active:scale-95" disabled={isSending || activeChatUserId === currentUser.id || (!inputText.trim() && !selectedFile)} title={editingMessage ? "Save edited message" : "Send message"} aria-label={editingMessage ? "Save edited message" : "Send message"}>{isSending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send className="h-4 w-4" />}</Button>
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
