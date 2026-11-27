ALTER TABLE messages ADD COLUMN call_organizer_id VARCHAR(36) NULL;
ALTER TABLE call_device_sessions ADD COLUMN meeting_heartbeat_at DATETIME NULL;
ALTER TABLE call_device_sessions ADD INDEX idx_meeting_presence (status, meeting_heartbeat_at, call_id);

CREATE TABLE IF NOT EXISTS scheduled_meetings (
  id VARCHAR(36) PRIMARY KEY,
  organizer_id VARCHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL,
  call_type ENUM('audio', 'video') NOT NULL,
  starts_at DATETIME NOT NULL,
  status ENUM('scheduled', 'started', 'cancelled') NOT NULL DEFAULT 'scheduled',
  call_id VARCHAR(36) NULL,
  INDEX idx_scheduled_meetings_organizer (organizer_id, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scheduled_meeting_participants (
  meeting_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  PRIMARY KEY (meeting_id, user_id),
  INDEX idx_scheduled_meeting_participants_user (user_id, meeting_id),
  CONSTRAINT fk_scheduled_meeting_participants_meeting FOREIGN KEY (meeting_id) REFERENCES scheduled_meetings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
