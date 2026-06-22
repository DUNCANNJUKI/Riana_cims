 import { useCurrentUserRole } from '@crms/hooks/useCurrentUserRole';
 import { Card, CardContent, CardHeader, CardTitle } from '@crms/components/ui/card';
 import { Badge } from '@crms/components/ui/badge';
 import { Button } from '@crms/components/ui/button';
 import { Link } from 'react-router-dom';
 import { 
   ClipboardCheck, 
   PlayCircle, 
   CheckCircle2, 
   Clock, 
   ArrowRight,
   Users,
   FileText,
   AlertTriangle,
   TrendingUp,
 } from 'lucide-react';
 import { useChangeRequests, useClients } from '@crms/hooks/useSupabaseData';
 
 interface RoleCardProps {
   title: string;
   description: string;
   stats: { label: string; value: number; icon: React.ComponentType<{ className?: string }> }[];
   actions: { label: string; href: string; variant?: 'default' | 'outline' }[];
   accentColor: string;
 }
 
 function RoleCard({ title, description, stats, actions, accentColor }: RoleCardProps) {
   return (
     <Card className={`border-l-4 ${accentColor} shadow-soft hover:shadow-medium transition-all`}>
       <CardHeader className="pb-2">
         <CardTitle className="flex items-center justify-between">
           <span className="text-lg font-semibold text-foreground">{title}</span>
           <Badge variant="secondary" className="text-xs">{description}</Badge>
         </CardTitle>
       </CardHeader>
       <CardContent className="space-y-4">
         <div className="grid grid-cols-2 gap-4">
           {stats.map((stat, i) => {
             const Icon = stat.icon;
             return (
               <div key={i} className="flex items-center gap-2">
                 <Icon className="h-4 w-4 text-muted-foreground" />
                 <div>
                   <p className="text-xl font-bold text-foreground">{stat.value}</p>
                   <p className="text-xs text-muted-foreground">{stat.label}</p>
                 </div>
               </div>
             );
           })}
         </div>
         <div className="flex gap-2 pt-2">
           {actions.map((action, i) => (
             <Link key={i} to={action.href}>
               <Button variant={action.variant || 'default'} size="sm">
                 {action.label}
                 <ArrowRight className="ml-1 h-3 w-3" />
               </Button>
             </Link>
           ))}
         </div>
       </CardContent>
     </Card>
   );
 }
 
 export function RoleDashboard() {
   const { isAdmin, isSeniorDeveloper, isDeveloper, isSales, isLoading } = useCurrentUserRole();
   const { data: requests } = useChangeRequests();
   const { data: clients } = useClients();
 
   if (isLoading) return null;
 
   // Calculate role-specific stats
   const pendingApproval = requests?.filter(r => r.status === 'pending_approval').length || 0;
   const inProgress = requests?.filter(r => r.status === 'in_progress').length || 0;
   const waitingClarification = requests?.filter(r => ['waiting', 'waiting_clarification'].includes(String(r.status))).length || 0;
   const completed = requests?.filter(r => r.status === 'completed').length || 0;
   const critical = requests?.filter(r => r.priority === 'critical' && r.status !== 'completed').length || 0;
   const assigned = requests?.filter(r => r.status === 'assigned').length || 0;
 
   const getRoleCards = () => {
     const cards = [];
 
     // Admin sees everything
     if (isAdmin) {
       cards.push(
         <RoleCard
           key="admin"
           title="Admin Overview"
           description="Full System Access"
           accentColor="border-l-primary"
           stats={[
             { label: 'Total Clients', value: clients?.length || 0, icon: Users },
             { label: 'Active Requests', value: (requests?.length || 0) - completed, icon: FileText },
             { label: 'Critical', value: critical, icon: AlertTriangle },
             { label: 'Completed', value: completed, icon: CheckCircle2 },
           ]}
           actions={[
             { label: 'View Reports', href: '/developers/reports', variant: 'outline' },
             { label: 'View Requests', href: '/developers/requests', variant: 'outline' },
           ]}
         />
       );
     }
 
     // Senior Developer
     if (isSeniorDeveloper || isAdmin) {
       cards.push(
         <RoleCard
           key="senior"
           title="Development Lead"
           description="Request Management"
            accentColor="border-l-status-in-progress"
           stats={[
             { label: 'Pending Assignment', value: pendingApproval, icon: Clock },
             { label: 'In Progress', value: inProgress, icon: PlayCircle },
             { label: 'Waiting Response', value: waitingClarification, icon: AlertTriangle },
             { label: 'Assigned', value: assigned, icon: ClipboardCheck },
           ]}
           actions={[
             { label: 'Create Request', href: '/developers/requests/new' },
             { label: 'View All Requests', href: '/developers/requests', variant: 'outline' },
           ]}
         />
       );
     }
 
     // Developer
     if (isDeveloper) {
       cards.push(
         <RoleCard
           key="developer"
           title="My Assignments"
           description="Developer Tasks"
            accentColor="border-l-status-completed"
           stats={[
             { label: 'Assigned to Me', value: assigned, icon: ClipboardCheck },
             { label: 'In Progress', value: inProgress, icon: PlayCircle },
             { label: 'Waiting', value: waitingClarification, icon: Clock },
             { label: 'Completed', value: completed, icon: CheckCircle2 },
           ]}
           actions={[
             { label: 'View My Tasks', href: '/developers/assignments' },
           ]}
         />
       );
     }
 
     // Sales
     if (isSales || isAdmin) {
       cards.push(
         <RoleCard
           key="sales"
           title="Approvals Queue"
           description="Commercial Review"
            accentColor="border-l-status-pending"
           stats={[
             { label: 'Pending Approval', value: pendingApproval, icon: Clock },
             { label: 'On Hold', value: waitingClarification, icon: AlertTriangle },
             { label: 'Approved', value: requests?.filter(r => r.status === 'approved').length || 0, icon: CheckCircle2 },
             { label: 'Completion Rate', value: requests?.length ? Math.round((completed / requests.length) * 100) : 0, icon: TrendingUp },
           ]}
           actions={[
             { label: 'Review Approvals', href: '/developers/approvals' },
             { label: 'View Reports', href: '/developers/reports', variant: 'outline' },
           ]}
         />
       );
     }
 
     return cards;
   };
 
   const roleCards = getRoleCards();
 
   if (roleCards.length === 0) return null;
 
   return (
     <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
       {roleCards}
     </div>
   );
 }
