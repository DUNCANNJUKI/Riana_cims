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
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = target_table AND COLUMN_NAME = target_column
  ) THEN
    SET @riana_sql = CONCAT('ALTER TABLE `', target_table, '` ADD COLUMN ', column_definition);
    PREPARE riana_stmt FROM @riana_sql;
    EXECUTE riana_stmt;
    DEALLOCATE PREPARE riana_stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS riana_add_index_if_missing $$
CREATE PROCEDURE riana_add_index_if_missing(
  IN target_table VARCHAR(64),
  IN target_index VARCHAR(64),
  IN index_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = target_table AND INDEX_NAME = target_index
  ) THEN
    SET @riana_sql = CONCAT('ALTER TABLE `', target_table, '` ADD ', index_definition);
    PREPARE riana_stmt FROM @riana_sql;
    EXECUTE riana_stmt;
    DEALLOCATE PREPARE riana_stmt;
  END IF;
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

SHOW COLUMNS FROM messages WHERE Field IN ('is_edited','edited_at','is_deleted_for_everyone','deleted_for_everyone_at','deleted_for_everyone_by','deletion_reason','content_hash');
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('message_edit_history','message_reactions','message_user_deletions','message_recipient_status','audit_logs');
SHOW INDEX FROM audit_logs;
SHOW INDEX FROM message_reactions;

