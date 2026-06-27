import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, LogOut, Settings, ExternalLink, Sun, Moon, MessageSquare } from "lucide-react";
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
import { RedirectDialog } from "@/components/common/RedirectDialog";
import { ProfileSettingsDialog } from "@/components/profile/ProfileSettingsDialog";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { useDatabase } from "@/hooks/useDatabase";
import { useChat } from "@/hooks/useChat";
import { ChatModule } from "@/components/chat/ChatModule";
import { getCompanyBrandingEventDetail, resolveCompanyLogoUrl } from "@/utils/logoUrl";
import { formatRoleLabel } from "@/utils/roleLabel";

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
}

export const Header = ({ user, className, setActiveModule }: HeaderProps) => {
  const { logout } = useAuth();
  const { getCompanySettings } = useDatabase();
  const [logoPath, setLogoPath] = useState(TRANSPARENT_RIANA_LOGO);
  const [isRedirectDialogOpen, setIsRedirectDialogOpen] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const { totalUnread } = useChat(user);
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
  
  const getRoleColor = (role: string) => {
    switch (role) {
      case 'SuperAdmin':
        return 'border-red-300 bg-red-600 text-white hover:bg-red-600';
      case 'Admin':
        return 'border-rose-300 bg-rose-600 text-white hover:bg-rose-600';
      case 'Management':
        return 'border-indigo-300 bg-indigo-600 text-white hover:bg-indigo-600';
      case 'Finance':
        return 'border-emerald-300 bg-emerald-700 text-white hover:bg-emerald-700';
      case 'Teamlead':
        return 'bg-primary';
      case 'Developer':
        return 'bg-violet-600';
      case 'Sales':
        return 'bg-amber-600';
      case 'User':
        return 'bg-secondary';
      default:
        return 'bg-muted';
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

  return (
    <header className={cn("enterprise-header text-white", className)}>
      <div className="flex h-[64px] w-full items-center justify-between px-3 sm:h-[72px] sm:px-6">
        <div className="flex w-full items-center justify-between gap-3">
          {/* Logo and Title - Responsive */}
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-4">
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
            <div className="min-w-0 leading-none">
              <h1 className="truncate text-lg font-bold leading-[1.1] tracking-normal sm:text-2xl xl:text-[29px]">RIANA CIMS</h1>
              <p className="mt-1 truncate text-xs font-normal leading-tight text-white/85 sm:text-[15px] xl:text-base">Client Installation Management</p>
            </div>
          </div>

          {/* Action Buttons - Responsive */}
          <div className="ml-auto flex flex-shrink-0 items-center gap-1.5 sm:gap-3 xl:gap-[22px]">
            {/* Optimus Button - Hidden on very small screens */}
            <Button 
              variant="default"
              size="sm"
              onClick={() => setIsRedirectDialogOpen(true)}
              className="hidden h-10 bg-white px-3 text-xs font-semibold text-primary shadow-sm transition-colors hover:bg-white/90 focus-visible:ring-white sm:flex sm:text-sm"
            >
              <ExternalLink className="h-[18px] w-[18px] sm:mr-2" />
              <span className="hidden sm:inline">Optimus</span>
            </Button>

            {/* Notification Bell - Always visible */}
            <NotificationBell
              user={user}
              onNavigate={setActiveModule}
              triggerClassName="h-10 w-10 text-white hover:bg-white/10 hover:text-white focus-visible:ring-white dark:text-white"
            />

            {/* Chat Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsChatOpen(!isChatOpen)}
              className="relative h-10 w-10 text-white transition-colors duration-200 hover:bg-white/10 focus-visible:ring-white"
              title="Open Chat"
            >
              <MessageSquare className="h-5 w-5" />
              {totalUnread > 0 && (
                <Badge className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center p-0 bg-red-500 text-[10px] animate-pulse border-white border">
                  {totalUnread}
                </Badge>
              )}
            </Button>
            
            {/* Dark Mode Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleDarkMode}
              className="h-10 w-10 text-white transition-colors duration-200 hover:bg-white/10 focus-visible:ring-white"
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? (
                <Sun className="h-5 w-5 transition-transform duration-300 rotate-0" />
              ) : (
                <Moon className="h-5 w-5 transition-transform duration-300 rotate-0" />
              )}
            </Button>
            
            {/* Role Badge - Hidden on mobile */}
            <Badge className={`hidden h-[30px] rounded-full border px-3.5 text-xs font-semibold shadow-sm sm:inline-flex ${getRoleColor(user.role)}`}>
              {formatRoleLabel(user.role)}
            </Badge>
            
            {/* User Menu Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 overflow-hidden rounded-full border-2 border-white/35 p-0 text-white shadow-[0_3px_10px_rgba(0,0,0,0.16)] transition-colors hover:bg-white/10 focus-visible:ring-white sm:h-12 sm:w-12">
                  <Avatar className="h-full w-full">
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
                      {formatRoleLabel(user.role)} • {user.designation || 'No designation'}
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
      
      <RedirectDialog 
        isOpen={isRedirectDialogOpen}
        onClose={() => setIsRedirectDialogOpen(false)}
        targetUrl="https://optimus.rianadevelopment.com/auth/login"
        targetName="Optimus"
      />

      <ProfileSettingsDialog
        isOpen={isProfileSettingsOpen}
        onClose={() => setIsProfileSettingsOpen(false)}
        user={user}
      />

      {isChatOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-[90vw] max-w-[400px] md:max-w-4xl h-[600px] animate-in slide-in-from-bottom-5">
           <ChatModule currentUser={user} onClose={() => setIsChatOpen(false)} />
        </div>
      )}
    </header>
  );
};
