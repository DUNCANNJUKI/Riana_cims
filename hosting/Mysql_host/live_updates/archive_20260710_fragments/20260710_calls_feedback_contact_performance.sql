-- RIANA CIMS live update
-- Date: 2026-07-10
-- Feature: Group calls, feedback link preview support, secure contact reveal audit, and performance indexes
-- Safe to rerun. This script only adds missing tables and indexes.
--
-- BEFORE IMPORTING:
-- 1. Create and verify a full production database backup.
-- 2. Import after 20260710_profile_avatar_chat_messages.sql and 20260710_chat_audit_logging.sql.
-- 3. In phpMyAdmin, select the existing RIANA CIMS production database.
-- 4. Import this file once. It is safe to import again if needed.
--
-- ROLLBACK PLAN:
-- 1. Keep the production backup until the application is verified.
-- 2. To disable these features without data loss, roll back the application build first.
-- 3. Leave added audit/participant tables and indexes in place; they are backward-compatible.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS migration_history (
  migration_id VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (migration_id)
);

CREATE TABLE IF NOT EXISTS call_participants (
  id VARCHAR(36) PRIMARY KEY,
  call_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  status ENUM('invited','ringing','accepted','declined','ended','missed') NOT NULL DEFAULT 'ringing',
  joined_at DATETIME NULL,
  left_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_call_participant (call_id,user_id),
  INDEX idx_call_participants_user_status (user_id,status,created_at),
  CONSTRAINT fk_call_participants_call FOREIGN KEY (call_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_call_participants_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_reveal_audit (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  field_name VARCHAR(80) NOT NULL,
  reason VARCHAR(255) NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  revealed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_contact_reveal_entity (entity_type,entity_id,revealed_at),
  INDEX idx_contact_reveal_user (user_id,revealed_at),
  CONSTRAINT fk_contact_reveal_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$

DROP PROCEDURE IF EXISTS riana_add_index_if_missing $$
CREATE PROCEDURE riana_add_index_if_missing(IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_sql TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_table AND INDEX_NAME = p_index
  ) THEN
    SET @riana_sql = p_sql;
    PREPARE stmt FROM @riana_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$

DELIMITER ;

CALL riana_add_index_if_missing('messages', 'idx_messages_kind_created', 'ALTER TABLE messages ADD INDEX idx_messages_kind_created (message_kind, created_at)');
CALL riana_add_index_if_missing('messages', 'idx_messages_kind_call_status', 'ALTER TABLE messages ADD INDEX idx_messages_kind_call_status (message_kind, call_status, created_at)');
CALL riana_add_index_if_missing('feedback_links', 'idx_feedback_links_client_active', 'ALTER TABLE feedback_links ADD INDEX idx_feedback_links_client_active (client_id, installation_id, is_used, expires_at)');
CALL riana_add_index_if_missing('feedback_links', 'idx_feedback_links_token_expires', 'ALTER TABLE feedback_links ADD INDEX idx_feedback_links_token_expires (unique_token, expires_at)');
CALL riana_add_index_if_missing('installation_feedback', 'idx_installation_feedback_client_install', 'ALTER TABLE installation_feedback ADD INDEX idx_installation_feedback_client_install (client_id, installation_id, created_at)');
CALL riana_add_index_if_missing('clients', 'idx_clients_name_branch', 'ALTER TABLE clients ADD INDEX idx_clients_name_branch (client_name, branch)');
CALL riana_add_index_if_missing('user_profiles', 'idx_user_profiles_active_role', 'ALTER TABLE user_profiles ADD INDEX idx_user_profiles_active_role (is_active, role, created_at)');

DROP PROCEDURE IF EXISTS riana_add_index_if_missing;

INSERT INTO migration_history (migration_id, description)
VALUES ('20260710_calls_feedback_contact_performance', 'Adds group call participants, contact reveal audit logging, feedback/performance indexes')
ON DUPLICATE KEY UPDATE description = VALUES(description);

SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('call_participants','contact_reveal_audit');
SHOW INDEX FROM messages WHERE Key_name IN ('idx_messages_kind_created','idx_messages_kind_call_status');
SHOW INDEX FROM feedback_links WHERE Key_name IN ('idx_feedback_links_client_active','idx_feedback_links_token_expires');
SHOW INDEX FROM installation_feedback WHERE Key_name = 'idx_installation_feedback_client_install';
SHOW INDEX FROM clients WHERE Key_name = 'idx_clients_name_branch';
SHOW INDEX FROM user_profiles WHERE Key_name = 'idx_user_profiles_active_role';