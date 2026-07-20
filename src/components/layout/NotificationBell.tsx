import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bell, CheckCircle2, Clock, AlertTriangle, FileText, Users, Settings, X, Megaphone } from "lucide-react";
import { apiClient } from "@/integrations/apiClient";
import { User } from "@/types";
import { format, isToday, isYesterday, differenceInDays } from "date-fns";
import { playNotificationSound, playAnnouncementSound, playAssignmentSound } from "@/utils/notificationSound";
import { cn } from "@/lib/utils";
import { can } from "@/security/accessControl";

import { useNavigate } from 'react-router-dom';
import { OPERATIONAL_REFRESH_INTERVAL_MS } from "@/utils/refreshIntervals";

interface Notification {
  id: string;
  type: 'assignment' | 'installation' | 'handover' | 'feedback' | 'reminder' | 'announcement';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  link?: string;
  priority?: string;
  persistentId?: string;
  actionUrl?: string;
  requestId?: string;
}

interface NotificationBellProps {
  user: User;
  onNavigate?: (module: string) => void;
  triggerClassName?: string;
}

export const NotificationBell = ({ user, onNavigate, triggerClassName }: NotificationBellProps) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingCounts, setPendingCounts] = useState({
    pendingAssignments: 0,
    pendingInstallations: 0,
    pendingHandovers: 0,
    pendingFeedback: 0,
    pendingAnnouncements: 0
  });
  const previousCountRef = useRef<number>(0);
  const isInitialLoadRef = useRef<boolean>(true);
  const previousIdsRef = useRef<Set<string>>(new Set());
  const assignmentModule = can(user, 'assignments.view') ? 'assignments' : 'technician-dashboard';

  useEffect(() => {
    loadPendingItems();
    
    // Keep background refresh gentle; explicit user actions still update immediately.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadPendingItems(false);
    }, OPERATIONAL_REFRESH_INTERVAL_MS);
    
    return () => clearInterval(interval);
  }, [user.id]);

  const loadPendingItems = async (showLoading = true) => {
    try {
      const newNotifications: Notification[] = [];
      
      const [assignments, installations, announcements, persistentNotifications] = await Promise.all([
        apiClient.get('/client_assignments'),
        apiClient.get('/installations'),
        apiClient.get(`/announcements?user_id=${encodeURIComponent(user.id)}`),
        apiClient.get('/notifications').catch(() => []),
      ]);

      (persistentNotifications || []).forEach((notification: any) => {
        const isAssignment = String(notification.title || '').toLowerCase().includes('assignment');
        const actionUrl = typeof notification.action_url === 'string' ? notification.action_url.trim() : '';
        const isDeveloperRequest = actionUrl.startsWith('/developers');
        newNotifications.push({
          id: `persistent-${notification.id}`,
          persistentId: notification.id,
          type: isAssignment ? 'assignment' : 'reminder',
          title: notification.title,
          message: notification.message,
          timestamp: new Date(notification.created_at),
          read: Boolean(notification.read),
          link: isDeveloperRequest ? 'developers' : isAssignment ? assignmentModule : 'dashboard',
          actionUrl: actionUrl || undefined,
          requestId: notification.request_id || undefined,
        });
      });
      const persistedRequestIds = new Set((persistentNotifications || []).map((notification: any) => notification.request_id).filter(Boolean));

      const userAssignments = (assignments || []).filter((a: any) => 
        (a.hardware_technician_id === user.id || a.software_technician_id === user.id) &&
        ['pending', 'in_progress', 'assigned', 'waiting'].includes(a.status)
      );

      const missionHandovers = (installations || []).filter((i: any) => 
        i.status === 'completed' && !i.handover_file_path
      );

      // 3. Fetch user's installations
      const userInstallations = (installations || []).filter((i: any) => 
        (i.hardware_technician_id === user.id || i.software_technician_id === user.id || i.account_manager_id === user.id) &&
        ['pending', 'in_progress'].includes(i.status)
      );

      const unreadAnnouncements = (announcements || []).filter((announcement: any) => !announcement.is_read);

      const pendingAssignments = userAssignments.length;
      const pendingInstallations = userInstallations.length;
      const pendingHandovers = missionHandovers.length;

      const newTotalCount = pendingAssignments + pendingInstallations + pendingHandovers + unreadAnnouncements.length;
      
      setPendingCounts({
        pendingAssignments,
        pendingInstallations,
        pendingHandovers,
        pendingFeedback: 0,
        pendingAnnouncements: unreadAnnouncements.length
      });

      // Create notifications
      userAssignments.forEach((assignment: any) => {
        if (persistedRequestIds.has(assignment.id)) return;
        newNotifications.push({
          id: `assignment-${assignment.id}`,
          type: 'assignment',
          title: 'Active Assignment',
          message: `You have an active assignment for ${assignment.client_name || 'Unknown Client'}${[assignment.branch, assignment.department_name].filter(Boolean).length ? ` - ${[assignment.branch, assignment.department_name].filter(Boolean).join(' / ')}` : ''}`,
          timestamp: new Date(assignment.created_at),
          read: false,
          link: assignmentModule
        });
      });

      userInstallations.forEach((installation: any) => {
        if (installation.status === 'pending') {
          newNotifications.push({
            id: `installation-pending-${installation.id}`,
            type: 'installation',
            title: 'Pending Installation',
            message: `Installation for ${installation.client_name || 'Unknown Client'} needs to be started`,
            timestamp: new Date(installation.created_at),
            read: false,
            link: 'installations'
          });
        }
      });

      if (user.role === 'SuperAdmin' || user.role === 'Admin' || user.role === 'Teamlead') {
        missionHandovers.forEach((installation: any) => {
          newNotifications.push({
            id: `handover-${installation.id}`,
            type: 'handover',
            title: 'E-Handover Required',
            message: `Upload E-handover for completed installation: ${installation.client_name || 'Unknown Client'}`,
            timestamp: new Date(installation.completion_date || installation.updated_at || new Date()),
            read: false,
            link: 'handover'
          });
        });
      }

      unreadAnnouncements.forEach((announcement: any) => {
        newNotifications.push({
          id: `announcement-${announcement.id}`,
          type: 'announcement',
          title: announcement.title,
          message: announcement.content.substring(0, 100) + (announcement.content.length > 100 ? '...' : ''),
          timestamp: new Date(announcement.created_at),
          read: false,
          link: 'dashboard',
          priority: announcement.priority
        });
      });

      newNotifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      const visibleNotifications = newNotifications.slice(0, 20);
      const newIds = new Set(visibleNotifications.map((notification) => notification.id));
      if (!isInitialLoadRef.current) {
        const added = visibleNotifications.filter((notification) => !notification.read && !previousIdsRef.current.has(notification.id));
        if (added.some((notification) => notification.type === 'announcement')) playAnnouncementSound();
        else if (added.some((notification) => notification.type === 'assignment')) playAssignmentSound();
        else if (added.length > 0 || newTotalCount > previousCountRef.current) playNotificationSound();

        const newest = added[0];
        if (newest && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(newest.title, { body: newest.message, icon: '/pwa-icon.svg', tag: newest.id });
          } catch (error) {
            console.warn('Browser notification could not be displayed:', error);
          }
        }
      }
      previousIdsRef.current = newIds;
      previousCountRef.current = newTotalCount;
      isInitialLoadRef.current = false;
      setNotifications(visibleNotifications);
    } catch (error) {
      console.error('Error loading pending items:', error);
    }
  };

  const totalCount = pendingCounts.pendingAssignments + 
                     pendingCounts.pendingInstallations + 
                     pendingCounts.pendingHandovers +
                     pendingCounts.pendingAnnouncements;

  const markAsRead = (id: string) => {
    const notification = notifications.find(item => item.id === id);
    if (notification?.persistentId) void apiClient.patch(`/notifications/${notification.persistentId}/read`, {});
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  const markAllAsRead = () => {
    void apiClient.post('/notifications/read-all', {});
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    if (notification.type === 'announcement') {
      void apiClient.post(`/announcements/${notification.id.replace('announcement-', '')}/read`, {});
    }
    if (notification.actionUrl) {
      try {
        const destination = new URL(notification.actionUrl, window.location.origin);
        if (destination.origin === window.location.origin && destination.pathname.startsWith('/developers')) {
          onNavigate?.('developers');
          navigate(destination.pathname + destination.search + destination.hash);
          setIsOpen(false);
          return;
        }
      } catch (error) {
        console.warn('Ignored invalid notification destination:', error);
      }
    }
    if (notification.link && onNavigate) {
      onNavigate(notification.link);
      setIsOpen(false);
    }
  };

  const formatTimestamp = (date: Date) => {
    if (isToday(date)) {
      return `Today at ${format(date, 'h:mm a')}`;
    } else if (isYesterday(date)) {
      return `Yesterday at ${format(date, 'h:mm a')}`;
    } else if (differenceInDays(new Date(), date) < 7) {
      return format(date, 'EEEE');
    } else {
      return format(date, 'MMM d, yyyy');
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'assignment':
        return <Users className="h-4 w-4 text-primary" />;
      case 'installation':
        return <Settings className="h-4 w-4 text-warning" />;
      case 'handover':
        return <FileText className="h-4 w-4 text-success" />;
      case 'feedback':
        return <CheckCircle2 className="h-4 w-4 text-secondary" />;
      case 'reminder':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'announcement':
        return <Megaphone className="h-4 w-4 text-primary" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className={cn(
            "relative h-10 w-10 rounded-full border border-transparent text-foreground transition-all hover:border-primary/20 hover:bg-primary/10 hover:text-primary dark:text-foreground",
            totalCount > 0 && "bg-primary/10 text-primary animate-pulse-glow",
            triggerClassName,
          )}
        >
          <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
          {totalCount > 0 && (
            <Badge 
              className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[10px] font-bold text-destructive-foreground shadow-sm"
            >
              {totalCount > 9 ? '9+' : totalCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-[80vh] w-[calc(100vw-16px)] overflow-hidden rounded-2xl border-primary/10 p-0 shadow-2xl sm:w-[26rem]" align="end" sideOffset={8}>
        <div className="flex items-center justify-between border-b border-primary/10 bg-gradient-to-br from-primary/10 via-background to-background p-4">
          <div>
            <h3 className="text-sm font-bold text-foreground sm:text-base">Notifications</h3>
            <p className="text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead} className="rounded-full text-xs hover:bg-primary/10 hover:text-primary">
              Mark all read
            </Button>
          )}
        </div>

        {/* Pending Counters Summary - Responsive Grid */}
        {totalCount > 0 && (
          <div className="grid grid-cols-3 gap-2 border-b border-primary/10 bg-muted/35 p-3 text-center">
            {pendingCounts.pendingAssignments > 0 && (
              <div 
                className="cursor-pointer rounded-xl border border-transparent p-2 transition-all hover:border-primary/15 hover:bg-background hover:shadow-sm"
                onClick={() => { onNavigate?.(assignmentModule); setIsOpen(false); }}
              >
                <div className="text-base sm:text-lg font-bold text-primary">{pendingCounts.pendingAssignments}</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground">Assignments</div>
              </div>
            )}
            {pendingCounts.pendingInstallations > 0 && (
              <div 
                className="cursor-pointer rounded-xl border border-transparent p-2 transition-all hover:border-primary/15 hover:bg-background hover:shadow-sm"
                onClick={() => { onNavigate?.('installations'); setIsOpen(false); }}
              >
                <div className="text-base sm:text-lg font-bold text-warning">{pendingCounts.pendingInstallations}</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground">Installations</div>
              </div>
            )}
            {pendingCounts.pendingHandovers > 0 && (
              <div 
                className="cursor-pointer rounded-xl border border-transparent p-2 transition-all hover:border-primary/15 hover:bg-background hover:shadow-sm"
                onClick={() => { onNavigate?.('handover'); setIsOpen(false); }}
              >
                <div className="text-base sm:text-lg font-bold text-success">{pendingCounts.pendingHandovers}</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground">Handovers</div>
              </div>
            )}
          </div>
        )}

        <ScrollArea className="max-h-[50vh] sm:max-h-80">
          {notifications.length === 0 ? (
            <div className="p-6 sm:p-8 text-center">
              <Bell className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">No notifications</p>
              <p className="text-xs text-muted-foreground mt-1">You're all caught up!</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn("notification-card mx-2 my-1 cursor-pointer p-3", !notification.read && "notification-card-unread")}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("truncate text-sm font-semibold", !notification.read ? "text-foreground" : "text-muted-foreground")}>
                          {notification.title}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearNotification(notification.id);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {notification.message}
                      </p>
                      <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-muted-foreground/75">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(notification.timestamp)}
                      </p>
                    </div>
                    {!notification.read && (
                      <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {notifications.length > 0 && (
          <div className="border-t border-primary/10 bg-muted/25 p-3 text-center">
            <Button 
              variant="ghost" 
              size="sm" 
              className="rounded-full text-xs"
              onClick={() => { onNavigate?.('dashboard'); setIsOpen(false); }}
            >
              View Dashboard
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
