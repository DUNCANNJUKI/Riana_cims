import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Star, ThumbsUp, MessageSquarePlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/integrations/apiClient";
import { Installation, Client, User } from "@/types";

interface ClientFeedbackFormProps {
  installation: Installation | null;
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
  user: User;
}

export const ClientFeedbackForm = ({ installation, client, isOpen, onClose, user }: ClientFeedbackFormProps) => {
  const [questions, setQuestions] = useState<any[]>([]);
  const [dynamicResponses, setDynamicResponses] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const data = await apiClient.get('/feedback_questions');
        setQuestions(data);
        // Initialize responses
        const initial: Record<string, any> = {};
        data.forEach((q: any) => {
          if (q.question_type === 'rating') initial[q.id] = 5;
          else if (q.question_type === 'nps') initial[q.id] = 10;
          else initial[q.id] = "";
        });
        setDynamicResponses(initial);
      } catch (error) {
        console.error("Error fetching feedback questions:", error);
      }
    };
    fetchQuestions();
  }, []);

  const handleSubmit = async () => {
    if (!installation || !client) return;

    setIsSubmitting(true);
    try {
      await apiClient.post('/feedback', {
        installation_id: installation.id,
        client_id: client.id,
        submitted_by: user.id,
        dynamic_responses: dynamicResponses,
        // Fallbacks for legacy columns
        overall_satisfaction: dynamicResponses[questions.find(q => q.question_type === 'rating')?.id] || 5,
        recommendation_score: dynamicResponses[questions.find(q => q.question_type === 'nps')?.id] || 10
      });

      toast({
        title: "Feedback Submitted",
        description: "Thank you for your valuable feedback!",
      });

      onClose();
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const StarRating = ({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="p-1 hover:scale-110 transition-transform"
          >
            <Star
              className={`h-6 w-6 ${star <= value ? 'fill-warning text-warning' : 'text-muted-foreground'}`}
            />
          </button>
        ))}
      </div>
    </div>
  );

  const NPSRating = ({ value, onChange }: { value: number; onChange: (value: number) => void }) => (
    <div className="space-y-2">
      <Label>How likely are you to recommend our services? (0-10)</Label>
      <div className="grid grid-cols-11 gap-1">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            className={`p-2 text-sm rounded transition-colors ${
              score === value 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted hover:bg-muted/80'
            }`}
          >
            {score}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Not likely</span>
        <span>Extremely likely</span>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5" />
            Installation Feedback - {client?.client_name}
          </DialogTitle>
          <DialogDescription>
            Please share your experience with our installation process and technician training
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {questions.map((q) => (
            <Card key={q.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium">{q.category || 'General'}</CardTitle>
              </CardHeader>
              <CardContent>
                {q.question_type === 'rating' && (
                  <StarRating
                    value={dynamicResponses[q.id]}
                    onChange={(val) => setDynamicResponses(prev => ({ ...prev, [q.id]: val }))}
                    label={q.question_text}
                  />
                )}
                {q.question_type === 'nps' && (
                  <NPSRating
                    value={dynamicResponses[q.id]}
                    onChange={(val) => setDynamicResponses(prev => ({ ...prev, [q.id]: val }))}
                  />
                )}
                {q.question_type === 'text' && (
                  <div className="space-y-2">
                    <Label>{q.question_text}</Label>
                    <Textarea
                      placeholder="Share your thoughts..."
                      value={dynamicResponses[q.id] || ""}
                      onChange={(e) => setDynamicResponses(prev => ({ ...prev, [q.id]: e.target.value }))}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {questions.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              Loading survey questions...
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={isSubmitting || questions.length === 0}
              className="gradient-primary"
            >
              <ThumbsUp className="h-4 w-4 mr-2" />
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};