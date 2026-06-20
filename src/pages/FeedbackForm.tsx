import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Star, ThumbsUp, MessageSquarePlus, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_URL } from "@/integrations/apiClient";
// Feedback form for clients (Public)


interface FeedbackData {
  installation_quality_rating: number;
  installation_timeliness_rating: number;
  installation_communication_rating: number;
  technician_knowledge_rating: number;
  technician_professionalism_rating: number;
  technician_helpfulness_rating: number;
  recommendation_score: number;
  overall_satisfaction: number;
  positive_feedback: string;
  improvement_suggestions: string;
}

interface FeedbackLink {
  id: string;
  client_id: string;
  installation_id: string | null;
  expires_at: string;
  is_used: boolean;
  client: {
    client_name: string;
    branch: string | null;
    industry_classification: string;
    contact_person_name: string;
  };
}

export const FeedbackForm = () => {
  const { token } = useParams<{ token: string }>();
  const [feedbackLink, setFeedbackLink] = useState<FeedbackLink | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [dynamicResponses, setDynamicResponses] = useState<Record<string, any>>({});
  const { toast } = useToast();

  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const resp = await fetch(`${API_URL}/feedback_questions`);
        if (resp.ok) {
          const data = await resp.json();
          setQuestions(data);
          // Initialize responses
          const initial: Record<string, any> = {};
          data.forEach((q: any) => {
            if (q.question_type === 'rating') initial[q.id] = 5;
            else if (q.question_type === 'nps') initial[q.id] = 10;
            else initial[q.id] = "";
          });
          setDynamicResponses(initial);
        }
      } catch (error) {
        console.error("Error fetching feedback questions:", error);
      }
    };
    fetchQuestions();
  }, []);

  useEffect(() => {
    if (token) {
      validateFeedbackLink();
    }
  }, [token]);

  const validateFeedbackLink = async () => {
    try {
      setIsLoading(true);
      
      const response = await fetch(`${API_URL}/public/feedback-links/${token}`);
      if (!response.ok) {
        setError('Invalid or expired feedback link');
        return;
      }
      
      const data = await response.json();

      // Check if link is expired
      if (new Date(data.expires_at) < new Date()) {
        setError('This feedback link has expired');
        return;
      }

      // If used, try to load existing feedback
      if (data.is_used) {
        const feedbackResp = await fetch(`${API_URL}/installation_feedback/latest?client_id=${data.client_id}&installation_id=${data.installation_id}`);
        if (feedbackResp.ok) {
            const existingFeedback = await feedbackResp.json();
            if (existingFeedback && existingFeedback.dynamic_responses) {
              setDynamicResponses(existingFeedback.dynamic_responses);
            }
        }
      }

      setFeedbackLink(data);
    } catch (error) {
      console.error('Error validating feedback link:', error);
      setError('Failed to validate feedback link');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!feedbackLink) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/public/installation-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            installation_id: feedbackLink.installation_id,
            client_id: feedbackLink.client_id,
            dynamic_responses: dynamicResponses,
            // Fallbacks for legacy columns
            overall_satisfaction: dynamicResponses[questions.find(q => q.question_type === 'rating')?.id] || 5,
            recommendation_score: dynamicResponses[questions.find(q => q.question_type === 'nps')?.id] || 10
        })
      });

      if (!response.ok) throw new Error('Failed to submit feedback');

      // Mark feedback link as used (simulated via public endpoint too)
      await fetch(`${API_URL}/public/feedback-links/${token}/use`, { method: 'POST' });

      setIsSubmitted(true);
      toast({
        title: "Thank you!",
        description: "Your feedback has been submitted successfully.",
      });
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
            className="p-1 hover:scale-110 transition-all active:scale-95"
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
            className={`p-2 text-sm rounded transition-all hover:scale-105 active:scale-95 ${
              score === value 
                ? 'bg-primary text-primary-foreground shadow-md' 
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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Validating feedback link...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-destructive">Access Denied</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">{error}</p>
            <p className="text-sm text-muted-foreground">
              Please contact RIANA Technologies support if you believe this is an error.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-success" />
            </div>
            <CardTitle className="text-success">Thank You!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Your feedback has been submitted successfully. We appreciate your time and input.
            </p>
            <div className="bg-muted/30 p-4 rounded-lg text-sm">
              <p className="font-medium">What happens next?</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-left">
                <li>Your feedback will be reviewed by our team</li>
                <li>We'll use your input to improve our services</li>
                <li>Outstanding technicians will be recognized</li>
                <li>Any issues raised will be addressed promptly</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Installation Feedback</h1>
          <p className="text-muted-foreground">
            Help us improve by sharing your experience with {feedbackLink?.client.client_name}
            {feedbackLink?.client.branch && ` - ${feedbackLink.client.branch}`}
          </p>
        </div>

        <div className="space-y-6">
          {questions.map((q) => (
            <Card key={q.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <MessageSquarePlus className="h-4 w-4 text-primary" />
                  {q.category || 'General'}
                </CardTitle>
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
            <div className="py-12 text-center text-muted-foreground animate-pulse">
              Loading your feedback survey...
            </div>
          )}

          {/* Submit Button */}
          <div className="text-center">
            <Button 
              onClick={handleSubmit} 
              disabled={isSubmitting}
              className="gradient-primary px-8 py-3 text-lg transition-all hover:scale-[1.05] active:scale-95 animate-fade-in shadow-lg hover:shadow-xl"
              size="lg"
            >
              <ThumbsUp className="h-5 w-5 mr-2" />
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </Button>
          </div>

          {/* Footer */}
          <div className="text-center text-sm text-muted-foreground bg-muted/30 p-4 rounded-lg">
            <p>
              This feedback form is provided by <strong>RIANA Technologies</strong> to improve our installation services.
              Your responses are confidential and will be used to enhance service quality.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};