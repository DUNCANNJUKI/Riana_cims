import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, MessageSquare, Star, Hash, AlignLeft, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/apiClient";

interface FeedbackQuestion {
  id: string;
  question_text: string;
  question_type: 'rating' | 'nps' | 'text';
  category: string;
  is_active: boolean;
  order_index: number;
}

export const FeedbackSettingsPanel = () => {
  const [questions, setQuestions] = useState<FeedbackQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<FeedbackQuestion | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [form, setForm] = useState({
    question_text: '',
    question_type: 'rating' as 'rating' | 'nps' | 'text',
    category: 'General',
  });

  const { toast } = useToast();

  useEffect(() => {
    loadQuestions();
  }, []);

  const loadQuestions = async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get('/admin/feedback_questions');
      setQuestions(data || []);
    } catch (e) {
      console.error('Error loading feedback questions:', e);
      toast({ title: 'Error', description: 'Failed to load feedback questions', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingQuestion(null);
    setForm({ question_text: '', question_type: 'rating', category: 'General' });
    setIsDialogOpen(true);
  };

  const openEditDialog = (q: FeedbackQuestion) => {
    setEditingQuestion(q);
    setForm({ question_text: q.question_text, question_type: q.question_type, category: q.category });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.question_text.trim()) {
      toast({ title: 'Error', description: 'Question text is required', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      if (editingQuestion) {
        await apiClient.put(`/feedback_questions/${editingQuestion.id}`, {
          ...form,
          is_active: editingQuestion.is_active,
          order_index: editingQuestion.order_index,
        });
        toast({ title: 'Success', description: 'Question updated' });
      } else {
        const maxOrder = questions.length > 0 ? Math.max(...questions.map(q => q.order_index)) : 0;
        await apiClient.post('/feedback_questions', {
          ...form,
          order_index: maxOrder + 1,
        });
        toast({ title: 'Success', description: 'Question added' });
      }
      await loadQuestions();
      setIsDialogOpen(false);
    } catch (e) {
      console.error('Error saving question:', e);
      toast({ title: 'Error', description: 'Failed to save question', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this question? It will no longer appear in new feedback forms.')) return;
    try {
      await apiClient.delete(`/feedback_questions/${id}`);
      toast({ title: 'Success', description: 'Question deactivated' });
      await loadQuestions();
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to delete question', variant: 'destructive' });
    }
  };

  const handleToggleActive = async (q: FeedbackQuestion) => {
    try {
      await apiClient.put(`/feedback_questions/${q.id}`, {
        question_text: q.question_text,
        question_type: q.question_type,
        category: q.category,
        order_index: q.order_index,
        is_active: !q.is_active,
      });
      await loadQuestions();
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to update question status', variant: 'destructive' });
    }
  };

  const handleMoveOrder = async (q: FeedbackQuestion, direction: 'up' | 'down') => {
    const sorted = [...questions].sort((a, b) => a.order_index - b.order_index);
    const idx = sorted.findIndex(x => x.id === q.id);
    const swap = direction === 'up' ? sorted[idx - 1] : sorted[idx + 1];
    if (!swap) return;

    try {
      await Promise.all([
        apiClient.put(`/feedback_questions/${q.id}`, {
          question_text: q.question_text, question_type: q.question_type,
          category: q.category, is_active: q.is_active, order_index: swap.order_index,
        }),
        apiClient.put(`/feedback_questions/${swap.id}`, {
          question_text: swap.question_text, question_type: swap.question_type,
          category: swap.category, is_active: swap.is_active, order_index: q.order_index,
        }),
      ]);
      await loadQuestions();
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to reorder question', variant: 'destructive' });
    }
  };

  const getTypeIcon = (type: string) => {
    if (type === 'rating') return <Star className="h-3 w-3 text-yellow-500" />;
    if (type === 'nps') return <Hash className="h-3 w-3 text-blue-500" />;
    return <AlignLeft className="h-3 w-3 text-gray-500" />;
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      rating: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      nps: 'bg-blue-100 text-blue-800 border-blue-200',
      text: 'bg-gray-100 text-gray-700 border-gray-200',
    };
    const labels: Record<string, string> = { rating: '1–5 Stars', nps: '0–10 NPS', text: 'Text Answer' };
    return (
      <Badge variant="outline" className={`text-xs ${colors[type] || ''}`}>
        {getTypeIcon(type)}
        <span className="ml-1">{labels[type] || type}</span>
      </Badge>
    );
  };

  const sortedQuestions = [...questions].sort((a, b) => a.order_index - b.order_index);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Feedback Form Questions
          </CardTitle>
          <CardDescription>
            Manage questions shown to clients when they receive a feedback survey link.
          </CardDescription>
        </div>
        <Button onClick={openAddDialog} className="gradient-primary">
          <Plus className="h-4 w-4 mr-2" />
          Add Question
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="mb-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground flex items-start gap-2">
              <MessageSquare className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                These questions will appear in the feedback form sent to clients. Toggle a question off to hide it from new responses. Deleting soft-deactivates the question to preserve historical data.
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">Order</TableHead>
                  <TableHead>Question</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedQuestions.map((q, idx) => (
                  <TableRow key={q.id} className={!q.is_active ? 'opacity-50' : ''}>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <Button
                          variant="ghost" size="icon"
                          className="h-5 w-5"
                          onClick={() => handleMoveOrder(q, 'up')}
                          disabled={idx === 0}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-5 w-5"
                          onClick={() => handleMoveOrder(q, 'down')}
                          disabled={idx === sortedQuestions.length - 1}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium max-w-xs">
                      <span className="line-clamp-2">{q.question_text}</span>
                    </TableCell>
                    <TableCell>{getTypeBadge(q.question_type)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{q.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={q.is_active}
                        onCheckedChange={() => handleToggleActive(q)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(q)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(q.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {questions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>No questions yet. Add your first feedback question above.</p>
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Add / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingQuestion ? 'Edit Question' : 'Add Feedback Question'}</DialogTitle>
            <DialogDescription>
              {editingQuestion ? 'Update the question details below.' : 'Add a new question to the client feedback form.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="question_text">Question Text *</Label>
              <Input
                id="question_text"
                value={form.question_text}
                onChange={(e) => setForm({ ...form, question_text: e.target.value })}
                placeholder="e.g. How satisfied are you with the installation?"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Question Type</Label>
                <Select
                  value={form.question_type}
                  onValueChange={(v) => setForm({ ...form, question_type: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rating">
                      <div className="flex items-center gap-2">
                        <Star className="h-3 w-3 text-yellow-500" /> 1–5 Star Rating
                      </div>
                    </SelectItem>
                    <SelectItem value="nps">
                      <div className="flex items-center gap-2">
                        <Hash className="h-3 w-3 text-blue-500" /> 0–10 NPS Score
                      </div>
                    </SelectItem>
                    <SelectItem value="text">
                      <div className="flex items-center gap-2">
                        <AlignLeft className="h-3 w-3 text-gray-500" /> Text Answer
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Quality">Quality</SelectItem>
                    <SelectItem value="Timeliness">Timeliness</SelectItem>
                    <SelectItem value="Communication">Communication</SelectItem>
                    <SelectItem value="Technician">Technician</SelectItem>
                    <SelectItem value="General">General</SelectItem>
                    <SelectItem value="Comments">Comments</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="gradient-primary" disabled={isSaving || !form.question_text.trim()}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingQuestion ? 'Save Changes' : 'Add Question'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
