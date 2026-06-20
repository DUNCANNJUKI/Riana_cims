import { useState, useEffect } from "react";
import { User } from "@/types";


import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  MapPin, 
  Phone, 
  Mail,
  ChevronRight,
  RefreshCw,
  Wrench,
  User as UserIcon,
  Calendar,
  Building2,
  CheckCheck,
  Loader2,
  Smartphone,
  Wifi,
  WifiOff
} from "lucide-react";
import { toast } from "sonner";
import { format, isToday, isTomorrow, isPast, parseISO } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TechnicianMobileDashboardProps {
  user: User;
}

interface Assignment {
  id: string;
  client_id: string;
  client_name: string;
  branch: string | null;
  contact_person: string;
  contact_phone: string;
  contact_email: string | null;
  status: string;
  installation_start_date: string;
  scheduled_end_date: string | null;
  notes: string | null;
  installation_id?: string;
  kiosk_count?: number;
  counter_count?: number;
  led_count?: number;
  service_points?: number;
}

const statusConfig = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800 border-yellow-300', icon: Clock },
  assigned: { label: 'Assigned', color: 'bg-blue-100 text-blue-800 border-blue-300', icon: UserIcon },
  in_progress: { label: 'In Progress', color: 'bg-purple-100 text-purple-800 border-purple-300', icon: Wrench },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle2 },
  waiting: { label: 'Waiting', color: 'bg-orange-100 text-orange-800 border-orange-300', icon: AlertCircle },
};

import { useDatabase } from "@/hooks/useDatabase";

