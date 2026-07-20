-- RIANA CIMS live database update
-- Date: 2026-07-17
-- Feature: E-handover export completion status alignment
-- Safe to rerun. This script adds missing handover columns and backfills
-- completed installation status for installations with uploaded E-handovers.
--
-- BEFORE IMPORTING:
-- 1. Create and verify a full production database backup.
-- 2. Import after 20260714_chat_presence_missed_call_dismissals.sql.
-- 3. In phpMyAdmin, select the existing RIANA CIMS production database.
--
-- ROLLBACK PLAN:
-- 1. Roll back the application build first if needed.
-- 2. Restore the verified database backup if the completion-status backfill must be reversed.

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

CALL riana_add_column_if_missing('installations', 'handover_file_path', '`handover_file_path` TEXT NULL');
CALL riana_add_column_if_missing('installations', 'handover_status', '`handover_status` VARCHAR(50) DEFAULT ''pending''');

UPDATE installations i
JOIN (
  SELECT
    installation_id,
    MAX(upload_date) AS latest_upload_date,
    MAX(file_path) AS latest_file_path,
    MAX(CASE WHEN is_signed = 1 THEN 1 ELSE 0 END) AS has_signed_upload
  FROM handover_uploads
  WHERE installation_id IS NOT NULL
  GROUP BY installation_id
) h ON h.installation_id = i.id
SET
  i.status = 'completed',
  i.completion_date = COALESCE(i.completion_date, DATE(h.latest_upload_date), CURDATE()),
  i.handover_file_path = COALESCE(i.handover_file_path, h.latest_file_path),
  i.handover_status = CASE
    WHEN h.has_signed_upload = 1 THEN 'signed'
    ELSE COALESCE(i.handover_status, 'uploaded')
  END;

DROP PROCEDURE IF EXISTS riana_add_column_if_missing;

INSERT INTO migration_history (migration_id, description)
VALUES (
  '20260717_ehandover_completion_status',
  'Adds E-handover installation completion/status columns and backfills completed installations from uploads'
)
ON DUPLICATE KEY UPDATE
  description = VALUES(description);

SHOW COLUMNS FROM installations LIKE 'handover_file_path';
SHOW COLUMNS FROM installations LIKE 'handover_status';
SELECT COUNT(*) AS completed_ehandover_installations
FROM installations i
JOIN handover_uploads h ON h.installation_id = i.id
WHERE i.status = 'completed';

