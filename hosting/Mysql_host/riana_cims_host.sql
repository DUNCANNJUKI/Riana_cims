-- RIANA CIMS MySQL hosting database
-- Generated 2026-07-27T23:32:04.058Z
-- Complete schema with sanitized reference data; no credentials or customer records.
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
CREATE DATABASE IF NOT EXISTS `riana_cims` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `riana_cims`;

DROP TABLE IF EXISTS `announcements`;
CREATE TABLE `announcements` (
  `id` varchar(36) NOT NULL,
  `title` varchar(255) NOT NULL,
  `content` text NOT NULL,
  `subsidiary_id` varchar(36) DEFAULT NULL,
  `priority` enum('low','normal','high') DEFAULT 'normal',
  `created_by` varchar(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `target_audience` varchar(50) DEFAULT 'all',
  `is_active` tinyint(1) DEFAULT 1,
  `expires_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_by_user_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `subsidiary_id` (`subsidiary_id`),
  KEY `idx_announcements_active_expiry` (`is_active`,`expires_at`),
  CONSTRAINT `announcements_ibfk_1` FOREIGN KEY (`subsidiary_id`) REFERENCES `subsidiaries` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `announcement_reads`;
CREATE TABLE `announcement_reads` (
  `id` varchar(36) NOT NULL,
  `announcement_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `read_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `announcement_id` (`announcement_id`,`user_id`),
  KEY `user_id` (`user_id`),
  KEY `idx_announcement_reads_lookup` (`announcement_id`,`user_id`),
  CONSTRAINT `announcement_reads_ibfk_1` FOREIGN KEY (`announcement_id`) REFERENCES `announcements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `announcement_reads_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `audit_logs`;
CREATE TABLE `audit_logs` (
  `id` varchar(36) NOT NULL,
  `event_uuid` varchar(36) NOT NULL,
  `user_id` varchar(36) DEFAULT NULL,
  `impersonator_user_id` varchar(36) DEFAULT NULL,
  `action` varchar(120) NOT NULL,
  `category` varchar(60) NOT NULL DEFAULT 'system',
  `module` varchar(80) NOT NULL,
  `entity_type` varchar(80) DEFAULT NULL,
  `entity_id` varchar(100) DEFAULT NULL,
  `description` varchar(1000) DEFAULT NULL,
  `old_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`old_values`)),
  `new_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`new_values`)),
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `device` varchar(255) DEFAULT NULL,
  `session_id` varchar(120) DEFAULT NULL,
  `request_id` varchar(80) DEFAULT NULL,
  `route` varchar(255) DEFAULT NULL,
  `http_method` varchar(12) DEFAULT NULL,
  `status` enum('success','failure','denied') NOT NULL DEFAULT 'success',
  `severity` enum('info','notice','warning','critical') NOT NULL DEFAULT 'info',
  `integrity_hash` char(64) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_audit_event_uuid` (`event_uuid`),
  KEY `idx_audit_logs_user_created` (`user_id`,`created_at`),
  KEY `idx_audit_logs_action` (`action`),
  KEY `idx_audit_logs_module_created` (`module`,`created_at`),
  KEY `idx_audit_logs_entity` (`entity_type`,`entity_id`),
  KEY `idx_audit_logs_created` (`created_at`),
  KEY `idx_audit_logs_severity` (`severity`),
  KEY `idx_audit_logs_status` (`status`),
  KEY `idx_audit_logs_ip` (`ip_address`),
  KEY `fk_audit_logs_impersonator` (`impersonator_user_id`),
  CONSTRAINT `fk_audit_logs_impersonator` FOREIGN KEY (`impersonator_user_id`) REFERENCES `user_profiles` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_audit_logs_user` FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `auth_two_factor_challenges`;
CREATE TABLE `auth_two_factor_challenges` (
  `id` char(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `code_hash` char(64) NOT NULL,
  `channel` enum('email','sms','call') NOT NULL,
  `destination` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `attempts` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `verified_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_2fa_user_active` (`user_id`,`verified_at`,`expires_at`),
  CONSTRAINT `fk_2fa_user` FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `call_participants`;
CREATE TABLE `call_participants` (
  `id` varchar(36) NOT NULL,
  `call_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `status` enum('invited','ringing','accepted','declined','ended','missed') NOT NULL DEFAULT 'ringing',
  `joined_at` datetime DEFAULT NULL,
  `left_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_call_participant` (`call_id`,`user_id`),
  KEY `idx_call_participants_user_status` (`user_id`,`status`,`created_at`),
  CONSTRAINT `fk_call_participants_call` FOREIGN KEY (`call_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_call_participants_user` FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `clients`;
CREATE TABLE `clients` (
  `id` varchar(36) NOT NULL,
  `client_name` varchar(255) NOT NULL,
  `branch` varchar(255) DEFAULT NULL,
  `contact_person_name` varchar(255) NOT NULL,
  `contact_person_department` varchar(100) DEFAULT NULL,
  `contact_phone` varchar(20) DEFAULT NULL,
  `account_manager_id` varchar(36) DEFAULT NULL,
  `contact_email` varchar(255) DEFAULT NULL,
  `industry_classification` varchar(100) NOT NULL,
  `current_vendor` varchar(255) DEFAULT NULL,
  `tags` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`tags`)),
  `contract_type` varchar(50) NOT NULL,
  `start_date` date NOT NULL,
  `department_id` varchar(36) DEFAULT NULL,
  `subsidiary_id` varchar(36) DEFAULT NULL,
  `added_by_user_id` varchar(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_department_id` (`department_id`),
  KEY `idx_subsidiary_id` (`subsidiary_id`),
  KEY `idx_clients_name_branch` (`client_name`,`branch`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `client_assignments`;
CREATE TABLE `client_assignments` (
  `id` varchar(36) NOT NULL,
  `client_id` varchar(36) NOT NULL,
  `branch_id` varchar(36) DEFAULT NULL,
  `department_id` varchar(36) DEFAULT NULL,
  `branch` varchar(255) DEFAULT NULL,
  `hardware_technician_id` varchar(36) DEFAULT NULL,
  `software_technician_id` varchar(36) DEFAULT NULL,
  `installation_start_date` date NOT NULL,
  `scheduled_end_date` date DEFAULT NULL,
  `extension_reason` text DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'assigned',
  `notes` text DEFAULT NULL,
  `assigned_by_user_id` varchar(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `installation_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_client_id` (`client_id`),
  KEY `idx_assignments_client_status` (`client_id`,`status`),
  KEY `idx_assignments_client_created` (`client_id`,`created_at`),
  KEY `idx_assignments_hardware_status` (`hardware_technician_id`,`status`),
  KEY `idx_assignments_software_status` (`software_technician_id`,`status`),
  KEY `idx_assignment_scope` (`client_id`,`branch_id`,`department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `client_branches`;
CREATE TABLE `client_branches` (
  `id` varchar(36) NOT NULL,
  `client_id` varchar(36) NOT NULL,
  `branch_name` varchar(150) NOT NULL,
  `branch_code` varchar(60) DEFAULT NULL,
  `contact_person_name` varchar(150) DEFAULT NULL,
  `contact_email` varchar(255) DEFAULT NULL,
  `contact_phone` varchar(30) DEFAULT NULL,
  `physical_address` text DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'active',
  `notes` text DEFAULT NULL,
  `created_by` varchar(36) DEFAULT NULL,
  `updated_by` varchar(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_client_branches_name` (`client_id`,`branch_name`),
  KEY `idx_client_branches_client_status` (`client_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `client_departments`;
CREATE TABLE `client_departments` (
  `id` varchar(36) NOT NULL,
  `client_id` varchar(36) NOT NULL,
  `branch_id` varchar(36) NOT NULL,
  `department_name` varchar(150) NOT NULL,
  `department_code` varchar(60) DEFAULT NULL,
  `contact_person_name` varchar(150) DEFAULT NULL,
  `contact_email` varchar(255) DEFAULT NULL,
  `contact_phone` varchar(30) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'active',
  `notes` text DEFAULT NULL,
  `created_by` varchar(36) DEFAULT NULL,
  `updated_by` varchar(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_client_departments_name` (`branch_id`,`department_name`),
  KEY `idx_client_departments_branch_status` (`branch_id`,`status`),
  KEY `idx_client_departments_client_status` (`client_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `companies`;
CREATE TABLE `companies` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `logo_path` text DEFAULT NULL,
  `font_color` varchar(50) DEFAULT NULL,
  `font_type` varchar(100) DEFAULT NULL,
  `contract_types` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `company_settings`;
CREATE TABLE `company_settings` (
  `id` int(11) NOT NULL DEFAULT 1,
  `name` varchar(255) DEFAULT 'RIANA CIMS',
  `logo_path` varchar(512) DEFAULT NULL,
  `font_color` varchar(20) DEFAULT '#000000',
  `primary_color` varchar(20) DEFAULT '#1e3a8a',
  `font_type` varchar(50) DEFAULT 'Inter',
  `contract_types` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`contract_types`)),
  `backup_schedule` varchar(50) DEFAULT '0 2 * * *',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `backup_day` varchar(20) DEFAULT 'Daily',
  `backup_time` varchar(10) DEFAULT '02:00',
  `tagline` varchar(255) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `contract_durations` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`contract_durations`)),
  `secondary_color` varchar(20) DEFAULT NULL,
  `accent_color` varchar(20) DEFAULT NULL,
  `timezone` varchar(100) DEFAULT 'Africa/Nairobi',
  `date_format` varchar(30) DEFAULT 'DD/MM/YYYY',
  `enable_email_notifications` tinyint(1) DEFAULT 1,
  `enable_sms_notifications` tinyint(1) DEFAULT 1,
  `enable_push_notifications` tinyint(1) DEFAULT 1,
  `auto_reminder_days` smallint(5) unsigned DEFAULT 3,
  `maintenance_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `maintenance_reason` varchar(255) DEFAULT NULL,
  `maintenance_message` text DEFAULT NULL,
  `estimated_completion` datetime DEFAULT NULL,
  `maintenance_enabled_by` varchar(36) DEFAULT NULL,
  `maintenance_enabled_at` datetime DEFAULT NULL,
  `maintenance_disabled_by` varchar(36) DEFAULT NULL,
  `maintenance_disabled_at` datetime DEFAULT NULL,
  `maintenance_allow_api_access` tinyint(1) NOT NULL DEFAULT 0,
  `maintenance_force_logout` tinyint(1) NOT NULL DEFAULT 1,
  `maintenance_notify_users` tinyint(1) NOT NULL DEFAULT 0,
  `maintenance_backup_before_enable` tinyint(1) NOT NULL DEFAULT 1,
  `maintenance_allow_super_admin_only` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `company_settings` (`id`, `name`, `logo_path`, `font_color`, `primary_color`, `font_type`, `contract_types`, `backup_schedule`, `updated_at`, `backup_day`, `backup_time`, `tagline`, `website`, `email`, `phone`, `address`, `contract_durations`, `secondary_color`, `accent_color`, `timezone`, `date_format`, `enable_email_notifications`, `enable_sms_notifications`, `enable_push_notifications`, `auto_reminder_days`, `maintenance_enabled`, `maintenance_reason`, `maintenance_message`, `estimated_completion`, `maintenance_enabled_by`, `maintenance_enabled_at`, `maintenance_disabled_by`, `maintenance_disabled_at`, `maintenance_allow_api_access`, `maintenance_force_logout`, `maintenance_notify_users`, `maintenance_backup_before_enable`, `maintenance_allow_super_admin_only`) VALUES (1, 'RIANA CIMS', '81558c19-3eeb-4c18-8367-40714cc8e9a0.png', '#000000', '#1A91AB', 'Inter', '[\"AMC\",\"Once-off\",\"Subscription\"]', '0 2 * * *', '2026-07-24 16:16:00.000', 'Daily', '02:00', 'Innovative Technology Solutions', 'https://www.riana.co', 'info@riana.co', '+254 700 000 000', '6th Floor, Allianz Plaza, 96 Riverside Drive, Nairobi, Kenya', '{\"AMC\":\"12 months\",\"WARRANTY\":\"24 months\",\"LEASE\":\"36 months\",\"POC\":\"3 months\"}', '#10b981', '#f59e0b', 'Africa/Nairobi', 'DD/MM/YYYY', 1, 1, 1, 3, 0, 'Database clean-up in progress', 'RIANA CIMS is temporarily unavailable while scheduled maintenance is in progress.', '2026-07-24 07:10:00.000', '00000000-0000-4000-8000-000000000001', '2026-07-24 16:11:13.000', '00000000-0000-4000-8000-000000000001', '2026-07-24 16:12:54.000', 1, 1, 0, 1, 1);

DROP TABLE IF EXISTS `contact_reveal_audit`;
CREATE TABLE `contact_reveal_audit` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) DEFAULT NULL,
  `entity_type` varchar(50) NOT NULL,
  `entity_id` varchar(36) NOT NULL,
  `field_name` varchar(80) NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `revealed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_contact_reveal_entity` (`entity_type`,`entity_id`,`revealed_at`),
  KEY `idx_contact_reveal_user` (`user_id`,`revealed_at`),
  CONSTRAINT `fk_contact_reveal_user` FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `crms_audit_logs`;
CREATE TABLE `crms_audit_logs` (
  `id` varchar(36) NOT NULL,
  `request_id` varchar(36) NOT NULL,
  `user_id` varchar(36) DEFAULT NULL,
  `action` enum('created','updated','status_changed','approved','rejected','assigned','started','completed','document_uploaded','comment_added') NOT NULL,
  `action_label` varchar(255) NOT NULL,
  `details` text DEFAULT NULL,
  `previous_value` text DEFAULT NULL,
  `new_value` text DEFAULT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `request_id` (`request_id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `crms_change_requests`;
CREATE TABLE `crms_change_requests` (
  `id` varchar(36) NOT NULL,
  `ticket_number` varchar(50) NOT NULL,
  `client_id` varchar(36) NOT NULL,
  `branch_id` varchar(36) DEFAULT NULL,
  `department_id` varchar(36) DEFAULT NULL,
  `installation_id` varchar(36) DEFAULT NULL,
  `department` varchar(255) NOT NULL,
  `date_requested` date NOT NULL,
  `source` enum('email','phone','whatsapp','meeting') NOT NULL,
  `change_description` text NOT NULL,
  `priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
  `status` enum('pending_approval','approved','rejected','waiting','assigned','in_progress','completed') NOT NULL DEFAULT 'pending_approval',
  `modules_affected` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`modules_affected`)),
  `estimated_completion_date` date NOT NULL,
  `senior_developer_id` varchar(36) NOT NULL,
  `assigned_developer_id` varchar(36) DEFAULT NULL,
  `approval_comment` text DEFAULT NULL,
  `is_chargeable` tinyint(1) DEFAULT 0,
  `sales_remarks` text DEFAULT NULL,
  `commencement_date` date DEFAULT NULL,
  `completion_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `commercial_remarks` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ticket_number` (`ticket_number`),
  KEY `senior_developer_id` (`senior_developer_id`),
  KEY `idx_crms_requests_client_status` (`client_id`,`status`),
  KEY `idx_crms_requests_assignee_status` (`assigned_developer_id`,`status`),
  KEY `idx_crms_change_requests_scope` (`client_id`,`branch_id`,`department_id`),
  KEY `idx_crms_change_requests_installation` (`installation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `crms_client_links`;
CREATE TABLE `crms_client_links` (
  `legacy_client_id` varchar(36) NOT NULL,
  `client_id` varchar(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`legacy_client_id`),
  UNIQUE KEY `client_id` (`client_id`),
  KEY `idx_crms_client_links_client` (`client_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `crms_documents`;
CREATE TABLE `crms_documents` (
  `id` varchar(36) NOT NULL,
  `request_id` varchar(36) NOT NULL,
  `document_type` varchar(100) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_url` text DEFAULT NULL,
  `generated_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `signed_by_client` tinyint(1) DEFAULT 0,
  `signed_by_developer` tinyint(1) DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `request_id` (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `crms_notifications`;
CREATE TABLE `crms_notifications` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `request_id` varchar(36) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `type` enum('info','success','warning','error') NOT NULL DEFAULT 'info',
  `notification_type` varchar(32) NOT NULL DEFAULT 'GENERAL',
  `read` tinyint(1) DEFAULT 0,
  `action_url` text DEFAULT NULL,
  `email_sent` tinyint(1) DEFAULT 0,
  `sms_sent` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `read_status` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `request_id` (`request_id`),
  KEY `idx_crms_notifications_user_read` (`user_id`,`read`),
  KEY `idx_crms_notifications_inbox` (`user_id`,`read`,`created_at`),
  KEY `idx_crms_notifications_type_created` (`notification_type`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `crms_user_links`;
CREATE TABLE `crms_user_links` (
  `legacy_profile_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`legacy_profile_id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `idx_crms_user_links_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `departments`;
CREATE TABLE `departments` (
  `id` varchar(36) NOT NULL,
  `department_name` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `departments` (`id`, `department_name`, `created_at`) VALUES ('07282e20-1b79-4a35-8737-d02aedc9989a', 'Manager', '2026-03-21 17:33:09.000');
INSERT INTO `departments` (`id`, `department_name`, `created_at`) VALUES ('170c5396-d2bf-4fd5-8d8f-aa39de9a72a2', 'Customer care', '2026-03-21 17:33:09.000');
INSERT INTO `departments` (`id`, `department_name`, `created_at`) VALUES ('b94db915-ab23-4120-8b66-b58938761c19', 'IT', '2026-03-21 17:33:09.000');
INSERT INTO `departments` (`id`, `department_name`, `created_at`) VALUES ('bbec601c-1f2a-48fb-9b39-1bf3c01aa69c', 'Admin', '2026-03-21 17:33:09.000');
INSERT INTO `departments` (`id`, `department_name`, `created_at`) VALUES ('da9d3709-8fbb-41a5-ab5d-56b9ae822b02', 'Support', '2026-03-21 17:33:09.000');
INSERT INTO `departments` (`id`, `department_name`, `created_at`) VALUES ('ec053cfa-33bd-48c5-a1eb-578974eb0a4c', 'Management', '2026-03-21 17:33:09.000');

DROP TABLE IF EXISTS `feedback_links`;
CREATE TABLE `feedback_links` (
  `id` varchar(36) NOT NULL,
  `client_id` varchar(36) NOT NULL,
  `branch_id` varchar(36) DEFAULT NULL,
  `department_id` varchar(36) DEFAULT NULL,
  `installation_id` varchar(36) DEFAULT NULL,
  `unique_token` varchar(255) NOT NULL,
  `expires_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `is_used` tinyint(1) NOT NULL DEFAULT 0,
  `used_at` timestamp NULL DEFAULT NULL,
  `email_sent` tinyint(1) DEFAULT 0,
  `sms_sent` tinyint(1) DEFAULT 0,
  `created_by_user_id` varchar(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_token` (`unique_token`),
  KEY `idx_client_id` (`client_id`),
  KEY `idx_feedback_links_client_expiry` (`client_id`,`expires_at`),
  KEY `idx_feedback_links_client_active` (`client_id`,`installation_id`,`is_used`,`expires_at`),
  KEY `idx_feedback_links_token_expires` (`unique_token`,`expires_at`),
  KEY `idx_feedback_links_scope` (`client_id`,`branch_id`,`department_id`,`is_used`,`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `feedback_questions`;
CREATE TABLE `feedback_questions` (
  `id` varchar(36) NOT NULL,
  `question_text` text NOT NULL,
  `question_type` enum('rating','nps','text') NOT NULL DEFAULT 'rating',
  `category` varchar(50) DEFAULT 'general',
  `is_active` tinyint(1) DEFAULT 1,
  `order_index` int(11) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `feedback_questions` (`id`, `question_text`, `question_type`, `category`, `is_active`, `order_index`, `created_at`) VALUES ('852a2a91-4c92-4282-b4f9-e3fe8f331134', 'How satisfied are  you with the training carried out', 'rating', 'General', 1, 7, '2026-03-21 20:06:32.000');
INSERT INTO `feedback_questions` (`id`, `question_text`, `question_type`, `category`, `is_active`, `order_index`, `created_at`) VALUES ('q1', 'How satisfied are you with the overall installation process?', 'rating', 'Quality', 1, 1, '2026-03-21 19:42:03.000');
INSERT INTO `feedback_questions` (`id`, `question_text`, `question_type`, `category`, `is_active`, `order_index`, `created_at`) VALUES ('q2', 'How would you rate the timeliness of the installation?', 'rating', 'Timeliness', 1, 2, '2026-03-21 19:42:03.000');
INSERT INTO `feedback_questions` (`id`, `question_text`, `question_type`, `category`, `is_active`, `order_index`, `created_at`) VALUES ('q3', 'How well did the technicians communicate the process to you?', 'rating', 'Communication', 1, 3, '2026-03-21 19:42:03.000');
INSERT INTO `feedback_questions` (`id`, `question_text`, `question_type`, `category`, `is_active`, `order_index`, `created_at`) VALUES ('q4', 'How would you rate the technicians knowledge of the product?', 'rating', 'Technician', 1, 4, '2026-03-21 19:42:03.000');
INSERT INTO `feedback_questions` (`id`, `question_text`, `question_type`, `category`, `is_active`, `order_index`, `created_at`) VALUES ('q5', 'How likely are you to recommend us to another client?', 'nps', 'General', 1, 5, '2026-03-21 19:42:03.000');
INSERT INTO `feedback_questions` (`id`, `question_text`, `question_type`, `category`, `is_active`, `order_index`, `created_at`) VALUES ('q6', 'Do you have any other comments or suggestions?', 'text', 'Comments', 1, 6, '2026-03-21 19:42:03.000');

DROP TABLE IF EXISTS `handover_uploads`;
CREATE TABLE `handover_uploads` (
  `id` varchar(36) NOT NULL,
  `client_id` varchar(36) NOT NULL,
  `installation_id` varchar(36) DEFAULT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` text NOT NULL,
  `file_size` int(11) DEFAULT NULL,
  `is_signed` tinyint(1) NOT NULL DEFAULT 0,
  `notes` text DEFAULT NULL,
  `uploaded_by_user_id` varchar(36) NOT NULL,
  `upload_date` timestamp NOT NULL DEFAULT current_timestamp(),
  `branch_id` varchar(36) DEFAULT NULL,
  `department_id` varchar(36) DEFAULT NULL,
  `work_type` varchar(40) NOT NULL DEFAULT 'installation',
  `change_request_id` varchar(36) DEFAULT NULL,
  `version_group_id` varchar(36) DEFAULT NULL,
  `version_number` int(11) NOT NULL DEFAULT 1,
  `is_latest_version` tinyint(1) NOT NULL DEFAULT 1,
  `status` varchar(30) NOT NULL DEFAULT 'uploaded',
  `file_hash` char(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_client_id` (`client_id`),
  KEY `idx_installation_id` (`installation_id`),
  KEY `idx_handover_scope` (`client_id`,`branch_id`,`department_id`,`work_type`),
  KEY `idx_handover_version_group` (`version_group_id`,`is_latest_version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `installations`;
CREATE TABLE `installations` (
  `id` varchar(36) NOT NULL,
  `client_id` varchar(36) NOT NULL,
  `kiosk_type` varchar(100) DEFAULT NULL,
  `screen_with_size` varchar(100) DEFAULT NULL,
  `screen_count` int(11) DEFAULT 0,
  `kiosk_count` int(11) NOT NULL DEFAULT 0,
  `counter_count` int(11) NOT NULL DEFAULT 0,
  `counter_names` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`counter_names`)),
  `led_count` int(11) NOT NULL DEFAULT 0,
  `led_names` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`led_names`)),
  `service_points` int(11) NOT NULL DEFAULT 0,
  `ups_count` int(11) NOT NULL DEFAULT 0,
  `speakers` int(11) NOT NULL DEFAULT 0,
  `amplifiers` int(11) NOT NULL DEFAULT 0,
  `media_controllers` int(11) NOT NULL DEFAULT 0,
  `tablets` int(11) NOT NULL DEFAULT 0,
  `digital_signage_system` int(11) NOT NULL DEFAULT 0,
  `hdmis` int(11) NOT NULL DEFAULT 0,
  `splitters` int(11) NOT NULL DEFAULT 0,
  `staff_trained` int(11) NOT NULL DEFAULT 0,
  `account_manager_id` varchar(36) DEFAULT NULL,
  `assigned_technician_id` varchar(36) DEFAULT NULL,
  `hardware_technician_id` varchar(36) DEFAULT NULL,
  `software_technician_id` varchar(36) DEFAULT NULL,
  `assigned_date` date DEFAULT NULL,
  `scheduled_end_date` date DEFAULT NULL,
  `completion_date` date DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'pending',
  `waiting_reason` text DEFAULT NULL,
  `extension_reason` text DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `escalation_matrix` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`escalation_matrix`)),
  `handover_file_path` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `handover_status` varchar(50) DEFAULT 'pending',
  `branch_id` varchar(36) DEFAULT NULL,
  `department_id` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_client_id` (`client_id`),
  KEY `idx_status` (`status`),
  KEY `idx_installations_client_status` (`client_id`,`status`),
  KEY `idx_installations_client_created` (`client_id`,`created_at`),
  KEY `idx_installations_branch_department` (`branch_id`,`department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `installation_budgets`;
CREATE TABLE `installation_budgets` (
  `id` varchar(36) NOT NULL,
  `installation_id` varchar(36) NOT NULL,
  `total_budget` float DEFAULT 0,
  `labor_cost` float DEFAULT 0,
  `equipment_cost` float DEFAULT 0,
  `transport_cost` float DEFAULT 0,
  `miscellaneous_cost` float DEFAULT 0,
  `notes` text DEFAULT NULL,
  `created_by` varchar(36) DEFAULT NULL,
  `currency` varchar(10) DEFAULT 'KES',
  `branch` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `installation_id` (`installation_id`),
  KEY `created_by` (`created_by`),
  KEY `idx_installation_budgets_installation` (`installation_id`,`created_at`),
  CONSTRAINT `installation_budgets_ibfk_1` FOREIGN KEY (`installation_id`) REFERENCES `installations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `installation_budgets_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `user_profiles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `installation_feedback`;
CREATE TABLE `installation_feedback` (
  `id` varchar(36) NOT NULL,
  `installation_id` varchar(36) NOT NULL,
  `client_id` varchar(36) NOT NULL,
  `feedback_date` date NOT NULL,
  `installation_quality_rating` int(11) NOT NULL,
  `installation_timeliness_rating` int(11) NOT NULL,
  `installation_communication_rating` int(11) NOT NULL,
  `technician_knowledge_rating` int(11) NOT NULL,
  `technician_professionalism_rating` int(11) NOT NULL,
  `technician_helpfulness_rating` int(11) NOT NULL,
  `recommendation_score` int(11) NOT NULL,
  `overall_satisfaction` int(11) NOT NULL,
  `positive_feedback` text DEFAULT NULL,
  `improvement_suggestions` text DEFAULT NULL,
  `csat_score` decimal(5,2) DEFAULT NULL,
  `nps_category` varchar(20) DEFAULT NULL,
  `submitted_by` varchar(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `dynamic_responses` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`dynamic_responses`)),
  PRIMARY KEY (`id`),
  KEY `idx_installation_id` (`installation_id`),
  KEY `idx_client_id` (`client_id`),
  KEY `idx_feedback_client_install_created` (`client_id`,`installation_id`,`created_at`),
  KEY `idx_installation_feedback_client_install` (`client_id`,`installation_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `installation_progress`;
CREATE TABLE `installation_progress` (
  `id` varchar(36) NOT NULL,
  `installation_id` varchar(36) NOT NULL,
  `progress_percentage` int(11) NOT NULL DEFAULT 0,
  `notes` text DEFAULT NULL,
  `last_updated_by` varchar(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_installation_id` (`installation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `messages`;
CREATE TABLE `messages` (
  `id` varchar(36) NOT NULL,
  `sender_id` varchar(36) NOT NULL,
  `receiver_id` varchar(36) NOT NULL,
  `content` text NOT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `message_kind` enum('text','attachment','call') NOT NULL DEFAULT 'text',
  `reply_to_message_id` varchar(36) DEFAULT NULL,
  `attachment_file_name` varchar(255) DEFAULT NULL,
  `attachment_file_path` varchar(255) DEFAULT NULL,
  `attachment_content_type` varchar(120) DEFAULT NULL,
  `attachment_size` int(10) unsigned DEFAULT NULL,
  `call_type` enum('audio','video') DEFAULT NULL,
  `call_status` enum('ringing','accepted','declined','missed','ended') DEFAULT NULL,
  `call_started_at` datetime DEFAULT NULL,
  `call_ended_at` datetime DEFAULT NULL,
  `is_edited` tinyint(1) DEFAULT 0,
  `edited_at` timestamp NULL DEFAULT NULL,
  `is_deleted_for_everyone` tinyint(1) DEFAULT 0,
  `deleted_for_everyone_at` timestamp NULL DEFAULT NULL,
  `deleted_for_everyone_by` varchar(36) DEFAULT NULL,
  `deletion_reason` varchar(255) DEFAULT NULL,
  `content_hash` char(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_messages_inbox` (`receiver_id`,`is_read`,`created_at`),
  KEY `idx_messages_thread` (`sender_id`,`receiver_id`,`created_at`),
  KEY `idx_messages_kind_created` (`message_kind`,`created_at`),
  KEY `idx_messages_kind_call_status` (`message_kind`,`call_status`,`created_at`),
  KEY `idx_messages_deleted_everyone` (`is_deleted_for_everyone`,`deleted_for_everyone_at`),
  KEY `idx_messages_edited` (`is_edited`,`edited_at`),
  KEY `idx_messages_reply` (`reply_to_message_id`),
  KEY `idx_messages_attachment_path` (`attachment_file_path`),
  KEY `idx_messages_call_status` (`call_status`),
  CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`sender_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `messages_ibfk_2` FOREIGN KEY (`receiver_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `message_edit_history`;
CREATE TABLE `message_edit_history` (
  `id` varchar(36) NOT NULL,
  `message_id` varchar(36) NOT NULL,
  `edited_by` varchar(36) DEFAULT NULL,
  `previous_content` text DEFAULT NULL,
  `new_content_hash` char(64) NOT NULL,
  `edited_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_message_edit_history_message` (`message_id`,`edited_at`),
  KEY `idx_message_edit_history_user` (`edited_by`),
  CONSTRAINT `fk_message_edit_history_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_message_edit_history_user` FOREIGN KEY (`edited_by`) REFERENCES `user_profiles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `message_reactions`;
CREATE TABLE `message_reactions` (
  `id` varchar(36) NOT NULL,
  `message_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `reaction_type` enum('like','love','laugh','wow','sad','angry') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_message_reaction_user` (`message_id`,`user_id`),
  KEY `idx_message_reactions_user` (`user_id`),
  CONSTRAINT `fk_message_reactions_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_message_reactions_user` FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `message_recipient_status`;
CREATE TABLE `message_recipient_status` (
  `id` varchar(36) NOT NULL,
  `message_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `delivered_at` timestamp NULL DEFAULT NULL,
  `read_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_message_recipient_status` (`message_id`,`user_id`),
  KEY `idx_message_recipient_status_user_read` (`user_id`,`read_at`),
  CONSTRAINT `fk_message_recipient_status_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_message_recipient_status_user` FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `message_user_deletions`;
CREATE TABLE `message_user_deletions` (
  `id` varchar(36) NOT NULL,
  `message_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `deleted_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_message_user_deletion` (`message_id`,`user_id`),
  KEY `idx_message_user_deletions_user` (`user_id`,`deleted_at`),
  CONSTRAINT `fk_message_user_deletions_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_message_user_deletions_user` FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `migration_history`;
CREATE TABLE `migration_history` (
  `migration_id` varchar(100) NOT NULL,
  `description` varchar(255) NOT NULL,
  `applied_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`migration_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260621_security_foundation', 'Unified module RBAC, session revocation, security settings, and audit events', '2026-06-21 06:41:40.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260627_enterprise_roles_permissions', 'Applied from 20260627_enterprise_roles_permissions.sql', '2026-06-27 19:04:26.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260705_subsidiary_handover_equipment', 'Applied from 20260705_subsidiary_handover_equipment.sql', '2026-07-05 02:11:40.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260710_calls_feedback_contact_performance', 'Local test hotfix: group call participants, contact reveal audit, feedback/performance indexes', '2026-07-10 23:49:08.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260710_chat_audit_logging', 'Applied from 20260710_chat_audit_logging.sql', '2026-07-15 18:03:10.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260710_chat_audit_logging_audit_logs_hotfix', 'Created audit_logs table from saved 20260710 chat audit migration to unblock login', '2026-07-10 22:47:20.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260710_chat_support_tables_hotfix', 'Local test hotfix: chat edit, reaction, deletion, recipient status tables', '2026-07-10 23:49:08.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260710_profile_avatar_chat_messages', 'Applied from 20260710_profile_avatar_chat_messages.sql', '2026-07-15 18:03:10.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260714_chat_presence_missed_call_dismissals', 'Applied from 20260714_chat_presence_missed_call_dismissals.sql', '2026-07-15 18:03:10.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260715_private_file_management', 'Applied from 20260715_private_file_management.sql', '2026-07-15 18:03:10.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260717_ehandover_completion_status', 'Applied from 20260717_ehandover_completion_status.sql', '2026-07-20 22:19:41.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260718_client_branch_department_scope', 'Applied from 20260718_client_branch_department_scope.sql', '2026-07-20 22:19:41.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260719_live_module_schema_repair', 'Applied from 20260719_live_module_schema_repair.sql', '2026-07-20 22:19:41.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260720_developer_request_scope_submit_fix', 'Applied from 20260720_developer_request_scope_submit_fix.sql', '2026-07-20 23:47:43.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260721_feedback_link_expiry_repair', 'Applied from 20260721_feedback_link_expiry_repair.sql', '2026-07-28 01:38:17.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260724_enterprise_maintenance_mode', 'Enterprise maintenance mode settings and access controls', '2026-07-24 14:58:17.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260724_notifications_and_single_sessions', 'Typed notifications and single active user sessions', '2026-07-24 15:33:43.000');
INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260728_installation_screen_count', 'Repairs maintenance settings columns, adds installation screen_count, and refreshes optimizer statistics', '2026-07-28 01:38:18.000');

DROP TABLE IF EXISTS `missed_call_dismissals`;
CREATE TABLE `missed_call_dismissals` (
  `id` varchar(36) NOT NULL,
  `call_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `dismissed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_missed_call_dismissal` (`call_id`,`user_id`),
  KEY `idx_missed_call_dismissals_user` (`user_id`,`dismissed_at`),
  CONSTRAINT `fk_missed_call_dismissal_call` FOREIGN KEY (`call_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_missed_call_dismissal_user` FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `modules`;
CREATE TABLE `modules` (
  `id` varchar(32) NOT NULL,
  `code` varchar(32) NOT NULL,
  `name` varchar(100) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `modules` (`id`, `code`, `name`, `is_active`, `created_at`) VALUES ('cims', 'cims', 'Client Installation Management', 1, '2026-06-21 06:41:40.000');
INSERT INTO `modules` (`id`, `code`, `name`, `is_active`, `created_at`) VALUES ('crms', 'crms', 'Change Request Management', 1, '2026-06-21 06:41:40.000');

DROP TABLE IF EXISTS `password_reset_tokens`;
CREATE TABLE `password_reset_tokens` (
  `id` char(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `idx_password_reset_active` (`user_id`,`used_at`,`expires_at`),
  KEY `idx_password_reset_lookup` (`token_hash`,`used_at`,`expires_at`),
  CONSTRAINT `password_reset_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `permissions`;
CREATE TABLE `permissions` (
  `id` varchar(100) NOT NULL,
  `module_id` varchar(32) NOT NULL,
  `code` varchar(80) NOT NULL,
  `description` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_permissions_module_code` (`module_id`,`code`),
  CONSTRAINT `fk_permissions_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('analytics.view', 'cims', 'analytics.view', 'View analytics');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('announcements.manage', 'cims', 'announcements.manage', 'Manage announcements');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('assignments.manage', 'cims', 'assignments.manage', 'Assign technicians and update assignments');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('assignments.view', 'cims', 'assignments.view', 'View assigned technicians');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('cims:admin', 'cims', 'admin', 'Manage CIMS users and settings');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('cims:backup.manage', 'cims', 'backup.manage', 'View and create database backups');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('cims:manage', 'cims', 'manage', 'Manage CIMS operational records');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('cims:read', 'cims', 'read', 'Read permitted CIMS records');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('clients.manage', 'cims', 'clients.manage', 'Add, edit, and delete clients');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('clients.view', 'cims', 'clients.view', 'View clients');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('company.manage', 'cims', 'company.manage', 'Manage company settings and branding');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('crms:admin', 'crms', 'admin', 'Manage CRMS users and settings');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('crms:approve', 'crms', 'approve', 'Approve or reject change requests');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('crms:assign', 'crms', 'assign', 'Assign and schedule change requests');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('crms:create', 'crms', 'create', 'Create change requests');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('crms:implement', 'crms', 'implement', 'Update assigned implementation work');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('crms:read', 'crms', 'read', 'Read permitted change requests');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('files.delete', 'cims', 'files.delete', 'Delete private files');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('files.download', 'cims', 'files.download', 'Download private files');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('files.manage_all', 'cims', 'files.manage_all', 'Manage all private files');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('files.replace', 'cims', 'files.replace', 'Replace private files');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('files.restore', 'cims', 'files.restore', 'Restore deleted private files');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('files.upload', 'cims', 'files.upload', 'Upload files');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('files.view', 'cims', 'files.view', 'View private files');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('finances.manage', 'cims', 'finances.manage', 'Add, edit, and delete installation budgets');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('finances.view', 'cims', 'finances.view', 'View installation budgets');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('import.manage', 'cims', 'import.manage', 'Import system data');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('installations.manage', 'cims', 'installations.manage', 'Add, edit, and update installations');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('installations.view', 'cims', 'installations.view', 'View installations');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('progress.manage', 'cims', 'progress.manage', 'Update installation progress');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('progress.view', 'cims', 'progress.view', 'View installation progress');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('reports.view', 'cims', 'reports.view', 'Preview and download all reports');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('subsidiaries.manage', 'cims', 'subsidiaries.manage', 'Add, edit, and delete subsidiaries');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('users.manage', 'cims', 'users.manage', 'Manage non-privileged users');

DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `id` varchar(80) NOT NULL,
  `module_id` varchar(32) NOT NULL,
  `code` varchar(32) NOT NULL,
  `name` varchar(100) NOT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_module_code` (`module_id`,`code`),
  CONSTRAINT `fk_roles_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('cims:Admin', 'cims', 'Admin', 'Administrator', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('cims:Developer', 'cims', 'Developer', 'Developer', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('cims:Finance', 'cims', 'Finance', 'Finance', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('cims:Management', 'cims', 'Management', 'Management', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('cims:Sales', 'cims', 'Sales', 'Sales', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('cims:SuperAdmin', 'cims', 'SuperAdmin', 'Super Administrator', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('cims:Teamlead', 'cims', 'Teamlead', 'Team Lead', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('cims:User', 'cims', 'User', 'User', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('crms:Admin', 'crms', 'Admin', 'Administrator', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('crms:Developer', 'crms', 'Developer', 'Developer', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('crms:Management', 'crms', 'Management', 'Management', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('crms:Sales', 'crms', 'Sales', 'Sales', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('crms:SuperAdmin', 'crms', 'SuperAdmin', 'Super Administrator', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('crms:Teamlead', 'crms', 'Teamlead', 'Team Lead', 1);

DROP TABLE IF EXISTS `role_permissions`;
CREATE TABLE `role_permissions` (
  `role_id` varchar(80) NOT NULL,
  `permission_id` varchar(100) NOT NULL,
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `fk_role_permissions_permission` (`permission_id`),
  CONSTRAINT `fk_role_permissions_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:Admin', 'cims:admin');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:Admin', 'cims:backup.manage');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:Admin', 'cims:manage');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:Admin', 'cims:read');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:Developer', 'cims:read');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:Sales', 'cims:read');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'analytics.view');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'announcements.manage');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'assignments.manage');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'assignments.view');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'cims:admin');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'cims:backup.manage');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'cims:manage');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'cims:read');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'clients.manage');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'clients.view');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'company.manage');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'files.delete');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'files.download');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'files.manage_all');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'files.replace');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'files.restore');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'files.upload');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'files.view');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'finances.manage');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'finances.view');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'import.manage');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'installations.manage');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'installations.view');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'progress.manage');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'progress.view');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'reports.view');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'subsidiaries.manage');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:SuperAdmin', 'users.manage');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:Teamlead', 'cims:manage');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:Teamlead', 'cims:read');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('cims:User', 'cims:read');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:Admin', 'crms:admin');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:Admin', 'crms:approve');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:Admin', 'crms:assign');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:Admin', 'crms:create');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:Admin', 'crms:implement');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:Admin', 'crms:read');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:Developer', 'crms:implement');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:Developer', 'crms:read');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:Sales', 'crms:approve');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:Sales', 'crms:create');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:Sales', 'crms:read');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:SuperAdmin', 'crms:admin');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:SuperAdmin', 'crms:approve');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:SuperAdmin', 'crms:assign');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:SuperAdmin', 'crms:create');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:SuperAdmin', 'crms:implement');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:SuperAdmin', 'crms:read');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:Teamlead', 'crms:assign');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:Teamlead', 'crms:create');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:Teamlead', 'crms:implement');
INSERT INTO `role_permissions` (`role_id`, `permission_id`) VALUES ('crms:Teamlead', 'crms:read');

DROP TABLE IF EXISTS `security_audit_events`;
CREATE TABLE `security_audit_events` (
  `id` char(36) NOT NULL,
  `actor_user_id` varchar(36) DEFAULT NULL,
  `module` varchar(32) NOT NULL,
  `action` varchar(100) NOT NULL,
  `outcome` enum('success','failure') NOT NULL DEFAULT 'success',
  `source_ip` varchar(45) DEFAULT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_security_audit_actor_created` (`actor_user_id`,`created_at`),
  KEY `idx_security_audit_action_created` (`action`,`created_at`),
  CONSTRAINT `security_audit_events_ibfk_1` FOREIGN KEY (`actor_user_id`) REFERENCES `user_profiles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `security_settings`;
CREATE TABLE `security_settings` (
  `id` tinyint(3) unsigned NOT NULL,
  `inactivity_minutes` smallint(5) unsigned NOT NULL DEFAULT 10,
  `warning_seconds` smallint(5) unsigned NOT NULL DEFAULT 60,
  `sensitive_rate_limit` smallint(5) unsigned NOT NULL DEFAULT 20,
  `sensitive_rate_window_minutes` smallint(5) unsigned NOT NULL DEFAULT 5,
  `updated_by` varchar(36) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_security_settings_user` (`updated_by`),
  CONSTRAINT `fk_security_settings_user` FOREIGN KEY (`updated_by`) REFERENCES `user_profiles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `security_settings` (`id`, `inactivity_minutes`, `warning_seconds`, `sensitive_rate_limit`, `sensitive_rate_window_minutes`, `updated_by`, `updated_at`) VALUES (1, 10, 60, 20, 5, NULL, '2026-06-21 06:41:40.000');

DROP TABLE IF EXISTS `subsidiaries`;
CREATE TABLE `subsidiaries` (
  `id` varchar(36) NOT NULL,
  `subsidiary_name` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `default_escalation_matrix` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`default_escalation_matrix`)),
  `equipment_configuration` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`equipment_configuration`)),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `subsidiaries` (`id`, `subsidiary_name`, `created_at`, `default_escalation_matrix`, `equipment_configuration`) VALUES ('34f8ccb0-0e95-11f1-9abb-00155d187c00', 'MAREZI', '2026-02-20 22:48:53.000', NULL, '[{\"field\":\"kiosk_type\",\"label\":\"Kiosk Type\",\"installed_status\":\"Configured\"},{\"field\":\"kiosk_count\",\"label\":\"Kiosk Count\",\"installed_status\":\"Installed\"},{\"field\":\"counter_count\",\"label\":\"Tripleplay/Counters\",\"installed_status\":\"Installed\"},{\"field\":\"led_count\",\"label\":\"LED Displays\",\"installed_status\":\"Installed\"},{\"field\":\"screen_with_size\",\"label\":\"Screen Size\",\"installed_status\":\"Configured\"},{\"field\":\"service_points\",\"label\":\"Service Points\",\"installed_status\":\"Active\"},{\"field\":\"ups_count\",\"label\":\"UPS Units\",\"installed_status\":\"Installed\"},{\"field\":\"speakers\",\"label\":\"Speakers\",\"installed_status\":\"Installed\"},{\"field\":\"amplifiers\",\"label\":\"Amplifiers\",\"installed_status\":\"Configured\"},{\"field\":\"media_controllers\",\"label\":\"Media Controllers\",\"installed_status\":\"Configured\"},{\"field\":\"tablets\",\"label\":\"Tablets\",\"installed_status\":\"Setup Complete\"},{\"field\":\"digital_signage_system\",\"label\":\"Digital Signage\",\"installed_status\":\"Operational\"},{\"field\":\"hdmis\",\"label\":\"HDMI Cables\",\"installed_status\":\"Connected\"},{\"field\":\"splitters\",\"label\":\"Splitters\",\"installed_status\":\"Installed\"},{\"field\":\"staff_trained\",\"label\":\"Staff Trained\",\"installed_status\":\"Completed\"}]');
INSERT INTO `subsidiaries` (`id`, `subsidiary_name`, `created_at`, `default_escalation_matrix`, `equipment_configuration`) VALUES ('34f8cf97-0e95-11f1-9abb-00155d187c00', 'USS', '2026-02-20 22:48:53.000', NULL, NULL);
INSERT INTO `subsidiaries` (`id`, `subsidiary_name`, `created_at`, `default_escalation_matrix`, `equipment_configuration`) VALUES ('34f8d0a8-0e95-11f1-9abb-00155d187c00', 'VMS', '2026-02-20 22:48:53.000', NULL, NULL);

DROP TABLE IF EXISTS `system_logs`;
CREATE TABLE `system_logs` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) DEFAULT NULL,
  `action` varchar(255) NOT NULL,
  `details` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_system_logs_user_created` (`user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `technician_performance_scores`;
CREATE TABLE `technician_performance_scores` (
  `id` varchar(36) NOT NULL,
  `technician_id` varchar(36) NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `total_installations` int(11) DEFAULT 0,
  `completed_on_time` int(11) DEFAULT 0,
  `completed_late` int(11) DEFAULT 0,
  `average_completion_days` float DEFAULT 0,
  `average_feedback_rating` float DEFAULT 0,
  `total_feedback_count` int(11) DEFAULT 0,
  `completion_rate_score` float DEFAULT 0,
  `time_efficiency_score` float DEFAULT 0,
  `client_satisfaction_score` float DEFAULT 0,
  `overall_score` float DEFAULT 0,
  `performance_tier` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `technician_id` (`technician_id`),
  CONSTRAINT `technician_performance_scores_ibfk_1` FOREIGN KEY (`technician_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `uploaded_files`;
CREATE TABLE `uploaded_files` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `tenant_id` varchar(36) DEFAULT NULL,
  `organization_id` varchar(36) DEFAULT NULL,
  `branch_id` varchar(100) DEFAULT NULL,
  `uploaded_by` varchar(36) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `relative_path` varchar(500) NOT NULL,
  `mime_type` varchar(150) NOT NULL,
  `detected_mime_type` varchar(150) DEFAULT NULL,
  `extension` varchar(20) DEFAULT NULL,
  `file_size` bigint(20) unsigned NOT NULL,
  `file_category` varchar(100) NOT NULL,
  `related_entity_type` varchar(100) DEFAULT NULL,
  `related_entity_id` varchar(64) DEFAULT NULL,
  `visibility` enum('private','organization','public') NOT NULL DEFAULT 'private',
  `status` enum('uploading','processing','active','failed','quarantined','deleted') NOT NULL DEFAULT 'processing',
  `checksum_sha256` char(64) DEFAULT NULL,
  `image_width` int(10) unsigned DEFAULT NULL,
  `image_height` int(10) unsigned DEFAULT NULL,
  `original_file_id` bigint(20) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL,
  `deleted_by` varchar(36) DEFAULT NULL,
  `deletion_reason` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_file_tenant` (`tenant_id`,`id`),
  KEY `idx_file_organization` (`organization_id`,`id`),
  KEY `idx_file_branch` (`branch_id`,`id`),
  KEY `idx_file_owner` (`uploaded_by`),
  KEY `idx_file_entity` (`related_entity_type`,`related_entity_id`),
  KEY `idx_file_status` (`status`),
  KEY `idx_file_checksum` (`checksum_sha256`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `uploaded_file_variants`;
CREATE TABLE `uploaded_file_variants` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `file_id` bigint(20) unsigned NOT NULL,
  `variant_type` enum('original','optimized','thumbnail') NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `relative_path` varchar(500) NOT NULL,
  `mime_type` varchar(150) NOT NULL,
  `file_size` bigint(20) unsigned NOT NULL,
  `width` int(10) unsigned DEFAULT NULL,
  `height` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_file_variant` (`file_id`,`variant_type`),
  KEY `idx_uploaded_file_variants_file` (`file_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `user_access_scopes`;
CREATE TABLE `user_access_scopes` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `scope_type` varchar(40) NOT NULL DEFAULT 'all_clients',
  `client_id` varchar(36) DEFAULT NULL,
  `branch_id` varchar(36) DEFAULT NULL,
  `department_id` varchar(36) DEFAULT NULL,
  `include_future_departments` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` varchar(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_access_scope` (`user_id`,`scope_type`,`client_id`,`branch_id`,`department_id`),
  KEY `idx_user_access_scope_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `user_module_roles`;
CREATE TABLE `user_module_roles` (
  `user_id` varchar(36) NOT NULL,
  `module_id` varchar(32) NOT NULL,
  `role_id` varchar(80) NOT NULL,
  `granted_by` varchar(36) DEFAULT NULL,
  `granted_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`,`module_id`),
  KEY `idx_user_module_roles_role` (`role_id`),
  KEY `fk_user_module_roles_module` (`module_id`),
  KEY `fk_user_module_roles_grantor` (`granted_by`),
  CONSTRAINT `fk_user_module_roles_grantor` FOREIGN KEY (`granted_by`) REFERENCES `user_profiles` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_user_module_roles_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_module_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`),
  CONSTRAINT `fk_user_module_roles_user` FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `user_permissions`;
CREATE TABLE `user_permissions` (
  `user_id` varchar(36) NOT NULL,
  `permission_id` varchar(100) NOT NULL,
  `granted_by` varchar(36) DEFAULT NULL,
  `granted_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`,`permission_id`),
  KEY `idx_user_permissions_permission` (`permission_id`),
  KEY `fk_user_permissions_grantor` (`granted_by`),
  CONSTRAINT `fk_user_permissions_grantor` FOREIGN KEY (`granted_by`) REFERENCES `user_profiles` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_user_permissions_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_user_permissions_user` FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `user_profiles`;
CREATE TABLE `user_profiles` (
  `id` varchar(36) NOT NULL,
  `email` varchar(255) NOT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `role` enum('SuperAdmin','Admin','Management','Finance','Developer','Teamlead','Sales','User') NOT NULL,
  `designation` varchar(100) DEFAULT NULL,
  `phone_number` varchar(20) DEFAULT NULL,
  `department_id` varchar(36) DEFAULT NULL,
  `subsidiary_id` varchar(36) DEFAULT NULL,
  `first_login` tinyint(1) NOT NULL DEFAULT 1,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `password` varchar(255) DEFAULT NULL,
  `two_factor_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `two_factor_method` enum('email','sms','call') NOT NULL DEFAULT 'email',
  `two_factor_phone` varchar(30) DEFAULT NULL,
  `session_version` int(10) unsigned NOT NULL DEFAULT 0,
  `avatar_url` varchar(255) DEFAULT NULL,
  `last_seen_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_users_role_active` (`role`,`is_active`),
  KEY `idx_users_active_role` (`is_active`,`role`),
  KEY `idx_user_profiles_active_role` (`is_active`,`role`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `user_sessions`;
CREATE TABLE `user_sessions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` varchar(36) NOT NULL,
  `session_id` varchar(128) NOT NULL,
  `token_hash` char(64) DEFAULT NULL,
  `device_name` varchar(255) DEFAULT NULL,
  `browser_name` varchar(100) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `last_activity_at` datetime NOT NULL,
  `expires_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `revoke_reason` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `session_id` (`session_id`),
  KEY `idx_user_sessions_user_id` (`user_id`),
  KEY `idx_user_sessions_session_id` (`session_id`),
  KEY `idx_user_sessions_active` (`user_id`,`revoked_at`,`expires_at`),
  CONSTRAINT `fk_user_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inactive bootstrap principal: it has no password and cannot sign in until explicitly activated.
-- Set a private SUPERADMIN_PASSWORD during the one-time deployment bootstrap; never distribute a default password.
INSERT INTO `user_profiles` (`id`,`email`,`first_name`,`last_name`,`role`,`designation`,`first_login`,`is_active`,`password`) VALUES ('00000000-0000-4000-8000-000000000001','superadmin@riana.co','Super','Admin','SuperAdmin','SuperAdmin',1,0,NULL) ON DUPLICATE KEY UPDATE `role`='SuperAdmin',`designation`='SuperAdmin';

INSERT INTO `user_module_roles` (`user_id`,`module_id`,`role_id`,`granted_by`) VALUES ('00000000-0000-4000-8000-000000000001','cims','cims:SuperAdmin',NULL),('00000000-0000-4000-8000-000000000001','crms','crms:SuperAdmin',NULL) ON DUPLICATE KEY UPDATE `role_id`=VALUES(`role_id`);

SET FOREIGN_KEY_CHECKS = 1;
