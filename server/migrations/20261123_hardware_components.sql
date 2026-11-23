-- Additive accessory/spare stock and equipment associations. Existing serials are unchanged.
CREATE TABLE IF NOT EXISTS hardware_component_stock (
  id VARCHAR(36) PRIMARY KEY,
  subsidiary_id VARCHAR(36) NOT NULL,
  location_id VARCHAR(36) NOT NULL,
  compatible_model_id VARCHAR(36) NULL,
  item_code VARCHAR(64) NOT NULL,
  item_name VARCHAR(150) NOT NULL,
  unit VARCHAR(20) NOT NULL DEFAULT 'pieces',
  quantity INT UNSIGNED NOT NULL DEFAULT 0,
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_component_stock_code (subsidiary_id,location_id,item_code),
  FOREIGN KEY (subsidiary_id) REFERENCES subsidiaries(id) ON DELETE RESTRICT,
  FOREIGN KEY (location_id) REFERENCES hardware_locations(id) ON DELETE RESTRICT,
  FOREIGN KEY (compatible_model_id) REFERENCES hardware_models(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hardware_asset_components (
  id VARCHAR(36) PRIMARY KEY,
  parent_asset_id VARCHAR(36) NOT NULL,
  component_asset_id VARCHAR(36) NULL,
  stock_item_id VARCHAR(36) NULL,
  relationship ENUM('accessory','spare') NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  slot_label VARCHAR(100) NULL,
  notes VARCHAR(2000) NULL,
  attached_by VARCHAR(36) NOT NULL,
  attached_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removed_by VARCHAR(36) NULL,
  removed_at DATETIME NULL,
  removal_reason VARCHAR(2000) NULL,
  active_component_id VARCHAR(36) GENERATED ALWAYS AS (IF(removed_at IS NULL,component_asset_id,NULL)) STORED,
  UNIQUE KEY uq_active_serial_component (active_component_id),
  INDEX idx_component_parent (parent_asset_id,removed_at),
  INDEX idx_component_stock (stock_item_id,removed_at),
  FOREIGN KEY (parent_asset_id) REFERENCES hardware_assets(id) ON DELETE RESTRICT,
  FOREIGN KEY (component_asset_id) REFERENCES hardware_assets(id) ON DELETE RESTRICT,
  FOREIGN KEY (stock_item_id) REFERENCES hardware_component_stock(id) ON DELETE RESTRICT,
  FOREIGN KEY (attached_by) REFERENCES user_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (removed_by) REFERENCES user_profiles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
