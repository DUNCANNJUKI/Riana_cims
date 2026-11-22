-- Additive and retryable on both MySQL and MariaDB; preserve existing feedback.
DELIMITER $$
DROP PROCEDURE IF EXISTS riana_add_implementation_feedback $$
CREATE PROCEDURE riana_add_implementation_feedback()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crms_client_acceptances' AND COLUMN_NAME = 'feedback_rating'
  ) THEN
    ALTER TABLE crms_client_acceptances ADD COLUMN feedback_rating TINYINT UNSIGNED NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crms_client_acceptances' AND COLUMN_NAME = 'feedback_comment'
  ) THEN
    ALTER TABLE crms_client_acceptances ADD COLUMN feedback_comment TEXT NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crms_client_acceptances' AND COLUMN_NAME = 'feedback_submitted_at'
  ) THEN
    ALTER TABLE crms_client_acceptances ADD COLUMN feedback_submitted_at DATETIME NULL;
  END IF;
END $$
DELIMITER ;

CALL riana_add_implementation_feedback();
DROP PROCEDURE IF EXISTS riana_add_implementation_feedback;

INSERT INTO migration_history (migration_id, description)
VALUES ('20261122_client_implementation_feedback', 'Verified client implementation feedback on existing acceptance records')
ON DUPLICATE KEY UPDATE description = VALUES(description);
