DROP INDEX IF EXISTS idx_crms_notifications_type_created ON crms_notifications;

ALTER TABLE crms_notifications
  DROP COLUMN IF EXISTS notification_type;

DROP TABLE IF EXISTS user_sessions;

DELETE FROM migration_history
WHERE migration_id = '20260724_notifications_and_single_sessions';
