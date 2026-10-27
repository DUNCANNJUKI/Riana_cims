-- Restore the verified pre-migration backup for a full rollback.
-- This metadata-only rollback is safe only before new module-role grants are used.
DROP TABLE IF EXISTS security_audit_events;
DROP TABLE IF EXISTS security_settings;
DROP TABLE IF EXISTS user_module_roles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS modules;
DELETE FROM migration_history WHERE migration_id = '20260621_security_foundation';
-- session_version is intentionally retained because dropping it would re-enable stale tokens.
