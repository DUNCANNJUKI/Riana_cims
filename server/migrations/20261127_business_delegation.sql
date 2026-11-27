CREATE TABLE IF NOT EXISTS business_subsidiary_grants (
  user_id VARCHAR(36) NOT NULL,
  subsidiary_id VARCHAR(36) NOT NULL,
  granted_by VARCHAR(36) NOT NULL,
  granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, subsidiary_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS business_staff_suspensions (
  user_id VARCHAR(36) NOT NULL PRIMARY KEY,
  subsidiary_id VARCHAR(36) NOT NULL,
  session_version BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO role_permissions (role_id,permission_id)
SELECT 'cims:HeadOfBusiness',id FROM permissions
WHERE module_id='cims' AND code IN ('installations.manage','assignments.manage');
