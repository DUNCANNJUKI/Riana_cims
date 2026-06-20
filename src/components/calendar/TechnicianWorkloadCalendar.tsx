import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Calendar, Users, Loader2 } from "lucide-react";
import { User } from "@/types";
import { apiClient } from "@/integrations/apiClient";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday } from "date-fns";
import { cn } from "@/lib/utils";

interface TechnicianWorkloadCalendarProps {
  user: User;
}

interface Assignment {
  id: string;
  client_id: string;
  client_name: string;
  hardware_technician_id: string | null;
  software_technician_id: string | null;
  hardware_technician_name: string;
  software_technician_name: string;
  installation_start_date: string;
  scheduled_end_date: string | null;
  status: string;
  branch?: string | null;
}

interface Technician {
  id: string;
  name: string;
  email: string;
  designation: string | null;
}

const statusColors: Record<string, string> = {
  assigned: "bg-blue-500",
  in_progress: "bg-amber-500",
  completed: "bg-green-500",
  waiting: "bg-orange-500",
  pending: "bg-gray-400",
};

export const TechnicianWorkloadCalendar = ({ user }: TechnicianWorkloadCalendarProps) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechnician, setSelectedTechnician] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  useEffect(() => {
    loadData();
    
    // Set up polling for "realtime" functionality with local backend
    const interval = setInterval(() => {
      loadData(false); // Silent refresh
    }, 30000); // 30 seconds
    
    // Listen for manual data refresh events
    const handleRefresh = () => loadData(false);
    window.addEventListener('data-updated', handleRefresh);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('data-updated', handleRefresh);
    };
  }, [currentDate]);

  const loadData = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      // 1. Fetch technicians from user profiles
      const users = await apiClient.get('/user_profiles');
      const techList = (users || [])
        .filter((u: any) => 
          (u.designation || '').toLowerCase().includes('technician') || 
          (u.designation || '').toLowerCase().includes('field specialist')
        )
        .map((t: any) => ({
          id: t.id,
          name: `${t.first_name || ""} ${t.last_name || ""}`.trim() || t.email,
          email: t.email,
          designation: t.designation,
        }));
      setTechnicians(techList);

      // 2. Fetch assignments
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      
      const assignmentsData = await apiClient.get('/client_assignments');
      
      // 3. Fetch clients to match names (though local API usually joins them)
      // If the local API /api/client_assignments already includes client_name, we use it.
      // Based on server/index.js, it joins client_name and technician names.

      const filteredAssignments = (assignmentsData || [])
        .filter((a: any) => {
          const startDate = new Date(a.installation_start_date);
          return startDate >= monthStart && startDate <= monthEnd;
        })
        .map((a: any) => ({
          ...a,
          client_name: a.client_name || "Unknown Client",
          hardware_technician_name: a.ht_f ? `${a.ht_f} ${a.ht_l || ''}`.trim() : "Unassigned",
          software_technician_name: a.st_f ? `${a.st_f} ${a.st_l || ''}`.trim() : "Unassigned",
        }));

      setAssignments(enrichedAssignments(filteredAssignments, techList));
    } catch (error) {
      console.error("Error loading calendar data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const enrichedAssignments = (data: any[], techs: Technician[]) => {
    return data.map(a => {
      const hwTech = techs.find(t => t.id === a.hardware_technician_id);
      const swTech = techs.find(t => t.id === a.software_technician_id);
      return {
        ...a,
        hardware_technician_name: hwTech ? hwTech.name : (a.hardware_technician_name || "Unassigned"),
        software_technician_name: swTech ? swTech.name : (a.software_technician_name || "Unassigned"),
      };
    });
  };

  const days = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  });

  const getAssignmentsForDay = (day: Date) => {
    // Use a Set to track unique assignment IDs to prevent duplicates
    const seenIds = new Set<string>();
    
    return assignments.filter((assignment) => {
      // Skip if we've already seen this assignment ID
      if (seenIds.has(assignment.id)) {
        return false;
      }
      
      const startDate = new Date(assignment.installation_start_date);
      // Reset time to midnight for accurate date comparison
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = assignment.scheduled_end_date
        ? new Date(assignment.scheduled_end_date)
        : startDate;
      endDate.setHours(23, 59, 59, 999);
      
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      
      const matchesDate = dayStart >= startDate && dayStart <= endDate;
      const matchesTechnician =
        selectedTechnician === "all" ||
        assignment.hardware_technician_id === selectedTechnician ||
        assignment.software_technician_id === selectedTechnician;

      if (matchesDate && matchesTechnician) {
        seenIds.add(assignment.id);
        return true;
      }
      return false;
    });
  };

  const selectedDayAssignments = selectedDay ? getAssignmentsForDay(selectedDay) : [];

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Get first day padding
  const firstDayOfMonth = startOfMonth(currentDate);
  const startPadding = firstDayOfMonth.getDay();

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            Technician Workload Calendar
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            View all technician assignments across dates
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 sm:gap-6">
        {/* Calendar Section */}
        <Card className="xl:col-span-3 shadow-riana overflow-hidden">
          <CardHeader className="pb-2 sm:pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                  className="h-8 w-8 sm:h-9 sm:w-9 btn-click-effect"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <h3 className="text-lg sm:text-xl font-semibold min-w-[140px] sm:min-w-[180px] text-center">
                  {format(currentDate, "MMMM yyyy")}
                </h3>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                  className="h-8 w-8 sm:h-9 sm:w-9 btn-click-effect"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Select value={selectedTechnician} onValueChange={setSelectedTechnician}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="All Technicians" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Technicians</SelectItem>
                  {technicians.map((tech) => (
                    <SelectItem key={tech.id} value={tech.id}>
                      {tech.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-2 sm:p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {/* Week day headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {weekDays.map((day) => (
                    <div
                      key={day}
                      className="text-center text-xs sm:text-sm font-medium text-muted-foreground py-2"
                    >
                      <span className="hidden sm:inline">{day}</span>
                      <span className="sm:hidden">{day.charAt(0)}</span>
                    </div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-1">
                  {/* Padding for first week */}
                  {Array.from({ length: startPadding }).map((_, i) => (
                    <div key={`pad-${i}`} className="aspect-square" />
                  ))}

                  {days.map((day) => {
                    const dayAssignments = getAssignmentsForDay(day);
                    const hasAssignments = dayAssignments.length > 0;
                    const isSelected = selectedDay && isSameDay(day, selectedDay);

                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => setSelectedDay(day)}
                        className={cn(
                          "aspect-square p-1 rounded-lg border transition-all duration-200 hover:scale-105 relative overflow-hidden",
                          isToday(day) && "ring-2 ring-primary ring-offset-1",
                          isSelected && "bg-primary/10 border-primary",
                          !isSameMonth(day, currentDate) && "opacity-50",
                          hasAssignments && "bg-accent/50"
                        )}
                      >
                        <span
                          className={cn(
                            "text-xs sm:text-sm font-medium",
                            isToday(day) && "text-primary font-bold"
                          )}
                        >
                          {format(day, "d")}
                        </span>
                        {hasAssignments && (
                          <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex gap-0.5">
                            {dayAssignments.slice(0, 3).map((a, i) => (
                              <div
                                key={i}
                                className={cn(
                                  "w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full",
                                  statusColors[a.status] || "bg-gray-400"
                                )}
                              />
                            ))}
                            {dayAssignments.length > 3 && (
                              <span className="text-[8px] sm:text-[10px] text-muted-foreground ml-0.5">
                                +{dayAssignments.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-2 sm:gap-4 mt-4 pt-4 border-t">
                  {Object.entries(statusColors).map(([status, color]) => (
                    <div key={status} className="flex items-center gap-1.5">
                      <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", color)} />
                      <span className="text-xs sm:text-sm capitalize text-muted-foreground">
                        {status.replace("_", " ")}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Side Panel - Selected Day Details */}
        <Card className="shadow-riana">
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Users className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              {selectedDay ? format(selectedDay, "MMM d, yyyy") : "Select a Day"}
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {selectedDayAssignments.length} assignment(s)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[400px] sm:max-h-[500px] overflow-y-auto">
            {selectedDayAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {selectedDay ? "No assignments for this day" : "Click a day to view assignments"}
              </p>
            ) : (
              selectedDayAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="p-3 rounded-lg border bg-card hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-medium text-sm line-clamp-1">{assignment.client_name}</h4>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] sm:text-xs shrink-0",
                        statusColors[assignment.status]?.replace("bg-", "text-")
                      )}
                    >
                      {assignment.status}
                    </Badge>
                  </div>
                  {assignment.branch && (
                    <p className="text-xs text-muted-foreground mt-1">Branch: {assignment.branch}</p>
                  )}
                  <div className="mt-2 space-y-1 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">HW:</span>
                      <span className="font-medium truncate">{assignment.hardware_technician_name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">SW:</span>
                      <span className="font-medium truncate">{assignment.software_technician_name}</span>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t text-[10px] sm:text-xs text-muted-foreground">
                    {format(new Date(assignment.installation_start_date), "MMM d")}
                    {assignment.scheduled_end_date && (
                      <> - {format(new Date(assignment.scheduled_end_date), "MMM d")}</>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Technician Summary */}
      <Card className="shadow-riana">
        <CardHeader className="pb-2 sm:pb-4">
          <CardTitle className="text-base sm:text-lg">Technician Workload Summary</CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Assignments per technician for {format(currentDate, "MMMM yyyy")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {technicians.map((tech) => {
              const techAssignments = assignments.filter(
                (a) =>
                  a.hardware_technician_id === tech.id || a.software_technician_id === tech.id
              );
              const completedCount = techAssignments.filter((a) => a.status === "completed").length;
              const inProgressCount = techAssignments.filter(
                (a) => a.status === "in_progress" || a.status === "assigned"
              ).length;

              return (
                <div
                  key={tech.id}
                  className={cn(
                    "p-3 sm:p-4 rounded-lg border bg-card transition-all hover:shadow-md cursor-pointer",
                    selectedTechnician === tech.id && "ring-2 ring-primary"
                  )}
                  onClick={() =>
                    setSelectedTechnician(selectedTechnician === tech.id ? "all" : tech.id)
                  }
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs sm:text-sm font-bold text-primary">
                        {tech.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{tech.name}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                        {tech.designation || "Technician"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Badge variant="outline" className="text-[10px] sm:text-xs bg-green-500/10 text-green-600 border-green-500/30">
                      {completedCount} done
                    </Badge>
                    <Badge variant="outline" className="text-[10px] sm:text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                      {inProgressCount} active
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
          {technicians.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No technicians found
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
