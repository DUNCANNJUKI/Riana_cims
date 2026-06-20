import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiClient } from "@/integrations/apiClient";
import { toast } from "sonner";
import { 
  User, Trophy, Star, TrendingUp, TrendingDown, Calendar, Clock, Target, 
  Award, Zap, Shield, Flame, Crown, Medal, Sparkles, ThumbsUp, Rocket, Heart,
  CheckCircle, BarChart3, RefreshCw
} from "lucide-react";
import { User as UserType } from "@/types";
import { format, subMonths } from "date-fns";

interface TechnicianProfilePageProps {
  user: UserType;
  technicianId?: string;
}

interface PerformanceScore {
  id: string;
  technician_id: string;
  period_start: string;
  period_end: string;
  total_installations: number;
  completed_on_time: number;
  completed_late: number;
  average_completion_days: number;
  average_feedback_rating: number;
  total_feedback_count: number;
  completion_rate_score: number;
  time_efficiency_score: number;
  client_satisfaction_score: number;
  overall_score: number;
  performance_tier: string;
  created_at: string;
}

interface AchievementBadge {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  earnedDate?: string;
  check: (score: PerformanceScore, allScores: PerformanceScore[]) => boolean;
}

const achievementBadges: AchievementBadge[] = [
  {
    id: "speed_demon",
    name: "Speed Demon",
    description: "Completed 100% of installations on time",
    icon: <Zap className="h-5 w-5" />,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10 border-yellow-500/30",
    check: (score) => score.completed_late === 0 && score.total_installations >= 3,
  },
  {
    id: "perfectionist",
    name: "Perfectionist",
    description: "Achieved 95%+ overall score",
    icon: <Target className="h-5 w-5" />,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10 border-purple-500/30",
    check: (score) => score.overall_score >= 95,
  },
  {
    id: "customer_champion",
    name: "Customer Champion",
    description: "Average feedback rating of 4.5+",
    icon: <Heart className="h-5 w-5" />,
    color: "text-pink-500",
    bgColor: "bg-pink-500/10 border-pink-500/30",
    check: (score) => score.average_feedback_rating >= 4.5 && score.total_feedback_count >= 2,
  },
  {
    id: "workhorse",
    name: "Workhorse",
    description: "Completed 10+ installations in a period",
    icon: <Rocket className="h-5 w-5" />,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10 border-blue-500/30",
    check: (score) => score.total_installations >= 10,
  },
  {
    id: "rising_star",
    name: "Rising Star",
    description: "Completed 5+ installations with 80%+ score",
    icon: <Sparkles className="h-5 w-5" />,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10 border-orange-500/30",
    check: (score) => score.total_installations >= 5 && score.overall_score >= 80,
  },
  {
    id: "champion",
    name: "Champion",
    description: "Ranked #1 in the leaderboard",
    icon: <Crown className="h-5 w-5" />,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10 border-amber-500/30",
    check: (score, allScores) => allScores.length > 0 && allScores[0]?.id === score.id,
  },
  {
    id: "elite",
    name: "Elite Performer",
    description: "Excellent tier with 5+ installations",
    icon: <Shield className="h-5 w-5" />,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10 border-emerald-500/30",
    check: (score) => score.performance_tier === "excellent" && score.total_installations >= 5,
  },
  {
    id: "hot_streak",
    name: "Hot Streak",
    description: "All 3 scoring categories above 85%",
    icon: <Flame className="h-5 w-5" />,
    color: "text-red-500",
    bgColor: "bg-red-500/10 border-red-500/30",
    check: (score) => 
      score.completion_rate_score >= 85 && 
      score.time_efficiency_score >= 85 && 
      score.client_satisfaction_score >= 85,
  },
  {
    id: "crowd_favorite",
    name: "Crowd Favorite",
    description: "Received 5+ client feedback responses",
    icon: <ThumbsUp className="h-5 w-5" />,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10 border-cyan-500/30",
    check: (score) => score.total_feedback_count >= 5,
  },
  {
    id: "veteran",
    name: "Veteran",
    description: "Completed 20+ installations",
    icon: <Medal className="h-5 w-5" />,
    color: "text-slate-500",
    bgColor: "bg-slate-500/10 border-slate-500/30",
    check: (score) => score.total_installations >= 20,
  },
];

const tierColors: Record<string, string> = {
  excellent: "bg-emerald-500",
  good: "bg-blue-500",
  standard: "bg-amber-500",
  needs_improvement: "bg-red-500",
};

