'use strict';

const DEFAULT_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 3650;
const DEFAULT_BATCH_SIZE = 250;
const MAX_BATCH_SIZE = 1000;

const boundedInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
};

const resolveRetentionOptions = (environment = process.env, argv = process.argv.slice(2)) => {
  const executeRequested = argv.includes('--execute');
  const executionEnabled = environment.COMMUNICATION_RETENTION_EXECUTION_ENABLED === 'true';
  return {
    dryRun: !(executeRequested && executionEnabled),
    executeRequested,
    executionEnabled,
    retentionDays: boundedInteger(environment.COMMUNICATION_RETENTION_DAYS, DEFAULT_RETENTION_DAYS, 1, MAX_RETENTION_DAYS),
    batchSize: boundedInteger(environment.COMMUNICATION_RETENTION_BATCH_SIZE, DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE),
  };
};

const buildCandidateQuery = () => `
  SELECT candidate.message_id,candidate.user_id,m.attachment_file_path
  FROM (
    SELECT m.id AS message_id,m.sender_id AS user_id FROM messages m
    UNION ALL
    SELECT m.id AS message_id,m.receiver_id AS user_id FROM messages m
    UNION ALL
    SELECT cp.call_id AS message_id,cp.user_id FROM call_participants cp
  ) candidate
  INNER JOIN messages m ON m.id=candidate.message_id
  LEFT JOIN communication_preferences pref ON pref.user_id=candidate.user_id
  LEFT JOIN saved_messages saved ON saved.message_id=candidate.message_id AND saved.user_id=candidate.user_id
  LEFT JOIN message_user_visibility visibility ON visibility.message_id=candidate.message_id AND visibility.user_id=candidate.user_id
  WHERE m.created_at < DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY)
    AND COALESCE(pref.keep_history,FALSE)=FALSE
    AND saved.id IS NULL
    AND visibility.hidden_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM message_legal_holds hold
      WHERE hold.message_id=candidate.message_id AND hold.released_at IS NULL
    )
  GROUP BY candidate.message_id,candidate.user_id,m.attachment_file_path
  ORDER BY m.created_at ASC,candidate.message_id ASC,candidate.user_id ASC
  LIMIT ?`;

const runRetentionBatch = async (connection, options) => {
  const [candidates] = await connection.query(buildCandidateQuery(), [options.retentionDays, options.batchSize]);
  if (options.dryRun || candidates.length === 0) return { dryRun: options.dryRun, candidates, hidden: 0 };

  await connection.beginTransaction();
  try {
    for (const candidate of candidates) {
      await connection.query(
        `INSERT INTO message_user_visibility (id,message_id,user_id,hidden_at)
         VALUES (UUID(),?,?,UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE hidden_at=COALESCE(hidden_at,UTC_TIMESTAMP())`,
        [candidate.message_id, candidate.user_id],
      );
    }
    await connection.commit();
    return { dryRun: false, candidates, hidden: candidates.length };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
};

module.exports = { buildCandidateQuery, resolveRetentionOptions, runRetentionBatch };
