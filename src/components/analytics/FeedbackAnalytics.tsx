import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Star, MessageSquare, Award } from "lucide-react";
import { useDatabase } from "@/hooks/useDatabase";
import { User } from "@/types";

interface FeedbackAnalyticsProps {
  user: User;
  refreshTrigger?: boolean;
}

interface FeedbackMetrics {
  totalFeedback: number;
  averageRating: number;
  npsScore: number;
  csatScore: number;
  promoters: number;
  passives: number;  
  detractors: number;
  recentFeedback: any[];
}

export const FeedbackAnalytics = ({ user, refreshTrigger }: FeedbackAnalyticsProps) => {
  const [metrics, setMetrics] = useState<FeedbackMetrics>({
    totalFeedback: 0,
    averageRating: 0,
    npsScore: 0,
    csatScore: 0,
    promoters: 0,
    passives: 0,
    detractors: 0,
    recentFeedback: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const { getFeedbackAnalytics } = useDatabase();

  useEffect(() => {
    loadFeedbackAnalytics();
  }, []);

  useEffect(() => {
    if (refreshTrigger === true) {
      loadFeedbackAnalytics();
    }
  }, [refreshTrigger]);

  const loadFeedbackAnalytics = async () => {
    try {
      setIsLoading(true);
      setHasError(false);
      const data = await getFeedbackAnalytics();
      setMetrics(data);
    } catch (error) {
      console.error('Error loading feedback analytics:', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const getNPSColor = (score: number) => {
    if (score >= 50) return 'text-success';
    if (score >= 0) return 'text-warning';
    return 'text-destructive';
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 4.5) return 'text-success';
    if (rating >= 3.5) return 'text-warning';
    return 'text-destructive';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading feedback analytics...</p>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 text-destructive mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold text-destructive">Feedback Data Unavailable</h3>
          <p className="text-muted-foreground max-w-xs mx-auto">We couldn't retrieve the feedback metrics. Please try again.</p>
        </div>
        <button 
          onClick={() => loadFeedbackAnalytics()}
          className="px-4 py-2 border rounded hover:bg-muted transition-colors flex items-center gap-2"
        >
          <TrendingUp className="h-4 w-4" />
          Retry Loading
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-primary mb-2">Feedback Analytics</h2>
        <p className="text-muted-foreground">Insights from client feedback and satisfaction surveys</p>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Feedback</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalFeedback}</div>
            <p className="text-xs text-muted-foreground">Client responses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getRatingColor(metrics.averageRating)}`}>
              {metrics.averageRating.toFixed(1)}/5
            </div>
            <p className="text-xs text-muted-foreground">Overall satisfaction</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">NPS Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getNPSColor(metrics.npsScore)}`}>
              {metrics.npsScore}
            </div>
            <p className="text-xs text-muted-foreground">Net Promoter Score</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CSAT Score</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{metrics.csatScore}%</div>
            <p className="text-xs text-muted-foreground">Customer Satisfaction</p>
          </CardContent>
        </Card>
      </div>

      {/* NPS Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>NPS Breakdown</CardTitle>
          <CardDescription>Distribution of promoters, passives, and detractors</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-success rounded-full"></div>
                <span className="text-sm">Promoters (9-10)</span>
              </div>
              <span className="font-medium">{metrics.promoters}</span>
            </div>
            <Progress value={(metrics.promoters / Math.max(metrics.totalFeedback, 1)) * 100} className="h-2" />
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-warning rounded-full"></div>
                <span className="text-sm">Passives (7-8)</span>
              </div>
              <span className="font-medium">{metrics.passives}</span>
            </div>
            <Progress value={(metrics.passives / Math.max(metrics.totalFeedback, 1)) * 100} className="h-2" />
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-destructive rounded-full"></div>
                <span className="text-sm">Detractors (0-6)</span>
              </div>
              <span className="font-medium">{metrics.detractors}</span>
            </div>
            <Progress value={(metrics.detractors / Math.max(metrics.totalFeedback, 1)) * 100} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Recent Feedback */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Feedback</CardTitle>
          <CardDescription>Latest client feedback submissions</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.recentFeedback.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Overall Rating</TableHead>
                  <TableHead>NPS Category</TableHead>
                  <TableHead>Key Feedback</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.recentFeedback.map((feedback, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {new Date(feedback.feedback_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{feedback.client_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${
                              i < feedback.overall_satisfaction
                                ? 'fill-warning text-warning'
                                : 'text-muted-foreground'
                            }`}
                          />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          feedback.nps_category === 'promoter'
                            ? 'default'
                            : feedback.nps_category === 'passive'
                            ? 'secondary'
                            : 'destructive'
                        }
                      >
                        {feedback.nps_category}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {feedback.positive_feedback || feedback.improvement_suggestions || 'No comments'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2" />
              <p>No feedback data available yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};