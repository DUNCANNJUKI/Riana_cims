-- Additive technician-owned installation budgeting. Legacy cost columns and rows remain unchanged.

DELIMITER $$

DROP PROCEDURE IF EXISTS riana_add_budget_col_if_missing $$
CREATE PROCEDURE riana_add_budget_col_if_missing(
  IN p_column VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  DECLARE duplicate_column CONDITION FOR 1060;
  DECLARE CONTINUE HANDLER FOR duplicate_column BEGIN END;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'installation_budgets' AND COLUMN_NAME = p_column
  ) THEN
    SET @riana_sql = CONCAT('ALTER TABLE installation_budgets ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE riana_stmt FROM @riana_sql;
    EXECUTE riana_stmt;
    DEALLOCATE PREPARE riana_stmt;
  END IF;
END $$

DROP PROCEDURE IF EXISTS riana_add_budget_idx_if_missing $$
CREATE PROCEDURE riana_add_budget_idx_if_missing(
  IN p_index VARCHAR(64),
  IN p_columns VARCHAR(255)
)
BEGIN
  DECLARE duplicate_key CONDITION FOR 1061;
  DECLARE CONTINUE HANDLER FOR duplicate_key BEGIN END;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'installation_budgets' AND INDEX_NAME = p_index
  ) THEN
    SET @riana_sql = CONCAT('CREATE INDEX `', p_index, '` ON installation_budgets (', p_columns, ')');
    PREPARE riana_stmt FROM @riana_sql;
    EXECUTE riana_stmt;
    DEALLOCATE PREPARE riana_stmt;
  END IF;
END $$

DELIMITER ;

CALL riana_add_budget_col_if_missing('client_id', 'VARCHAR(36) NULL');
CALL riana_add_budget_col_if_missing('branch_id', 'VARCHAR(36) NULL');
CALL riana_add_budget_col_if_missing('budget_model', 'VARCHAR(30) NOT NULL DEFAULT \'legacy\'');
CALL riana_add_budget_col_if_missing('revision_number', 'INT UNSIGNED NOT NULL DEFAULT 1');
CALL riana_add_budget_col_if_missing('is_current', 'BOOLEAN NOT NULL DEFAULT TRUE');
CALL riana_add_budget_col_if_missing('supersedes_budget_id', 'VARCHAR(36) NULL');
CALL riana_add_budget_col_if_missing('approved_by', 'VARCHAR(36) NULL');
CALL riana_add_budget_col_if_missing('approved_at', 'DATETIME NULL');

ALTER TABLE installation_budgets
  MODIFY total_budget DECIMAL(15,2) NOT NULL DEFAULT 0.00;

CALL riana_add_budget_idx_if_missing('idx_installation_budget_scope', 'client_id, branch_id, installation_id');
CALL riana_add_budget_idx_if_missing('idx_installation_budget_current', 'installation_id, budget_model, is_current, revision_number');

DROP PROCEDURE IF EXISTS riana_add_budget_col_if_missing;
DROP PROCEDURE IF EXISTS riana_add_budget_idx_if_missing;

CREATE TABLE IF NOT EXISTS installation_budget_technician_expenses (
  id VARCHAR(36) PRIMARY KEY,
  budget_id VARCHAR(36) NOT NULL,
  technician_id VARCHAR(36) NOT NULL,
  accommodation_cost DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  transport_cost DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  meals_cost DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  other_expenses DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  technician_total DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  expense_notes VARCHAR(1000) NULL,
  technician_name_snapshot VARCHAR(201) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_budget_technician (budget_id, technician_id),
  INDEX idx_budget_expense_technician (technician_id, budget_id),
  CONSTRAINT fk_budget_expense_budget FOREIGN KEY (budget_id) REFERENCES installation_budgets(id) ON DELETE CASCADE,
  CONSTRAINT fk_budget_expense_technician FOREIGN KEY (technician_id) REFERENCES user_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS installation_budget_audit (
  id VARCHAR(36) PRIMARY KEY,
  budget_id VARCHAR(36) NOT NULL,
  installation_id VARCHAR(36) NOT NULL,
  action VARCHAR(30) NOT NULL,
  actor_id VARCHAR(36) NULL,
  revision_number INT UNSIGNED NOT NULL,
  total_budget DECIMAL(15,2) NOT NULL,
  change_summary JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_budget_audit_budget (budget_id, created_at),
  INDEX idx_budget_audit_installation (installation_id, created_at),
  CONSTRAINT fk_budget_audit_budget FOREIGN KEY (budget_id) REFERENCES installation_budgets(id) ON DELETE RESTRICT,
  CONSTRAINT fk_budget_audit_actor FOREIGN KEY (actor_id) REFERENCES user_profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO migration_history (migration_id, description)
VALUES ('20261102_technician_installation_budgets', 'Adds precise technician expense budgets, revisions, scope indexes, and audit history')
ON DUPLICATE KEY UPDATE description = VALUES(description);
