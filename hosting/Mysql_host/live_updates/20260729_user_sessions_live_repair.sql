-- Repairs existing live databases that predate single-session tracking.
-- Safe to retry; preserves existing users and sessions.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS migration_history (
  migration_id VARCHAR(100) PRIMARY KEY,
  description TEXT,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  session_id VARCHAR(128) NOT NULL UNIQUE,
  token_hash CHAR(64) NULL,
  device_name VARCHAR(255) NULL,
  browser_name VARCHAR(100) NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_activity_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  revoked_at DATETIME NULL,
  revoke_reason VARCHAR(100) NULL,
  INDEX idx_user_sessions_user_id (user_id),
  INDEX idx_user_sessions_session_id (session_id),
  INDEX idx_user_sessions_active (user_id, revoked_at, expires_at),
  CONSTRAINT fk_user_sessions_user
    FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
);

INSERT INTO migration_history (migration_id, description)
VALUES ('20260729_user_sessions_live_repair', 'Repair missing user_sessions table on existing live databases')
ON DUPLICATE KEY UPDATE description = VALUES(description);
