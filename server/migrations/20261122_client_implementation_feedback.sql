-- Additive, nullable fields: existing acceptance records and indexes are preserved.
ALTER TABLE crms_client_acceptances
  ADD COLUMN IF NOT EXISTS feedback_rating TINYINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS feedback_comment TEXT NULL,
  ADD COLUMN IF NOT EXISTS feedback_submitted_at DATETIME NULL;

INSERT INTO migration_history (migration_id, description)
VALUES ('20261122_client_implementation_feedback', 'Verified client implementation feedback on existing acceptance records')
ON DUPLICATE KEY UPDATE description = VALUES(description);
