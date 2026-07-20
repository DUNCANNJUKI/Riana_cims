-- RIANA CIMS live database update
-- Date: 2026-07-15
-- Feature: Private uploaded-file metadata, variants, and file permissions
-- Safe to rerun. This script adds missing tables and permission rows only.
--
-- BEFORE IMPORTING:
-- 1. Create and verify a full production database backup.
-- 2. Confirm PRIVATE_UPLOAD_ROOT points outside public/build/deployment folders.
-- 3. In phpMyAdmin, select the existing RIANA CIMS production database.
-- 4. Import this file once. It is safe to import again if needed.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS migration_history (
  migration_id VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (migration_id)
);

CREATE TABLE IF NOT EXISTS uploaded_files (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id VARCHAR(36) NULL,
  organization_id VARCHAR(36) NULL,
  branch_id VARCHAR(100) NULL,
  uploaded_by VARCHAR(36) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  relative_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  detected_mime_type VARCHAR(150) NULL,
  extension VARCHAR(20) NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  file_category VARCHAR(100) NOT NULL,
  related_entity_type VARCHAR(100) NULL,
  related_entity_id VARCHAR(64) NULL,
  visibility ENUM('private','organization','public') NOT NULL DEFAULT 'private',
  status ENUM('uploading','processing','active','failed','quarantined','deleted') NOT NULL DEFAULT 'processing',
  checksum_sha256 CHAR(64) NULL,
  image_width INT UNSIGNED NULL,
  image_height INT UNSIGNED NULL,
  original_file_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  deleted_by VARCHAR(36) NULL,
  deletion_reason VARCHAR(500) NULL,
  INDEX idx_file_tenant (tenant_id, id),
  INDEX idx_file_organization (organization_id, id),
  INDEX idx_file_branch (branch_id, id),
  INDEX idx_file_owner (uploaded_by),
  INDEX idx_file_entity (related_entity_type, related_entity_id),
  INDEX idx_file_status (status),
  INDEX idx_file_checksum (checksum_sha256)
);

CREATE TABLE IF NOT EXISTS uploaded_file_variants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_id BIGINT UNSIGNED NOT NULL,
  variant_type ENUM('original','optimized','thumbnail') NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  relative_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_file_variant (file_id, variant_type),
  INDEX idx_uploaded_file_variants_file (file_id)
);

INSERT INTO permissions (id,module_id,code,description) VALUES
  ('files.upload','cims','files.upload','Upload files'),
  ('files.view','cims','files.view','View private files'),
  ('files.download','cims','files.download','Download private files'),
  ('files.delete','cims','files.delete','Delete private files'),
  ('files.restore','cims','files.restore','Restore deleted private files'),
  ('files.replace','cims','files.replace','Replace private files'),
  ('files.manage_all','cims','files.manage_all','Manage all private files')
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  code = VALUES(code);

INSERT IGNORE INTO role_permissions (role_id,permission_id)
SELECT 'cims:SuperAdmin', id FROM permissions WHERE id LIKE 'files.%';

INSERT INTO migration_history (migration_id, description)
VALUES (
  '20260715_private_file_management',
  'Adds private uploaded file metadata, variants, and file permissions'
)
ON DUPLICATE KEY UPDATE
  description = VALUES(description);

SHOW TABLES LIKE 'uploaded_files';
SHOW TABLES LIKE 'uploaded_file_variants';
SHOW INDEX FROM uploaded_files WHERE Key_name IN ('idx_file_organization', 'idx_file_entity', 'idx_file_status', 'idx_file_checksum');
