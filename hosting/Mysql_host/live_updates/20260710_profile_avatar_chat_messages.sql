-- RIANA CIMS consolidated live database update
-- Date: 2026-07-10
-- Purpose: Apply all database changes required by the current Riana CIMS build.
-- Safe to rerun. Scripts are additive/idempotent and preserve existing data.
--
-- BEFORE IMPORTING:
-- 1. Create and verify a full production database backup.
-- 2. In phpMyAdmin, select the existing RIANA CIMS production database.
-- 3. Import this consolidated file once. It is safe to import again if needed.
--
-- Included sections:
-- 1. Profile avatar, chat replies, attachments, and audio/video call metadata.
-- 2. Chat edit/reactions/deletion, recipient status, and central audit_logs.
-- 3. Group call participants, secure contact reveal audit, feedback/performance indexes.

-- RIANA CIMS live database update
-- Date: 2026-07-10
-- Feature: Profile avatar support plus chat replies, attachments, and audio/video call metadata
-- Safe to rerun. This script only adds missing columns and indexes.
--
-- BEFORE IMPORTING:
-- 1. Create and verify a full production database backup.
-- 2. In phpMyAdmin, select the existing RIANA CIMS production database.
-- 3. Import this file once. It is safe to import again if needed.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS migration_history (
  migration_id VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (migration_id)
);

DELIMITER $$

DROP PROCEDURE IF EXISTS riana_add_column_if_missing $$
CREATE PROCEDURE riana_add_column_if_missing(
  IN target_table VARCHAR(64),
  IN target_column VARCHAR(64),
  IN column_definition TEXT
)
BEGIN
  DECLARE duplicate_column CONDITION FOR 1060;
  DECLARE CONTINUE HANDLER FOR duplicate_column BEGIN END;

  SET @riana_sql = CONCAT('ALTER TABLE `', target_table, '` ADD COLUMN ', column_definition);
  PREPARE riana_stmt FROM @riana_sql;
  EXECUTE riana_stmt;
  DEALLOCATE PREPARE riana_stmt;
END $$

DROP PROCEDURE IF EXISTS riana_add_index_if_missing $$
CREATE PROCEDURE riana_add_index_if_missing(
  IN target_table VARCHAR(64),
  IN target_index VARCHAR(64),
  IN index_definition TEXT
)
BEGIN
  DECLARE duplicate_key CONDITION FOR 1061;
  DECLARE CONTINUE HANDLER FOR duplicate_key BEGIN END;

  SET @riana_sql = CONCAT('ALTER TABLE `', target_table, '` ADD ', index_definition);
  PREPARE riana_stmt FROM @riana_sql;
  EXECUTE riana_stmt;
  DEALLOCATE PREPARE riana_stmt;
END $$

DELIMITER ;

CALL riana_add_column_if_missing('user_profiles', 'avatar_url', '`avatar_url` VARCHAR(255) NULL');

CALL riana_add_column_if_missing('messages', 'message_kind', "`message_kind` ENUM('text','attachment','call') NOT NULL DEFAULT 'text'");
CALL riana_add_column_if_missing('messages', 'reply_to_message_id', '`reply_to_message_id` VARCHAR(36) NULL');
CALL riana_add_column_if_missing('messages', 'attachment_file_name', '`attachment_file_name` VARCHAR(255) NULL');
CALL riana_add_column_if_missing('messages', 'attachment_file_path', '`attachment_file_path` VARCHAR(255) NULL');
CALL riana_add_column_if_missing('messages', 'attachment_content_type', '`attachment_content_type` VARCHAR(120) NULL');
CALL riana_add_column_if_missing('messages', 'attachment_size', '`attachment_size` INT UNSIGNED NULL');
CALL riana_add_column_if_missing('messages', 'call_type', "`call_type` ENUM('audio','video') NULL");
CALL riana_add_column_if_missing('messages', 'call_status', "`call_status` ENUM('ringing','accepted','declined','missed','ended') NULL");
CALL riana_add_column_if_missing('messages', 'call_started_at', '`call_started_at` DATETIME NULL');
CALL riana_add_column_if_missing('messages', 'call_ended_at', '`call_ended_at` DATETIME NULL');

CALL riana_add_index_if_missing('messages', 'idx_messages_reply', 'INDEX `idx_messages_reply` (`reply_to_message_id`)');
CALL riana_add_index_if_missing('messages', 'idx_messages_attachment_path', 'INDEX `idx_messages_attachment_path` (`attachment_file_path`)');
CALL riana_add_index_if_missing('messages', 'idx_messages_call_status', 'INDEX `idx_messages_call_status` (`call_status`)');

DROP PROCEDURE IF EXISTS riana_add_column_if_missing;
DROP PROCEDURE IF EXISTS riana_add_index_if_missing;

