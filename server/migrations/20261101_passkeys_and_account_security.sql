CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id CHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  credential_id VARCHAR(1024) NOT NULL,
  public_key BLOB NOT NULL,
  counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transports JSON NULL,
  device_type VARCHAR(32) NULL,
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  display_name VARCHAR(120) NOT NULL DEFAULT 'Passkey',
  aaguid VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NULL,
  revoked_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_webauthn_credential_id (credential_id(255)),
  KEY idx_webauthn_user_active (user_id,revoked_at),
  CONSTRAINT fk_webauthn_credential_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id CHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  purpose ENUM('registration','authentication') NOT NULL,
  challenge VARCHAR(1024) NOT NULL,
  session_id VARCHAR(128) NULL,
  rp_id VARCHAR(255) NOT NULL,
  origin VARCHAR(512) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  used_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_webauthn_challenge_active (user_id,purpose,expires_at,used_at),
  CONSTRAINT fk_webauthn_challenge_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO migration_history (migration_id,description)
VALUES ('20261101_passkeys_and_account_security','WebAuthn passkey credentials and single-use bound challenges')
ON DUPLICATE KEY UPDATE description=VALUES(description);
