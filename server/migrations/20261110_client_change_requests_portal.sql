-- End-to-end Client Change Request, Completion Reporting & Acceptance Portal
-- Safe to retry and backward-compatible with existing CRMS tables and workflows.

CREATE TABLE IF NOT EXISTS crms_change_request_invitations (
  id VARCHAR(36) PRIMARY KEY,
  invitation_token VARCHAR(128) NOT NULL UNIQUE,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36) NULL,
  department_id VARCHAR(36) NULL,
  account_manager_id VARCHAR(36) NOT NULL,
  client_representative_name VARCHAR(255) NOT NULL,
  client_representative_phone VARCHAR(50) NOT NULL,
  client_representative_email VARCHAR(255) NOT NULL,
  request_reference VARCHAR(50) NOT NULL,
  status ENUM('draft', 'sent', 'delivered', 'opened', 'submitted', 'expired', 'cancelled') NOT NULL DEFAULT 'draft',
  expires_at DATETIME NOT NULL,
  opened_at DATETIME NULL,
  submitted_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  change_request_id VARCHAR(36) NULL,
  delivery_sms_status VARCHAR(50) DEFAULT NULL,
  delivery_email_status VARCHAR(50) DEFAULT NULL,
  last_notification_sent_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_invitation_scope (client_id, branch_id, department_id),
  INDEX idx_invitation_manager (account_manager_id, status),
  INDEX idx_invitation_token (invitation_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE crms_change_requests
  MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'pending_approval';

ALTER TABLE crms_change_requests
  ADD COLUMN IF NOT EXISTS is_client_request BOOLEAN NOT NULL DEFAULT FALSE AFTER source,
  ADD COLUMN IF NOT EXISTS invitation_id VARCHAR(36) NULL AFTER is_client_request,
  ADD COLUMN IF NOT EXISTS account_manager_id VARCHAR(36) NULL AFTER invitation_id,
  ADD COLUMN IF NOT EXISTS client_representative_name VARCHAR(255) NULL AFTER account_manager_id,
  ADD COLUMN IF NOT EXISTS client_representative_phone VARCHAR(50) NULL AFTER client_representative_name,
  ADD COLUMN IF NOT EXISTS client_representative_email VARCHAR(255) NULL AFTER client_representative_phone,
  ADD COLUMN IF NOT EXISTS request_title VARCHAR(255) NULL AFTER client_representative_email,
  ADD COLUMN IF NOT EXISTS request_category VARCHAR(50) NULL AFTER request_title,
  ADD COLUMN IF NOT EXISTS current_behaviour TEXT NULL AFTER change_description,
  ADD COLUMN IF NOT EXISTS expected_behaviour TEXT NULL AFTER current_behaviour,
  ADD COLUMN IF NOT EXISTS business_problem TEXT NULL AFTER expected_behaviour,
  ADD COLUMN IF NOT EXISTS business_justification TEXT NULL AFTER business_problem,
  ADD COLUMN IF NOT EXISTS impact_on_operations TEXT NULL AFTER business_justification,
  ADD COLUMN IF NOT EXISTS preferred_timeline VARCHAR(100) NULL AFTER impact_on_operations,
  ADD COLUMN IF NOT EXISTS additional_comments TEXT NULL AFTER preferred_timeline,
  ADD COLUMN IF NOT EXISTS client_declaration_confirmed BOOLEAN DEFAULT FALSE AFTER additional_comments,
  ADD COLUMN IF NOT EXISTS client_submission_timestamp DATETIME NULL AFTER client_declaration_confirmed,
  ADD COLUMN IF NOT EXISTS client_submission_data JSON NULL AFTER client_submission_timestamp,
  ADD COLUMN IF NOT EXISTS client_attachments JSON NULL AFTER client_submission_data,
  ADD COLUMN IF NOT EXISTS acceptance_status VARCHAR(50) NULL AFTER status;

CREATE INDEX IF NOT EXISTS idx_crms_requests_manager ON crms_change_requests (account_manager_id, status);
CREATE INDEX IF NOT EXISTS idx_crms_requests_invitation ON crms_change_requests (invitation_id);
CREATE INDEX IF NOT EXISTS idx_crms_requests_client_flag ON crms_change_requests (is_client_request, status);

CREATE TABLE IF NOT EXISTS crms_completion_reports (
  id VARCHAR(36) PRIMARY KEY,
  change_request_id VARCHAR(36) NOT NULL,
  version_number INT UNSIGNED NOT NULL DEFAULT 1,
  account_manager_id VARCHAR(36) NOT NULL,
  summary_of_change TEXT NOT NULL,
  implemented_solution TEXT NOT NULL,
  deliverables TEXT NULL,
  issues_resolved TEXT NULL,
  testing_performed TEXT NULL,
  implementation_date DATE NULL,
  deployment_date DATE NULL,
  outstanding_items TEXT NULL,
  known_limitations TEXT NULL,
  client_recommendations TEXT NULL,
  additional_comments TEXT NULL,
  attachments JSON NULL,
  status ENUM('draft', 'sent', 'superseded', 'accepted', 'rejected', 'disputed') NOT NULL DEFAULT 'draft',
  acceptance_token VARCHAR(128) NULL UNIQUE,
  token_expires_at DATETIME NULL,
  sent_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_report_request (change_request_id, version_number),
  INDEX idx_report_token (acceptance_token),
  INDEX idx_report_manager (account_manager_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crms_client_acceptances (
  id VARCHAR(36) PRIMARY KEY,
  change_request_id VARCHAR(36) NOT NULL,
  completion_report_id VARCHAR(36) NOT NULL,
  client_representative_name VARCHAR(255) NOT NULL,
  client_representative_designation VARCHAR(255) NOT NULL,
  client_representative_phone VARCHAR(50) NOT NULL,
  client_representative_email VARCHAR(255) NOT NULL,
  sign_off_method ENUM('otp', 'signature') NOT NULL,
  signature_image_path VARCHAR(500) NULL,
  otp_verified_at DATETIME NULL,
  declaration_text TEXT NOT NULL,
  declaration_confirmed BOOLEAN NOT NULL DEFAULT TRUE,
  ip_address VARCHAR(100) NULL,
  user_agent TEXT NULL,
  accepted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_acceptance_request (change_request_id),
  INDEX idx_acceptance_report (completion_report_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crms_client_action_responses (
  id VARCHAR(36) PRIMARY KEY,
  change_request_id VARCHAR(36) NOT NULL,
  completion_report_id VARCHAR(36) NOT NULL,
  response_type ENUM('correction_requested', 'dispute_raised') NOT NULL,
  written_explanation TEXT NOT NULL,
  client_representative_name VARCHAR(255) NOT NULL,
  client_representative_phone VARCHAR(50) NULL,
  client_representative_email VARCHAR(255) NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by VARCHAR(36) NULL,
  resolution_notes TEXT NULL,
  resolved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_action_response_request (change_request_id),
  INDEX idx_action_response_report (completion_report_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crms_client_otp_verifications (
  id VARCHAR(36) PRIMARY KEY,
  change_request_id VARCHAR(36) NOT NULL,
  completion_report_id VARCHAR(36) NOT NULL,
  contact_target VARCHAR(255) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  salt VARCHAR(64) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  expires_at DATETIME NOT NULL,
  resend_available_at DATETIME NOT NULL,
  verified_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_report (completion_report_id),
  INDEX idx_otp_target (contact_target)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crms_notification_delivery_logs (
  id VARCHAR(36) PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  recipient_type ENUM('client', 'user') NOT NULL,
  recipient_id VARCHAR(36) NULL,
  recipient_contact VARCHAR(255) NOT NULL,
  channel ENUM('email', 'sms') NOT NULL,
  change_request_id VARCHAR(36) NULL,
  invitation_id VARCHAR(36) NULL,
  status ENUM('queued', 'sent', 'failed', 'delivered') NOT NULL,
  provider_response TEXT NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_delivery_log_request (change_request_id),
  INDEX idx_delivery_log_invitation (invitation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crms_request_closures (
  id VARCHAR(36) PRIMARY KEY,
  change_request_id VARCHAR(36) NOT NULL UNIQUE,
  account_manager_id VARCHAR(36) NOT NULL,
  acceptance_id VARCHAR(36) NOT NULL,
  closure_notes TEXT NULL,
  closed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_closure_request (change_request_id),
  INDEX idx_closure_manager (account_manager_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO migration_history (migration_id, description)
VALUES ('20261110_client_change_requests_portal', 'End-to-end client change requests, invitations, completion reporting, and OTP/signature acceptance portal')
ON DUPLICATE KEY UPDATE description = VALUES(description);
