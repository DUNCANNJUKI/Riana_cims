ALTER TABLE user_profiles
  MODIFY role ENUM('SuperAdmin','Admin','Management','Finance','Developer','Teamlead','Sales','User') NOT NULL;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS tagline VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS website VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS email VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS phone VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS address TEXT NULL,
  ADD COLUMN IF NOT EXISTS contract_durations JSON NULL,
  ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'Africa/Nairobi',
  ADD COLUMN IF NOT EXISTS date_format VARCHAR(30) DEFAULT 'DD/MM/YYYY',
  ADD COLUMN IF NOT EXISTS enable_email_notifications BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS enable_sms_notifications BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS enable_push_notifications BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS auto_reminder_days SMALLINT UNSIGNED DEFAULT 3;

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id VARCHAR(36) NOT NULL,
  permission_id VARCHAR(100) NOT NULL,
  granted_by VARCHAR(36),
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_id),
  INDEX idx_user_permissions_permission (permission_id),
  CONSTRAINT fk_user_permissions_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_permissions_grantor FOREIGN KEY (granted_by) REFERENCES user_profiles(id) ON DELETE SET NULL
);

INSERT INTO roles (id,module_id,code,name) VALUES
  ('cims:Management','cims','Management','Management'),
  ('cims:Finance','cims','Finance','Finance'),
  ('crms:Management','crms','Management','Management')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO permissions (id,module_id,code,description) VALUES
  ('clients.view','cims','clients.view','View clients'),
  ('clients.manage','cims','clients.manage','Add, edit, and delete clients'),
  ('installations.view','cims','installations.view','View installations'),
  ('installations.manage','cims','installations.manage','Add, edit, and update installations'),
  ('assignments.view','cims','assignments.view','View assigned technicians'),
  ('assignments.manage','cims','assignments.manage','Assign technicians and update assignments'),
  ('progress.view','cims','progress.view','View installation progress'),
  ('progress.manage','cims','progress.manage','Update installation progress'),
  ('reports.view','cims','reports.view','Preview and download all reports'),
  ('finances.view','cims','finances.view','View installation budgets'),
  ('finances.manage','cims','finances.manage','Add, edit, and delete installation budgets'),
  ('analytics.view','cims','analytics.view','View analytics'),
  ('announcements.manage','cims','announcements.manage','Manage announcements'),
  ('import.manage','cims','import.manage','Import system data'),
  ('users.manage','cims','users.manage','Manage non-privileged users'),
  ('company.manage','cims','company.manage','Manage company settings and branding'),
  ('subsidiaries.manage','cims','subsidiaries.manage','Manage subsidiaries'),
  ('backup.manage','cims','backup.manage','View and create database backups')
ON DUPLICATE KEY UPDATE description=VALUES(description);

INSERT INTO user_module_roles (user_id,module_id,role_id)
SELECT id,'cims',CONCAT('cims:',role) FROM user_profiles WHERE role IN ('Management','Finance')
ON DUPLICATE KEY UPDATE role_id=VALUES(role_id);

INSERT INTO user_module_roles (user_id,module_id,role_id)
SELECT id,'crms','crms:Management' FROM user_profiles WHERE role='Management'
ON DUPLICATE KEY UPDATE role_id=VALUES(role_id);

INSERT INTO migration_history (migration_id,description)
VALUES ('20260627_enterprise_roles_permissions','Finance and Management roles with direct per-user capability grants')
ON DUPLICATE KEY UPDATE description=VALUES(description);
