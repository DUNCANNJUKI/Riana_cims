import { useState, useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { useNavigate } from 'react-router-dom';
import { Bell, Search, User, LogOut, Settings, Moon, Sun, Check, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useCurrentUserRole } from '@/hooks/useCurrentUserRole';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import {
  useUserNotifications,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
  useRealtimeNotifications
} from '@/hooks/useNotificationsData';
import { notificationSound } from '@/lib/notificationSound';

export function Header() {
  const navigate = useNavigate();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { toast } = useToast();
  const userRole = useCurrentUserRole();

  // Persisted notifications from the shared CIMS API
  const { data: notifications = [], isLoading: notificationsLoading } = useUserNotifications();
  const unreadCount = notifications.filter(notification => !notification.read).length;
  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  const knownNotificationIds = useRef<Set<string>>(new Set());
  const notificationsInitialized = useRef(false);

  // Enable realtime updates
  useRealtimeNotifications();

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const currentIds = new Set(notifications.map(notification => notification.id));
    if (notificationsInitialized.current) {
      const added = notifications.filter(notification => !notification.read && !knownNotificationIds.current.has(notification.id));
      if (added.length) {
        notificationSound.play();
        const newest = added[0];
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(newest.title, { body: newest.message, tag: newest.id, icon: '/pwa-icon.svg' });
        }
      }
    }
    knownNotificationIds.current = currentIds;
    notificationsInitialized.current = true;
  }, [notifications]);

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const getRoleBadge = (role: string) => {
    const roleMap: Record<string, string> = {
      admin: 'Admin',
      senior_developer: 'Senior Developer',
      developer: 'Developer',
      sales: 'Sales Team',
    };
    return roleMap[role] || role;
  };

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const handleNotificationClick = (notification: typeof notifications[0]) => {
    if (!notification.read) {
      markAsRead.mutate(notification.id);
    }
    if (notification.action_url) {
      if (/^https?:\/\//i.test(notification.action_url)) window.location.assign(notification.action_url);
      else navigate(notification.action_url);
    }
  };

  const requestBrowserNotificationPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
  };

  const handleMarkAllAsRead = () => {
    markAllAsRead.mutate();
  };

  const getNotificationTypeColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-status-approved';
      case 'warning':
        return 'bg-status-pending';
      case 'error':
        return 'bg-status-rejected';
      default:
        return 'bg-primary';
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card/95 backdrop-blur-sm px-6 shadow-sm">
      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search requests, clients..."
            className="w-[300px] pl-9 bg-muted/50 border-border focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Theme Toggle */}
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="hover:bg-primary/10"
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-5 w-5 text-muted-foreground transition-transform" />
            ) : (
              <Moon className="h-5 w-5 text-muted-foreground transition-transform" />
            )}
          </Button>
        )}

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative hover:bg-primary/10" onClick={requestBrowserNotificationPermission}>
              <Bell className="h-5 w-5 text-muted-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[380px] p-0 bg-popover border-border shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h4 className="font-semibold text-foreground">Notifications</h4>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-primary hover:text-primary hover:bg-primary/10"
                  onClick={handleMarkAllAsRead}
                  disabled={markAllAsRead.isPending}
                >
                  {markAllAsRead.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3 mr-1" />
                  )}
                  Mark all as read
                </Button>
              )}
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {notificationsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    You'll see updates about your requests here
                  </p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      'flex gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer transition-colors',
                      !notification.read && 'bg-primary/5'
                    )}
                  >
                    <div
                      className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        getNotificationTypeColor(notification.type)
                      )}
                    />
                    <div className="flex-1 space-y-1">
                      <p className={cn(
                        "text-sm",
                        !notification.read ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                      )}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </div>
                ))
              )}
            </div>
            {notifications.length > 0 && (
              <div className="border-t border-border p-2">
                <Button
                  variant="ghost"
                  className="w-full text-sm text-primary hover:text-primary hover:bg-primary/10"
                  onClick={() => navigate('/notifications')}
                >
                  View all notifications
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-3 px-2 hover:bg-primary/10">
              <Avatar className="h-8 w-8 border-2 border-primary/20">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                  {userRole.userName ? getInitials(userRole.userName) : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium text-foreground">{userRole.userName || 'Loading...'}</span>
                <span className="text-xs text-muted-foreground">
                  {userRole.roles.length > 0 ? getRoleBadge(userRole.roles[0]) : 'User'}
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-popover border-border shadow-lg">
            <DropdownMenuLabel className="text-foreground">My Account</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem className="hover:bg-primary/10 hover:text-primary cursor-pointer">
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              className="hover:bg-primary/10 hover:text-primary cursor-pointer"
              onClick={() => navigate('/settings')}
            >
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              className="text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
              onClick={() => {
                localStorage.removeItem('crms-user-session');
                localStorage.removeItem('crms-user-id');
                localStorage.removeItem('crms-auth-token');
                toast({ title: 'Logged out', description: 'You have been signed out.' });
                navigate('/login');
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
