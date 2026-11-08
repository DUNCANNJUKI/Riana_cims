-- Additive migration for enterprise meeting recording metadata and active recording state

CREATE TABLE IF NOT EXISTS call_recordings (
  id VARCHAR(36) PRIMARY KEY,
  call_id VARCHAR(36) NOT NULL,
  initiated_by VARCHAR(36) NOT NULL,
  stopped_by VARCHAR(36) NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  duration_seconds INT NOT NULL DEFAULT 0,
  status ENUM('recording', 'processing', 'saved', 'failed', 'deleted') NOT NULL DEFAULT 'recording',
  file_name VARCHAR(255) NULL,
  file_path VARCHAR(512) NULL,
  mime_type VARCHAR(120) NULL,
  file_size BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_call_recordings_call_id (call_id),
  INDEX idx_call_recordings_initiated_by (initiated_by),
  INDEX idx_call_recordings_status_created (status, created_at)
);
