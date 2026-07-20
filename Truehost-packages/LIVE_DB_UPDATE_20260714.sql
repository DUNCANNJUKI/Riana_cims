-- RIANA CIMS live database update
-- Date: 2026-07-14
-- Feature: Chat presence last-seen and persistent missed-call dismissals
-- Safe to rerun. This script only adds a nullable column, a table, and supporting indexes.
--
-- BEFORE IMPORTING:
-- 1. Create and verify a full production database backup.
-- 2. Import after 20260710_calls_feedback_contact_performance.sql.
-- 3. In phpMyAdmin, select the existing RIANA CIMS production database.
--
-- ROLLBACK PLAN:
-- 1. Roll back the application build first if needed.
-- 2. Leave the added nullable column/table in place to preserve audit-like dismissal history.
-- 3. If a full database rollback is required, restore the verified backup.

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

DELIMITER ;

CALL riana_add_column_if_missing('user_profiles', 'last_seen_at', '`last_seen_at` TIMESTAMP NULL');

CREATE TABLE IF NOT EXISTS missed_call_dismissals (
  id VARCHAR(36) PRIMARY KEY,
  call_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  dismissed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_missed_call_dismissal (call_id,user_id),
  INDEX idx_missed_call_dismissals_user (user_id,dismissed_at),
  CONSTRAINT fk_missed_call_dismissal_call FOREIGN KEY (call_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_missed_call_dismissal_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS riana_add_column_if_missing;

INSERT INTO migration_history (migration_id, description)
VALUES ('20260714_chat_presence_missed_call_dismissals', 'Adds chat last seen timestamps and persistent missed-call dismissals')
ON DUPLICATE KEY UPDATE description = VALUES(description);

SHOW COLUMNS FROM user_profiles LIKE 'last_seen_at';
SHOW TABLES LIKE 'missed_call_dismissals';
SHOW INDEX FROM missed_call_dismissals;
