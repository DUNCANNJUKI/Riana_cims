DELETE FROM user_module_roles WHERE role_id IN ('cims:Management','cims:Finance','crms:Management');
UPDATE user_profiles SET role='User' WHERE role IN ('Management','Finance');
DROP TABLE IF EXISTS user_permissions;
DELETE FROM permissions WHERE id IN (
  'clients.view','clients.manage','installations.view','installations.manage','assignments.view','assignments.manage',
  'progress.view','progress.manage','reports.view','finances.view','finances.manage','analytics.view',
  'announcements.manage','import.manage','users.manage','company.manage','subsidiaries.manage','backup.manage'
);
DELETE FROM roles WHERE id IN ('cims:Management','cims:Finance','crms:Management');
ALTER TABLE user_profiles
  MODIFY role ENUM('SuperAdmin','Admin','Developer','Teamlead','Sales','User') NOT NULL;
DELETE FROM migration_history WHERE migration_id='20260627_enterprise_roles_permissions';
