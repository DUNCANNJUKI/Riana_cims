-- RIANA CIMS live database update
-- Feature: subsidiary-specific E-handover equipment configuration
-- Safe to rerun. This script does not delete or rewrite existing business data.
--
-- BEFORE IMPORTING:
-- 1. Create and verify a full database backup.
-- 2. In phpMyAdmin, select the existing RIANA CIMS production database.
-- 3. Import this file. Do not import the clean-install riana_cims_host.sql file.

SET NAMES utf8mb4;

-- Fail safely if the selected database does not contain the expected table.
-- When the column already exists, the prepared statement performs a read-only no-op.
SET @equipment_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'subsidiaries'
    AND COLUMN_NAME = 'equipment_configuration'
);

SET @equipment_update_sql = IF(
  @equipment_column_exists > 0,
  'SELECT ''equipment_configuration already exists; no schema change required.'' AS migration_status',
  'ALTER TABLE subsidiaries ADD COLUMN equipment_configuration JSON NULL AFTER default_escalation_matrix'
);

PREPARE equipment_update_statement FROM @equipment_update_sql;
EXECUTE equipment_update_statement;
DEALLOCATE PREPARE equipment_update_statement;

-- Record the update only after the schema statement succeeds.
CREATE TABLE IF NOT EXISTS migration_history (
  migration_id VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (migration_id)
);

INSERT INTO migration_history (migration_id, description)
VALUES (
  '20260705_subsidiary_handover_equipment',
  'Adds per-subsidiary E-handover equipment configuration'
)
ON DUPLICATE KEY UPDATE
  description = VALUES(description);

-- Post-update verification. Expected result: one row with a JSON-compatible column.
SELECT
  TABLE_SCHEMA,
  TABLE_NAME,
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'subsidiaries'
  AND COLUMN_NAME = 'equipment_configuration';
