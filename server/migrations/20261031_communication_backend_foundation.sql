-- RIANA CIMS communication backend foundation
-- Additive only. Back up and validate on a production-like database before application.
-- Rollback: disable dependent features first. Preserve these tables until retention and
-- audit obligations are reviewed; do not drop them as part of an application rollback.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS communication_preferences (
  user_id VARCHAR(36) PRIMARY KEY,
  keep_history BOOLEAN NOT NULL DEFAULT FALSE,
  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  message_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  call_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  do_not_disturb BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_hours_start TIME NULL,
  quiet_hours_end TIME NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'Africa/Nairobi',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_communication_preferences_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  endpoint_hash CHAR(64) NOT NULL,
  device_id VARCHAR(80) NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth_secret VARCHAR(255) NOT NULL,
  device_label VARCHAR(120) NULL,
  user_agent VARCHAR(255) NULL,
  expires_at DATETIME NULL,
  last_success_at DATETIME NULL,
  failure_count INT UNSIGNED NOT NULL DEFAULT 0,
  disabled_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_subscription_endpoint (endpoint_hash),
  UNIQUE KEY uq_push_subscription_device (user_id,device_id),
  INDEX idx_push_subscription_user_active (user_id,disabled_at),
  CONSTRAINT fk_push_subscription_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS call_device_sessions (
  id VARCHAR(36) PRIMARY KEY,
  call_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  device_id VARCHAR(80) NOT NULL,
  status ENUM('ringing','accepted','canceled','disconnected','missed') NOT NULL DEFAULT 'ringing',
  accepted_at DATETIME NULL,
  resolved_at DATETIME NULL,
  last_seen_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_call_device_session (call_id,user_id,device_id),
  INDEX idx_call_device_user_status (user_id,status,created_at),
  CONSTRAINT fk_call_device_call FOREIGN KEY (call_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_call_device_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_user_visibility (
  id VARCHAR(36) PRIMARY KEY,
  message_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  hidden_at DATETIME NULL,
  retained_until DATETIME NULL,
  archived_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_message_user_visibility (message_id,user_id),
  INDEX idx_message_visibility_cleanup (user_id,hidden_at,retained_until),
  CONSTRAINT fk_message_visibility_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_message_visibility_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saved_messages (
  id VARCHAR(36) PRIMARY KEY,
  message_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_saved_message_user (message_id,user_id),
  INDEX idx_saved_messages_user_created (user_id,created_at),
  CONSTRAINT fk_saved_message_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_saved_message_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_legal_holds (
  id VARCHAR(36) PRIMARY KEY,
  message_id VARCHAR(36) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  placed_by VARCHAR(36) NULL,
  released_by VARCHAR(36) NULL,
  placed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at DATETIME NULL,
  INDEX idx_message_legal_hold_active (message_id,released_at),
  CONSTRAINT fk_legal_hold_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT fk_legal_hold_placed_by FOREIGN KEY (placed_by) REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_legal_hold_released_by FOREIGN KEY (released_by) REFERENCES user_profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  subscription_id VARCHAR(36) NULL,
  deduplication_key VARCHAR(160) NOT NULL,
  notification_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(36) NULL,
  status ENUM('pending','sent','failed','expired','suppressed') NOT NULL DEFAULT 'pending',
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_error_code VARCHAR(80) NULL,
  delivered_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notification_delivery_dedup (user_id,deduplication_key,subscription_id),
  INDEX idx_notification_delivery_status (status,created_at),
  CONSTRAINT fk_notification_delivery_user FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_delivery_subscription FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO migration_history (migration_id,description)
VALUES ('20261031_communication_backend_foundation','Adds communication preferences, push subscriptions, per-user retention visibility, saved messages, legal holds, and notification deduplication')
ON DUPLICATE KEY UPDATE description = VALUES(description);

