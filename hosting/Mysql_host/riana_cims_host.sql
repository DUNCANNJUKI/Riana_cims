-- RIANA CIMS MySQL hosting database
-- Generated 2026-06-21T03:47:04.431Z
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
  PRIMARY KEY (`id`),
  KEY `subsidiary_id` (`subsidiary_id`),
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

DROP TABLE IF EXISTS `clients`;
CREATE TABLE `clients` (
  `id` varchar(36) NOT NULL DEFAULT uuid(),
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
  `id` varchar(36) NOT NULL DEFAULT uuid(),
  `client_id` varchar(36) NOT NULL,
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
  KEY `idx_assignments_software_status` (`software_technician_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `companies`;
CREATE TABLE `companies` (
  `id` varchar(36) NOT NULL DEFAULT uuid(),
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
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `company_settings` (`id`, `name`, `logo_path`, `font_color`, `primary_color`, `font_type`, `contract_types`, `backup_schedule`, `updated_at`, `backup_day`, `backup_time`) VALUES (1, 'RIANA CIMS', '/Riana_logo.png', '#000000', '#1A91AB', 'Inter', '[\"AMC\",\"Once-off\",\"Subscription\"]', '0 2 * * *', '2026-03-21 23:06:17.000', 'Daily', '02:00');

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
  KEY `idx_crms_requests_assignee_status` (`assigned_developer_id`,`status`)
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
  `read` tinyint(1) DEFAULT 0,
  `action_url` text DEFAULT NULL,
  `email_sent` tinyint(1) DEFAULT 0,
  `sms_sent` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `read_status` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `request_id` (`request_id`),
  KEY `idx_crms_notifications_user_read` (`user_id`,`read`),
  KEY `idx_crms_notifications_inbox` (`user_id`,`read`,`created_at`)
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
  `id` varchar(36) NOT NULL DEFAULT uuid(),
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
  `id` varchar(36) NOT NULL DEFAULT uuid(),
  `client_id` varchar(36) NOT NULL,
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
  KEY `idx_feedback_links_client_expiry` (`client_id`,`expires_at`)
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
  `id` varchar(36) NOT NULL DEFAULT uuid(),
  `client_id` varchar(36) NOT NULL,
  `installation_id` varchar(36) DEFAULT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` text NOT NULL,
  `file_size` int(11) DEFAULT NULL,
  `is_signed` tinyint(1) NOT NULL DEFAULT 0,
  `notes` text DEFAULT NULL,
  `uploaded_by_user_id` varchar(36) NOT NULL,
  `upload_date` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_client_id` (`client_id`),
  KEY `idx_installation_id` (`installation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `installations`;
CREATE TABLE `installations` (
  `id` varchar(36) NOT NULL DEFAULT uuid(),
  `client_id` varchar(36) NOT NULL,
  `kiosk_type` varchar(100) DEFAULT NULL,
  `screen_with_size` varchar(100) DEFAULT NULL,
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
  PRIMARY KEY (`id`),
  KEY `idx_client_id` (`client_id`),
  KEY `idx_status` (`status`),
  KEY `idx_installations_client_status` (`client_id`,`status`),
  KEY `idx_installations_client_created` (`client_id`,`created_at`)
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
  CONSTRAINT `installation_budgets_ibfk_1` FOREIGN KEY (`installation_id`) REFERENCES `installations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `installation_budgets_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `user_profiles` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `installation_feedback`;
CREATE TABLE `installation_feedback` (
  `id` varchar(36) NOT NULL DEFAULT uuid(),
  `installation_id` varchar(36) NOT NULL,
  `client_id` varchar(36) NOT NULL,
  `feedback_date` date NOT NULL DEFAULT curdate(),
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
  KEY `idx_feedback_client_install_created` (`client_id`,`installation_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `installation_progress`;
CREATE TABLE `installation_progress` (
  `id` varchar(36) NOT NULL DEFAULT uuid(),
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
  PRIMARY KEY (`id`),
  KEY `idx_messages_inbox` (`receiver_id`,`is_read`,`created_at`),
  KEY `idx_messages_thread` (`sender_id`,`receiver_id`,`created_at`),
  CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`sender_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `messages_ibfk_2` FOREIGN KEY (`receiver_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `migration_history`;
CREATE TABLE `migration_history` (
  `migration_id` varchar(100) NOT NULL,
  `description` varchar(255) NOT NULL,
  `applied_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`migration_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `migration_history` (`migration_id`, `description`, `applied_at`) VALUES ('20260621_security_foundation', 'Unified module RBAC, session revocation, security settings, and audit events', '2026-06-21 06:41:40.000');

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

INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('cims:admin', 'cims', 'admin', 'Manage CIMS users and settings');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('cims:backup.manage', 'cims', 'backup.manage', 'View, schedule, and create verified backups');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('cims:manage', 'cims', 'manage', 'Manage CIMS operational records');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('cims:read', 'cims', 'read', 'Read permitted CIMS records');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('crms:admin', 'crms', 'admin', 'Manage CRMS users and settings');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('crms:approve', 'crms', 'approve', 'Approve or reject change requests');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('crms:assign', 'crms', 'assign', 'Assign and schedule change requests');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('crms:create', 'crms', 'create', 'Create change requests');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('crms:implement', 'crms', 'implement', 'Update assigned implementation work');
INSERT INTO `permissions` (`id`, `module_id`, `code`, `description`) VALUES ('crms:read', 'crms', 'read', 'Read permitted change requests');

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
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('cims:Sales', 'cims', 'Sales', 'Sales', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('cims:Teamlead', 'cims', 'Teamlead', 'Team Lead', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('cims:User', 'cims', 'User', 'User', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('crms:Admin', 'crms', 'Admin', 'Administrator', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('crms:Developer', 'crms', 'Developer', 'Developer', 1);
INSERT INTO `roles` (`id`, `module_id`, `code`, `name`, `is_system`) VALUES ('crms:Sales', 'crms', 'Sales', 'Sales', 1);
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
  `id` varchar(36) NOT NULL DEFAULT uuid(),
  `subsidiary_name` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `default_escalation_matrix` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`default_escalation_matrix`)),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `subsidiaries` (`id`, `subsidiary_name`, `created_at`, `default_escalation_matrix`) VALUES ('34f8ccb0-0e95-11f1-9abb-00155d187c00', 'MAREZI', '2026-02-20 22:48:53.000', NULL);
INSERT INTO `subsidiaries` (`id`, `subsidiary_name`, `created_at`, `default_escalation_matrix`) VALUES ('34f8cf97-0e95-11f1-9abb-00155d187c00', 'USS', '2026-02-20 22:48:53.000', NULL);
INSERT INTO `subsidiaries` (`id`, `subsidiary_name`, `created_at`, `default_escalation_matrix`) VALUES ('34f8d0a8-0e95-11f1-9abb-00155d187c00', 'VMS', '2026-02-20 22:48:53.000', NULL);
INSERT INTO `subsidiaries` (`id`, `subsidiary_name`, `created_at`, `default_escalation_matrix`) VALUES ('b78e70f3-1c82-4eab-96a7-768b05e3b1f7', 'TINDANCE', '2026-03-21 23:23:28.000', NULL);

DROP TABLE IF EXISTS `system_logs`;
CREATE TABLE `system_logs` (
  `id` varchar(36) NOT NULL DEFAULT uuid(),
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

DROP TABLE IF EXISTS `user_profiles`;
CREATE TABLE `user_profiles` (
  `id` varchar(36) NOT NULL DEFAULT uuid(),
  `email` varchar(255) NOT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `role` enum('Admin','Developer','Teamlead','Sales','User') NOT NULL,
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_users_role_active` (`role`,`is_active`),
  KEY `idx_users_active_role` (`is_active`,`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
