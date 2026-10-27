import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, User } from "lucide-react";
import { useDatabase } from "@/hooks/useDatabase";

export const TechnicianPerformanceReport = () => {
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { getUsers, getAssignments } = useDatabase();

  useEffect(() => {
    fetchPerformanceData();
    
    // Listen for data updates to keep report in sync
    const handleDataUpdate = () => {
      console.log('Real-time update triggered for performance report');
      fetchPerformanceData();
    };
    
    window.addEventListener('data-updated', handleDataUpdate);
    return () => window.removeEventListener('data-updated', handleDataUpdate);
  }, []);

  const fetchPerformanceData = async () => {
    try {
      setIsLoading(true);
      const [usersData, assignmentsData] = await Promise.all([
        getUsers(),
        getAssignments()
      ]);

      // Filter for technicians only
      const techs = (usersData || []).filter((u: any) => u.role === 'User' || u.role === 'Technician');
      
      const enrichedTechs = techs.map(tech => {
        const techAssignments = (assignmentsData || []).filter((a: any) => 
          a.hardware_technician_id === tech.id || a.software_technician_id === tech.id
        );

        const completed = techAssignments.filter((a: any) => a.status === 'completed').length;
        const total = techAssignments.length;
        const rate = total > 0 ? (completed / total) * 100 : 0;
        const avgProgress = total > 0 ? techAssignments.reduce((acc: number, curr: any) => acc + (curr.progress_percentage || 0), 0) / total : 0;

        return {
          ...tech,
          total_assignments: total,
          completed_assignments: completed,
          completion_rate: rate.toFixed(1),
          average_progress: avgProgress.toFixed(1)
        };
      });

      setTechnicians(enrichedTechs);
    } catch (error) {
      console.error("Error loading technician performance data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="shadow-elegant border-none bg-white/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-xl font-bold text-primary">Technician Performance Report</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-bold">Technician</TableHead>
              <TableHead className="font-bold text-center">Total Tasks</TableHead>
              <TableHead className="font-bold text-center">Completed</TableHead>
              <TableHead className="font-bold text-center">Completion Rate</TableHead>
              <TableHead className="font-bold text-center">Avg. Progress</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {technicians.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No technician performance data found
                </TableCell>
              </TableRow>
            ) : (
              technicians.map((tech) => (
                <TableRow key={tech.id} className="hover:bg-muted/20 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/10 p-2 rounded-full">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div className="font-bold text-primary">
                        {tech.first_name || ''} {tech.last_name || ''}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center font-medium">{tech.total_assignments}</TableCell>
                  <TableCell className="text-center font-medium text-success">{tech.completed_assignments}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                      {tech.completion_rate}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary" 
                          style={{ width: `${tech.average_progress}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold">{tech.average_progress}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
