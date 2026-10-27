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
