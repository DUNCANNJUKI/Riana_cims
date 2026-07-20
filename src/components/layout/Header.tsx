import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, LogOut, Settings, Sun, Moon, MessageSquare, Menu, Phone, PhoneOff, Video, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { User as UserType } from "@/types";
import { cn } from "@/lib/utils";
import { ProfileSettingsDialog } from "@/components/profile/ProfileSettingsDialog";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { useDatabase } from "@/hooks/useDatabase";
import { useChat } from "@/hooks/useChat";
import { ChatModule } from "@/components/chat/ChatModule";
import { getCompanyBrandingEventDetail, resolveCompanyLogoUrl } from "@/utils/logoUrl";
import { formatRoleLabel } from "@/utils/roleLabel";
import { resolveAvatarUrl } from "@/utils/avatar";

const TRANSPARENT_RIANA_LOGO = "/Riana_mark_transparent.png";

const resolveHeaderLogoUrl = (logoPath?: string | null, version?: string | number | null) => {
  if (!logoPath || /(?:^|\/)Riana_logo\.png(?:$|\?)/i.test(logoPath)) {
    return TRANSPARENT_RIANA_LOGO;
  }
  return resolveCompanyLogoUrl(logoPath, version);
};

interface HeaderProps {
  user: UserType;
  className?: string;
  setActiveModule?: (module: string) => void;
  onOpenMobileMenu?: () => void;
  onProfileUpdate?: () => void | Promise<void>;
}

