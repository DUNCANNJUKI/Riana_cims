INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 'cims:HeadOfBusiness', id
FROM permissions
WHERE module_id = 'cims'
  AND code IN (
    'progress.view', 'finances.view', 'inventory.view',
    'inventory.view_reports', 'inventory.export', 'announcements.manage'
  );
