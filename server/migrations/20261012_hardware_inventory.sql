-- Additive migration. Back up the database and apply during an approved rollout.
-- Do not drop these tables on rollback after any serial has been issued.
ALTER TABLE user_profiles MODIFY role ENUM('SuperAdmin','Admin','Management','Finance','Developer','Teamlead','Sales','User','InventoryOfficer') NOT NULL;

CREATE TABLE IF NOT EXISTS hardware_policy (
  id TINYINT PRIMARY KEY,
  sequence_partition VARCHAR(30) NOT NULL DEFAULT 'per_model_year',
  issuance_approved BOOLEAN NOT NULL DEFAULT FALSE,
  field_approval_required BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by VARCHAR(36) NULL,
  approved_at DATETIME NULL,
  approval_reference VARCHAR(255) NULL,
  FOREIGN KEY (approved_by) REFERENCES user_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO hardware_policy (id) VALUES (1);

CREATE TABLE IF NOT EXISTS hardware_variants (
  id VARCHAR(20) PRIMARY KEY,
  family VARCHAR(8) NOT NULL,
  variant VARCHAR(4) NOT NULL,
  nickname VARCHAR(50) NOT NULL,
  description VARCHAR(150) NOT NULL,
  retired BOOLEAN NOT NULL DEFAULT FALSE,
  policy_source VARCHAR(50) NOT NULL,
  UNIQUE KEY uq_hardware_variant (family,variant)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO hardware_variants (id,family,variant,nickname,description,retired,policy_source) VALUES
 ('QMS-C','QMS','C','Wave','Curved QMS Kiosk',FALSE,'Marezi guide'),
 ('QMS-E','QMS','E','Edge','Flat QMS Kiosk',TRUE,'Marezi guide'),
 ('QMS-W','QMS','W','Anchor','Wall Mount QMS Kiosk',FALSE,'Marezi guide'),
 ('SSK-R','SSK','R','Vault','SSK with Cash Recycler',FALSE,'Marezi guide'),
 ('SSK-S','SSK','S','Lite','SSK without Cash Recycler',FALSE,'Marezi guide'),
 ('DS-T','DS','T','Tap','Touch Digital Signage',FALSE,'Marezi guide'),
 ('DS-N','DS','N','Glow','Non-touch Digital Signage',FALSE,'Marezi guide'),
 ('FBT-K','FBT','K','Pulse','Feedback Terminal',FALSE,'Marezi guide'),
 ('LED-D','LED','D','Beacon','LED Display',FALSE,'Marezi guide'),
 ('MC-M','MC','M','Core','Media Controller',FALSE,'CIMS approved extension');

CREATE TABLE IF NOT EXISTS hardware_model_counters (
  variant_id VARCHAR(20) NOT NULL,
  model_year SMALLINT UNSIGNED NOT NULL,
  next_sequence INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (variant_id,model_year),
  FOREIGN KEY (variant_id) REFERENCES hardware_variants(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS hardware_models (
  id VARCHAR(36) PRIMARY KEY,
  variant_id VARCHAR(20) NOT NULL,
  model_year SMALLINT UNSIGNED NOT NULL,
  model_sequence INT UNSIGNED NOT NULL,
  model_number VARCHAR(100) NOT NULL UNIQUE,
  approval_status ENUM('Pending','Approved','Rejected','Retired') NOT NULL DEFAULT 'Pending',
  historical_only BOOLEAN NOT NULL DEFAULT FALSE,
  specifications JSON NULL,
  submitted_by VARCHAR(36) NOT NULL,
  approved_by VARCHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_hardware_model_code (variant_id,model_year,model_sequence),
  FOREIGN KEY (variant_id) REFERENCES hardware_variants(id) ON DELETE RESTRICT,
  FOREIGN KEY (submitted_by) REFERENCES user_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (approved_by) REFERENCES user_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS hardware_locations (
  id VARCHAR(36) PRIMARY KEY,
  subsidiary_id VARCHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_hardware_location (subsidiary_id,name),
  FOREIGN KEY (subsidiary_id) REFERENCES subsidiaries(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS hardware_sequences (
  model_id VARCHAR(36) NOT NULL,
  serial_year SMALLINT UNSIGNED NOT NULL,
  next_sequence INT UNSIGNED NOT NULL DEFAULT 1001,
  PRIMARY KEY (model_id,serial_year),
  FOREIGN KEY (model_id) REFERENCES hardware_models(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS hardware_assets (
  id VARCHAR(36) PRIMARY KEY,
  serial_number VARCHAR(100) NULL UNIQUE,
  model_id VARCHAR(36) NOT NULL,
  subsidiary_id VARCHAR(36) NOT NULL,
  manufacturing_year SMALLINT UNSIGNED NULL,
  serial_year SMALLINT UNSIGNED NULL,
  manufacturer_serial VARCHAR(150) NULL,
  manufacturer_serial_key VARCHAR(150) NULL UNIQUE,
  status ENUM('Generated','Available','Reserved','Assigned','Installed','Faulty','Under Maintenance','In Transit','Returned','Retired','Disposed') NOT NULL DEFAULT 'Generated',
  condition_grade ENUM('New','Good','Fair','Poor','Unserviceable') NULL DEFAULT NULL,
  approval_status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Approved',
  physical_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by VARCHAR(36) NULL,
  verified_at DATETIME NULL,
  location_id VARCHAR(36) NULL,
  custodian_id VARCHAR(36) NULL,
  installation_id VARCHAR(36) NULL,
  registration_source ENUM('Inventory','Field','Legacy','Import','Draft') NOT NULL DEFAULT 'Inventory',
  reconciliation_status ENUM('Unverified','Matched','Missing','Discrepancy') NOT NULL DEFAULT 'Unverified',
  warranty_expires DATE NULL,
  notes TEXT NULL,
  issued_by VARCHAR(36) NULL,
  issued_at DATETIME NULL,
  registered_by VARCHAR(36) NOT NULL,
  archived_at DATETIME NULL,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_hardware_stock (subsidiary_id,status,physical_verified,approval_status),
  INDEX idx_hardware_installation (installation_id),
  FOREIGN KEY (model_id) REFERENCES hardware_models(id) ON DELETE RESTRICT,
  FOREIGN KEY (subsidiary_id) REFERENCES subsidiaries(id) ON DELETE RESTRICT,
  FOREIGN KEY (location_id) REFERENCES hardware_locations(id) ON DELETE RESTRICT,
  FOREIGN KEY (custodian_id) REFERENCES user_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE RESTRICT,
  FOREIGN KEY (verified_by) REFERENCES user_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (issued_by) REFERENCES user_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (registered_by) REFERENCES user_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS hardware_assignments (
  id VARCHAR(36) PRIMARY KEY,
  asset_id VARCHAR(36) NOT NULL,
  installation_id VARCHAR(36) NULL,
  technician_id VARCHAR(36) NULL,
  assigned_by VARCHAR(36) NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  installed_at DATETIME NULL,
  closed_at DATETIME NULL,
  reservation_expires_at DATETIME NULL,
  configuration JSON NULL,
  active_asset_id VARCHAR(36) GENERATED ALWAYS AS (IF(closed_at IS NULL,asset_id,NULL)) STORED,
  UNIQUE KEY uq_hardware_active_assignment (active_asset_id),
  FOREIGN KEY (asset_id) REFERENCES hardware_assets(id) ON DELETE RESTRICT,
  FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE RESTRICT,
  FOREIGN KEY (technician_id) REFERENCES user_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_by) REFERENCES user_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS hardware_events (
  id VARCHAR(36) PRIMARY KEY,
  asset_id VARCHAR(36) NULL,
  model_id VARCHAR(36) NULL,
  subsidiary_id VARCHAR(36) NULL,
  action VARCHAR(60) NOT NULL,
  actor_id VARCHAR(36) NOT NULL,
  details JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_hardware_timeline (asset_id,created_at),
  INDEX idx_hardware_events_scope (subsidiary_id,action,created_at),
  FOREIGN KEY (asset_id) REFERENCES hardware_assets(id) ON DELETE RESTRICT,
  FOREIGN KEY (model_id) REFERENCES hardware_models(id) ON DELETE RESTRICT,
  FOREIGN KEY (subsidiary_id) REFERENCES subsidiaries(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_id) REFERENCES user_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS hardware_requests (
  actor_id VARCHAR(36) NOT NULL,
  request_key VARCHAR(100) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (actor_id,request_key),
  FOREIGN KEY (actor_id) REFERENCES user_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS hardware_handover_snapshots (
  installation_id VARCHAR(36) PRIMARY KEY,
  hardware JSON NOT NULL,
  captured_by VARCHAR(36) NOT NULL,
  captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (installation_id) REFERENCES installations(id) ON DELETE RESTRICT,
  FOREIGN KEY (captured_by) REFERENCES user_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS hardware_reconciliations (
  id VARCHAR(36) PRIMARY KEY,
  subsidiary_id VARCHAR(36) NOT NULL,
  location_id VARCHAR(36) NOT NULL,
  performed_by VARCHAR(36) NOT NULL,
  results JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subsidiary_id) REFERENCES subsidiaries(id) ON DELETE RESTRICT,
  FOREIGN KEY (location_id) REFERENCES hardware_locations(id) ON DELETE RESTRICT,
  FOREIGN KEY (performed_by) REFERENCES user_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS hardware_alert_rules (
  id VARCHAR(36) PRIMARY KEY,
  subsidiary_id VARCHAR(36) NOT NULL,
  model_id VARCHAR(36) NOT NULL,
  location_id VARCHAR(36) NOT NULL,
  minimum_stock INT UNSIGNED NOT NULL DEFAULT 0,
  warranty_days INT UNSIGNED NOT NULL DEFAULT 30,
  aging_days INT UNSIGNED NOT NULL DEFAULT 90,
  configured_by VARCHAR(36) NOT NULL,
  UNIQUE KEY uq_hardware_alert_rule (subsidiary_id,model_id,location_id),
  FOREIGN KEY (subsidiary_id) REFERENCES subsidiaries(id) ON DELETE RESTRICT,
  FOREIGN KEY (model_id) REFERENCES hardware_models(id) ON DELETE RESTRICT,
  FOREIGN KEY (location_id) REFERENCES hardware_locations(id) ON DELETE RESTRICT,
  FOREIGN KEY (configured_by) REFERENCES user_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
