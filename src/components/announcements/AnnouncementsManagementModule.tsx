import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlanningDateInput } from '@/components/common/PlanningDateInput';
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Megaphone, 
  Plus, 
  Trash2, 
  Clock, 
  Users, 
  Bell,
  Eye,
  BarChart3,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Edit,
  ToggleLeft,
  ToggleRight,
  Calendar
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/apiClient";
import { User } from "@/types";
import { format } from "date-fns";
import { OPERATIONAL_REFRESH_INTERVAL_MS } from "@/utils/refreshIntervals";

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  target_audience: string;
  subsidiary_id: string | null;
  created_by_user_id: string;
  is_active: boolean;
  is_expired?: boolean;
  is_read?: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  creator?: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  };
  subsidiary?: {
    subsidiary_name: string;
  };
  read_count?: number;
  total_target?: number;
}

interface AnnouncementsManagementModuleProps {
  user: User;
}

const formatLocalDateTimeInput = (isoValue: string | null | undefined) => {
  if (!isoValue) return "";
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return "";
  return format(parsed, "yyyy-MM-dd'T'HH:mm");
};

const isAnnouncementExpired = (announcement: Pick<Announcement, 'expires_at' | 'is_expired'>) => {
  if (typeof announcement.is_expired === 'boolean') return announcement.is_expired;
  if (!announcement.expires_at) return false;
  return new Date(announcement.expires_at).getTime() <= Date.now();
};

