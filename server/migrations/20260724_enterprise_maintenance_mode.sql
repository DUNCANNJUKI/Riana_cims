ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS maintenance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS maintenance_reason VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS maintenance_message TEXT NULL,
  ADD COLUMN IF NOT EXISTS estimated_completion DATETIME NULL,
  ADD COLUMN IF NOT EXISTS maintenance_enabled_by VARCHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS maintenance_enabled_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS maintenance_disabled_by VARCHAR(36) NULL,
  ADD COLUMN IF NOT EXISTS maintenance_disabled_at DATETIME NULL,
  ADD COLUMN IF NOT EXISTS maintenance_allow_api_access BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS maintenance_force_logout BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS maintenance_notify_users BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS maintenance_backup_before_enable BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS maintenance_allow_super_admin_only BOOLEAN NOT NULL DEFAULT TRUE;

INSERT INTO company_settings (id, maintenance_enabled, maintenance_force_logout, maintenance_backup_before_enable, maintenance_allow_super_admin_only)
VALUES (1, FALSE, TRUE, TRUE, TRUE)
ON DUPLICATE KEY UPDATE id = id;

INSERT INTO migration_history (migration_id, description)
VALUES ('20260724_enterprise_maintenance_mode', 'Enterprise maintenance mode settings and access controls')
ON DUPLICATE KEY UPDATE description = VALUES(description);
