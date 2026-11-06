-- Additive technician-owned installation budgeting. Legacy cost columns and rows remain unchanged.
ALTER TABLE installation_budgets
  ADD COLUMN IF NOT EXISTS client_id VARCHAR(36) NULL AFTER installation_id,
  ADD COLUMN IF NOT EXISTS branch_id VARCHAR(36) NULL AFTER client_id,
  ADD COLUMN IF NOT EXISTS budget_model VARCHAR(30) NOT NULL DEFAULT 'legacy' AFTER branch_id,
  ADD COLUMN IF NOT EXISTS revision_number INT UNSIGNED NOT NULL DEFAULT 1 AFTER budget_model,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE AFTER revision_number,
  ADD COLUMN IF NOT EXISTS supersedes_budget_id VARCHAR(36) NULL AFTER is_current,
  ADD COLUMN IF NOT EXISTS approved_by VARCHAR(36) NULL AFTER created_by,
  ADD COLUMN IF NOT EXISTS approved_at DATETIME NULL AFTER approved_by;

ALTER TABLE installation_budgets
  MODIFY total_budget DECIMAL(15,2) NOT NULL DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_installation_budget_scope ON installation_budgets (client_id, branch_id, installation_id);
CREATE INDEX IF NOT EXISTS idx_installation_budget_current ON installation_budgets (installation_id, budget_model, is_current, revision_number);

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
