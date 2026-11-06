-- Restore the required singleton serialization policy without authorizing issuance.
-- Idempotent and non-destructive: existing approval state is never changed.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS hardware_policy (
  id TINYINT PRIMARY KEY,
  sequence_partition VARCHAR(30) NOT NULL DEFAULT 'per_model_year',
  issuance_approved BOOLEAN NOT NULL DEFAULT FALSE,
  field_approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by VARCHAR(36) NULL,
  approved_at DATETIME NULL,
  approval_reference VARCHAR(255) NULL,
  KEY approved_by (approved_by),
  CONSTRAINT hardware_policy_ibfk_1 FOREIGN KEY (approved_by) REFERENCES user_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO hardware_policy
  (id, sequence_partition, issuance_approved, field_approval_required, approved_by, approved_at, approval_reference)
VALUES
  (1, 'per_model_year', FALSE, TRUE, NULL, NULL, NULL);

CREATE TABLE IF NOT EXISTS migration_history (
  migration_id VARCHAR(100) PRIMARY KEY,
  description TEXT,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO migration_history (migration_id, description)
VALUES ('20261105_hardware_policy_default_bootstrap','Ensures the default unapproved hardware serialization policy exists')
ON DUPLICATE KEY UPDATE description=VALUES(description);