INSERT INTO migration_history (migration_id, description)
VALUES (
  '20260710_profile_avatar_chat_messages',
  'Adds profile avatar URL and chat reply, attachment, and audio/video call metadata'
)
ON DUPLICATE KEY UPDATE
  description = VALUES(description);

SHOW COLUMNS FROM user_profiles LIKE 'avatar_url';
SHOW COLUMNS FROM messages LIKE 'message_kind';
SHOW COLUMNS FROM messages LIKE 'reply_to_message_id';
SHOW COLUMNS FROM messages LIKE 'attachment_file_path';
SHOW COLUMNS FROM messages LIKE 'call_status';
SHOW INDEX FROM messages WHERE Key_name IN ('idx_messages_reply', 'idx_messages_attachment_path', 'idx_messages_call_status');


-- -----------------------------------------------------------------------------
-- Section 2: Chat audit logging and message controls
-- -----------------------------------------------------------------------------

-- RIANA CIMS live database update
-- Date: 2026-07-10
-- Feature: Chat message edit/reactions/deletion plus centralized audit logging
-- Safe to rerun. This script only adds missing columns, tables, and indexes.
--
-- BEFORE IMPORTING:
-- 1. Create and verify a full production database backup.
-- 2. Run during a low-traffic window because message text charset/index updates may lock large tables.
-- 3. In phpMyAdmin, select the existing RIANA CIMS production database.
-- 4. Import this file once. It is safe to import again if needed.
--
-- ROLLBACK PLAN:
-- 1. Keep the production backup until the application is verified.
-- 2. To disable the feature without data loss, roll back the application build first.
-- 3. Leave added tables/columns in place; they are backward-compatible with the previous code.
-- 4. If a full rollback is mandated, restore the verified backup rather than dropping audit evidence.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS migration_history (
  migration_id VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (migration_id)
);

DELIMITER $$

DROP PROCEDURE IF EXISTS riana_add_column_if_missing $$
CREATE PROCEDURE riana_add_column_if_missing(
  IN target_table VARCHAR(64),
  IN target_column VARCHAR(64),
  IN column_definition TEXT
)
BEGIN
  DECLARE duplicate_column CONDITION FOR 1060;
  DECLARE CONTINUE HANDLER FOR duplicate_column BEGIN END;

  SET @riana_sql = CONCAT('ALTER TABLE `', target_table, '` ADD COLUMN ', column_definition);
  PREPARE riana_stmt FROM @riana_sql;
  EXECUTE riana_stmt;
  DEALLOCATE PREPARE riana_stmt;
END $$

DROP PROCEDURE IF EXISTS riana_add_index_if_missing $$
CREATE PROCEDURE riana_add_index_if_missing(
  IN target_table VARCHAR(64),
  IN target_index VARCHAR(64),
  IN index_definition TEXT
)
BEGIN
  DECLARE duplicate_key CONDITION FOR 1061;
  DECLARE CONTINUE HANDLER FOR duplicate_key BEGIN END;

  SET @riana_sql = CONCAT('ALTER TABLE `', target_table, '` ADD ', index_definition);
  PREPARE riana_stmt FROM @riana_sql;
  EXECUTE riana_stmt;
  DEALLOCATE PREPARE riana_stmt;
END $$

DELIMITER ;

CALL riana_add_column_if_missing('messages', 'is_edited', '`is_edited` BOOLEAN DEFAULT FALSE');
CALL riana_add_column_if_missing('messages', 'edited_at', '`edited_at` TIMESTAMP NULL');
CALL riana_add_column_if_missing('messages', 'is_deleted_for_everyone', '`is_deleted_for_everyone` BOOLEAN DEFAULT FALSE');
CALL riana_add_column_if_missing('messages', 'deleted_for_everyone_at', '`deleted_for_everyone_at` TIMESTAMP NULL');
CALL riana_add_column_if_missing('messages', 'deleted_for_everyone_by', '`deleted_for_everyone_by` VARCHAR(36) NULL');
CALL riana_add_column_if_missing('messages', 'deletion_reason', '`deletion_reason` VARCHAR(255) NULL');
CALL riana_add_column_if_missing('messages', 'content_hash', '`content_hash` CHAR(64) NULL');

CALL riana_add_index_if_missing('messages', 'idx_messages_deleted_everyone', 'INDEX `idx_messages_deleted_everyone` (`is_deleted_for_everyone`,`deleted_for_everyone_at`)');
CALL riana_add_index_if_missing('messages', 'idx_messages_edited', 'INDEX `idx_messages_edited` (`is_edited`,`edited_at`)');

