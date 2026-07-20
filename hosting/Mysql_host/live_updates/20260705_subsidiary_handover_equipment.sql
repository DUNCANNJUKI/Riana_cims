-- RIANA CIMS live database update
-- Feature: subsidiary-specific E-handover equipment configuration
-- Safe to rerun. This script does not delete or rewrite existing business data.
--
-- BEFORE IMPORTING:
-- 1. Create and verify a full database backup.
-- 2. In phpMyAdmin, select the existing RIANA CIMS production database.
-- 3. Import this file. Do not import the clean-install riana_cims_host.sql file.

SET NAMES utf8mb4;

-- Truehost cPanel database users may be denied direct information_schema access,
-- and older shared-host MySQL builds may not support ADD COLUMN IF NOT EXISTS.
-- Guard the plain ALTER with the application-owned migration history instead.
CREATE TABLE IF NOT EXISTS migration_history (
  migration_id VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (migration_id)
);

SET @equipment_migration_applied = (
  SELECT COUNT(*)
  FROM migration_history
  WHERE migration_id = '20260705_subsidiary_handover_equipment'
);

SET @equipment_update_sql = IF(
  @equipment_migration_applied > 0,
  'SELECT ''20260705_subsidiary_handover_equipment already applied.'' AS migration_status',
  'ALTER TABLE subsidiaries ADD COLUMN equipment_configuration JSON NULL AFTER default_escalation_matrix'
);

PREPARE equipment_update_statement FROM @equipment_update_sql;
EXECUTE equipment_update_statement;
DEALLOCATE PREPARE equipment_update_statement;

-- Record the update only after the schema statement succeeds.
INSERT INTO migration_history (migration_id, description)
VALUES (
  '20260705_subsidiary_handover_equipment',
  'Adds per-subsidiary E-handover equipment configuration'
)
ON DUPLICATE KEY UPDATE
  description = VALUES(description);

-- Post-update verification. Expected result: one nullable JSON-compatible column.
-- SHOW COLUMNS uses the selected database and does not require information_schema access.
SHOW COLUMNS FROM subsidiaries LIKE 'equipment_configuration';
