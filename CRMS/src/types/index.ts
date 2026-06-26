export type UserRole = 'admin' | 'senior_developer' | 'developer' | 'sales';

export type RequestStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'waiting'
  | 'waiting_clarification'
  | 'assigned'
  | 'in_progress'
  | 'completed';

export type Priority = 'low' | 'medium' | 'high' | 'critical';

export type ContractType = 'amc' | 'lease' | 'warranty' | 'poc';

export type RequestSource = 'email' | 'phone' | 'whatsapp' | 'meeting';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  department?: string;
}

export interface Client {
  id: string;
  name: string;
  branch: string;
  contractType: ContractType;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface ChangeRequest {
  id: string;
  ticketNumber: string;
  clientId: string;
  client: Client;
  department: string;
  dateRequested: string;
  source: RequestSource;
  changeDescription: string;
  priority: Priority;
  modulesAffected: string[];
  estimatedCompletionDate: string;
  status: RequestStatus;
  assignedDeveloperId?: string;
  assignedDeveloper?: User;
  seniorDeveloperId: string;
  seniorDeveloper: User;
  approvalComment?: string;
  isChargeable?: boolean;
  salesRemarks?: string;
  commercialRemarks?: string;
  commencementDate?: string;
  completionDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  actionUrl?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  requestId: string;
  userId: string;
  user: User;
  action: string;
  details: string;
  previousValue?: string;
  newValue?: string;
  createdAt: string;
}

export interface DashboardStats {
  totalRequests: number;
  pendingApproval: number;
  inProgress: number;
  completed: number;
  overdue: number;
  avgCompletionDays: number;
}
