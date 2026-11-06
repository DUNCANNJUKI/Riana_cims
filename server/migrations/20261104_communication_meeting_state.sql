-- Persistent meeting engagement/media state and complete invitation outcomes.
-- Additive only. Existing participant and message rows are preserved.
-- Apply first to a disposable staging restore; do not run against production
-- without a separately approved migration window and verified backup.
-- Rollback: roll back the application first and retain these additive fields/table.

SET NAMES utf8mb4;

ALTER TABLE call_participants
  MODIFY COLUMN status ENUM('invited','ringing','accepted','declined','ended','missed','cancelled','expired','failed') NOT NULL DEFAULT 'ringing';

DELIMITER $$

DROP PROCEDURE IF EXISTS riana_add_call_participant_state_column $$
CREATE PROCEDURE riana_add_call_participant_state_column(IN p_column VARCHAR(64), IN p_definition VARCHAR(255))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'call_participants' AND COLUMN_NAME = p_column
  ) THEN
    SET @riana_call_state_sql = CONCAT('ALTER TABLE call_participants ADD COLUMN ', p_column, ' ', p_definition);
    PREPARE riana_call_state_stmt FROM @riana_call_state_sql;
    EXECUTE riana_call_state_stmt;
    DEALLOCATE PREPARE riana_call_state_stmt;
  END IF;
END $$

DELIMITER ;

CALL riana_add_call_participant_state_column('hand_raised', 'BOOLEAN NOT NULL DEFAULT FALSE');
CALL riana_add_call_participant_state_column('hand_raised_at', 'DATETIME NULL');
CALL riana_add_call_participant_state_column('audio_enabled', 'BOOLEAN NULL');
CALL riana_add_call_participant_state_column('video_enabled', 'BOOLEAN NULL');
CALL riana_add_call_participant_state_column('screen_sharing', 'BOOLEAN NOT NULL DEFAULT FALSE');

DROP PROCEDURE IF EXISTS riana_add_call_participant_state_column;

CREATE TABLE IF NOT EXISTS call_meeting_state (
  call_id VARCHAR(36) PRIMARY KEY,
  spotlight_user_id VARCHAR(36) NULL,
  updated_by VARCHAR(36) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_call_meeting_state_call FOREIGN KEY (call_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_call_meeting_state_spotlight_user FOREIGN KEY (spotlight_user_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_call_meeting_state_updated_by FOREIGN KEY (updated_by) REFERENCES user_profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO migration_history (migration_id,description)
VALUES ('20261104_communication_meeting_state','Adds persistent call participant media/hand state, meeting spotlight state, and invitation lifecycle outcomes')
ON DUPLICATE KEY UPDATE description=VALUES(description);
