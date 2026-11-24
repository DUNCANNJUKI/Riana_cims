-- Ensure every selectable CIMS/Developers module role exists before user grants.
-- This is additive and safe to re-run through the migration history runner.
INSERT INTO roles (id,module_id,code,name) VALUES
  ('cims:SuperAdmin','cims','SuperAdmin','Super Administrator'),
  ('cims:Admin','cims','Admin','Administrator'),
  ('cims:Management','cims','Management','Management'),
  ('cims:Finance','cims','Finance','Finance'),
  ('cims:Developer','cims','Developer','Developer'),
  ('cims:Teamlead','cims','Teamlead','Team Lead'),
  ('cims:Sales','cims','Sales','Sales'),
  ('cims:User','cims','User','User'),
  ('cims:InventoryOfficer','cims','InventoryOfficer','Inventory Officer'),
  ('crms:SuperAdmin','crms','SuperAdmin','Super Administrator'),
  ('crms:Admin','crms','Admin','Administrator'),
  ('crms:Management','crms','Management','Management'),
  ('crms:Developer','crms','Developer','Developer'),
  ('crms:Teamlead','crms','Teamlead','Team Lead'),
  ('crms:Sales','crms','Sales','Sales')
ON DUPLICATE KEY UPDATE name=VALUES(name);
