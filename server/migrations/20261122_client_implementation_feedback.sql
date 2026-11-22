-- Additive, nullable fields: existing acceptance records and indexes are preserved.
ALTER TABLE crms_client_acceptances
  ADD COLUMN IF NOT EXISTS feedback_rating TINYINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS feedback_comment TEXT NULL,
  ADD COLUMN IF NOT EXISTS feedback_submitted_at DATETIME NULL;
