-- Production-safe copy of the approved installation-feedback schema correction.
-- Existing rating values and dynamic responses are preserved.
ALTER TABLE installation_feedback
  MODIFY installation_quality_rating INT NULL DEFAULT NULL,
  MODIFY installation_timeliness_rating INT NULL DEFAULT NULL,
  MODIFY installation_communication_rating INT NULL DEFAULT NULL,
  MODIFY technician_knowledge_rating INT NULL DEFAULT NULL,
  MODIFY technician_professionalism_rating INT NULL DEFAULT NULL,
  MODIFY technician_helpfulness_rating INT NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS migration_history (
  migration_id VARCHAR(100) PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO migration_history (migration_id, description)
VALUES (
  '20261030_installation_feedback_rating_nullability',
  'Allows uncollected legacy installation-feedback ratings to remain null without artificial defaults'
)
ON DUPLICATE KEY UPDATE description=VALUES(description);

SHOW COLUMNS FROM installation_feedback
WHERE Field IN (
  'installation_quality_rating',
  'installation_timeliness_rating',
  'installation_communication_rating',
  'technician_knowledge_rating',
  'technician_professionalism_rating',
  'technician_helpfulness_rating'
);
