-- RIANA CIMS production recovery diagnostics (READ ONLY)
-- Generated for the October 2026 recovery incident.
-- Run only after taking and verifying a current backup. This script does not
-- modify data, disable constraints, create objects, or reveal secret values.

SELECT DATABASE() AS database_name, VERSION() AS mysql_version, NOW() AS checked_at;

-- Expected critical tables. A missing row in this result means the table is absent.
SELECT table_name, table_rows, engine, table_collation
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN (
    'user_profiles','roles','permissions','subsidiaries','clients','branches',
    'hardware_assets','hardware_policy','hardware_assignments','installations',
    'communication_preferences','crms_notifications','company_settings',
    'audit_logs'
  )
ORDER BY table_name;

-- Columns required by the confirmed failures.
SELECT table_name, column_name, column_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND (
    (table_name = 'hardware_policy' AND column_name IN ('id','issuance_approved','field_approval_required')) OR
    (table_name = 'communication_preferences' AND column_name IN ('user_id','notifications_enabled','do_not_disturb','timezone')) OR
    (table_name = 'crms_notifications' AND column_name IN ('id','user_id','read')) OR
    (table_name = 'audit_logs' AND column_name IN ('id','user_id')) OR
    (table_name = 'company_settings' AND column_name = 'id')
  )
ORDER BY table_name, ordinal_position;

-- Hardware governance must have exactly one policy row and never a NULL approval.
SELECT COUNT(*) AS hardware_policy_rows,
       SUM(issuance_approved IS NULL) AS null_issuance_approval_rows
FROM hardware_policy;
SELECT id, issuance_approved, field_approval_required,
       CASE WHEN issuance_approved = 1 AND NULLIF(TRIM(approval_reference), '') IS NULL
            THEN 'REVIEW_APPROVED_WITHOUT_REFERENCE' ELSE 'OK' END AS integrity_status
FROM hardware_policy;

-- Known #1452 relationship: report only identifiers needed for reconciliation.
SELECT a.id AS audit_log_id, a.user_id AS missing_user_id
FROM audit_logs a
LEFT JOIN user_profiles u ON u.id = a.user_id
WHERE a.user_id IS NOT NULL AND u.id IS NULL
ORDER BY a.id;

-- Other security- and workflow-sensitive orphan checks.
SELECT h.id AS hardware_asset_id, h.subsidiary_id AS missing_subsidiary_id
FROM hardware_assets h
LEFT JOIN subsidiaries s ON s.id = h.subsidiary_id
WHERE h.subsidiary_id IS NOT NULL AND s.id IS NULL
ORDER BY h.id;

SELECT cp.user_id AS preference_user_id
FROM communication_preferences cp
LEFT JOIN user_profiles u ON u.id = cp.user_id
WHERE u.id IS NULL
ORDER BY cp.user_id;

SELECT n.id AS notification_id, n.user_id AS missing_user_id
FROM crms_notifications n
LEFT JOIN user_profiles u ON u.id = n.user_id
WHERE u.id IS NULL
ORDER BY n.id;

-- Known #1062 condition. Multiple rows are not expected; id=1 may already be valid.
SELECT id, COUNT(*) AS row_count
FROM company_settings
GROUP BY id
HAVING COUNT(*) > 1 OR id = 1;

-- Foreign keys declared by the live schema, for comparison with the expected build.
SELECT table_name, constraint_name, column_name,
       referenced_table_name, referenced_column_name
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE() AND referenced_table_name IS NOT NULL
ORDER BY table_name, constraint_name, ordinal_position;

-- Index inventory for critical API paths.
SELECT table_name, index_name, non_unique,
       GROUP_CONCAT(column_name ORDER BY seq_in_index) AS indexed_columns
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name IN ('hardware_assets','communication_preferences','crms_notifications','audit_logs')
GROUP BY table_name, index_name, non_unique
ORDER BY table_name, index_name;
