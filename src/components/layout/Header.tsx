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

interface HeaderProps {
  user: UserType;
  className?: string;
  setActiveModule?: (module: string) => void;
}

export const Header = ({ user, className, setActiveModule }: HeaderProps) => {
  const { logout } = useAuth();
  const { getCompanySettings } = useDatabase();
  const [logoPath, setLogoPath] = useState("/Riana_logo.png");
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
          setLogoPath(resolveCompanyLogoUrl(settings.logo_path, settings.updated_at || settings.id));
        }
      } catch (error) {
        console.error("Error loading logo settings:", error);
      }
    };
    loadSettings();

    const handleBrandingUpdate = (event: Event) => {
      const { logoPath, version } = getCompanyBrandingEventDetail(event);
      setLogoPath(resolveCompanyLogoUrl(logoPath, version));
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
      case 'Admin':
        return 'bg-destructive';
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
    <header className={cn("gradient-header text-white shadow-riana", className)}>
      <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-4">
        <div className="flex items-center justify-between gap-2">
          {/* Logo and Title - Responsive */}
          <div className="flex items-center space-x-2 sm:space-x-4 min-w-0">
            <div className="flex-shrink-0 w-20 sm:w-28 h-10 sm:h-12 flex items-center justify-start overflow-hidden">
              <img 
                src={logoPath} 
                alt="RIANA Group" 
                className="h-full w-auto object-contain drop-shadow-lg"
                onError={(e) => {
                  // Fallback to local asset if DB path fails
                  if (e.currentTarget.src.includes(logoPath) && logoPath !== "/Riana_logo.png") {
                    setLogoPath("/Riana_logo.png");
                  }
                }}
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold truncate">RIANA CIMS</h1>
              <p className="text-xs sm:text-sm opacity-90 hidden sm:block">Client Installation Management</p>
            </div>
          </div>

          {/* Action Buttons - Responsive */}
          <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
            {/* Optimus Button - Hidden on very small screens */}
            <Button 
              variant="default"
              size="sm"
              onClick={() => setIsRedirectDialogOpen(true)}
              className="hidden xs:flex bg-white text-primary hover:bg-white/90 font-semibold shadow-lg transition-all hover:scale-105 active:scale-95 text-xs sm:text-sm px-2 sm:px-3"
            >
              <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">Optimus</span>
            </Button>

            {/* Notification Bell - Always visible */}
            <NotificationBell user={user} onNavigate={setActiveModule} />

            {/* Chat Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsChatOpen(!isChatOpen)}
              className="relative h-8 w-8 sm:h-9 sm:w-9 text-white hover:bg-white/10 transition-all duration-300"
              title="Open Chat"
            >
              <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />
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
              className="h-8 w-8 sm:h-9 sm:w-9 text-white hover:bg-white/10 transition-all duration-300"
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? (
                <Sun className="h-4 w-4 sm:h-5 sm:w-5 transition-transform duration-300 rotate-0" />
              ) : (
                <Moon className="h-4 w-4 sm:h-5 sm:w-5 transition-transform duration-300 rotate-0" />
              )}
            </Button>
            
            {/* Role Badge - Hidden on mobile */}
            <Badge variant="outline" className={`hidden sm:inline-flex text-white border-white/30 font-medium text-xs ${getRoleColor(user.role)}`}>
              {user.role}
            </Badge>
            
            {/* User Menu Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 sm:h-11 sm:w-11 rounded-full text-white hover:bg-white/10 p-0 overflow-hidden ring-2 ring-white/30 hover:ring-white/50 transition-all">
                  <Avatar className="h-9 w-9 sm:h-11 sm:w-11">
                    <AvatarFallback className="bg-gradient-to-br from-primary-foreground to-white text-primary font-bold text-sm sm:text-lg">
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
                      {user.role} • {user.designation || 'No designation'}
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