export const TechnicianMobileDashboard = ({ user }: TechnicianMobileDashboardProps) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [activeTab, setActiveTab] = useState('today');
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const { 
    getAssignments, 
    updateAssignment, 
    updateInstallationStatus 
  } = useDatabase();

  useEffect(() => {
    loadAssignments();

    // Listen for online/offline status
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Poll assignments every 15 seconds for "realtime" updates
    const interval = setInterval(() => {
      loadAssignments(true); // pass true to indicate silent background poll
    }, 15000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [user.id]);

  const loadAssignments = async (isSilent = false) => {
    try {
      if (!isSilent) setIsLoading(true);
      // Fetch all assignments and filter locally for simplicity
      // In a real app, we'd have a backend endpoint for this
      const assignmentsData = await getAssignments();
      
      const filtered = assignmentsData.filter((a: any) => 
        a.hardware_technician_id === user.id || a.software_technician_id === user.id
      );

      const enrichedAssignments: Assignment[] = filtered.map((a: any) => ({
        id: a.id,
        client_id: a.client_id,
        client_name: a.clients?.client_name || 'Unknown Client',
        branch: a.branch || a.clients?.branch,
        contact_person: a.clients?.contact_person_name || '',
        contact_phone: a.clients?.contact_person_phone || '',
        contact_email: a.clients?.contact_person_email || null,
        status: a.status,
        installation_start_date: a.installation_start_date,
        scheduled_end_date: a.scheduled_end_date,
        notes: a.notes,
        installation_id: a.installation_id,
        kiosk_count: a.kiosk_count,
        counter_count: a.counter_count,
        led_count: a.led_count,
        service_points: a.service_points,
      }));

      setAssignments(enrichedAssignments);
      localStorage.setItem('technician_assignments', JSON.stringify(enrichedAssignments));
      if (!isSilent) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    } catch (error) {
      console.error('Error loading assignments:', error);
      const cached = localStorage.getItem('technician_assignments');
      if (cached) {
        setAssignments(JSON.parse(cached));
        toast.info('Showing cached data - you are offline');
      }
      if (!isSilent) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadAssignments(false);
  };

  const updateAssignmentStatus = async (assignmentId: string, newStatus: string, notes?: string) => {
    setUpdatingStatus(assignmentId);
    try {
      await updateAssignment(assignmentId, { 
        status: newStatus,
        notes: notes 
      });

      // Also update the installation status if applicable
      const assignment = assignments.find(a => a.id === assignmentId);
      if (assignment?.installation_id) {
        const installationStatus = newStatus === 'completed' ? 'completed' : 
                                   newStatus === 'in_progress' ? 'in_progress' : 
                                   newStatus === 'waiting' ? 'waiting' : 'pending';
        
        await updateInstallationStatus(assignment.installation_id, installationStatus, user.id);

      }

      toast.success(`Status updated to ${newStatus}`);
      loadAssignments();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    } finally {
      setUpdatingStatus(null);
    }
  };


  const getDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isPast(date)) return 'Overdue';
    return format(date, 'MMM dd');
  };

  const getDateColor = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isPast(date) && !isToday(date)) return 'text-destructive';
    if (isToday(date)) return 'text-primary font-semibold';
    if (isTomorrow(date)) return 'text-warning';
    return 'text-muted-foreground';
  };

  const filterAssignments = (tab: string) => {
    const now = new Date();
    switch (tab) {
      case 'today':
        return assignments.filter(a => {
          const date = parseISO(a.installation_start_date);
          return (isToday(date) || (isPast(date) && !isToday(date))) && a.status !== 'completed';
        });
      case 'upcoming':
        return assignments.filter(a => {
          const date = parseISO(a.installation_start_date);
          return date > now && !isToday(date) && a.status !== 'completed';
        });
      case 'in_progress':
        return assignments.filter(a => a.status === 'in_progress');
      case 'completed':
        return assignments.filter(a => a.status === 'completed');
      default:
        return assignments.filter(a => a.status !== 'completed');
    }
  };

  const stats = {
    today: assignments.filter(a => {
      const date = parseISO(a.installation_start_date);
      return (isToday(date) || (isPast(date) && !isToday(date))) && a.status !== 'completed';
    }).length,
    inProgress: assignments.filter(a => a.status === 'in_progress').length,
    completed: assignments.filter(a => a.status === 'completed').length,
    total: assignments.length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-sm text-muted-foreground">Loading your assignments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Header with connectivity status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">My Assignments</h1>
          <p className="text-sm text-muted-foreground">
            Welcome, {user.first_name || user.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
              <Wifi className="h-3 w-3 mr-1" /> Online
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
              <WifiOff className="h-3 w-3 mr-1" /> Offline
            </Badge>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="p-3 text-center bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <p className="text-2xl font-bold text-blue-700">{stats.today}</p>
          <p className="text-[10px] text-blue-600">Today</p>
        </Card>
        <Card className="p-3 text-center bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <p className="text-2xl font-bold text-purple-700">{stats.inProgress}</p>
          <p className="text-[10px] text-purple-600">In Progress</p>
        </Card>
        <Card className="p-3 text-center bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <p className="text-2xl font-bold text-green-700">{stats.completed}</p>
          <p className="text-[10px] text-green-600">Completed</p>
        </Card>
        <Card className="p-3 text-center bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200">
          <p className="text-2xl font-bold text-gray-700">{stats.total}</p>
          <p className="text-[10px] text-gray-600">Total</p>
        </Card>
      </div>

      {/* Assignments Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 h-auto">
          <TabsTrigger value="today" className="text-xs py-2">
            Today
            {stats.today > 0 && (
              <Badge variant="destructive" className="ml-1 h-4 w-4 p-0 text-[10px]">
                {stats.today}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="text-xs py-2">Upcoming</TabsTrigger>
          <TabsTrigger value="in_progress" className="text-xs py-2">Active</TabsTrigger>
          <TabsTrigger value="completed" className="text-xs py-2">Done</TabsTrigger>
        </TabsList>

        {['today', 'upcoming', 'in_progress', 'completed'].map(tab => (
          <TabsContent key={tab} value={tab} className="mt-4">
            <ScrollArea className="h-[calc(100vh-380px)]">
              {filterAssignments(tab).length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Smartphone className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No assignments in this category</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filterAssignments(tab).map((assignment) => {
                    const StatusIcon = statusConfig[assignment.status as keyof typeof statusConfig]?.icon || Clock;
                    
                    return (
                      <Sheet key={assignment.id}>
                        <SheetTrigger asChild>
                          <Card 
                            className="cursor-pointer hover:shadow-md transition-all active:scale-[0.99]"
                            onClick={() => setSelectedAssignment(assignment)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge 
                                      variant="outline" 
                                      className={`${statusConfig[assignment.status as keyof typeof statusConfig]?.color || ''} text-[10px]`}
                                    >
                                      <StatusIcon className="h-3 w-3 mr-1" />
                                      {statusConfig[assignment.status as keyof typeof statusConfig]?.label || assignment.status}
                                    </Badge>
                                    <span className={`text-xs ${getDateColor(assignment.installation_start_date)}`}>
                                      {getDateLabel(assignment.installation_start_date)}
                                    </span>
                                  </div>
                                  <h3 className="font-semibold text-sm truncate max-w-[200px]">{assignment.client_name}</h3>
                                  {assignment.branch && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 truncate max-w-[200px]">
                                      <MapPin className="h-3 w-3 shrink-0" />
                                      <span className="truncate">{assignment.branch}</span>
                                    </p>
                                  )}
                                </div>
                                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                              </div>
                              
                              {/* Quick equipment summary */}
                              <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                                {assignment.kiosk_count && assignment.kiosk_count > 0 && (
                                  <span>🖥️ {assignment.kiosk_count} Kiosks</span>
                                )}
                                {assignment.counter_count && assignment.counter_count > 0 && (
                                  <span>📊 {assignment.counter_count} Counters</span>
                                )}
                                {assignment.service_points && assignment.service_points > 0 && (
                                  <span>📍 {assignment.service_points} SPs</span>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </SheetTrigger>

                        {/* Assignment Details Sheet */}
                        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
                          <SheetHeader className="pb-4">
                            <SheetTitle className="text-left">{assignment.client_name}</SheetTitle>
                          </SheetHeader>
                          
                          <ScrollArea className="h-[calc(85vh-120px)] pr-4">
                            <div className="space-y-6">
                              {/* Status Update Section */}
                              <Card className="border-2 border-primary/20 bg-primary/5">
                                <CardHeader className="pb-2">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Wrench className="h-4 w-4" />
                                    Quick Status Update
                                  </CardTitle>
                                </CardHeader>
                                <CardContent>
                                  <div className="grid grid-cols-2 gap-2">
                                    {['assigned', 'in_progress', 'waiting', 'completed'].map((status) => {
                                      const config = statusConfig[status as keyof typeof statusConfig];
                                      const Icon = config?.icon || Clock;
                                      const isCurrentStatus = assignment.status === status;
                                      
                                      return (
                                        <Button
                                          key={status}
                                          variant={isCurrentStatus ? "default" : "outline"}
                                          size="sm"
                                          className={`justify-start ${isCurrentStatus ? '' : config?.color}`}
                                          disabled={updatingStatus === assignment.id || isCurrentStatus}
                                          onClick={() => updateAssignmentStatus(assignment.id, status)}
                                        >
                                          {updatingStatus === assignment.id ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                          ) : (
                                            <Icon className="h-4 w-4 mr-2" />
                                          )}
                                          {config?.label}
                                        </Button>
                                      );
                                    })}
                                  </div>
                                </CardContent>
                              </Card>

                              {/* Contact Info */}
                              <Card>
                                <CardHeader className="pb-2">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <UserIcon className="h-4 w-4" />
                                    Contact Person
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                  <p className="font-medium">{assignment.contact_person}</p>
                                  
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="flex-1"
                                      asChild
                                    >
                                      <a href={`tel:${assignment.contact_phone}`}>
                                        <Phone className="h-4 w-4 mr-2" />
                                        Call
                                      </a>
                                    </Button>
                                    {assignment.contact_email && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex-1"
                                        asChild
                                      >
                                        <a href={`mailto:${assignment.contact_email}`}>
                                          <Mail className="h-4 w-4 mr-2" />
                                          Email
                                        </a>
                                      </Button>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>

                              {/* Schedule Info */}
                              <Card>
                                <CardHeader className="pb-2">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Calendar className="h-4 w-4" />
                                    Schedule
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Start Date:</span>
                                    <span className="font-medium">
                                      {format(parseISO(assignment.installation_start_date), 'MMM dd, yyyy')}
                                    </span>
                                  </div>
                                  {assignment.scheduled_end_date && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Due Date:</span>
                                      <span className={`font-medium ${getDateColor(assignment.scheduled_end_date)}`}>
                                        {format(parseISO(assignment.scheduled_end_date), 'MMM dd, yyyy')}
                                      </span>
                                    </div>
                                  )}
                                </CardContent>
                              </Card>

                              {/* Equipment Summary */}
                              <Card>
                                <CardHeader className="pb-2">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Building2 className="h-4 w-4" />
                                    Equipment to Install
                                  </CardTitle>
                                </CardHeader>
                                <CardContent>
                                  <div className="grid grid-cols-2 gap-3 text-sm">
                                    {assignment.kiosk_count && assignment.kiosk_count > 0 && (
                                      <div className="flex items-center justify-between bg-muted/50 rounded p-2">
                                        <span>Kiosks</span>
                                        <Badge variant="secondary">{assignment.kiosk_count}</Badge>
                                      </div>
                                    )}
                                    {assignment.counter_count && assignment.counter_count > 0 && (
                                      <div className="flex items-center justify-between bg-muted/50 rounded p-2">
                                        <span>Counters</span>
                                        <Badge variant="secondary">{assignment.counter_count}</Badge>
                                      </div>
                                    )}
                                    {assignment.led_count && assignment.led_count > 0 && (
                                      <div className="flex items-center justify-between bg-muted/50 rounded p-2">
                                        <span>LED Displays</span>
                                        <Badge variant="secondary">{assignment.led_count}</Badge>
                                      </div>
                                    )}
                                    {assignment.service_points && assignment.service_points > 0 && (
                                      <div className="flex items-center justify-between bg-muted/50 rounded p-2">
                                        <span>Service Points</span>
                                        <Badge variant="secondary">{assignment.service_points}</Badge>
                                      </div>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>

                              {/* Notes */}
                              {assignment.notes && (
                                <Card>
                                  <CardHeader className="pb-2">
                                    <CardTitle className="text-sm">Notes</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <p className="text-sm text-muted-foreground">{assignment.notes}</p>
                                  </CardContent>
                                </Card>
                              )}

                              {/* Mark Complete Button */}
                              {assignment.status !== 'completed' && (
                                <Button
                                  className="w-full"
                                  size="lg"
                                  onClick={() => updateAssignmentStatus(assignment.id, 'completed')}
                                  disabled={updatingStatus === assignment.id}
                                >
                                  {updatingStatus === assignment.id ? (
                                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                  ) : (
                                    <CheckCheck className="h-5 w-5 mr-2" />
                                  )}
                                  Mark as Completed
                                </Button>
                              )}
                            </div>
                          </ScrollArea>
                        </SheetContent>
                      </Sheet>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
