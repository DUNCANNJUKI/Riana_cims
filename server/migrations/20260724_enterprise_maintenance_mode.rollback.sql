ALTER TABLE company_settings
  DROP COLUMN IF EXISTS maintenance_allow_super_admin_only,
  DROP COLUMN IF EXISTS maintenance_backup_before_enable,
  DROP COLUMN IF EXISTS maintenance_notify_users,
  DROP COLUMN IF EXISTS maintenance_force_logout,
  DROP COLUMN IF EXISTS maintenance_allow_api_access,
  DROP COLUMN IF EXISTS maintenance_disabled_at,
  DROP COLUMN IF EXISTS maintenance_disabled_by,
  DROP COLUMN IF EXISTS maintenance_enabled_at,
  DROP COLUMN IF EXISTS maintenance_enabled_by,
  DROP COLUMN IF EXISTS estimated_completion,
  DROP COLUMN IF EXISTS maintenance_message,
  DROP COLUMN IF EXISTS maintenance_reason,
  DROP COLUMN IF EXISTS maintenance_enabled;

DELETE FROM migration_history WHERE migration_id = '20260724_enterprise_maintenance_mode';
