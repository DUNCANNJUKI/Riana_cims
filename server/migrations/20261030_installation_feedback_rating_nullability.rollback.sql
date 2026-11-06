-- Rollback is intentionally guarded: NOT NULL cannot be restored while legitimate
-- uncollected ratings are null. Back up the database before running this file.
DELIMITER $$
DROP PROCEDURE IF EXISTS cims_rollback_feedback_rating_nullability$$
CREATE PROCEDURE cims_rollback_feedback_rating_nullability()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM installation_feedback
    WHERE installation_quality_rating IS NULL
       OR installation_timeliness_rating IS NULL
       OR installation_communication_rating IS NULL
       OR technician_knowledge_rating IS NULL
       OR technician_professionalism_rating IS NULL
       OR technician_helpfulness_rating IS NULL
    LIMIT 1
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Rollback blocked: installation feedback contains legitimate null ratings';
  END IF;

  ALTER TABLE installation_feedback
    MODIFY installation_quality_rating INT NOT NULL,
    MODIFY installation_timeliness_rating INT NOT NULL,
    MODIFY installation_communication_rating INT NOT NULL,
    MODIFY technician_knowledge_rating INT NOT NULL,
    MODIFY technician_professionalism_rating INT NOT NULL,
    MODIFY technician_helpfulness_rating INT NOT NULL;

  DELETE FROM migration_history
  WHERE migration_id='20261030_installation_feedback_rating_nullability';
END$$
CALL cims_rollback_feedback_rating_nullability()$$
DROP PROCEDURE cims_rollback_feedback_rating_nullability$$
DELIMITER ;
