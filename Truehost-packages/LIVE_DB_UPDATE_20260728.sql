-- Adds TV/screen quantity tracking to installation equipment scope.
-- Idempotent, additive, and safe to retry on a selected application database.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS migration_history (
  migration_id VARCHAR(100) PRIMARY KEY,
  description TEXT,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DELIMITER $$

DROP PROCEDURE IF EXISTS riana_20260728_add_column_if_missing $$
CREATE PROCEDURE riana_20260728_add_column_if_missing(IN p_sql TEXT)
BEGIN
  DECLARE duplicate_column CONDITION FOR 1060;
  DECLARE CONTINUE HANDLER FOR duplicate_column BEGIN END;

  SET @riana_sql = p_sql;
  PREPARE stmt FROM @riana_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;
END $$

DELIMITER ;

CALL riana_20260728_add_column_if_missing('ALTER TABLE installations ADD COLUMN screen_count INT DEFAULT 0 AFTER screen_with_size');

DROP PROCEDURE IF EXISTS riana_20260728_add_column_if_missing;

CREATE TEMPORARY TABLE IF NOT EXISTS riana_20260728_optimize_tables (
  table_name VARCHAR(64) PRIMARY KEY
);

TRUNCATE TABLE riana_20260728_optimize_tables;

INSERT IGNORE INTO riana_20260728_optimize_tables (table_name) VALUES
  ('announcements'),
  ('announcement_reads'),
  ('audit_logs'),
  ('auth_two_factor_challenges'),
  ('call_participants'),
  ('clients'),
  ('client_assignments'),
  ('client_branches'),
  ('client_departments'),
  ('companies'),
  ('company_settings'),
  ('contact_reveal_audit'),
  ('crms_audit_logs'),
  ('crms_change_requests'),
  ('crms_client_links'),
  ('crms_documents'),
  ('crms_notifications'),
  ('crms_user_links'),
  ('departments'),
  ('feedback_links'),
  ('feedback_questions'),
  ('handover_uploads'),
  ('installations'),
  ('installation_budgets'),
  ('installation_feedback'),
  ('installation_progress'),
  ('messages'),
  ('message_edit_history'),
  ('message_reactions'),
  ('message_recipient_status'),
  ('message_user_deletions'),
  ('migration_history'),
  ('missed_call_dismissals'),
  ('modules'),
  ('password_reset_tokens'),
  ('permissions'),
  ('roles'),
  ('role_permissions'),
  ('security_audit_events'),
  ('security_settings'),
  ('subsidiaries'),
  ('system_logs'),
  ('technician_performance_scores'),
  ('uploaded_files'),
  ('uploaded_file_variants'),
  ('user_access_scopes'),
  ('user_module_roles'),
  ('user_permissions'),
  ('user_profiles'),
  ('user_sessions');

DELIMITER $$

DROP PROCEDURE IF EXISTS riana_20260728_optimize_database $$
CREATE PROCEDURE riana_20260728_optimize_database()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE current_table VARCHAR(64);
  DECLARE table_cursor CURSOR FOR SELECT table_name FROM riana_20260728_optimize_tables ORDER BY table_name;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  OPEN table_cursor;

  table_loop: LOOP
    FETCH table_cursor INTO current_table;
    IF done = 1 THEN
      LEAVE table_loop;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = current_table
    ) THEN
      SET @riana_sql = CONCAT('ANALYZE TABLE `', REPLACE(current_table, '`', '``'), '`');
      PREPARE stmt FROM @riana_sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;

      SET @riana_sql = CONCAT('OPTIMIZE TABLE `', REPLACE(current_table, '`', '``'), '`');
      PREPARE stmt FROM @riana_sql;
      EXECUTE stmt;
      DEALLOCATE PREPARE stmt;
    END IF;
  END LOOP;

  CLOSE table_cursor;
END $$

DELIMITER ;

-- Database maintenance: refresh optimizer statistics and compact application tables.
-- Run during a maintenance window on large live databases because OPTIMIZE TABLE may lock tables.
CALL riana_20260728_optimize_database();

DROP PROCEDURE IF EXISTS riana_20260728_optimize_database;
DROP TEMPORARY TABLE IF EXISTS riana_20260728_optimize_tables;
INSERT INTO migration_history (migration_id, description)
VALUES (
  '20260728_installation_screen_count',
  'Adds screen_count to installations and refreshes optimizer statistics for application tables'
)
ON DUPLICATE KEY UPDATE
  description = VALUES(description);

SHOW COLUMNS FROM installations LIKE 'screen_count';