import type { Client, ClientAssignment, Installation, User } from './index';

export interface AssignmentRecord extends Omit<ClientAssignment, 'status'> {
  status: string;
  installation_id?: string;
  branch_id?: string;
  department_id?: string;
  branch?: string;
  branch_name?: string;
  department_name?: string;
  client_name?: string;
  clients?: Partial<Client>;
  hardware_technician_id?: string;
  software_technician_id?: string;
  hardware_tech?: Partial<User>;
  software_tech?: Partial<User>;
  installation_start_date?: string;
  completion_date?: string;
  completed_at?: string;
  created_at?: string;
  updated_at?: string;
  progress_percentage?: number;
  notes?: string;
}

export interface FeedbackResponse {
  id?: string;
  created_at?: string;
  recommendation_score?: number;
  overall_satisfaction?: number;
  dynamic_responses?: Record<string, unknown>;
  positive_feedback?: string;
  improvement_suggestions?: string;
  clients?: Partial<Client>;
}

export interface FeedbackQuestion {
  id: string;
  question_text: string;
  question_type: string;
  is_required?: boolean;
  options?: string[];
  display_order?: number;
  is_active?: boolean;
}

export interface AnnouncementRecord {
  id: string;
  title: string;
  content: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  target_audience: string;
  subsidiary_id: string | null;
  created_by_user_id: string;
  is_active: boolean;
  is_expired?: boolean;
  is_read?: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  creator?: Partial<User>;
  subsidiary?: { subsidiary_name: string };
  read_count?: number;
  total_target?: number;
  total_target_users?: number;
}

export interface AnnouncementReader extends Partial<User> {
  user?: Partial<User>;
  user_id?: string;
  read_at?: string;
}

export interface HandoverRecord {
  id: string;
  client_id: string;
  client_name?: string;
  clients?: Partial<Client>;
  installations?: Partial<Installation>;
  branch_id?: string;
  department_id?: string;
  branch?: string;
  branch_name?: string;
  department_name?: string;
  branch_label?: string;
  department_label?: string;
  branch_count?: number;
  department_count?: number;
  file_path?: string;
  file_name?: string;
  upload_date?: string;
  is_signed?: boolean;
  installation_status?: string;
  notes?: string;
  installation_notes?: string;
  uploaded_by_user_id?: string;
  file_exists?: boolean;
  file_available?: boolean;
}