CREATE TABLE IF NOT EXISTS message_edit_history (
  id VARCHAR(36) PRIMARY KEY,
  message_id VARCHAR(36) NOT NULL,
  edited_by VARCHAR(36) NULL,
  previous_content TEXT NULL,
  new_content_hash CHAR(64) NOT NULL,
  edited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_message_edit_history_message (message_id,edited_at),
  CONSTRAINT fk_message_edit_history_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_edit_history_user FOREIGN KEY (edited_by) REFERENCES user_profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_reactions (
  id VARCHAR(36) PRIMARY KEY,
  message_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  reaction_type ENUM('like','love','laugh','wow','sad','angry') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_message_reaction_user (message_id,user_id),
  INDEX idx_message_reactions_user (user_id),
  CONSTRAINT fk_message_reactions_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_reactions_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_user_deletions (
  id VARCHAR(36) PRIMARY KEY,
  message_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_message_user_deletion (message_id,user_id),
  INDEX idx_message_user_deletions_user (user_id,deleted_at),
  CONSTRAINT fk_message_user_deletions_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_user_deletions_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_recipient_status (
  id VARCHAR(36) PRIMARY KEY,
  message_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  delivered_at TIMESTAMP NULL,
  read_at TIMESTAMP NULL,
  UNIQUE KEY uq_message_recipient_status (message_id,user_id),
  INDEX idx_message_recipient_status_user_read (user_id,read_at),
  CONSTRAINT fk_message_recipient_status_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_recipient_status_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  event_uuid VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NULL,
  impersonator_user_id VARCHAR(36) NULL,
  action VARCHAR(120) NOT NULL,
  category VARCHAR(60) NOT NULL DEFAULT 'system',
  module VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NULL,
  entity_id VARCHAR(100) NULL,
  description VARCHAR(1000) NULL,
  old_values JSON NULL,
  new_values JSON NULL,
  metadata JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  device VARCHAR(255) NULL,
  session_id VARCHAR(120) NULL,
  request_id VARCHAR(80) NULL,
  route VARCHAR(255) NULL,
  http_method VARCHAR(12) NULL,
  status ENUM('success','failure','denied') NOT NULL DEFAULT 'success',
  severity ENUM('info','notice','warning','critical') NOT NULL DEFAULT 'info',
  integrity_hash CHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_logs_user_created (user_id,created_at),
  INDEX idx_audit_logs_action (action),
  INDEX idx_audit_logs_module_created (module,created_at),
  INDEX idx_audit_logs_entity (entity_type,entity_id),
  INDEX idx_audit_logs_created (created_at),
  INDEX idx_audit_logs_severity (severity),
  INDEX idx_audit_logs_status (status),
  INDEX idx_audit_logs_ip (ip_address),
  UNIQUE KEY uq_audit_event_uuid (event_uuid),
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_logs_impersonator FOREIGN KEY (impersonator_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS riana_add_column_if_missing;
DROP PROCEDURE IF EXISTS riana_add_index_if_missing;

INSERT INTO migration_history (migration_id, description)
VALUES ('20260710_chat_audit_logging', 'Adds chat editing, reactions, per-user deletion, recipient read status, and central audit logs')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO migration_history (migration_id, description)
VALUES ('20260710_chat_support_tables_hotfix', 'Ensures chat edit, reaction, deletion, and recipient delivery-status tables exist for message sending')
ON DUPLICATE KEY UPDATE description = VALUES(description);

SHOW COLUMNS FROM messages WHERE Field IN ('is_edited','edited_at','is_deleted_for_everyone','deleted_for_everyone_at','deleted_for_everyone_by','deletion_reason','content_hash');
SHOW TABLES LIKE 'message_edit_history';
SHOW TABLES LIKE 'message_reactions';
SHOW TABLES LIKE 'message_user_deletions';
SHOW TABLES LIKE 'message_recipient_status';
SHOW TABLES LIKE 'audit_logs';
SHOW INDEX FROM audit_logs;
SHOW INDEX FROM message_reactions;
SHOW INDEX FROM message_recipient_status;



-- -----------------------------------------------------------------------------
-- Section 3: Calls, feedback, contact reveal, and performance
-- -----------------------------------------------------------------------------

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
  DECLARE duplicate_key CONDITION FOR 1061;
  DECLARE CONTINUE HANDLER FOR duplicate_key BEGIN END;

  SET @riana_sql = p_sql;
  PREPARE stmt FROM @riana_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;
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

SHOW TABLES LIKE 'call_participants';
SHOW TABLES LIKE 'contact_reveal_audit';
SHOW INDEX FROM messages WHERE Key_name IN ('idx_messages_kind_created','idx_messages_kind_call_status');
SHOW INDEX FROM feedback_links WHERE Key_name IN ('idx_feedback_links_client_active','idx_feedback_links_token_expires');
SHOW INDEX FROM installation_feedback WHERE Key_name = 'idx_installation_feedback_client_install';
SHOW INDEX FROM clients WHERE Key_name = 'idx_clients_name_branch';
SHOW INDEX FROM user_profiles WHERE Key_name = 'idx_user_profiles_active_role';