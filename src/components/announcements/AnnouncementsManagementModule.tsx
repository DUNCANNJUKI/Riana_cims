import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
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

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  target_audience: string;
  subsidiary_id: string | null;
  created_by_user_id: string;
  is_active: boolean;
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

export const AnnouncementsManagementModule = ({ user }: AnnouncementsManagementModuleProps) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [subsidiaries, setSubsidiaries] = useState<{ id: string; subsidiary_name: string }[]>([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [totalUsers, setTotalUsers] = useState(0);
  const [readDetails, setReadDetails] = useState<any[]>([]);
  const [showReadDetails, setShowReadDetails] = useState(false);
  
  // Form state
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [targetAudience, setTargetAudience] = useState<string>('all');
  const [selectedSubsidiary, setSelectedSubsidiary] = useState<string>('all');
  const [expiresAt, setExpiresAt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    loadAnnouncements();
    loadSubsidiaries();
    loadTotalUsers();

    const intervalId = setInterval(loadAnnouncements, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

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

  const loadAnnouncements = async () => {
    setIsLoading(true);
    try {
      let url = '/announcements';
      if (user.role === 'Teamlead') {
        url += `?created_by_user_id=${user.id}`;
      }

      const data = await apiClient.get(url);
      setAnnouncements(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading announcements:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadReadDetails = async (announcementId: string) => {
    try {
      const data = await apiClient.get(`/announcement_reads/${announcementId}`);
      setReadDetails(Array.isArray(data) ? data : []);
      setShowReadDetails(true);
    } catch (error) {
      console.error('Error loading read details:', error);
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
      loadAnnouncements();
    } catch (error) {
      console.error('Error saving announcement:', error);
      toast({
        title: "Error",
        description: "Failed to save announcement",
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
    setPriority(announcement.priority);
    setTargetAudience(announcement.target_audience);
    setSelectedSubsidiary(announcement.subsidiary_id || 'all');
    setExpiresAt(announcement.expires_at ? announcement.expires_at.slice(0, 16) : '');
    setEditingId(announcement.id);
    setIsDialogOpen(true);
  };

  const handleToggleActive = async (announcement: Announcement) => {
    try {
      await apiClient.patch(`/announcements/${announcement.id}`, {
        is_active: !announcement.is_active
      });

      toast({
        title: announcement.is_active ? "Announcement Deactivated" : "Announcement Activated",
        description: `The announcement has been ${announcement.is_active ? 'deactivated' : 'activated'}`,
      });

      loadAnnouncements();
    } catch (error) {
      console.error('Error toggling announcement:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`/announcements/${id}`);

      toast({
        title: "Announcement Deleted",
        description: "The announcement has been permanently deleted",
      });

      loadAnnouncements();
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
      default: return audience;
    }
  };

  const getEngagementRate = (readCount: number, totalTarget: number) => {
    if (totalTarget === 0) return 0;
    return Math.round((readCount / totalTarget) * 100);
  };

  // Analytics summary
  const activeAnnouncements = announcements.filter(a => a.is_active).length;
  const totalReads = announcements.reduce((sum, a) => sum + (a.read_count || 0), 0);
  const avgEngagement = announcements.length > 0
    ? Math.round(announcements.reduce((sum, a) => sum + getEngagementRate(a.read_count || 0, a.total_target || 1), 0) / announcements.length)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">Announcements Management</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Track and manage all your announcements with detailed analytics</p>
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
                {editingId ? 'Update your announcement details' : 'Share an update with your team'}
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
                  <Input
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
                <p className="text-sm text-muted-foreground">Active Announcements</p>
                <p className="text-2xl font-bold text-green-600">{activeAnnouncements}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-riana">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Views</p>
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
                <p className="text-sm text-muted-foreground">Avg Engagement</p>
                <p className="text-2xl font-bold text-purple-600">{avgEngagement}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Announcements Table */}
      <Card className="shadow-riana">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            All Announcements
          </CardTitle>
          <CardDescription>
            View and manage all your announcements with read analytics
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground mt-2">Loading announcements...</p>
            </div>
          ) : announcements.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg">
              <Megaphone className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No announcements yet</p>
              <p className="text-sm text-muted-foreground mt-1">Click "New Announcement" to create your first announcement</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Engagement</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {announcements.map((announcement) => {
                    const engagement = getEngagementRate(announcement.read_count || 0, announcement.total_target || 1);
                    return (
                      <TableRow key={announcement.id}>
                        <TableCell>
                          <div className="max-w-[200px]">
                            <p className="font-medium truncate">{announcement.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{announcement.content.substring(0, 50)}...</p>
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
                          {announcement.is_active ? (
                            <Badge className="bg-green-600 text-white">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
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
                              className="h-6 text-xs"
                              onClick={() => loadReadDetails(announcement.id)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              {announcement.read_count} / {announcement.total_target} reads
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
                              onClick={() => handleEdit(announcement)}
                              className="h-8 w-8"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleActive(announcement)}
                              className="h-8 w-8"
                            >
                              {announcement.is_active ? (
                                <ToggleRight className="h-4 w-4 text-green-600" />
                              ) : (
                                <ToggleLeft className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(announcement.id)}
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

      {/* Read Details Dialog */}
      <Dialog open={showReadDetails} onOpenChange={setShowReadDetails}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Read Details
            </DialogTitle>
            <DialogDescription>
              Users who have read this announcement
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {readDetails.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No one has read this announcement yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {readDetails.map((read: any) => (
                  <div key={read.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-sm">
                        {read.user?.first_name} {read.user?.last_name}
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
        </DialogContent>
      </Dialog>
    </div>
  );
};
