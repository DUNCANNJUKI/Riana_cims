CREATE TABLE IF NOT EXISTS crms_affected_modules (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_crms_affected_module_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crms_affected_module_events (
  id VARCHAR(36) PRIMARY KEY,
  module_id VARCHAR(36) NOT NULL,
  actor_user_id VARCHAR(36) NOT NULL,
  action VARCHAR(20) NOT NULL,
  previous_values JSON NULL,
  next_values JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_module_events (module_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO crms_affected_modules (id, name, sort_order) VALUES
  ('a7b00000-0000-4000-8000-000000000001', 'Authentication', 10), ('a7b00000-0000-4000-8000-000000000002', 'User Management', 20),
  ('a7b00000-0000-4000-8000-000000000003', 'Security', 30), ('a7b00000-0000-4000-8000-000000000004', 'Reporting', 40),
  ('a7b00000-0000-4000-8000-000000000005', 'Analytics', 50), ('a7b00000-0000-4000-8000-000000000006', 'Data Export', 60),
  ('a7b00000-0000-4000-8000-000000000007', 'Payment Gateway', 70), ('a7b00000-0000-4000-8000-000000000008', 'Transaction Processing', 80),
  ('a7b00000-0000-4000-8000-000000000009', 'HR Portal', 90), ('a7b00000-0000-4000-8000-00000000000a', 'Leave Management', 100),
  ('a7b00000-0000-4000-8000-00000000000b', 'Timesheets', 110), ('a7b00000-0000-4000-8000-00000000000c', 'Inventory', 120),
  ('a7b00000-0000-4000-8000-00000000000d', 'ERP Integration', 130), ('a7b00000-0000-4000-8000-00000000000e', 'Stock Management', 140),
  ('a7b00000-0000-4000-8000-00000000000f', 'Dashboard', 150), ('a7b00000-0000-4000-8000-000000000010', 'Notifications', 160);

INSERT INTO migration_history (migration_id, description)
VALUES ('20261123_affected_module_catalog', 'Shared affected-module catalogue with versioning and management audit')
ON DUPLICATE KEY UPDATE description = VALUES(description);
