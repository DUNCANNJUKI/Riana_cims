// RIANA CIMS Type Definitions

export interface User {
  id: string;
  email: string;
  role: 'Admin' | 'Developer' | 'Teamlead' | 'Sales' | 'User';
  designation?: 'Admin' | 'Developer' | 'Teamlead' | 'Sales' | 'Field specialist' | 'Product Specialist' | 'Customer success' | 'Intern' | 'Manager' | 'Support' | 'Hardware Engineer';
  department_id: string | null;
  subsidiary_id: string | null;
  department_name?: string;
  subsidiary_name?: string;
  phone_number?: string;
  first_name?: string;
  last_name?: string;
  password?: string;
  created_at?: string;
  first_login?: boolean;
  is_active?: boolean;
}

export interface Company {
  id: string;
  name: string;
  logo_path?: string;
  font_color?: string;
  primary_color?: string;
  font_type?: string;
  contract_types?: string[];
}

export interface Subsidiary {
  id: string;
  subsidiary_name: 'QSYS' | 'USS' | 'VMS' | string;
  default_escalation_matrix?: string; // JSON string
}

export interface Department {
  id: string;
  company_id: string;
  department_name: string;
}

export interface Client {
  id: string;
  department_id: string;
  subsidiary_id: string;
  client_name: string;
  branch?: string;
  contact_person_name: string;
  contact_person_phone: string;
  contact_person_email?: string;
  contact_person_department?: string;
  current_vendor?: string;
  start_date: string;
  contract_type: string;
  industry_classification: string;
  added_by_user_id: string;
  created_at: string;
}

export interface Installation {
  id: string;
  client_id: string;
  branch?: string;
  kiosk_type: string;

  kiosk_count: number;
  counter_count: number;
  counter_names?: string[]; // Array of Tripleplay/Counter device names
  led_count: number;
  led_names?: string[]; // Array of LED display names
  service_points: number;
  ups_count: number;
  speakers: number;
  screen_with_size: string;
  media_controllers: number;
  tablets: number;
  digital_signage_system: number;
  staff_trained: number;
  amplifiers: number;
  hdmis: number;
  splitters: number;
  handover_file_path: string;
  account_manager_id: string;
  assigned_technician_id?: string;
  hardware_technician_id?: string;
  software_technician_id?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'waiting';
  remarks?: string;
  assigned_date?: string;
  completion_date?: string;
  scheduled_end_date?: string;
  extension_reason?: string;
  escalation_matrix?: EscalationMatrix;
  waiting_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface EscalationTier {
  name: string;
  phone_number: string;
  email: string;
  role: string;
}

export interface EscalationMatrix {
  tier1: EscalationTier;
  tier2: EscalationTier;
  tier3: EscalationTier;
}

export interface HandoverUpload {
  id: string;
  client_id: string;
  file_path: string;
  uploaded_by_user_id: string;
  upload_date: string;
}

export interface SystemLog {
  id: string;
  user_id: string;
  action: string;
  details?: string;
  created_at: string;
}

export interface ClientAssignment {
  id: string;
  client_id: string;
  assigned_technician_id: string;
  assigned_by_user_id: string;
  assigned_date: string;
  scheduled_end_date?: string;
  extension_reason?: string;
  status: 'waiting' | 'in_progress' | 'completed';
  remarks?: string;
}

export interface InstallationProgress {
  id: string;
  assignment_id: string;
  client_name: string;
  subsidiary: string;
  branch: string;
  technician_name: string;
  teamlead_name: string;
  status: 'waiting' | 'in_progress' | 'completed';
  assigned_date: string;
  completion_date?: string;
  progress_percentage: number;
  equipment_installed: number;
  total_equipment: number;
  remarks?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface DashboardStats {
  totalClients: number;
  totalInstallations: number;
  totalUsers: number;
  recentLogs: SystemLog[];
}
