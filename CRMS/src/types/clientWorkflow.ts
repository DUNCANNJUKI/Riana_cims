export interface ClientInvitation {
  id: string;
  request_reference: string;
  invitation_token: string;
  client_name?: string | null;
  branch_name?: string | null;
  client_representative_name: string;
  client_representative_phone: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export interface ClientAcceptance {
  client_representative_name: string;
  client_representative_designation: string;
  sign_off_method: string;
  accepted_at: string;
  signature_image_path?: string | null;
}

export interface CompletionReport {
  summary_of_change?: string | null;
  implemented_solution?: string | null;
  deliverables?: string | null;
  issues_resolved?: string | null;
  testing_performed?: string | null;
  implementation_date?: string | null;
  deployment_date?: string | null;
  known_limitations?: string | null;
  client_recommendations?: string | null;
  additional_comments?: string | null;
}
