-- Live-safe Developers request scope repair for branch/department selection.
-- Idempotent, additive, and safe to retry on a selected application database.
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

DELIMITER $$

DROP PROCEDURE IF EXISTS riana_20260720_add_column_if_missing $$
CREATE PROCEDURE riana_20260720_add_column_if_missing(IN p_sql TEXT)
BEGIN
  DECLARE duplicate_column CONDITION FOR 1060;
  DECLARE CONTINUE HANDLER FOR duplicate_column BEGIN END;

  SET @riana_sql = p_sql;
  PREPARE stmt FROM @riana_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;
END $$

DROP PROCEDURE IF EXISTS riana_20260720_add_index_if_missing $$
CREATE PROCEDURE riana_20260720_add_index_if_missing(IN p_sql TEXT)
BEGIN
  DECLARE duplicate_key CONDITION FOR 1061;
  DECLARE CONTINUE HANDLER FOR duplicate_key BEGIN END;

  SET @riana_sql = p_sql;
  PREPARE stmt FROM @riana_sql;
  EXECUTE stmt;
  DEALLOCATE PREPARE stmt;
END $$

DELIMITER ;

CALL riana_20260720_add_column_if_missing('ALTER TABLE crms_change_requests ADD COLUMN branch_id VARCHAR(36) NULL AFTER client_id');
CALL riana_20260720_add_column_if_missing('ALTER TABLE crms_change_requests ADD COLUMN department_id VARCHAR(36) NULL AFTER branch_id');
CALL riana_20260720_add_column_if_missing('ALTER TABLE crms_change_requests ADD COLUMN installation_id VARCHAR(36) NULL AFTER department_id');
CALL riana_20260720_add_index_if_missing('ALTER TABLE crms_change_requests ADD INDEX idx_crms_change_requests_scope (client_id, branch_id, department_id)');
CALL riana_20260720_add_index_if_missing('ALTER TABLE crms_change_requests ADD INDEX idx_crms_change_requests_installation (installation_id)');

INSERT IGNORE INTO client_branches
  (id, client_id, branch_name, branch_code, status, notes)
SELECT
  UUID(),
  c.id,
  COALESCE(NULLIF(TRIM(c.branch), ''), 'MAIN'),
  CASE WHEN NULLIF(TRIM(c.branch), '') IS NULL THEN 'MAIN' ELSE NULL END,
  'active',
  'Auto-created primary branch for Developers request scope'
FROM clients c
WHERE NOT EXISTS (
  SELECT 1
  FROM client_branches b
  WHERE CONVERT(b.client_id USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(c.id USING utf8mb4) COLLATE utf8mb4_unicode_ci
    AND b.deleted_at IS NULL
);

DROP PROCEDURE IF EXISTS riana_20260720_add_column_if_missing;
DROP PROCEDURE IF EXISTS riana_20260720_add_index_if_missing;

INSERT INTO migration_history (migration_id, description)
VALUES (
  '20260720_developer_request_scope_submit_fix',
  'Ensures Developers change requests can safely persist client branch and department scope'
)
ON DUPLICATE KEY UPDATE
  description = VALUES(description);

SHOW COLUMNS FROM crms_change_requests LIKE 'branch_id';
SHOW COLUMNS FROM crms_change_requests LIKE 'department_id';
SHOW COLUMNS FROM crms_change_requests LIKE 'installation_id';
SELECT COUNT(*) AS clients_without_branch_rows FROM clients c WHERE NOT EXISTS (SELECT 1 FROM client_branches b WHERE CONVERT(b.client_id USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(c.id USING utf8mb4) COLLATE utf8mb4_unicode_ci AND b.deleted_at IS NULL);
