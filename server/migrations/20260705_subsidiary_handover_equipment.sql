ALTER TABLE subsidiaries
  ADD COLUMN IF NOT EXISTS equipment_configuration JSON NULL AFTER default_escalation_matrix;
