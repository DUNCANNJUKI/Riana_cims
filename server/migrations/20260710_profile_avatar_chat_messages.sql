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
