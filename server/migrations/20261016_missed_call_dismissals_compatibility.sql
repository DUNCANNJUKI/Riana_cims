-- Compatibility repair for installations where messages.id predates UUID chat.
-- Missed-call dismissal is a user-notification preference; it must not make the
-- application depend on the physical type/collation of a legacy messages.id.
CREATE TABLE IF NOT EXISTS missed_call_dismissals (
  id VARCHAR(36) NOT NULL,
  call_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  dismissed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_missed_call_dismissal (call_id,user_id),
  KEY idx_missed_call_dismissals_user (user_id,dismissed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS migration_history (
  migration_id VARCHAR(100) PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO migration_history (migration_id,description)
VALUES ('20261016_missed_call_dismissals_compatibility','Creates missed-call dismissals without a legacy message-ID foreign-key dependency')
ON DUPLICATE KEY UPDATE description=VALUES(description);
