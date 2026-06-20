import { useState } from 'react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { 
  Bell,
  Filter,
  CheckCheck,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Inbox,
  Trash2,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useUserNotifications,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
  useRealtimeNotifications,
} from '@/hooks/useNotificationsData';
import { cn } from '@/lib/utils';

type NotificationType = 'info' | 'success' | 'warning' | 'error';

const typeConfig: Record<NotificationType, { icon: typeof Info; className: string; label: string }> = {
  info: { icon: Info, className: 'text-blue-500 bg-blue-500/10', label: 'Info' },
  success: { icon: CheckCircle2, className: 'text-green-500 bg-green-500/10', label: 'Success' },
  warning: { icon: AlertTriangle, className: 'text-amber-500 bg-amber-500/10', label: 'Warning' },
  error: { icon: XCircle, className: 'text-red-500 bg-red-500/10', label: 'Error' },
};

export default function Notifications() {
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [readFilter, setReadFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const { data: notifications, isLoading, error } = useUserNotifications();
  const markAsRead = useMarkNotificationAsRead();
  const markAllAsRead = useMarkAllNotificationsAsRead();
  
  // Enable realtime updates
  useRealtimeNotifications();

  // Filter notifications
  const filteredNotifications = notifications?.filter(notification => {
    if (typeFilter !== 'all' && notification.type !== typeFilter) return false;
    if (readFilter === 'unread' && notification.read) return false;
    if (readFilter === 'read' && !notification.read) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        notification.title.toLowerCase().includes(query) ||
        notification.message.toLowerCase().includes(query)
      );
    }
    return true;
  }) || [];

  const unreadCount = notifications?.filter(n => !n.read).length || 0;

  const handleMarkAsRead = async (id: string) => {
    await markAsRead.mutateAsync(id);
  };

  const handleMarkAllAsRead = async () => {
    await markAllAsRead.mutateAsync();
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Notifications
          </h1>
          <p className="text-muted-foreground">View and manage your notifications</p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">Error loading notifications</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground">
            <Bell className="h-6 w-6 text-primary" />
            Notifications
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {unreadCount} unread
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground">
            View and manage your notifications
          </p>
        </div>
        {unreadCount > 0 && (
          <Button 
            variant="outline" 
            onClick={handleMarkAllAsRead}
            disabled={markAllAsRead.isPending}
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark All as Read
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search notifications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
              <Select value={readFilter} onValueChange={setReadFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="unread">Unread</SelectItem>
                  <SelectItem value="read">Read</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      <ScrollArea className="h-[calc(100vh-300px)]">
        <div className="space-y-3">
          {filteredNotifications.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Inbox className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No notifications found</p>
                <p className="text-sm text-muted-foreground">
                  {searchQuery || typeFilter !== 'all' || readFilter !== 'all' 
                    ? 'Try adjusting your filters' 
                    : 'You\'re all caught up!'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredNotifications.map((notification) => {
              const config = typeConfig[notification.type as NotificationType] || typeConfig.info;
              const IconComponent = config.icon;
              
              return (
                <Card 
                  key={notification.id} 
                  className={cn(
                    'card-interactive overflow-hidden transition-all',
                    !notification.read && 'border-l-4 border-l-primary bg-primary/5'
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <div className={cn('rounded-full p-2 h-fit', config.className)}>
                        <IconComponent className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className={cn(
                              'font-semibold text-foreground',
                              !notification.read && 'text-primary'
                            )}>
                              {notification.title}
                            </h4>
                            <p className="text-sm text-muted-foreground mt-1">
                              {notification.message}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className="text-xs">
                              {config.label}
                            </Badge>
                            {!notification.read && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleMarkAsRead(notification.id)}
                                disabled={markAsRead.isPending}
                              >
                                <CheckCheck className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(notification.created_at), 'MMM d, yyyy \'at\' h:mm a')}
                          </span>
                          {notification.action_url && (
                            <Link to={notification.action_url}>
                              <Button variant="link" size="sm" className="h-auto p-0 text-primary">
                                View Details
                                <ExternalLink className="ml-1 h-3 w-3" />
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Summary Stats */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Showing {filteredNotifications.length} of {notifications?.length || 0} notifications
            </span>
            <div className="flex gap-4">
              <span className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-primary" />
                {unreadCount} unread
              </span>
              <span className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                {(notifications?.length || 0) - unreadCount} read
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
