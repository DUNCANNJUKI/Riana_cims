ALTER TABLE user_profiles
  MODIFY role ENUM('SuperAdmin','Admin','Management','Finance','Developer','Teamlead','Sales','User','InventoryOfficer','HeadOfBusiness') NOT NULL;

INSERT INTO roles (id,module_id,code,name)
VALUES ('cims:HeadOfBusiness','cims','HeadOfBusiness','Head of Business')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT IGNORE INTO role_permissions (role_id,permission_id)
SELECT 'cims:HeadOfBusiness', id FROM permissions
WHERE module_id='cims' AND code IN ('clients.view','clients.manage','installations.view','assignments.view','reports.view','analytics.view');

INSERT IGNORE INTO role_permissions (role_id,permission_id)
SELECT 'cims:InventoryOfficer', id FROM permissions
WHERE module_id='cims' AND code='inventory.cross_subsidiary';