const tierLabels: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  standard: "Standard",
  needs_improvement: "Needs Improvement",
};

export const TechnicianProfilePage = ({ user, technicianId }: TechnicianProfilePageProps) => {
  const [loading, setLoading] = useState(true);
  const [technicianInfo, setTechnicianInfo] = useState<any>(null);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceScore[]>([]);
  const [allScores, setAllScores] = useState<PerformanceScore[]>([]);
  const [earnedBadges, setEarnedBadges] = useState<AchievementBadge[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("all_time");

  const targetTechnicianId = technicianId || user.id;

  useEffect(() => {
    loadTechnicianData();
  }, [targetTechnicianId, selectedPeriod]);

  const loadTechnicianData = async () => {
    setLoading(true);
    try {
      // Load technician info from local API
      const techData = await apiClient.get(`/user_profiles/${targetTechnicianId}`);
      setTechnicianInfo(techData);

      // Calculate date range based on period
      let startDate: Date;
      const endDate = new Date();
      
      switch (selectedPeriod) {
        case "last_month":
          startDate = subMonths(endDate, 1);
          break;
        case "last_quarter":
          startDate = subMonths(endDate, 3);
          break;
        case "last_year":
          startDate = subMonths(endDate, 12);
          break;
        default:
          startDate = new Date(2020, 0, 1); // All time
      }

      const startStr = startDate.toISOString().split("T")[0];
      const endStr = endDate.toISOString().split("T")[0];

      // Load performance history and all scores from local API
      const historyData = await apiClient.get(
        `/technician_performance_scores?technician_id=${targetTechnicianId}&period_start=${startStr}&period_end=${endStr}`
      );
      setPerformanceHistory(Array.isArray(historyData) ? historyData : []);

      const allScoresData = await apiClient.get(
        `/technician_performance_scores?period_start=${startStr}&period_end=${endStr}`
      );
      setAllScores(Array.isArray(allScoresData) ? allScoresData : []);

      // Calculate earned badges
      if (Array.isArray(historyData) && historyData.length > 0) {
        const latestScore = historyData[0];
        const badges = achievementBadges.filter(badge => 
          badge.check(latestScore, Array.isArray(allScoresData) ? allScoresData : [])
        );
        setEarnedBadges(badges);
      }

    } catch (error) {
      console.error("Error loading technician data:", error);
      toast.error("Failed to load technician profile");
    } finally {
      setLoading(false);
    }
  };

  const latestScore = performanceHistory[0];
  const totalInstallations = performanceHistory.reduce((sum, p) => sum + p.total_installations, 0);
  const avgScore = performanceHistory.length > 0 
    ? performanceHistory.reduce((sum, p) => sum + p.overall_score, 0) / performanceHistory.length 
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
             <User className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              {technicianInfo?.first_name} {technicianInfo?.last_name}
            </h1>
            <p className="text-muted-foreground">{technicianInfo?.designation || "Field Specialist"}</p>
            {technicianInfo?.subsidiary && (
              <Badge variant="outline" className="mt-1">
                {technicianInfo.subsidiary.subsidiary_name}
              </Badge>
            )}
          </div>
        </div>
        {user.role !== 'User' && (
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="last_quarter">Last Quarter</SelectItem>
              <SelectItem value="last_year">Last Year</SelectItem>
              <SelectItem value="all_time">All Time</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {user.role !== 'User' && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    latestScore ? tierColors[latestScore.performance_tier] : "bg-muted"
                  }`}>
                    <Trophy className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Current Tier</p>
                    <p className="text-xl font-bold">
                      {latestScore ? tierLabels[latestScore.performance_tier] : "N/A"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Star className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Overall Score</p>
                    <p className="text-xl font-bold">{latestScore?.overall_score?.toFixed(1) || 0}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle className="h-6 w-6 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Installations</p>
                    <p className="text-xl font-bold">{totalInstallations}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Award className="h-6 w-6 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Badges Earned</p>
                    <p className="text-xl font-bold">{earnedBadges.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="badges" className="space-y-4">
            <TabsList>
              <TabsTrigger value="badges">Badge Collection</TabsTrigger>
              <TabsTrigger value="history">Performance History</TabsTrigger>
              <TabsTrigger value="statistics">Statistics</TabsTrigger>
            </TabsList>

            {/* Badge Collection Tab */}
            <TabsContent value="badges" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-primary" />
                    Badge Collection
                  </CardTitle>
                  <CardDescription>
                    {earnedBadges.length} of {achievementBadges.length} badges earned
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                    {achievementBadges.map((badge) => {
                      const isEarned = earnedBadges.some(b => b.id === badge.id);
                      
                      return (
                        <TooltipProvider key={badge.id}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`flex flex-col items-center p-4 rounded-lg border transition-all cursor-pointer ${
                                isEarned 
                                  ? `${badge.bgColor} ${badge.color}` 
                                  : "bg-muted/30 border-muted text-muted-foreground opacity-40 grayscale"
                              }`}>
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-2 ${
                                  isEarned ? badge.bgColor : "bg-muted"
                                }`}>
                                  {badge.icon}
                                </div>
                                <span className="text-sm font-medium text-center">{badge.name}</span>
                                {isEarned && (
                                  <CheckCircle className="h-4 w-4 mt-2 text-emerald-500" />
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <div className="font-semibold">{badge.name}</div>
                              <div className="text-xs text-muted-foreground">{badge.description}</div>
                              <div className="text-xs mt-1 font-medium">
                                {isEarned ? "✓ Earned" : "🔒 Locked"}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Performance History Tab */}
            <TabsContent value="history" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Performance Over Time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {performanceHistory.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No performance data available for this period</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {performanceHistory.map((score) => (
                        <div key={score.id} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">
                                {format(new Date(score.period_start), "MMM yyyy")} - {format(new Date(score.period_end), "MMM yyyy")}
                              </span>
                            </div>
                            <Badge className={tierColors[score.performance_tier]}>
                              {tierLabels[score.performance_tier]}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                            <div>
                              <p className="text-xs text-muted-foreground">Overall Score</p>
                              <p className="font-semibold">{score.overall_score?.toFixed(1)}%</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Installations</p>
                              <p className="font-semibold">{score.total_installations}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">On Time</p>
                              <p className="font-semibold text-emerald-600">{score.completed_on_time}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Avg Rating</p>
                              <p className="font-semibold">{score.average_feedback_rating?.toFixed(1) || "N/A"}</p>
                            </div>
                          </div>
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs w-24">Completion</span>
                              <Progress value={score.completion_rate_score || 0} className="flex-1 h-2" />
                              <span className="text-xs w-12 text-right">{score.completion_rate_score?.toFixed(0)}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs w-24">Efficiency</span>
                              <Progress value={score.time_efficiency_score || 0} className="flex-1 h-2" />
                              <span className="text-xs w-12 text-right">{score.time_efficiency_score?.toFixed(0)}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs w-24">Satisfaction</span>
                              <Progress value={score.client_satisfaction_score || 0} className="flex-1 h-2" />
                              <span className="text-xs w-12 text-right">{score.client_satisfaction_score?.toFixed(0)}%</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Statistics Tab */}
            <TabsContent value="statistics" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Performance Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Completion Rate</span>
                        <span className="font-medium">{latestScore?.completion_rate_score?.toFixed(1) || 0}%</span>
                      </div>
                      <Progress value={latestScore?.completion_rate_score || 0} />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Time Efficiency</span>
                        <span className="font-medium">{latestScore?.time_efficiency_score?.toFixed(1) || 0}%</span>
                      </div>
                      <Progress value={latestScore?.time_efficiency_score || 0} />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Client Satisfaction</span>
                        <span className="font-medium">{latestScore?.client_satisfaction_score?.toFixed(1) || 0}%</span>
                      </div>
                      <Progress value={latestScore?.client_satisfaction_score || 0} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Key Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                        <span className="text-sm text-muted-foreground">Total Installations</span>
                        <span className="font-bold">{totalInstallations}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                        <span className="text-sm text-muted-foreground">Average Score</span>
                        <span className="font-bold">{avgScore.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                        <span className="text-sm text-muted-foreground">Avg Completion Days</span>
                        <span className="font-bold">{latestScore?.average_completion_days?.toFixed(1) || "N/A"}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                        <span className="text-sm text-muted-foreground">Total Feedback</span>
                        <span className="font-bold">{latestScore?.total_feedback_count || 0}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                        <span className="text-sm text-muted-foreground">Avg Feedback Rating</span>
                        <span className="font-bold">{latestScore?.average_feedback_rating?.toFixed(1) || "N/A"}/5</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};