export const AnnouncementsManagementModule = ({ user }: AnnouncementsManagementModuleProps) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'expired'>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [subsidiaries, setSubsidiaries] = useState<{ id: string; subsidiary_name: string }[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const [readDetails, setReadDetails] = useState<any[]>([]);
  const [unreadUsers, setUnreadUsers] = useState<any[]>([]);
  const [reachTab, setReachTab] = useState<'read' | 'unread'>('read');
  const [showReadDetails, setShowReadDetails] = useState(false);
  
  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [targetAudience, setTargetAudience] = useState<string>('all');
  const [selectedSubsidiary, setSelectedSubsidiary] = useState<string>('all');
  const [expiresAt, setExpiresAt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const isDialogOpenRef = useRef(false);
  
  const { toast } = useToast();

  useEffect(() => {
    loadAnnouncements();
    loadSubsidiaries();
    loadTotalUsers();

    const handleUpdated = () => {
      void loadAnnouncements(false);
    };
    window.addEventListener('riana-announcements-updated', handleUpdated);

    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible' && !isDialogOpenRef.current) {
        void loadAnnouncements(false);
      }
    }, OPERATIONAL_REFRESH_INTERVAL_MS);

    return () => {
      window.removeEventListener('riana-announcements-updated', handleUpdated);
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    isDialogOpenRef.current = isDialogOpen;
  }, [isDialogOpen]);

  const notifyAnnouncementsUpdated = () => {
    window.dispatchEvent(new CustomEvent('riana-announcements-updated'));
  };

  const loadTotalUsers = async () => {
    try {
      const data = await apiClient.get('/user_profiles');
      const activeCount = (Array.isArray(data) ? data : []).filter((u: any) => u.is_active).length;
      setTotalUsers(activeCount);
    } catch (error) {
      console.error('Error loading total users:', error);
    }
  };

  const loadSubsidiaries = async () => {
    try {
      const data = await apiClient.get('/subsidiaries');
      setSubsidiaries(data || []);
    } catch (error) {
      console.error('Error loading subsidiaries:', error);
    }
  };

  const loadAnnouncements = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await apiClient.get('/announcements');
      const normalized = (Array.isArray(data) ? data : []).map((item: any) => ({
        ...item,
        is_active: Boolean(item.is_active),
        is_expired: isAnnouncementExpired(item),
        read_count: Number(item.read_count || 0),
        total_target: Number(item.total_target ?? item.total_target_users ?? 0),
      }));
      setAnnouncements(normalized);
    } catch (error) {
      console.error('Error loading announcements:', error);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  const loadReadDetails = async (announcement: Announcement) => {
    try {
      setSelectedAnnouncement(announcement);
      setReachTab('read');
      const data = await apiClient.get(`/announcement_reads/${announcement.id}?include_reach=true`);
      if (Array.isArray(data)) {
        setReadDetails(data);
        setUnreadUsers([]);
      } else {
        setReadDetails(Array.isArray(data?.reads) ? data.reads : []);
        setUnreadUsers(Array.isArray(data?.unread_users) ? data.unread_users : []);
      }
      setShowReadDetails(true);
    } catch (error) {
      console.error('Error loading read details:', error);
      toast({
        title: "Error",
        description: "Failed to load announcement reach details",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingId) {
        await apiClient.put(`/announcements/${editingId}`, {
          title: title.trim(),
          content: content.trim(),
          priority,
          target_audience: targetAudience,
          subsidiary_id: selectedSubsidiary === 'all' ? null : selectedSubsidiary,
          expires_at: expiresAt || null,
        });

        toast({
          title: "Announcement Updated",
          description: "Your announcement has been updated successfully",
        });
      } else {
        await apiClient.post('/announcements', {
          title: title.trim(),
          content: content.trim(),
          priority,
          target_audience: targetAudience,
          subsidiary_id: selectedSubsidiary === 'all' ? null : selectedSubsidiary,
          created_by_user_id: user.id,
          expires_at: expiresAt || null,
        });

        toast({
          title: "Announcement Posted",
          description: "Your announcement has been shared with the team",
        });
      }

      resetForm();
      await loadAnnouncements();
      notifyAnnouncementsUpdated();
    } catch (error: any) {
      console.error('Error saving announcement:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to save announcement",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setTitle("");
    setContent("");
    setPriority('normal');
    setTargetAudience('all');
    setSelectedSubsidiary('all');
    setExpiresAt("");
    setEditingId(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (announcement: Announcement) => {
    setTitle(announcement.title);
    setContent(announcement.content);
    setPriority(announcement.priority || 'normal');
    setTargetAudience(announcement.target_audience || 'all');
    setSelectedSubsidiary(announcement.subsidiary_id || 'all');
    setExpiresAt(formatLocalDateTimeInput(announcement.expires_at));
    setEditingId(announcement.id);
    setIsDialogOpen(true);
  };

  const handleToggleActive = async (announcement: Announcement) => {
    const nextActive = !Boolean(announcement.is_active);
    try {
      await apiClient.patch(`/announcements/${announcement.id}`, {
        is_active: nextActive,
      });

      setAnnouncements((current) =>
        current.map((item) =>
          item.id === announcement.id ? { ...item, is_active: nextActive } : item
        )
      );

      toast({
        title: nextActive ? "Announcement Activated" : "Announcement Deactivated",
        description: `"${announcement.title}" is now ${nextActive ? 'active and visible to the target audience' : 'toggled off and hidden from the active feed'}.`,
      });

      await loadAnnouncements(false);
      notifyAnnouncementsUpdated();
    } catch (error: any) {
      console.error('Error toggling announcement:', error);
      toast({
        title: "Error",
        description: error?.message || "Failed to toggle announcement status",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/announcements/${id}`);

      toast({
        title: "Announcement Deleted",
        description: "The announcement has been permanently deleted",
      });

      await loadAnnouncements();
      notifyAnnouncementsUpdated();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      toast({
        title: "Error",
        description: "Failed to delete announcement",
        variant: "destructive",
      });
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-destructive text-destructive-foreground';
      case 'high': return 'bg-warning text-warning-foreground';
      case 'normal': return 'bg-primary text-primary-foreground';
      case 'low': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted';
    }
  };

  const getAudienceLabel = (audience: string) => {
    switch (audience) {
      case 'all': return 'Everyone';
      case 'admins': return 'Admins Only';
      case 'teamleads': return 'Team Leads';
      case 'technicians': return 'Technicians';
      case 'sales': return 'Sales';
      case 'subsidiary': return 'Subsidiary';
      default: return audience || 'Everyone';
    }
  };

  const getEngagementRate = (readCount: number, totalTarget: number) => {
    if (totalTarget <= 0) return 0;
    return Math.min(100, Math.round((readCount / totalTarget) * 100));
  };

  // Analytics summary
  const activeAnnouncementsCount = announcements.filter(a => a.is_active && !isAnnouncementExpired(a)).length;
  const inactiveAnnouncementsCount = announcements.filter(a => !a.is_active).length;
  const expiredAnnouncementsCount = announcements.filter(a => isAnnouncementExpired(a)).length;
  const totalReads = announcements.reduce((sum, a) => sum + (a.read_count || 0), 0);
  const avgEngagement = announcements.length > 0
    ? Math.round(announcements.reduce((sum, a) => sum + getEngagementRate(a.read_count || 0, a.total_target || totalUsers || 1), 0) / announcements.length)
    : 0;

  const filteredAnnouncements = announcements.filter((announcement) => {
    const expired = isAnnouncementExpired(announcement);
    if (statusFilter === 'active') return announcement.is_active && !expired;
    if (statusFilter === 'inactive') return !announcement.is_active;
    if (statusFilter === 'expired') return expired;
    return true;
  });

  const selectedReachTarget = selectedAnnouncement
    ? (selectedAnnouncement.total_target || (readDetails.length + unreadUsers.length) || totalUsers || 1)
    : 1;
  const selectedReachRate = getEngagementRate(readDetails.length, selectedReachTarget);

  return (
    <div className="space-y-6">
      <div className="cims-page-header">
        <div>
          <h1 className="cims-page-title">Announcements Management</h1>
          <p className="cims-page-subtitle">Track reach, toggle events on or off, and manage all announcements</p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsDialogOpen(open); }}>
          <DialogTrigger asChild>
            <Button className="gradient-primary">
              <Plus className="h-4 w-4 mr-2" />
              New Announcement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5" />
                {editingId ? 'Edit Announcement' : 'Post New Announcement'}
              </DialogTitle>
              <DialogDescription>
                {editingId ? 'Update your announcement details' : 'Share an update or event with your team'}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Announcement title..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Message *</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your announcement..."
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Target Audience</Label>
                  <Select value={targetAudience} onValueChange={setTargetAudience}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Everyone</SelectItem>
                      <SelectItem value="admins">Admins Only</SelectItem>
                      <SelectItem value="teamleads">Team Leads</SelectItem>
                      <SelectItem value="technicians">Technicians</SelectItem>
                      <SelectItem value="sales">Sales</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Subsidiary (Optional)</Label>
                  <Select value={selectedSubsidiary} onValueChange={setSelectedSubsidiary}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Subsidiaries</SelectItem>
                      {subsidiaries.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>{sub.subsidiary_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Expires (Optional)</Label>
                  <PlanningDateInput
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} className="gradient-primary">
                  <Bell className="h-4 w-4 mr-1" />
                  {editingId ? 'Update' : 'Post & Notify'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Analytics Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-riana">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Announcements</p>
                <p className="text-2xl font-bold">{announcements.length}</p>
              </div>
              <Megaphone className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-riana">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Events / Posts</p>
                <p className="text-2xl font-bold text-green-600">{activeAnnouncementsCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-riana">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Reach (Reads)</p>
                <p className="text-2xl font-bold text-blue-600">{totalReads}</p>
              </div>
              <Eye className="h-8 w-8 text-blue-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-riana">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Reach Rate</p>
                <p className="text-2xl font-bold text-purple-600">{avgEngagement}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Announcements Table */}
      <Card className="shadow-riana">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              All Announcements & Events
            </CardTitle>
            <CardDescription>
              Inspect audience reach, view who read each announcement, and toggle events on or off
            </CardDescription>
          </div>
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)} className="w-full sm:w-auto">
            <TabsList className="grid w-full grid-cols-4 sm:w-auto">
              <TabsTrigger value="all" className="text-xs">All ({announcements.length})</TabsTrigger>
              <TabsTrigger value="active" className="text-xs">Active ({activeAnnouncementsCount})</TabsTrigger>
              <TabsTrigger value="inactive" className="text-xs">Off ({inactiveAnnouncementsCount})</TabsTrigger>
              <TabsTrigger value="expired" className="text-xs">Expired ({expiredAnnouncementsCount})</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground mt-2">Loading announcements...</p>
            </div>
          ) : filteredAnnouncements.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg">
              <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No announcements match this filter</p>
              <p className="text-sm text-muted-foreground mt-1">Click "New Announcement" to create an announcement or switch tabs</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead>Status & Toggle</TableHead>
                    <TableHead>Reach & Reads</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAnnouncements.map((announcement) => {
                    const targetCount = announcement.total_target || totalUsers || 1;
                    const readCount = announcement.read_count || 0;
                    const engagement = getEngagementRate(readCount, targetCount);
                    const expired = isAnnouncementExpired(announcement);
                    return (
                      <TableRow key={announcement.id} className={!announcement.is_active ? "opacity-75" : undefined}>
                        <TableCell>
                          <div className="max-w-[240px]">
                            <p className="font-medium truncate">{announcement.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{announcement.content}</p>
                            {announcement.expires_at && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Expires {format(new Date(announcement.expires_at), 'MMM d, yyyy HH:mm')}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getPriorityColor(announcement.priority)}>
                            {announcement.priority.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="text-sm">{getAudienceLabel(announcement.target_audience)}</span>
                            {announcement.subsidiary && (
                              <Badge variant="outline" className="text-xs w-fit">
                                {announcement.subsidiary.subsidiary_name}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Switch
                              checked={Boolean(announcement.is_active)}
                              onCheckedChange={() => handleToggleActive(announcement)}
                              aria-label={announcement.is_active ? `Toggle off ${announcement.title}` : `Toggle on ${announcement.title}`}
                            />
                            {!announcement.is_active ? (
                              <Badge variant="secondary">Toggled Off</Badge>
                            ) : expired ? (
                              <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">Expired</Badge>
                            ) : (
                              <Badge className="bg-green-600 text-white">Active</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Progress value={engagement} className="h-2 w-20" />
                              <span className="text-sm font-medium">{engagement}%</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs font-medium text-primary hover:bg-primary/10"
                              onClick={() => loadReadDetails(announcement)}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              {readCount} / {targetCount} reached
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {format(new Date(announcement.created_at), 'MMM d, yyyy')}
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(announcement.created_at), 'HH:mm')}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => loadReadDetails(announcement)}
                              title="View reach & read details"
                              aria-label="View reach & read details"
                              className="h-8 w-8 text-primary"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(announcement)}
                              title="Edit announcement"
                              aria-label="Edit announcement"
                              className="h-8 w-8"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleActive(announcement)}
                              title={announcement.is_active ? "Toggle off announcement" : "Toggle on announcement"}
                              aria-label={announcement.is_active ? "Toggle off announcement" : "Toggle on announcement"}
                              className="h-8 w-8"
                            >
                              {announcement.is_active ? (
                                <ToggleRight className="h-4 w-4 text-green-600" />
                              ) : (
                                <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(announcement.id)}
                              title="Delete announcement"
                              aria-label="Delete announcement"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Reach & Read Details Dialog */}
      <Dialog open={showReadDetails} onOpenChange={setShowReadDetails}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Announcement Reach & Read Details
            </DialogTitle>
            <DialogDescription>
              {selectedAnnouncement ? selectedAnnouncement.title : "Audience reach and read activity"}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span>Audience Reach ({readDetails.length} of {selectedReachTarget} users)</span>
              <span className="font-bold text-primary">{selectedReachRate}%</span>
            </div>
            <Progress value={selectedReachRate} className="h-2" />
          </div>

          <Tabs value={reachTab} onValueChange={(v) => setReachTab(v as 'read' | 'unread')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="read">Read ({readDetails.length})</TabsTrigger>
              <TabsTrigger value="unread">Not Read Yet ({unreadUsers.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="read" className="mt-3">
              <ScrollArea className="max-h-[320px]">
                {readDetails.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">No one has read this announcement yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {readDetails.map((read: any) => (
                      <div key={read.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-sm">
                            {[read.user?.first_name, read.user?.last_name].filter(Boolean).join(' ') || read.user?.email || 'User'}
                          </p>
                          <p className="text-xs text-muted-foreground">{read.user?.email}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className="text-xs">{read.user?.role}</Badge>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(read.read_at), 'MMM d, HH:mm')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
            <TabsContent value="unread" className="mt-3">
              <ScrollArea className="max-h-[320px]">
                {unreadUsers.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">All target users have read this announcement</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {unreadUsers.map((unreadUser: any) => (
                      <div key={unreadUser.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-sm">
                            {[unreadUser.first_name, unreadUser.last_name].filter(Boolean).join(' ') || unreadUser.email}
                          </p>
                          <p className="text-xs text-muted-foreground">{unreadUser.email}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className="text-xs">{unreadUser.role}</Badge>
                          <p className="text-xs text-muted-foreground mt-1">Pending</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
};
