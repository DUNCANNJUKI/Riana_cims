-- Release: RIANA-CIMS-CLOUD-PATCH-20261016-212604-EAT
-- Created UTC: 2026-10-16T18:26:04.514Z

-- Component of the reviewed cloud patch, not a standalone migration.
-- This preflight preserves existing role enum values and never changes upload paths.
DELIMITER $$
DROP PROCEDURE IF EXISTS cims_inventory_patch_preflight$$
CREATE PROCEDURE cims_inventory_patch_preflight()
BEGIN
    DECLARE missing_tables INT DEFAULT 0;
    DECLARE incompatible_keys INT DEFAULT 0;
    DECLARE missing_assignment_columns INT DEFAULT 0;
    DECLARE role_type TEXT;
    DECLARE role_default TEXT;
    DECLARE role_nullable VARCHAR(3);

    SELECT 7 - COUNT(*) INTO missing_tables
      FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN (
           'subsidiaries', 'user_profiles', 'clients', 'installations',
           'uploaded_files', 'uploaded_file_variants', 'client_assignments'
       );
    IF missing_tables <> 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Required CIMS tables are missing. Apply base, assignment and private-file migrations first.';
    END IF;

    SELECT 13 - COUNT(*) INTO missing_assignment_columns
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND (
           (TABLE_NAME = 'installations' AND COLUMN_NAME IN (
               'client_id', 'branch_id', 'department_id', 'assigned_technician_id',
               'hardware_technician_id', 'software_technician_id'
           )) OR
           (TABLE_NAME = 'client_assignments' AND COLUMN_NAME IN (
               'installation_id', 'client_id', 'branch_id', 'department_id',
               'hardware_technician_id', 'software_technician_id', 'branch'
           ))
       );
    IF missing_assignment_columns <> 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Assignment scope columns are missing. Apply the client branch/department migrations first.';
    END IF;

    SELECT COUNT(*) INTO incompatible_keys
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN ('subsidiaries', 'user_profiles', 'clients', 'installations')
       AND COLUMN_NAME = 'id'
       AND (COLUMN_TYPE <> 'varchar(36)' OR COLLATION_NAME <> 'utf8mb4_unicode_ci');
    IF incompatible_keys <> 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Parent ID types/collations differ. Review foreign keys before applying the hardware schema.';
    END IF;

    SELECT COLUMN_TYPE, COLUMN_DEFAULT, IS_NULLABLE INTO role_type,role_default,role_nullable
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'user_profiles' AND COLUMN_NAME = 'role';
    IF role_type NOT LIKE 'enum(%' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'User roles are not ENUM; manual compatibility review is required.';
    END IF;
    IF LOCATE('''InventoryOfficer''', role_type) = 0 THEN
        SET @cims_role_ddl = CONCAT(
            'ALTER TABLE user_profiles MODIFY role ',
            LEFT(role_type, LENGTH(role_type) - 1),
            ',''InventoryOfficer'')',
            IF(role_nullable='YES',' NULL',' NOT NULL'),
            IF(role_default IS NULL,'',CONCAT(' DEFAULT ',IF(LOCATE('MariaDB',VERSION())>0,role_default,QUOTE(role_default))))
        );
        PREPARE cims_role_statement FROM @cims_role_ddl;
        EXECUTE cims_role_statement;
        DEALLOCATE PREPARE cims_role_statement;
    END IF;
END$$
CALL cims_inventory_patch_preflight()$$
DROP PROCEDURE cims_inventory_patch_preflight$$
DELIMITER ;

-- Serialized hardware schema; existing data and counters are retained.
-- Additive migration. Back up the database and apply during an approved rollout.
-- Do not drop these tables on rollback after any serial has been issued.

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

-- All equipment, including kiosks, is optional unless configured per subsidiary.
CREATE TABLE IF NOT EXISTS hardware_equipment_requirements (
  subsidiary_id VARCHAR(36) NOT NULL,
  equipment_field VARCHAR(64) NOT NULL,
  serial_required BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by VARCHAR(36) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (subsidiary_id,equipment_field),
  FOREIGN KEY (subsidiary_id) REFERENCES subsidiaries(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by) REFERENCES user_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS migration_history (migration_id VARCHAR(100) PRIMARY KEY, description VARCHAR(255) NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO migration_history (migration_id,description) VALUES ('20261012_hardware_inventory','Serialized hardware schema'),('20261014_equipment_serial_requirements','Configurable subsidiary serial requirements') ON DUPLICATE KEY UPDATE description=VALUES(description);

-- Hybrid equipment storage, retaining all built-in installation values.
-- Additive hybrid equipment storage. Existing built-in columns remain unchanged.
DELIMITER $$
DROP PROCEDURE IF EXISTS cims_add_hybrid_equipment$$
CREATE PROCEDURE cims_add_hybrid_equipment()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='installations'
          AND COLUMN_NAME='equipment_quantities'
    ) THEN
        ALTER TABLE installations ADD COLUMN equipment_quantities JSON NULL;
    END IF;
END$$
CALL cims_add_hybrid_equipment()$$
DROP PROCEDURE cims_add_hybrid_equipment$$
DELIMITER ;

INSERT INTO migration_history (migration_id,description) VALUES ('20261015_hybrid_equipment','Hybrid configurable equipment quantities') ON DUPLICATE KEY UPDATE description=VALUES(description);

-- Additive update. Variant deletion retains a tombstone so seed replay cannot restore it.
DELIMITER $$
DROP PROCEDURE IF EXISTS cims_inventory_operations_upgrade$$
CREATE PROCEDURE cims_inventory_operations_upgrade()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
        AND TABLE_NAME='hardware_variants' AND COLUMN_NAME='deleted_at') THEN
        ALTER TABLE hardware_variants ADD COLUMN deleted_at DATETIME NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
        AND TABLE_NAME='uploaded_files' AND INDEX_NAME='idx_handover_identity') THEN
        ALTER TABLE uploaded_files ADD INDEX idx_handover_identity
            (related_entity_type,related_entity_id,file_category,checksum_sha256);
    END IF;
