-- Additive scheduling layer. Legacy dates, actuals, inventory and handovers are unchanged.
CREATE TABLE IF NOT EXISTS scheduling_series (
 id VARCHAR(36) PRIMARY KEY,
 subsidiary_id VARCHAR(36) NOT NULL,
 rule_configuration JSON NOT NULL,
 time_zone VARCHAR(100) NOT NULL,
 created_by VARCHAR(36) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS scheduling_policies (
 scope_key VARCHAR(100) PRIMARY KEY,
 configuration JSON NOT NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 updated_by VARCHAR(36) NOT NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS scheduling_policy_history (
 id VARCHAR(36) PRIMARY KEY,
 scope_key VARCHAR(100) NOT NULL,
 actor_id VARCHAR(36) NOT NULL,
 previous_values JSON NOT NULL,
 next_values JSON NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY idx_schedule_policy_history(scope_key,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS scheduling_events (
 id VARCHAR(36) PRIMARY KEY,
 subsidiary_id VARCHAR(36) NOT NULL,
 branch_id VARCHAR(36) NULL,
 activity_type VARCHAR(30) NOT NULL,
 activity_id VARCHAR(36) NULL,
 title VARCHAR(160) NOT NULL,
 start_utc DATETIME(6) NOT NULL,
 end_utc DATETIME(6) NOT NULL,
 time_zone VARCHAR(100) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
 version INT UNSIGNED NOT NULL DEFAULT 1,
 buffer_minutes INT UNSIGNED NOT NULL DEFAULT 0,
 policy_snapshot JSON NOT NULL,
 series_id VARCHAR(36) NULL,
 occurrence_local VARCHAR(30) NULL,
 created_by VARCHAR(36) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_schedule_occurrence (series_id,occurrence_local),
 KEY idx_schedule_scope (subsidiary_id,start_utc,end_utc),
 KEY idx_schedule_activity (activity_type,activity_id),
 KEY idx_schedule_series (series_id,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS scheduling_resources (
 event_id VARCHAR(36) NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 PRIMARY KEY(event_id,user_id), KEY idx_schedule_resource(user_id,event_id),
 CONSTRAINT fk_schedule_resource_event FOREIGN KEY(event_id) REFERENCES scheduling_events(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS scheduling_history (
 id VARCHAR(36) PRIMARY KEY,
 event_id VARCHAR(36) NOT NULL,
 actor_id VARCHAR(36) NOT NULL,
 reason VARCHAR(500) NOT NULL,
 previous_values JSON NULL,
 next_values JSON NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY idx_schedule_history(event_id,created_at),
 CONSTRAINT fk_schedule_history_event FOREIGN KEY(event_id) REFERENCES scheduling_events(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS scheduling_requests (
 actor_id VARCHAR(36) NOT NULL,
 request_key VARCHAR(80) NOT NULL,
 payload_hash CHAR(64) NOT NULL,
 result JSON NULL,
 PRIMARY KEY(actor_id,request_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS scheduling_jobs (
 id VARCHAR(190) PRIMARY KEY,
 event_id VARCHAR(36) NOT NULL,
 event_version INT UNSIGNED NOT NULL,
 user_id VARCHAR(36) NOT NULL,
 kind VARCHAR(20) NOT NULL,
 due_utc DATETIME(6) NOT NULL,
 state VARCHAR(20) NOT NULL DEFAULT 'pending',
 attempts INT UNSIGNED NOT NULL DEFAULT 0,
 last_error VARCHAR(100) NULL,
 KEY idx_schedule_job_due(state,due_utc),
 CONSTRAINT fk_schedule_job_event FOREIGN KEY(event_id) REFERENCES scheduling_events(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