export const Header = ({ user, className, setActiveModule, onOpenMobileMenu, onProfileUpdate }: HeaderProps) => {
  const { logout } = useAuth();
  const { getCompanySettings } = useDatabase();
  const [logoPath, setLogoPath] = useState(TRANSPARENT_RIANA_LOGO);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const chat = useChat(user);
  const avatarSrc = resolveAvatarUrl(user.avatar_url);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme) {
        return savedTheme === 'dark';
      }
      // Default to light theme
      return false;
    }
    return false;
  });

  // Load logo on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getCompanySettings();
        if (settings?.logo_path) {
          setLogoPath(resolveHeaderLogoUrl(settings.logo_path, settings.updated_at || settings.id));
        }
      } catch (error) {
        console.error("Error loading logo settings:", error);
      }
    };
    loadSettings();

    const handleBrandingUpdate = (event: Event) => {
      const { logoPath, version } = getCompanyBrandingEventDetail(event);
      setLogoPath(resolveHeaderLogoUrl(logoPath, version));
    };

    window.addEventListener('riana-company-branding-updated', handleBrandingUpdate);
    
    const savedTheme = localStorage.getItem('theme');
    
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
      setIsDarkMode(true);
    } else {
      // Default to light - remove dark class
      document.documentElement.classList.remove('dark');
      setIsDarkMode(false);
    }
    return () => window.removeEventListener('riana-company-branding-updated', handleBrandingUpdate);
  }, []);

  // Listen for system preference changes (auto-detect)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // Only auto-update if no manual preference is saved
      const savedTheme = localStorage.getItem('theme');
      if (!savedTheme) {
        setIsDarkMode(e.matches);
        if (e.matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };

    const handleOpenChat = () => setIsChatOpen(true);
    window.addEventListener('open-chat', handleOpenChat);

    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      window.removeEventListener('open-chat', handleOpenChat);
    };
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };
  const getUserInitials = () => {
    if (user.first_name && user.last_name) {
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    }
    return user.email.charAt(0).toUpperCase();
  };

  const getUserDisplayName = () => {
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return user.email;
  };

  const getChatDisplayName = (firstName?: string | null, lastName?: string | null, fallback = "A colleague") => {
    const name = `${firstName || ""} ${lastName || ""}`.trim();
    return name || fallback;
  };

  const openChatForCall = (otherUserId?: string | null) => {
    if (otherUserId) chat.setActiveChatUserId(otherUserId);
    setIsChatOpen(true);
  };

  const incomingCall = chat.incomingCall;
  const missedCall = chat.missedCalls[0];
  const messageBadgeCount = chat.totalUnread + (incomingCall ? 1 : 0) + chat.missedCalls.length;

  return (
    <header className={cn("enterprise-header text-white", className)}>
      <div className="flex h-16 w-full min-w-0 items-center justify-between px-2 sm:h-[72px] sm:px-4 xl:px-6">
        <div className="flex min-w-0 w-full items-center justify-between gap-2 sm:gap-3">
          {/* Logo and Title - Responsive */}
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenMobileMenu}
              className="h-10 w-10 shrink-0 text-white hover:bg-white/10 hover:text-white focus-visible:ring-white lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden sm:h-14 sm:w-14">
              <img 
                src={logoPath} 
                alt="RIANA Group" 
                className="max-h-10 max-w-11 object-contain sm:max-h-[46px] sm:max-w-[54px]"
                onError={(e) => {
                  if (e.currentTarget.src.includes(logoPath) && logoPath !== TRANSPARENT_RIANA_LOGO) {
                    setLogoPath(TRANSPARENT_RIANA_LOGO);
                  }
                }}
              />
            </div>
            <div className="block min-w-0 max-w-[88px] leading-none min-[360px]:max-w-[112px] min-[420px]:max-w-none">
              <h1 className="truncate text-[13px] font-bold leading-[1.1] tracking-normal min-[360px]:text-sm sm:text-2xl xl:text-[29px]">RIANA CIMS</h1>
              <p className="mt-1 hidden truncate text-xs font-normal leading-tight text-white/85 min-[420px]:block sm:text-[15px] xl:text-base">Client Installation Management</p>
            </div>
          </div>

          {/* Action Buttons - Responsive */}
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-2 xl:gap-4">
            {/* Notification Bell - Always visible */}
            <NotificationBell
              user={user}
              onNavigate={setActiveModule}
              triggerClassName="h-9 w-9 sm:h-10 sm:w-10 text-white hover:bg-white/10 hover:text-white focus-visible:ring-white dark:text-white"
            />

            {/* Chat Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsChatOpen(!isChatOpen)}
              className="relative h-9 w-9 text-white transition-colors duration-200 hover:bg-white/10 focus-visible:ring-white sm:h-10 sm:w-10"
              title="Open Chat"
              aria-label="Open messages"
            >
              <MessageSquare className="h-5 w-5" />
              {messageBadgeCount > 0 && (
                <Badge className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-red-500 px-1 text-[10px] animate-pulse">
                  {messageBadgeCount > 9 ? "9+" : messageBadgeCount}
                </Badge>
              )}
            </Button>
            
            {/* Dark Mode Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleDarkMode}
              className="h-9 w-9 text-white transition-colors duration-200 hover:bg-white/10 focus-visible:ring-white sm:h-10 sm:w-10"
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? (
                <Sun className="h-5 w-5 transition-transform duration-300 rotate-0" />
              ) : (
                <Moon className="h-5 w-5 transition-transform duration-300 rotate-0" />
              )}
            </Button>
            
            {/* Signed-in identity - Hidden on smaller screens */}
            <div className="hidden min-w-[128px] max-w-[220px] flex-col items-end leading-tight lg:flex">
              <span className="max-w-full truncate text-sm font-semibold text-white">
                {getUserDisplayName()}
              </span>
              <span className="mt-0.5 max-w-full truncate text-[11px] font-medium text-white/75">
                {user.designation || formatRoleLabel(user.role)}
              </span>
            </div>
            
            {/* User Menu Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 overflow-hidden rounded-full border-2 border-white/35 p-0 text-white shadow-[0_3px_10px_rgba(0,0,0,0.16)] transition-colors hover:bg-white/10 focus-visible:ring-white sm:h-12 sm:w-12">
                  <Avatar className="h-full w-full">
                    <AvatarImage src={avatarSrc} alt={getUserDisplayName()} />
                    <AvatarFallback className="bg-gradient-to-br from-primary-foreground to-white text-sm font-bold text-primary sm:text-lg">
                      {getUserInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    <p className="font-medium text-sm">{getUserDisplayName()}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRoleLabel(user.role)} | {user.designation || 'No designation'}
                    </p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsProfileSettingsOpen(true)}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsProfileSettingsOpen(true)}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      
      <ProfileSettingsDialog
        isOpen={isProfileSettingsOpen}
        onClose={() => setIsProfileSettingsOpen(false)}
        user={user}
        onProfileUpdate={onProfileUpdate}
      />

      {!isChatOpen && incomingCall && (
        <div className="fixed inset-x-3 bottom-4 z-40 animate-in slide-in-from-bottom-4 sm:left-auto sm:right-4 sm:w-[min(92vw,420px)]">
          <div className="overflow-hidden rounded-2xl border border-white/20 bg-background/95 text-foreground shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-3 border-b border-primary/10 bg-primary/10 px-4 py-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-riana">
                {incomingCall.call_type === "video" ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">Incoming {incomingCall.call_type === "video" ? "video" : "phone"} call</p>
                <p className="truncate text-xs text-muted-foreground">{getChatDisplayName(incomingCall.sender_first_name, incomingCall.sender_last_name)} is calling</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => chat.clearCallState()} aria-label="Hide call notification">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 p-3">
              <Button size="sm" className="flex-1 rounded-full" onClick={() => openChatForCall(incomingCall.sender_id)}>
                <Phone className="mr-2 h-4 w-4" />Open call
              </Button>
              <Button size="sm" variant="destructive" className="flex-1 rounded-full" onClick={() => void chat.updateCallStatus(incomingCall.id, "declined")}>
                <PhoneOff className="mr-2 h-4 w-4" />Decline
              </Button>
            </div>
          </div>
        </div>
      )}

      {!isChatOpen && !incomingCall && missedCall && (
        <div className="fixed inset-x-3 bottom-4 z-40 animate-in slide-in-from-bottom-4 sm:left-auto sm:right-4 sm:w-[min(92vw,390px)]">
          <div className="rounded-2xl border border-primary/15 bg-background/95 p-4 text-foreground shadow-2xl backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <PhoneOff className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Missed {missedCall.call_type === "video" ? "video" : "phone"} call</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">From {getChatDisplayName(missedCall.sender_first_name, missedCall.sender_last_name)}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => chat.dismissMissedCall(missedCall.id)} aria-label="Dismiss missed call">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 rounded-full" onClick={() => openChatForCall(missedCall.sender_id)}>
                <MessageSquare className="mr-2 h-4 w-4" />Open chat
              </Button>
              <Button size="sm" variant="ghost" className="rounded-full" onClick={() => chat.dismissMissedCall(missedCall.id)}>Dismiss</Button>
            </div>
          </div>
        </div>
      )}

      {isChatOpen && (
        <div
          className="fixed inset-x-2 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] top-[calc(4rem+env(safe-area-inset-top))] z-40 bg-black/25 p-0 backdrop-blur-[2px] animate-in fade-in sm:inset-0 sm:z-50 sm:flex sm:items-end sm:justify-end sm:bg-black/35 sm:p-3 md:p-4"
          onMouseDown={() => setIsChatOpen(false)}
        >
          <div
            className="h-full w-full animate-in slide-in-from-bottom-5 sm:h-[min(760px,calc(100dvh-96px))] md:w-[min(94vw,1120px)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <ChatModule currentUser={user} chat={chat} onClose={() => setIsChatOpen(false)} />
          </div>
        </div>
      )}
    </header>
  );
};
