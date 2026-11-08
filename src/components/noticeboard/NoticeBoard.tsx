import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlanningDateInput } from "@/components/common/PlanningDateInput";
import { Megaphone, Plus, Trash2, Calendar, Building2, Eye, Edit, Users, Clock, CheckCircle2, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useDatabase } from "@/hooks/useDatabase";
import { apiClient } from "@/integrations/apiClient";
import { can } from "@/security/accessControl";
import { format } from "date-fns";

interface NoticeBoardProps {
  onNavigate?: (module: string) => void;
}

const formatLocalDateTimeInput = (isoValue: string | null | undefined) => {
  if (!isoValue) return "";
  const parsed = new Date(isoValue);
  if (Number.isNaN(parsed.getTime())) return "";
  return format(parsed, "yyyy-MM-dd'T'HH:mm");
};

const isAnnouncementExpired = (announcement: any) => {
  if (typeof announcement?.is_expired === 'boolean') return announcement.is_expired;
  if (!announcement?.expires_at) return false;
  return new Date(announcement.expires_at).getTime() <= Date.now();
};

export const NoticeBoard = ({ onNavigate }: NoticeBoardProps) => {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [subsidiaries, setSubsidiaries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState<'active' | 'all'>('active');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any | null>(null);
  const [readDetails, setReadDetails] = useState<any[]>([]);
  const [unreadUsers, setUnreadUsers] = useState<any[]>([]);
  const [reachTab, setReachTab] = useState<'read' | 'unread'>('read');
  const [showReadDetails, setShowReadDetails] = useState(false);

  const { user } = useAuth();
  const { toast } = useToast();
  const { getSubsidiaries } = useDatabase();
  const canManage = Boolean(user && (user.role === 'SuperAdmin' || can(user, 'announcements.manage')));

  const [formState, setFormState] = useState({
    title: "",
    content: "",
    subsidiary_id: "all",
    target_audience: "all",
    priority: "normal" as "low" | "normal" | "high" | "urgent",
    expires_at: "",
  });

  useEffect(() => {
    void loadInitialData();
    const handleUpdated = () => {
      void loadInitialData(false);
    };
    window.addEventListener('riana-announcements-updated', handleUpdated);
    return () => window.removeEventListener('riana-announcements-updated', handleUpdated);
  }, [canManage]);

  const notifyAnnouncementsUpdated = () => {
    window.dispatchEvent(new CustomEvent('riana-announcements-updated'));
  };

  const loadInitialData = async (showSpinner = true) => {
    try {
      if (showSpinner) setIsLoading(true);
      const [subsData, data] = await Promise.all([
        getSubsidiaries().catch(() => []),
        apiClient.get(canManage ? '/announcements' : '/announcements?scope=active'),
      ]);
      setSubsidiaries(subsData || []);
      const normalized = (Array.isArray(data) ? data : []).map((item: any) => ({
        ...item,
        is_active: Boolean(item.is_active),
        is_expired: isAnnouncementExpired(item),
        is_read: Boolean(item.is_read),
        read_count: Number(item.read_count || 0),
        total_target: Number(item.total_target ?? item.total_target_users ?? 1),
      }));
      setAnnouncements(normalized);
    } catch (error) {
      console.error("Error loading notice board:", error);
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  };

  const resetForm = () => {
    setFormState({
      title: "",
      content: "",
      subsidiary_id: "all",
      target_audience: "all",
      priority: "normal",
      expires_at: "",
    });
    setEditingId(null);
    setIsDialogOpen(false);
  };

  const handleOpenEdit = (announcement: any) => {
    setFormState({
      title: announcement.title || "",
      content: announcement.content || "",
      subsidiary_id: announcement.subsidiary_id || "all",
      target_audience: announcement.target_audience || "all",
      priority: announcement.priority || "normal",
      expires_at: formatLocalDateTimeInput(announcement.expires_at),
    });
    setEditingId(announcement.id);
    setIsDialogOpen(true);
  };

  const handleSaveAnnouncement = async () => {
    if (!formState.title.trim() || !formState.content.trim()) return;

    try {
      const payload = {
        title: formState.title.trim(),
        content: formState.content.trim(),
        priority: formState.priority,
        target_audience: formState.target_audience,
        subsidiary_id: formState.subsidiary_id === 'all' ? null : formState.subsidiary_id,
        expires_at: formState.expires_at || null,
        created_by_user_id: user?.id,
      };

      if (editingId) {
        await apiClient.put(`/announcements/${editingId}`, payload);
        toast({
          title: "Announcement Updated",
          description: "The announcement has been updated successfully.",
        });
      } else {
        await apiClient.post('/announcements', payload);
        toast({
          title: "Announcement Created",
          description: "The announcement has been posted successfully.",
        });
      }

      resetForm();
      await loadInitialData(false);
      notifyAnnouncementsUpdated();
    } catch (error: any) {
      console.error("Error saving announcement:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to save announcement.",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (announcement: any) => {
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
        title: nextActive ? "Announcement Activated" : "Announcement Toggled Off",
        description: `"${announcement.title}" is now ${nextActive ? "active" : "toggled off"}.`,
      });
      await loadInitialData(false);
      notifyAnnouncementsUpdated();
    } catch (error: any) {
      console.error("Error toggling announcement:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to toggle announcement.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      await apiClient.delete(`/announcements/${id}`);
      toast({
        title: "Announcement Deleted",
        description: "The announcement has been removed.",
      });
      await loadInitialData(false);
      notifyAnnouncementsUpdated();
    } catch (error) {
      console.error("Error deleting announcement:", error);
    }
  };

  const handleMarkAsRead = async (announcement: any) => {
    if (announcement.is_read) return;
    try {
      await apiClient.post(`/announcements/${announcement.id}/read`, {});
      setAnnouncements((current) =>
        current.map((item) =>
          item.id === announcement.id
            ? { ...item, is_read: true, read_count: Number(item.read_count || 0) + 1 }
            : item
        )
      );
      notifyAnnouncementsUpdated();
    } catch (error) {
      console.error("Error marking announcement as read:", error);
    }
  };

  const handleViewReach = async (announcement: any) => {
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
      console.error("Error loading reach details:", error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-destructive text-destructive-foreground border-destructive/30';
      case 'high': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'normal': return 'bg-primary/10 text-primary border-primary/20';
      case 'low': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-muted text-muted-foreground border-border';
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

  const getSubsidiaryName = (id: string | null) => {
    if (!id) return "All Subsidiaries";
    const sub = subsidiaries.find(s => s.id === id);
    return sub ? sub.subsidiary_name : "All Subsidiaries";
  };

  const getEngagementRate = (readCount: number, totalTarget: number) => {
    if (totalTarget <= 0) return 0;
    return Math.min(100, Math.round((readCount / totalTarget) * 100));
  };

  const activeList = announcements.filter(a => a.is_active && !isAnnouncementExpired(a));
  const visibleAnnouncements = canManage && viewFilter === 'all' ? announcements : activeList;

  const selectedReachTarget = selectedAnnouncement
    ? (selectedAnnouncement.total_target || (readDetails.length + unreadUsers.length) || 1)
    : 1;
  const selectedReachRate = getEngagementRate(readDetails.length, selectedReachTarget);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary sm:text-2xl">Notice Board</h2>
            <p className="text-sm text-muted-foreground">Internal announcements, events, and audience reach</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
              <Button
                type="button"
                variant={viewFilter === 'active' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setViewFilter('active')}
              >
                Active ({activeList.length})
              </Button>
              <Button
                type="button"
                variant={viewFilter === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setViewFilter('all')}
              >
                All ({announcements.length})
              </Button>
            </div>
          )}

          {canManage && onNavigate && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onNavigate('announcements-management')}
            >
              <BarChart3 className="h-4 w-4 mr-1.5" />
              Manage & Reach
            </Button>
          )}

          {canManage && (
            <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setIsDialogOpen(true); }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gradient-primary">
                  <Plus className="h-4 w-4 mr-1.5" /> Post Announcement
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                  <DialogTitle>{editingId ? "Edit Announcement" : "Post New Announcement"}</DialogTitle>
                  <DialogDescription>
                    {editingId ? "Update announcement details and audience targeting." : "Share an announcement or event with your team."}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input 
                      placeholder="Announcement title" 
                      value={formState.title}
                      onChange={(e) => setFormState({...formState, title: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select 
                        value={formState.priority} 
                        onValueChange={(value: any) => setFormState({...formState, priority: value})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
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
                      <Select 
                        value={formState.target_audience} 
                        onValueChange={(value) => setFormState({...formState, target_audience: value})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select audience" />
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
                      <Label>Subsidiary</Label>
                      <Select 
                        value={formState.subsidiary_id} 
                        onValueChange={(value) => setFormState({...formState, subsidiary_id: value})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select subsidiary" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Subsidiaries</SelectItem>
                          {subsidiaries.map(sub => (
                            <SelectItem key={sub.id} value={sub.id}>{sub.subsidiary_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Expires (Optional)</Label>
                      <PlanningDateInput
                        type="datetime-local"
                        value={formState.expires_at}
                        onChange={(e) => setFormState({...formState, expires_at: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Content</Label>
                    <Textarea 
                      placeholder="Write announcement details..." 
                      className="min-h-[120px]"
                      value={formState.content}
                      onChange={(e) => setFormState({...formState, content: e.target.value})}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={resetForm}>Cancel</Button>
                  <Button onClick={handleSaveAnnouncement} className="gradient-primary">
                    {editingId ? "Update Announcement" : "Post Announcement"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <p className="text-center py-10 text-muted-foreground">Loading announcements...</p>
        ) : visibleAnnouncements.length === 0 ? (
          <Card className="border-dashed border-2 flex flex-col items-center justify-center p-10 text-center text-muted-foreground">
            <Megaphone className="h-10 w-10 mb-3 opacity-20" />
            <p>No active announcements right now.</p>
            {canManage && announcements.length > 0 && viewFilter === 'active' && (
              <Button variant="link" size="sm" className="mt-1" onClick={() => setViewFilter('all')}>
                View all {announcements.length} announcements (including toggled-off / expired)
              </Button>
            )}
          </Card>
        ) : (
          visibleAnnouncements.map((announcement) => {
            const expired = isAnnouncementExpired(announcement);
            const readCount = Number(announcement.read_count || 0);
            const targetCount = Number(announcement.total_target || 1);
            const reachRate = getEngagementRate(readCount, targetCount);

            return (
              <Card
                key={announcement.id}
                className={`shadow-elegant overflow-hidden group hover:border-primary/50 transition-all ${!announcement.is_active ? 'opacity-75' : ''}`}
              >
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between pb-3 border-b bg-muted/30">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={getPriorityColor(announcement.priority)}>
                        {announcement.priority}
                      </Badge>
                      {!announcement.is_active ? (
                        <Badge variant="secondary">Toggled Off</Badge>
                      ) : expired ? (
                        <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">Expired</Badge>
                      ) : (
                        <Badge className="bg-emerald-600/15 text-emerald-500 border-emerald-500/30">Active</Badge>
                      )}
                      {!announcement.is_read && (
                        <Badge variant="default" className="text-[10px] h-5">Unread</Badge>
                      )}
                      <CardTitle className="text-base sm:text-lg text-primary">{announcement.title}</CardTitle>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {new Date(announcement.created_at).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> {getSubsidiaryName(announcement.subsidiary_id)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> {getAudienceLabel(announcement.target_audience)}
                      </span>
                      {announcement.expires_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Expires {format(new Date(announcement.expires_at), 'MMM d, yyyy HH:mm')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {!announcement.is_read && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => handleMarkAsRead(announcement)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-primary" />
                        Mark Read
                      </Button>
                    )}

                    {canManage && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs font-medium"
                          onClick={() => handleViewReach(announcement)}
                          title="View announcement reach and readers"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1.5 text-primary" />
                          {readCount}/{targetCount} ({reachRate}%)
                        </Button>

                        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background/80 px-2.5 py-1">
                          <Switch
                            checked={Boolean(announcement.is_active)}
                            onCheckedChange={() => handleToggleActive(announcement)}
                            aria-label={announcement.is_active ? `Toggle off ${announcement.title}` : `Toggle on ${announcement.title}`}
                          />
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {announcement.is_active ? "Live" : "Off"}
                          </span>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Edit announcement"
                          aria-label="Edit announcement"
                          onClick={() => handleOpenEdit(announcement)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>

                        <Button 
                          type="button"
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Delete announcement"
                          aria-label="Delete announcement"
                          onClick={() => handleDeleteAnnouncement(announcement.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{announcement.content}</p>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

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
              <ScrollArea className="max-h-[300px]">
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
              <ScrollArea className="max-h-[300px]">
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
