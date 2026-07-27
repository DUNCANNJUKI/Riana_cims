CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  session_id VARCHAR(128) NOT NULL UNIQUE,
  token_hash CHAR(64) NULL,
  device_name VARCHAR(255) NULL,
  browser_name VARCHAR(100) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  created_at DATETIME NOT NULL,
  last_activity_at DATETIME NOT NULL,
  expires_at DATETIME NULL,
  revoked_at DATETIME NULL,
  revoke_reason VARCHAR(100) NULL,
  INDEX idx_user_sessions_user_id (user_id),
  INDEX idx_user_sessions_session_id (session_id),
  INDEX idx_user_sessions_active (user_id, revoked_at, expires_at),
  CONSTRAINT fk_user_sessions_user
    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
);

ALTER TABLE crms_notifications
  ADD COLUMN IF NOT EXISTS notification_type VARCHAR(32) NOT NULL DEFAULT 'GENERAL' AFTER type;

UPDATE crms_notifications
SET notification_type = 'GENERAL'
WHERE notification_type IS NULL OR notification_type = '';

DELIMITER $$
DROP PROCEDURE IF EXISTS riana_add_index_if_missing $$
CREATE PROCEDURE riana_add_index_if_missing(IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_sql TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = p_table AND index_name = p_index
  ) THEN
    SET @stmt = p_sql;
    PREPARE stmt FROM @stmt;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END $$
DELIMITER ;

CALL riana_add_index_if_missing('crms_notifications', 'idx_crms_notifications_type_created', 'ALTER TABLE crms_notifications ADD INDEX idx_crms_notifications_type_created (notification_type, created_at)');

DROP PROCEDURE IF EXISTS riana_add_index_if_missing;

INSERT INTO migration_history (migration_id,description)
VALUES ('20260724_notifications_and_single_sessions','Typed notifications and single active user sessions')
ON DUPLICATE KEY UPDATE description=VALUES(description);