END$$
CALL cims_inventory_operations_upgrade()$$
DROP PROCEDURE cims_inventory_operations_upgrade$$
DELIMITER ;

INSERT INTO migration_history (migration_id,description) VALUES ('20261016_inventory_operations','Variant dependency safety and handover identity lookup') ON DUPLICATE KEY UPDATE description=VALUES(description);

-- Additive scheduling; no historical date conversions.
-- Additive scheduling layer. Legacy dates, actuals, inventory and handovers are unchanged.
CREATE TABLE IF NOT EXISTS scheduling_series (
 id VARCHAR(36) PRIMARY KEY,
 subsidiary_id VARCHAR(36) NOT NULL,
 rule_configuration JSON NOT NULL,
 time_zone VARCHAR(100) NOT NULL,
 created_by VARCHAR(36) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS scheduling_policies (
 scope_key VARCHAR(100) PRIMARY KEY,
 configuration JSON NOT NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 updated_by VARCHAR(36) NOT NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS scheduling_policy_history (
 id VARCHAR(36) PRIMARY KEY,
 scope_key VARCHAR(100) NOT NULL,
 actor_id VARCHAR(36) NOT NULL,
 previous_values JSON NOT NULL,
 next_values JSON NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY idx_schedule_policy_history(scope_key,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS scheduling_events (
 id VARCHAR(36) PRIMARY KEY,
 subsidiary_id VARCHAR(36) NOT NULL,
 branch_id VARCHAR(36) NULL,
 activity_type VARCHAR(30) NOT NULL,
 activity_id VARCHAR(36) NULL,
 title VARCHAR(160) NOT NULL,
 start_utc DATETIME(6) NOT NULL,
 end_utc DATETIME(6) NOT NULL,
 time_zone VARCHAR(100) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
 version INT UNSIGNED NOT NULL DEFAULT 1,
 buffer_minutes INT UNSIGNED NOT NULL DEFAULT 0,
 policy_snapshot JSON NOT NULL,
 series_id VARCHAR(36) NULL,
 occurrence_local VARCHAR(30) NULL,
 created_by VARCHAR(36) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_schedule_occurrence (series_id,occurrence_local),
 KEY idx_schedule_scope (subsidiary_id,start_utc,end_utc),
 KEY idx_schedule_activity (activity_type,activity_id),
 KEY idx_schedule_series (series_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS scheduling_resources (
 event_id VARCHAR(36) NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 PRIMARY KEY(event_id,user_id), KEY idx_schedule_resource(user_id,event_id),
 CONSTRAINT fk_schedule_resource_event FOREIGN KEY(event_id) REFERENCES scheduling_events(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS scheduling_history (
 id VARCHAR(36) PRIMARY KEY,
 event_id VARCHAR(36) NOT NULL,
 actor_id VARCHAR(36) NOT NULL,
 reason VARCHAR(500) NOT NULL,
 previous_values JSON NULL,
 next_values JSON NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY idx_schedule_history(event_id,created_at),
 CONSTRAINT fk_schedule_history_event FOREIGN KEY(event_id) REFERENCES scheduling_events(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS scheduling_requests (
 actor_id VARCHAR(36) NOT NULL,
 request_key VARCHAR(80) NOT NULL,
 payload_hash CHAR(64) NOT NULL,
 result JSON NULL,
 PRIMARY KEY(actor_id,request_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS scheduling_jobs (
 id VARCHAR(190) PRIMARY KEY,
 event_id VARCHAR(36) NOT NULL,
 event_version INT UNSIGNED NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 kind VARCHAR(20) NOT NULL,
 due_utc DATETIME(6) NOT NULL,
 state VARCHAR(20) NOT NULL DEFAULT 'pending',
 attempts INT UNSIGNED NOT NULL DEFAULT 0,
 last_error VARCHAR(100) NULL,
 KEY idx_schedule_job_due(state,due_utc),
 CONSTRAINT fk_schedule_job_event FOREIGN KEY(event_id) REFERENCES scheduling_events(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO migration_history (migration_id,description) VALUES ('20261016_scheduling','Scoped scheduling, calendars and durable in-app reminders') ON DUPLICATE KEY UPDATE description=VALUES(description);
