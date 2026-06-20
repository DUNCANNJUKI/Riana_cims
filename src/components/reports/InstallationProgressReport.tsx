import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";
import { useDatabase } from "@/hooks/useDatabase";

export const InstallationProgressReport = () => {
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { getAssignments, getClients } = useDatabase();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [assignmentsData, clientsData] = await Promise.all([
        getAssignments(),
        getClients()
      ]);

      const enrichedData = (assignmentsData || []).map((assignment: any) => {
        const client = (clientsData || []).find((c: any) => c.id === assignment.client_id);
        return {
          ...assignment,
          client_name: client?.client_name || 'Unknown',
          client_branch: client?.branch || assignment.branch || ''
        };
      });

      setData(enrichedData);
    } catch (error) {
      console.error("Error fetching progress data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-success/10 text-success border-success/20';
      case 'in_progress': return 'bg-primary/10 text-primary border-primary/20';
      case 'waiting': return 'bg-warning/10 text-warning border-warning/20';
      default: return 'bg-muted text-muted-foreground border-border';
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
        <CardTitle className="text-xl font-bold text-primary">Installation Progress Report</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-bold">Client</TableHead>
              <TableHead className="font-bold">Branch</TableHead>
              <TableHead className="font-bold">Status</TableHead>
              <TableHead className="font-bold">Progress</TableHead>
              <TableHead className="font-bold text-right">Last Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No progress data found
                </TableCell>
              </TableRow>
            ) : (
              data.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/20 transition-colors">
                  <TableCell className="font-medium text-primary">{item.client_name}</TableCell>
                  <TableCell>{item.client_branch}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStatusColor(item.status)}>
                      {item.status?.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Progress value={item.progress_percentage || 0} className="w-24" />
                      <span className="text-sm font-semibold">{item.progress_percentage || 0}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : 'N/A'}
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
