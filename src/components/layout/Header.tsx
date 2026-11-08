import { useState, useEffect, useRef } from "react";
import type { Driver } from "driver.js";
import { HelpCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, LogOut, Settings, Sun, Moon, MessageSquare, Menu, Phone, PhoneOff, Video, Mic, X } from "lucide-react";
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
import { apiClient } from "@/integrations/apiClient";
import { DEFAULT_TIME_ZONE, getGreeting, resolveTimeZone, TIME_ZONE_PREFERENCE_CHANGED_EVENT } from "@/utils/dateTime";
import { refreshServerClock, serverClockSnapshot, subscribeServerClock } from "@/utils/serverClock";

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
  onTourNavigationPreview?: (active: boolean) => void;
}

export const Header = ({ user, className, setActiveModule, onOpenMobileMenu, onProfileUpdate, onTourNavigationPreview }: HeaderProps) => {
  const systemTour = useRef<Driver>();
  const { toast } = useToast();
  useEffect(() => () => systemTour.current?.destroy(), []);
  const beginSystemTour = () => {
    setTimeout(() => { void import("@/components/tours/systemTour").then(({ startSystemTour }) => startSystemTour(onTourNavigationPreview || (() => {}))).then((tour) => { systemTour.current = tour; }).catch(() => toast({ title: "Unable to start system tour", description: "Reload the page and try again.", variant: "destructive" })); }, 0);
  };
  const { logout } = useAuth();
  const { getCompanySettings } = useDatabase();
  const getCompanySettingsRef = useRef(getCompanySettings);
  getCompanySettingsRef.current = getCompanySettings;
  const [logoPath, setLogoPath] = useState(TRANSPARENT_RIANA_LOGO);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [accountDialogView, setAccountDialogView] = useState<"profile" | "settings">("profile");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isChatFullscreen, setIsChatFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => {
    const clock = serverClockSnapshot();
    return new Date(clock.ready ? clock.now : Date.now());
  });
  const [userTimeZone, setUserTimeZone] = useState(DEFAULT_TIME_ZONE);
  const [callElapsedSeconds, setCallElapsedSeconds] = useState(0);
  const chat = useChat(user);
  const avatarSrc = resolveAvatarUrl(user.avatar_url);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'dark') return true;
      if (savedTheme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches;
      // Default to light theme
      return false;
    }
    return false;
  });

  // Load logo on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await getCompanySettingsRef.current();
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
    
    if (savedTheme === 'dark' || (savedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
      setIsDarkMode(true);
    } else {
      // Default to light - remove dark class
      document.documentElement.classList.remove('dark');
      setIsDarkMode(false);
    }
    return () => window.removeEventListener('riana-company-branding-updated', handleBrandingUpdate);
  }, []);

  useEffect(() => {
    const initialClock = serverClockSnapshot();
    let renderedMinute = Math.floor((initialClock.ready ? initialClock.now : Date.now()) / 60_000);
    const updateFromServerClock = () => {
      const clock = serverClockSnapshot();
      if (!clock.ready) return;
      const minute = Math.floor(clock.now / 60_000);
      if (minute === renderedMinute) return;
      renderedMinute = minute;
      setCurrentTime(new Date(clock.now));
    };
    const unsubscribe = subscribeServerClock(updateFromServerClock);
    void refreshServerClock().then(updateFromServerClock);
    return unsubscribe;
  }, []);

  useEffect(() => {
    void apiClient.get('/communication/preferences')
      .then((preferences) => {
        if (typeof preferences?.timezone === 'string' && preferences.timezone) setUserTimeZone(resolveTimeZone(preferences.timezone));
        if (['light', 'dark', 'system'].includes(preferences?.theme)) {
          const savedTheme = localStorage.getItem('theme');
          const theme = savedTheme && ['light', 'dark', 'system'].includes(savedTheme)
            ? savedTheme
            : preferences.theme;
          localStorage.setItem('theme', theme);
          const useDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
          document.documentElement.classList.toggle('dark', useDark);
          setIsDarkMode(useDark);
        }
      })
      .catch(() => undefined);
    const handleTimeZoneChange = (event: Event) => {
      const timeZone = (event as CustomEvent<{ timeZone?: string }>).detail?.timeZone;
      setUserTimeZone(resolveTimeZone(timeZone));
      const clock = serverClockSnapshot();
      if (clock.ready) setCurrentTime(new Date(clock.now));
    };
    window.addEventListener(TIME_ZONE_PREFERENCE_CHANGED_EVENT, handleTimeZoneChange);
    const handleThemeChange = (event: Event) => {
      const theme = (event as CustomEvent<{ theme?: string }>).detail?.theme;
      if (!theme || !['light', 'dark', 'system'].includes(theme)) return;
      const useDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', useDark);
      setIsDarkMode(useDark);
    };
    window.addEventListener('riana-theme-preference-changed', handleThemeChange);
    return () => {
      window.removeEventListener(TIME_ZONE_PREFERENCE_CHANGED_EVENT, handleTimeZoneChange);
      window.removeEventListener('riana-theme-preference-changed', handleThemeChange);
    };
  }, [user.id]);

  // Listen for system preference changes (auto-detect)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // Only auto-update if no manual preference is saved
      const savedTheme = localStorage.getItem('theme');
      if (!savedTheme || savedTheme === 'system') {
        setIsDarkMode(e.matches);
        if (e.matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    };

    const handleOpenChat = () => setIsChatOpen(true);
    const handleThemeStorage = (event: StorageEvent) => {
      if (event.key !== 'theme') return;
      const theme = event.newValue || 'system';
      const useDark = theme === 'dark' || (theme === 'system' && mediaQuery.matches);
      document.documentElement.classList.toggle('dark', useDark);
      setIsDarkMode(useDark);
    };
    window.addEventListener('open-chat', handleOpenChat);
    window.addEventListener('storage', handleThemeStorage);

    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      window.removeEventListener('open-chat', handleOpenChat);
      window.removeEventListener('storage', handleThemeStorage);
    };
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    const theme = newMode ? 'dark' : 'light';
    setIsDarkMode(newMode);
    document.documentElement.classList.toggle('dark', newMode);
    localStorage.setItem('theme', theme);
    void apiClient.patch('/communication/preferences/theme', { theme }).catch((error) => {
      // Local theme is already active and persisted in localStorage.
      console.warn('Account theme synchronization was deferred:', error?.message || error);
    });
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

  const greeting = getGreeting(currentTime, userTimeZone);

  const getChatDisplayName = (firstName?: string | null, lastName?: string | null, fallback = "A colleague") => {
    const name = `${firstName || ""} ${lastName || ""}`.trim();
    return name || fallback;
  };

  const openChatForCall = (otherUserId?: string | null) => {
    if (otherUserId) chat.setActiveChatUserId(otherUserId);
    setIsChatOpen(true);
  };

  const minimizeChat = () => {
    setIsChatFullscreen(false);
    setIsChatOpen(false);
  };

  const closeChat = () => {
    setIsChatFullscreen(false);
    setIsChatOpen(false);
  };

  const incomingCall = chat.incomingCall;
  const activeCall = chat.activeCall;
  const missedCall = chat.missedCalls[0];
  const messageBadgeCount = chat.totalUnread + (incomingCall ? 1 : 0) + chat.missedCalls.length;
  useEffect(() => {
    if (!activeCall) { setCallElapsedSeconds(0); return; }
    const startedAt = new Date(activeCall.call_started_at || activeCall.created_at).getTime();
    const refresh = () => setCallElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    refresh();
    const interval = window.setInterval(refresh, 1000);
    return () => window.clearInterval(interval);
  }, [activeCall]);
  const dispatchCallControl = (action: "microphone" | "camera" | "hangup") => window.dispatchEvent(new CustomEvent("riana-call-control", { detail: { action } }));
  const callDuration = `${String(Math.floor(callElapsedSeconds / 60)).padStart(2, "0")}:${String(callElapsedSeconds % 60).padStart(2, "0")}`;

  return (
    <header data-tour="system-header" className={cn("enterprise-header text-white", className)}>
      <div className="flex h-14 w-full min-w-0 items-center justify-between px-2 sm:h-16 sm:px-4 xl:px-6">
        <div className="flex min-w-0 w-full items-center justify-between gap-2 sm:gap-3">
          {/* Logo and Title - Responsive */}
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenMobileMenu}
              className="h-10 w-10 shrink-0 text-white hover:bg-white/10 hover:text-white focus-visible:ring-white lg:hidden"
              title="Open navigation menu" aria-label="Open navigation menu"
              data-tour="system-mobile-menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden sm:h-12 sm:w-12">
              <img 
                src={logoPath} 
                alt="RIANA Group" 
                className="max-h-9 max-w-10 object-contain sm:max-h-10 sm:max-w-12"
                onError={(e) => {
                  if (e.currentTarget.src.includes(logoPath) && logoPath !== TRANSPARENT_RIANA_LOGO) {
                    setLogoPath(TRANSPARENT_RIANA_LOGO);
                  }
                }}
              />
            </div>
            <div className="block min-w-0 max-w-[88px] leading-none min-[360px]:max-w-[112px] min-[420px]:max-w-none">
              <h1 className="truncate text-[13px] font-bold leading-[1.1] tracking-normal min-[360px]:text-sm sm:text-xl xl:text-2xl">RIANA CIMS</h1>
              <p className="mt-0.5 hidden truncate text-xs font-normal leading-tight text-white/85 min-[420px]:block sm:text-sm">Client Installation Management</p>
            </div>
          </div>

          {/* Action Buttons - Responsive */}
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5 xl:gap-2.5">
            {/* Notification Bell - Always visible */}
            <div data-tour="system-notifications"><NotificationBell
              user={user}
              onNavigate={setActiveModule}
              triggerClassName="h-9 w-9 rounded-lg text-white hover:bg-white/10 hover:text-white focus-visible:ring-white dark:text-white"
            /></div>

            {/* Chat Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => isChatOpen ? minimizeChat() : setIsChatOpen(true)}
              className="relative h-9 w-9 rounded-lg text-white transition-colors duration-200 hover:bg-white/10 focus-visible:ring-white"
              title="Open Chat"
              aria-label="Open messages"
              data-tour="system-messages"
            >
              <MessageSquare className="h-4 w-4" />
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
              data-tour="system-theme"
              className="h-9 w-9 rounded-lg text-white transition-colors duration-200 hover:bg-white/10 focus-visible:ring-white"
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"} aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? (
                <Sun className="h-4 w-4 transition-transform duration-300 rotate-0" />
              ) : (
                <Moon className="h-4 w-4 transition-transform duration-300 rotate-0" />
              )}
            </Button>
            
            {/* Signed-in identity - Hidden on smaller screens */}
            <div className="hidden min-w-[128px] max-w-[220px] flex-col items-end leading-tight lg:flex" aria-label={`${greeting} Signed in as ${getUserDisplayName()}`}>
              <span className="max-w-full truncate text-[11px] font-medium text-white/75">{greeting}</span>
              <span className="mt-0.5 max-w-full truncate text-sm font-semibold text-white">{getUserDisplayName()}</span>
            </div>
            
            {/* User Menu Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-tour="system-profile" title="Open profile menu" aria-label="Open profile menu" variant="ghost" className="relative h-9 w-9 overflow-hidden rounded-full border-2 border-white/35 p-0 text-white shadow-[0_3px_10px_rgba(0,0,0,0.16)] transition-colors hover:bg-white/10 focus-visible:ring-white sm:h-10 sm:w-10">
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
                <DropdownMenuItem onSelect={beginSystemTour}><HelpCircle className="mr-2 h-4 w-4" />System Tour</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setAccountDialogView("profile"); setIsProfileSettingsOpen(true); }}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setAccountDialogView("settings"); setIsProfileSettingsOpen(true); }}>
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
        view={accountDialogView}
      />

      {!isChatOpen && incomingCall && (
        <div className="fixed inset-x-3 bottom-4 z-40 animate-in slide-in-from-bottom-4 sm:left-auto sm:right-4 sm:w-[min(92vw,420px)]">
          <div className="overflow-hidden rounded-2xl border border-[hsl(var(--comm-border-strong))] bg-background/95 text-foreground shadow-2xl backdrop-blur-xl dark:border-white/20">
            <div className="flex items-center gap-3 border-b border-primary/10 bg-primary/10 px-4 py-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-riana">
                {incomingCall.call_type === "video" ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">Incoming {incomingCall.call_type === "video" ? "video" : "phone"} call</p>
                <p className="truncate text-xs text-muted-foreground">{getChatDisplayName(incomingCall.sender_first_name, incomingCall.sender_last_name)} is calling</p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => chat.clearCallState()} title="Hide call notification" aria-label="Hide call notification">
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
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" disabled={chat.dismissingMissedCallIds.has(missedCall.id)} onClick={async () => {
                const dismissed = await chat.dismissMissedCall(missedCall.id);
                if (!dismissed) toast({ title: "Missed call not dismissed", description: "The dismissal could not be saved. Check your connection and try again.", variant: "destructive" });
              }} title="Dismiss missed call" aria-label="Dismiss missed call">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 rounded-full" onClick={() => openChatForCall(missedCall.sender_id)}>
                <MessageSquare className="mr-2 h-4 w-4" />Open chat
              </Button>
              <Button size="sm" variant="ghost" className="rounded-full" disabled={chat.dismissingMissedCallIds.has(missedCall.id)} onClick={async () => {
                const dismissed = await chat.dismissMissedCall(missedCall.id);
                if (!dismissed) toast({ title: "Missed call not dismissed", description: "The dismissal could not be saved. Check your connection and try again.", variant: "destructive" });
              }}>Dismiss</Button>
            </div>
          </div>
        </div>
      )}

      {!isChatOpen && activeCall && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[min(94vw,560px)] -translate-x-1/2 rounded-2xl border border-primary/20 bg-background/95 p-3 text-foreground shadow-2xl backdrop-blur-xl sm:left-auto sm:right-4 sm:translate-x-0" aria-label="Active call controls">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{activeCall.call_type === "video" ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">Active {activeCall.call_type === "video" ? "video" : "phone"} call</p>
              <p className="text-xs tabular-nums text-muted-foreground">{callDuration}</p>
            </div>
            <Button size="icon" variant="outline" className="rounded-full" onClick={() => dispatchCallControl("microphone")} title="Toggle microphone" aria-label="Toggle microphone"><Mic className="h-4 w-4" /></Button>
            {activeCall.call_type === "video" && <Button size="icon" variant="outline" className="rounded-full" onClick={() => dispatchCallControl("camera")} title="Toggle camera" aria-label="Toggle camera"><Video className="h-4 w-4" /></Button>}
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => setIsChatOpen(true)}>Return to call</Button>
            <Button size="icon" variant="destructive" className="rounded-full" onClick={() => dispatchCallControl("hangup")} title="End call" aria-label="End call"><PhoneOff className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {(isChatOpen || activeCall) && (
        <div
          className={cn(
            isChatOpen
              ? "fixed inset-x-0 bottom-0 top-[calc(3.75rem+env(safe-area-inset-top))] z-40 bg-black/30 p-0 backdrop-blur-[2px] animate-in fade-in sm:inset-0 sm:z-50 sm:flex sm:items-end sm:justify-end sm:bg-black/40 sm:p-2.5 md:p-4"
              : "pointer-events-none fixed -left-[10000px] top-0 h-px w-px overflow-hidden opacity-0",
            isChatOpen && isChatFullscreen && "inset-0 top-0 z-[100] bg-background p-0 sm:p-0 md:p-0",
          )}
          onMouseDown={minimizeChat}
        >
          <div
            className={cn(
              "h-full w-full animate-in slide-in-from-bottom-5",
              activeCall
                ? "sm:h-[min(860px,calc(100dvh-32px))] md:w-[min(96vw,1380px)] xl:w-[min(96vw,1560px)]"
                : "sm:h-[min(760px,calc(100dvh-88px))] md:w-[min(94vw,1160px)]",
              isChatFullscreen && "h-dvh sm:h-dvh md:w-screen xl:w-screen",
            )}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <ChatModule currentUser={user} chat={chat} onClose={closeChat} onMinimize={minimizeChat} onToggleFullscreen={() => setIsChatFullscreen(value => !value)} isFullscreen={isChatFullscreen} />
          </div>
        </div>
      )}
    </header>
  );
};
