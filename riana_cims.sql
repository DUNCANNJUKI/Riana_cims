-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Mar 22, 2026 at 03:41 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `riana_cims`
--

-- --------------------------------------------------------

--
-- Table structure for table `announcements`
--

CREATE TABLE `announcements` (
  `id` varchar(36) NOT NULL,
  `title` varchar(255) NOT NULL,
  `content` text NOT NULL,
  `subsidiary_id` varchar(36) DEFAULT NULL,
  `priority` enum('low','normal','high') DEFAULT 'normal',
  `created_by` varchar(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `announcement_reads`
--

CREATE TABLE `announcement_reads` (
  `id` varchar(36) NOT NULL,
  `announcement_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `read_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `clients`
--

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
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `client_assignments`
--

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
  `installation_id` varchar(36) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `companies`
--

CREATE TABLE `companies` (
  `id` varchar(36) NOT NULL DEFAULT uuid(),
  `name` varchar(255) NOT NULL,
  `logo_path` text DEFAULT NULL,
  `font_color` varchar(50) DEFAULT NULL,
  `font_type` varchar(100) DEFAULT NULL,
  `contract_types` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `companies`
--

INSERT INTO `companies` (`id`, `name`, `logo_path`, `font_color`, `font_type`, `contract_types`, `created_at`, `updated_at`) VALUES
('34f79c61-0e95-11f1-9abb-00155d187c00', 'RIANA Technologies', NULL, '#000000', 'Arial', '[\"AMC\", \"WARRANTY\", \"LEASE\", \"POC\"]', '2026-02-20 19:48:53', '2026-02-20 19:48:53');

-- --------------------------------------------------------

--
-- Table structure for table `company_settings`
--

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
  `backup_time` varchar(10) DEFAULT '02:00'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `company_settings`
--

INSERT INTO `company_settings` (`id`, `name`, `logo_path`, `font_color`, `primary_color`, `font_type`, `contract_types`, `backup_schedule`, `updated_at`, `backup_day`, `backup_time`) VALUES
(1, 'RIANA CIMS', '/Riana_logo.png', '#000000', '#1A91AB', 'Inter', '[\"AMC\",\"Once-off\",\"Subscription\"]', '0 2 * * *', '2026-03-21 20:06:17', 'Daily', '02:00');

-- --------------------------------------------------------

--
-- Table structure for table `departments`
--

CREATE TABLE `departments` (
  `id` varchar(36) NOT NULL DEFAULT uuid(),
  `department_name` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `departments`
--

INSERT INTO `departments` (`id`, `department_name`, `created_at`) VALUES
('07282e20-1b79-4a35-8737-d02aedc9989a', 'Manager', '2026-03-21 14:33:09'),
('170c5396-d2bf-4fd5-8d8f-aa39de9a72a2', 'Customer care', '2026-03-21 14:33:09'),
('b94db915-ab23-4120-8b66-b58938761c19', 'IT', '2026-03-21 14:33:09'),
('bbec601c-1f2a-48fb-9b39-1bf3c01aa69c', 'Admin', '2026-03-21 14:33:09'),
('da9d3709-8fbb-41a5-ab5d-56b9ae822b02', 'Support', '2026-03-21 14:33:09'),
('ec053cfa-33bd-48c5-a1eb-578974eb0a4c', 'Management', '2026-03-21 14:33:09');

-- --------------------------------------------------------

--
-- Table structure for table `feedback_links`
--

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
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `feedback_questions`
--

CREATE TABLE `feedback_questions` (
  `id` varchar(36) NOT NULL,
  `question_text` text NOT NULL,
  `question_type` enum('rating','nps','text') NOT NULL DEFAULT 'rating',
  `category` varchar(50) DEFAULT 'general',
  `is_active` tinyint(1) DEFAULT 1,
  `order_index` int(11) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `feedback_questions`
--

INSERT INTO `feedback_questions` (`id`, `question_text`, `question_type`, `category`, `is_active`, `order_index`, `created_at`) VALUES
('852a2a91-4c92-4282-b4f9-e3fe8f331134', 'How satisfied are  you with the training carried out', 'rating', 'General', 1, 7, '2026-03-21 17:06:32'),
('q1', 'How satisfied are you with the overall installation process?', 'rating', 'Quality', 1, 1, '2026-03-21 16:42:03'),
('q2', 'How would you rate the timeliness of the installation?', 'rating', 'Timeliness', 1, 2, '2026-03-21 16:42:03'),
('q3', 'How well did the technicians communicate the process to you?', 'rating', 'Communication', 1, 3, '2026-03-21 16:42:03'),
('q4', 'How would you rate the technicians knowledge of the product?', 'rating', 'Technician', 1, 4, '2026-03-21 16:42:03'),
('q5', 'How likely are you to recommend us to another client?', 'nps', 'General', 1, 5, '2026-03-21 16:42:03'),
('q6', 'Do you have any other comments or suggestions?', 'text', 'Comments', 1, 6, '2026-03-21 16:42:03');

-- --------------------------------------------------------

--
-- Table structure for table `handover_uploads`
--

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
  `upload_date` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `installations`
--

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
  `handover_status` varchar(50) DEFAULT 'pending'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `installation_budgets`
--

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
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `installation_feedback`
--

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
  `dynamic_responses` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`dynamic_responses`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `installation_progress`
--

CREATE TABLE `installation_progress` (
  `id` varchar(36) NOT NULL DEFAULT uuid(),
  `installation_id` varchar(36) NOT NULL,
  `progress_percentage` int(11) NOT NULL DEFAULT 0,
  `notes` text DEFAULT NULL,
  `last_updated_by` varchar(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `messages`
--

CREATE TABLE `messages` (
  `id` varchar(36) NOT NULL,
  `sender_id` varchar(36) NOT NULL,
  `receiver_id` varchar(36) NOT NULL,
  `content` text NOT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `subsidiaries`
--

CREATE TABLE `subsidiaries` (
  `id` varchar(36) NOT NULL DEFAULT uuid(),
  `subsidiary_name` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `default_escalation_matrix` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`default_escalation_matrix`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `subsidiaries`
--

INSERT INTO `subsidiaries` (`id`, `subsidiary_name`, `created_at`, `default_escalation_matrix`) VALUES
('34f8ccb0-0e95-11f1-9abb-00155d187c00', 'QSYS', '2026-02-20 19:48:53', NULL),
('34f8cf97-0e95-11f1-9abb-00155d187c00', 'USS', '2026-02-20 19:48:53', NULL),
('34f8d0a8-0e95-11f1-9abb-00155d187c00', 'VMS', '2026-02-20 19:48:53', NULL),
('b78e70f3-1c82-4eab-96a7-768b05e3b1f7', 'TINDANCE', '2026-03-21 20:23:28', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `system_logs`
--

CREATE TABLE `system_logs` (
  `id` varchar(36) NOT NULL DEFAULT uuid(),
  `user_id` varchar(36) DEFAULT NULL,
  `action` varchar(255) NOT NULL,
  `details` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `technician_performance_scores`
--

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
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_profiles`
--

CREATE TABLE `user_profiles` (
  `id` varchar(36) NOT NULL DEFAULT uuid(),
  `email` varchar(255) NOT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `role` varchar(50) NOT NULL,
  `designation` varchar(100) DEFAULT NULL,
  `phone_number` varchar(20) DEFAULT NULL,
  `department_id` varchar(36) DEFAULT NULL,
  `subsidiary_id` varchar(36) DEFAULT NULL,
  `first_login` tinyint(1) NOT NULL DEFAULT 1,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `password` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `announcements`
--
ALTER TABLE `announcements`
  ADD PRIMARY KEY (`id`),
  ADD KEY `subsidiary_id` (`subsidiary_id`);

--
-- Indexes for table `announcement_reads`
--
ALTER TABLE `announcement_reads`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `announcement_id` (`announcement_id`,`user_id`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `clients`
--
ALTER TABLE `clients`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_department_id` (`department_id`),
  ADD KEY `idx_subsidiary_id` (`subsidiary_id`);

--
-- Indexes for table `client_assignments`
--
ALTER TABLE `client_assignments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_client_id` (`client_id`);

--
-- Indexes for table `companies`
--
ALTER TABLE `companies`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `company_settings`
--
ALTER TABLE `company_settings`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `departments`
--
ALTER TABLE `departments`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `feedback_links`
--
ALTER TABLE `feedback_links`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_token` (`unique_token`),
  ADD KEY `idx_client_id` (`client_id`);

--
-- Indexes for table `feedback_questions`
--
ALTER TABLE `feedback_questions`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `handover_uploads`
--
ALTER TABLE `handover_uploads`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_client_id` (`client_id`),
  ADD KEY `idx_installation_id` (`installation_id`);

--
-- Indexes for table `installations`
--
ALTER TABLE `installations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_client_id` (`client_id`),
  ADD KEY `idx_status` (`status`);

--
-- Indexes for table `installation_budgets`
--
ALTER TABLE `installation_budgets`
  ADD PRIMARY KEY (`id`),
  ADD KEY `installation_id` (`installation_id`),
  ADD KEY `created_by` (`created_by`);

--
-- Indexes for table `installation_feedback`
--
ALTER TABLE `installation_feedback`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_installation_id` (`installation_id`),
  ADD KEY `idx_client_id` (`client_id`);

--
-- Indexes for table `installation_progress`
--
ALTER TABLE `installation_progress`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_installation_id` (`installation_id`);

--
-- Indexes for table `messages`
--
ALTER TABLE `messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `sender_id` (`sender_id`),
  ADD KEY `receiver_id` (`receiver_id`);

--
-- Indexes for table `subsidiaries`
--
ALTER TABLE `subsidiaries`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `system_logs`
--
ALTER TABLE `system_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_user_id` (`user_id`);

--
-- Indexes for table `technician_performance_scores`
--
ALTER TABLE `technician_performance_scores`
  ADD PRIMARY KEY (`id`),
  ADD KEY `technician_id` (`technician_id`);

--
-- Indexes for table `user_profiles`
--
ALTER TABLE `user_profiles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Constraints for dumped tables
--

--
-- Constraints for table `announcements`
--
ALTER TABLE `announcements`
  ADD CONSTRAINT `announcements_ibfk_1` FOREIGN KEY (`subsidiary_id`) REFERENCES `subsidiaries` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `announcement_reads`
--
ALTER TABLE `announcement_reads`
  ADD CONSTRAINT `announcement_reads_ibfk_1` FOREIGN KEY (`announcement_id`) REFERENCES `announcements` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `announcement_reads_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `installation_budgets`
--
ALTER TABLE `installation_budgets`
  ADD CONSTRAINT `installation_budgets_ibfk_1` FOREIGN KEY (`installation_id`) REFERENCES `installations` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `installation_budgets_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `user_profiles` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `messages`
--
ALTER TABLE `messages`
  ADD CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`sender_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `messages_ibfk_2` FOREIGN KEY (`receiver_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `technician_performance_scores`
--
ALTER TABLE `technician_performance_scores`
  ADD CONSTRAINT `technician_performance_scores_ibfk_1` FOREIGN KEY (`technician_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
