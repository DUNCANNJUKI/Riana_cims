-- Live module schema repair for Developers, feedback links, messaging presence, assignments, and finances.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS migration_history (
  migration_id VARCHAR(100) PRIMARY KEY,
  description TEXT,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS client_branches (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_name VARCHAR(150) NOT NULL,
  branch_code VARCHAR(60) NULL,
  contact_person_name VARCHAR(150) NULL,
  contact_email VARCHAR(255) NULL,
  contact_phone VARCHAR(30) NULL,
  physical_address TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  created_by VARCHAR(36) NULL,
  updated_by VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  INDEX idx_client_branches_client_status (client_id,status),
  UNIQUE KEY uq_client_branches_name (client_id,branch_name)
);

CREATE TABLE IF NOT EXISTS client_departments (
  id VARCHAR(36) PRIMARY KEY,
  client_id VARCHAR(36) NOT NULL,
  branch_id VARCHAR(36) NOT NULL,
  department_name VARCHAR(150) NOT NULL,
  department_code VARCHAR(60) NULL,
  contact_person_name VARCHAR(150) NULL,
  contact_email VARCHAR(255) NULL,
  contact_phone VARCHAR(30) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  created_by VARCHAR(36) NULL,
  updated_by VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  INDEX idx_client_departments_branch_status (branch_id,status),
  INDEX idx_client_departments_client_status (client_id,status),
  UNIQUE KEY uq_client_departments_name (branch_id,department_name)
);

CREATE TABLE IF NOT EXISTS user_access_scopes (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  scope_type VARCHAR(40) NOT NULL DEFAULT 'all_clients',
  client_id VARCHAR(36) NULL,
  branch_id VARCHAR(36) NULL,
  department_id VARCHAR(36) NULL,
  include_future_departments BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_access_scope (user_id,scope_type,client_id,branch_id,department_id),
  INDEX idx_user_access_scope_user (user_id)
);

CREATE TABLE IF NOT EXISTS installation_budgets (
  id VARCHAR(36) PRIMARY KEY,
  installation_id VARCHAR(36) NOT NULL,
  total_budget FLOAT DEFAULT 0,
  labor_cost FLOAT DEFAULT 0,
  equipment_cost FLOAT DEFAULT 0,
  transport_cost FLOAT DEFAULT 0,
  miscellaneous_cost FLOAT DEFAULT 0,
  notes TEXT,
  created_by VARCHAR(36),
  currency VARCHAR(10) DEFAULT 'KES',
  branch VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

DELIMITER $$

DROP PROCEDURE IF EXISTS riana_add_column_if_missing $$
CREATE PROCEDURE riana_add_column_if_missing(IN p_sql TEXT)
BEGIN
  DECLARE duplicate_column CONDITION FOR 1060;
  DECLARE CONTINUE HANDLER FOR duplicate_column BEGIN END;

  SET @riana_sql = p_sql;
  PREPARE stmt FROM @riana_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;
END $$

DROP PROCEDURE IF EXISTS riana_add_index_if_missing $$
CREATE PROCEDURE riana_add_index_if_missing(IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_sql TEXT)
BEGIN
  DECLARE duplicate_key CONDITION FOR 1061;
  DECLARE CONTINUE HANDLER FOR duplicate_key BEGIN END;

  SET @riana_sql = p_sql;
  PREPARE stmt FROM @riana_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;
END $$

DELIMITER ;

CALL riana_add_column_if_missing('ALTER TABLE user_profiles ADD COLUMN avatar_url VARCHAR(255) NULL');
CALL riana_add_column_if_missing('ALTER TABLE user_profiles ADD COLUMN last_seen_at TIMESTAMP NULL');
CALL riana_add_index_if_missing('user_profiles', 'idx_user_profiles_active_role', 'ALTER TABLE user_profiles ADD INDEX idx_user_profiles_active_role (is_active, role, created_at)');

CALL riana_add_column_if_missing('ALTER TABLE crms_change_requests ADD COLUMN branch_id VARCHAR(36) NULL AFTER client_id');
CALL riana_add_column_if_missing('ALTER TABLE crms_change_requests ADD COLUMN department_id VARCHAR(36) NULL AFTER branch_id');
CALL riana_add_column_if_missing('ALTER TABLE crms_change_requests ADD COLUMN installation_id VARCHAR(36) NULL AFTER department_id');
CALL riana_add_index_if_missing('crms_change_requests', 'idx_crms_change_requests_scope', 'ALTER TABLE crms_change_requests ADD INDEX idx_crms_change_requests_scope (client_id, branch_id, department_id)');
CALL riana_add_index_if_missing('crms_change_requests', 'idx_crms_change_requests_installation', 'ALTER TABLE crms_change_requests ADD INDEX idx_crms_change_requests_installation (installation_id)');

CALL riana_add_column_if_missing('ALTER TABLE feedback_links ADD COLUMN branch_id VARCHAR(36) NULL AFTER client_id');
CALL riana_add_column_if_missing('ALTER TABLE feedback_links ADD COLUMN department_id VARCHAR(36) NULL AFTER branch_id');
CALL riana_add_index_if_missing('feedback_links', 'idx_feedback_links_scope', 'ALTER TABLE feedback_links ADD INDEX idx_feedback_links_scope (client_id, branch_id, department_id, is_used, expires_at)');
CALL riana_add_index_if_missing('feedback_links', 'idx_feedback_links_token_expires', 'ALTER TABLE feedback_links ADD INDEX idx_feedback_links_token_expires (unique_token, expires_at)');

CALL riana_add_column_if_missing('ALTER TABLE client_assignments ADD COLUMN branch_id VARCHAR(36) NULL AFTER client_id');
CALL riana_add_column_if_missing('ALTER TABLE client_assignments ADD COLUMN department_id VARCHAR(36) NULL AFTER branch_id');
CALL riana_add_column_if_missing('ALTER TABLE client_assignments ADD COLUMN installation_id VARCHAR(36) NULL AFTER department_id');
CALL riana_add_column_if_missing('ALTER TABLE client_assignments ADD COLUMN branch VARCHAR(100) NULL AFTER notes');
CALL riana_add_index_if_missing('client_assignments', 'idx_assignment_scope', 'ALTER TABLE client_assignments ADD INDEX idx_assignment_scope (client_id, branch_id, department_id)');

CALL riana_add_column_if_missing('ALTER TABLE installations ADD COLUMN branch_id VARCHAR(36) NULL AFTER client_id');
CALL riana_add_column_if_missing('ALTER TABLE installations ADD COLUMN department_id VARCHAR(36) NULL AFTER branch_id');
CALL riana_add_index_if_missing('installations', 'idx_installations_branch_department', 'ALTER TABLE installations ADD INDEX idx_installations_branch_department (branch_id, department_id)');

CALL riana_add_column_if_missing('ALTER TABLE installation_budgets ADD COLUMN currency VARCHAR(10) DEFAULT ''KES''');
CALL riana_add_column_if_missing('ALTER TABLE installation_budgets ADD COLUMN branch VARCHAR(100) NULL');
CALL riana_add_column_if_missing('ALTER TABLE installation_budgets ADD COLUMN created_by VARCHAR(36) NULL');
CALL riana_add_index_if_missing('installation_budgets', 'idx_installation_budgets_installation', 'ALTER TABLE installation_budgets ADD INDEX idx_installation_budgets_installation (installation_id, created_at)');

INSERT IGNORE INTO client_branches
  (id, client_id, branch_name, branch_code, status, notes)
SELECT
  UUID(),
  c.id,
  COALESCE(NULLIF(TRIM(c.branch), ''), 'MAIN'),
  CASE WHEN NULLIF(TRIM(c.branch), '') IS NULL THEN 'MAIN' ELSE NULL END,
  'active',
  'Auto-created primary branch for existing client'
FROM clients c
WHERE NOT EXISTS (
  SELECT 1
  FROM client_branches b
  WHERE CONVERT(b.client_id USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(c.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
    AND b.deleted_at IS NULL
);

DROP PROCEDURE IF EXISTS riana_add_column_if_missing;
DROP PROCEDURE IF EXISTS riana_add_index_if_missing;

INSERT INTO migration_history (migration_id, description)
VALUES (
  '20260719_live_module_schema_repair',
  'Repairs live module schema for Developers, feedback links, messaging presence, assignments, and finances'
)
ON DUPLICATE KEY UPDATE
  description = VALUES(description);

SHOW COLUMNS FROM user_profiles LIKE 'last_seen_at';
SHOW COLUMNS FROM feedback_links LIKE 'branch_id';
SHOW COLUMNS FROM feedback_links LIKE 'department_id';
SHOW COLUMNS FROM client_assignments LIKE 'branch_id';
SHOW COLUMNS FROM client_assignments LIKE 'department_id';
SHOW COLUMNS FROM crms_change_requests LIKE 'branch_id';
SHOW COLUMNS FROM crms_change_requests LIKE 'department_id';
SHOW TABLES LIKE 'installation_budgets';
SELECT COUNT(*) AS clients_without_branch_rows FROM clients c WHERE NOT EXISTS (SELECT 1 FROM client_branches b WHERE CONVERT(b.client_id USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(c.id USING utf8mb4) COLLATE utf8mb4_unicode_ci AND b.deleted_at IS NULL);

