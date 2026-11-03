ALTER TABLE user_profiles
  MODIFY two_factor_method ENUM('email','sms','call','totp') NOT NULL DEFAULT 'email';

CREATE TABLE IF NOT EXISTS user_totp_credentials (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  secret_ciphertext VARBINARY(512) NOT NULL,
  secret_iv VARBINARY(32) NOT NULL,
  secret_tag VARBINARY(32) NOT NULL,
  enrollment_expires_at DATETIME NOT NULL,
  confirmed_at DATETIME NULL,
  last_used_step BIGINT NULL,
  last_used_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_totp_user (user_id),
  KEY idx_user_totp_active (user_id,confirmed_at,revoked_at),
  CONSTRAINT fk_user_totp_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_mfa_recovery_codes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  batch_id CHAR(36) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mfa_recovery_hash (user_id,code_hash),
  KEY idx_mfa_recovery_available (user_id,used_at),
  CONSTRAINT fk_mfa_recovery_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_mfa_login_challenges (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  method ENUM('totp') NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  verified_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_auth_mfa_challenge_active (user_id,method,expires_at,verified_at),
  CONSTRAINT fk_auth_mfa_challenge_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_interface_preferences (
  user_id VARCHAR(36) NOT NULL PRIMARY KEY,
  language VARCHAR(12) NOT NULL DEFAULT 'en',
  theme ENUM('light','dark','system') NOT NULL DEFAULT 'system',
  inactivity_timeout_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  lock_on_resume BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ui_preferences_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_session_locks (
  session_id VARCHAR(128) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  reason ENUM('manual','inactivity','resume') NOT NULL DEFAULT 'manual',
  locked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unlocked_at DATETIME NULL,
  KEY idx_session_locks_user_active (user_id,unlocked_at),
  CONSTRAINT fk_session_lock_session FOREIGN KEY (session_id) REFERENCES user_sessions(session_id) ON DELETE CASCADE,
  CONSTRAINT fk_session_lock_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_identity_change_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  change_type ENUM('email','phone') NOT NULL,
  proposed_value VARCHAR(255) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_identity_change_active (user_id,change_type,used_at,expires_at),
  CONSTRAINT fk_identity_change_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO migration_history (migration_id,description)
VALUES ('20261101_totp_recovery_and_preferences','Encrypted authenticator-app MFA and one-time recovery codes')
ON DUPLICATE KEY UPDATE description=VALUES(description);
