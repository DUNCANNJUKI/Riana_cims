import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Megaphone, Plus, Trash2, Calendar, Globe, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useDatabase } from "@/hooks/useDatabase";
import { apiClient } from "@/integrations/apiClient";

export const NoticeBoard = () => {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [subsidiaries, setSubsidiaries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const { getSubsidiaries, loading: dbLoading } = useDatabase();
  
  const [newAnnouncement, setNewAnnouncement] = useState({
    title: "",
    content: "",
    subsidiary_id: "all",
    priority: "normal" as "low" | "normal" | "high"
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      const subsData = await getSubsidiaries();
      setSubsidiaries(subsData || []);
      
      const data = await apiClient.get('/announcements');
      setAnnouncements(data || []);
    } catch (error) {
      console.error("Error loading notice board:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!newAnnouncement.title || !newAnnouncement.content) return;

    try {
      await apiClient.post('/announcements', {
        ...newAnnouncement,
        created_by: user?.id,
        subsidiary_id: newAnnouncement.subsidiary_id === 'all' ? null : newAnnouncement.subsidiary_id
      });

      toast({
        title: "Announcement Created",
        description: "The announcement has been posted successfully.",
      });
      setIsDialogOpen(false);
      setNewAnnouncement({ title: "", content: "", subsidiary_id: "all", priority: "normal" });
      loadInitialData();
    } catch (error) {
      console.error("Error creating announcement:", error);
      toast({
        title: "Error",
        description: "Failed to create announcement.",
        variant: "destructive"
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
      loadInitialData();
    } catch (error) {
      console.error("Error deleting announcement:", error);
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'normal': return 'bg-primary/10 text-primary border-primary/20';
      case 'low': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getSubsidiaryName = (id: string | null) => {
    if (!id) return "All Subsidiaries";
    const sub = subsidiaries.find(s => s.id === id);
    return sub ? sub.subsidiary_name : "All Subsidiaries";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-full">
            <Megaphone className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">Notice Board</h1>
            <p className="text-sm text-muted-foreground">Internal announcements and updates</p>
          </div>
        </div>

        {(user?.role === 'SuperAdmin' || user?.role === 'Admin' || user?.role === 'Teamlead') && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary">
                <Plus className="h-4 w-4 mr-2" /> Post Announcement
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Post New Announcement</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input 
                    placeholder="Announcement title" 
                    value={newAnnouncement.title}
                    onChange={(e) => setNewAnnouncement({...newAnnouncement, title: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Subsidiary</Label>
                    <Select 
                      value={newAnnouncement.subsidiary_id} 
                      onValueChange={(value) => setNewAnnouncement({...newAnnouncement, subsidiary_id: value})}
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
                    <Label>Priority</Label>
                    <Select 
                      value={newAnnouncement.priority} 
                      onValueChange={(value: any) => setNewAnnouncement({...newAnnouncement, priority: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Content</Label>
                  <Textarea 
                    placeholder="Write announcement details..." 
                    className="min-h-[150px]"
                    value={newAnnouncement.content}
                    onChange={(e) => setNewAnnouncement({...newAnnouncement, content: e.target.value})}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateAnnouncement} className="gradient-primary">Post Announcement</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <p className="text-center py-10 text-muted-foreground">Loading announcements...</p>
        ) : announcements.length === 0 ? (
          <Card className="border-dashed border-2 flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Megaphone className="h-12 w-12 mb-4 opacity-20" />
            <p>No announcements posted yet.</p>
          </Card>
        ) : (
          announcements.map((announcement) => (
            <Card key={announcement.id} className="shadow-elegant overflow-hidden group hover:border-primary/50 transition-all">
              <CardHeader className="flex flex-row items-start justify-between pb-2 border-b bg-muted/30">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge className={getPriorityColor(announcement.priority)}>
                      {announcement.priority}
                    </Badge>
                    <CardTitle className="text-lg text-primary">{announcement.title}</CardTitle>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {new Date(announcement.created_at).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> {getSubsidiaryName(announcement.subsidiary_id)}
                    </span>
                  </div>
                </div>
                {(user?.role === 'SuperAdmin' || user?.role === 'Admin' || user?.role === 'Teamlead') && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDeleteAnnouncement(announcement.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="pt-4">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{announcement.content}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
