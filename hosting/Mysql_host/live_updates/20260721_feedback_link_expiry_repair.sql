-- Live-safe feedback link expiry repair.
-- Removes legacy ON UPDATE behavior from feedback_links.expires_at so delivery updates do not expire active links.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS migration_history (
  migration_id VARCHAR(100) PRIMARY KEY,
  description TEXT,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback_links (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36) NULL,
  department_id VARCHAR(36) NULL,
  installation_id VARCHAR(36) NULL,
  unique_token VARCHAR(100) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP NULL,
  email_sent BOOLEAN DEFAULT FALSE,
  sms_sent BOOLEAN DEFAULT FALSE,
  created_by_user_id VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_feedback_links_scope (client_id,branch_id,department_id,is_used,expires_at),
  INDEX idx_feedback_links_token_expires (unique_token,expires_at)
);

ALTER TABLE feedback_links MODIFY COLUMN expires_at TIMESTAMP NOT NULL;

UPDATE feedback_links
SET expires_at = DATE_ADD(created_at, INTERVAL 30 DAY)
WHERE is_used = FALSE
  AND (email_sent = TRUE OR sms_sent = TRUE)
  AND created_at IS NOT NULL
  AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
  AND expires_at <= NOW();

INSERT INTO migration_history (migration_id, description)
VALUES (
  '20260721_feedback_link_expiry_repair',
  'Removes automatic expires_at updates from feedback links so links remain valid until their original deadline'
)
ON DUPLICATE KEY UPDATE
  description = VALUES(description);

SHOW COLUMNS FROM feedback_links LIKE 'expires_at';
