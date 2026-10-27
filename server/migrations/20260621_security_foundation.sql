ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS session_version INT UNSIGNED NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS migration_history (
  migration_id VARCHAR(100) PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS modules (
  id VARCHAR(32) PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(80) PRIMARY KEY,
  module_id VARCHAR(32) NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_roles_module_code (module_id, code),
  CONSTRAINT fk_roles_module FOREIGN KEY (module_id) REFERENCES modules(id)
);

CREATE TABLE IF NOT EXISTS permissions (
  id VARCHAR(100) PRIMARY KEY,
  module_id VARCHAR(32) NOT NULL,
  code VARCHAR(80) NOT NULL,
  description VARCHAR(255) NOT NULL,
  UNIQUE KEY uq_permissions_module_code (module_id, code),
  CONSTRAINT fk_permissions_module FOREIGN KEY (module_id) REFERENCES modules(id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id VARCHAR(80) NOT NULL,
  permission_id VARCHAR(100) NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_module_roles (
  user_id VARCHAR(36) NOT NULL,
  module_id VARCHAR(32) NOT NULL,
  role_id VARCHAR(80) NOT NULL,
  granted_by VARCHAR(36),
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, module_id),
  INDEX idx_user_module_roles_role (role_id),
  CONSTRAINT fk_user_module_roles_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_module_roles_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_module_roles_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_user_module_roles_grantor FOREIGN KEY (granted_by) REFERENCES user_profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS security_settings (
  id TINYINT UNSIGNED PRIMARY KEY,
  inactivity_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  warning_seconds SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  sensitive_rate_limit SMALLINT UNSIGNED NOT NULL DEFAULT 20,
  sensitive_rate_window_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  updated_by VARCHAR(36),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_security_settings_user FOREIGN KEY (updated_by) REFERENCES user_profiles(id) ON DELETE SET NULL
);

INSERT INTO modules (id,code,name) VALUES
  ('cims','cims','Client Installation Management'),
  ('crms','crms','Change Request Management')
ON DUPLICATE KEY UPDATE name=VALUES(name),is_active=TRUE;

INSERT INTO roles (id,module_id,code,name) VALUES
  ('cims:Admin','cims','Admin','Administrator'),('cims:Teamlead','cims','Teamlead','Team Lead'),
  ('cims:Developer','cims','Developer','Developer'),('cims:Sales','cims','Sales','Sales'),('cims:User','cims','User','User'),
  ('crms:Admin','crms','Admin','Administrator'),('crms:Teamlead','crms','Teamlead','Team Lead'),
  ('crms:Developer','crms','Developer','Developer'),('crms:Sales','crms','Sales','Sales')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO permissions (id,module_id,code,description) VALUES
  ('cims:read','cims','read','Read permitted CIMS records'),
  ('cims:manage','cims','manage','Manage CIMS operational records'),
  ('cims:admin','cims','admin','Manage CIMS users and settings'),
  ('cims:backup.manage','cims','backup.manage','View, schedule, and create verified backups'),
  ('crms:read','crms','read','Read permitted change requests'),
  ('crms:create','crms','create','Create change requests'),
  ('crms:assign','crms','assign','Assign and schedule change requests'),
  ('crms:approve','crms','approve','Approve or reject change requests'),
  ('crms:implement','crms','implement','Update assigned implementation work'),
  ('crms:admin','crms','admin','Manage CRMS users and settings')
ON DUPLICATE KEY UPDATE description=VALUES(description);

INSERT IGNORE INTO role_permissions (role_id,permission_id) VALUES
  ('cims:Admin','cims:read'),('cims:Admin','cims:manage'),('cims:Admin','cims:admin'),('cims:Admin','cims:backup.manage'),
  ('cims:Teamlead','cims:read'),('cims:Teamlead','cims:manage'),('cims:Developer','cims:read'),('cims:Sales','cims:read'),('cims:User','cims:read'),
  ('crms:Admin','crms:read'),('crms:Admin','crms:create'),('crms:Admin','crms:assign'),('crms:Admin','crms:approve'),('crms:Admin','crms:implement'),('crms:Admin','crms:admin'),
  ('crms:Teamlead','crms:read'),('crms:Teamlead','crms:create'),('crms:Teamlead','crms:assign'),('crms:Teamlead','crms:implement'),
  ('crms:Developer','crms:read'),('crms:Developer','crms:implement'),
  ('crms:Sales','crms:read'),('crms:Sales','crms:create'),('crms:Sales','crms:approve');

INSERT INTO user_module_roles (user_id,module_id,role_id)
SELECT id,'cims',CONCAT('cims:',role) FROM user_profiles
ON DUPLICATE KEY UPDATE role_id=VALUES(role_id);

INSERT INTO user_module_roles (user_id,module_id,role_id)
SELECT id,'crms',CONCAT('crms:',role) FROM user_profiles WHERE role IN ('Admin','Teamlead','Developer','Sales')
ON DUPLICATE KEY UPDATE role_id=VALUES(role_id);

INSERT INTO security_settings (id) VALUES (1) ON DUPLICATE KEY UPDATE id=id;

INSERT INTO migration_history (migration_id,description)
VALUES ('20260621_security_foundation','Unified module RBAC, session revocation, security settings, and audit events')
ON DUPLICATE KEY UPDATE description=VALUES(description);

CREATE TABLE IF NOT EXISTS security_audit_events (
  id CHAR(36) PRIMARY KEY,
  actor_user_id VARCHAR(36),
  module VARCHAR(32) NOT NULL,
  action VARCHAR(100) NOT NULL,
  outcome ENUM('success','failure') NOT NULL DEFAULT 'success',
  source_ip VARCHAR(45),
  details JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_security_audit_actor_created (actor_user_id, created_at),
  INDEX idx_security_audit_action_created (action, created_at),
  CONSTRAINT fk_security_audit_actor FOREIGN KEY (actor_user_id)
    REFERENCES user_profiles(id) ON DELETE SET NULL
);
