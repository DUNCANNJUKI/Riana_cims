'use strict';

const pool = require('../db');
const { resolveRetentionOptions, runRetentionBatch } = require('../services/messageRetention');

const main = async () => {
  const options = resolveRetentionOptions();
  if (options.executeRequested && !options.executionEnabled) {
    throw new Error('Execution refused: set COMMUNICATION_RETENTION_EXECUTION_ENABLED=true and pass --execute. Dry-run requires neither.');
  }
  const connection = await pool.getConnection();
  try {
    const result = await runRetentionBatch(connection, options);
    console.log(JSON.stringify({ mode: result.dryRun ? 'dry-run' : 'execute', retentionDays: options.retentionDays, batchSize: options.batchSize, candidates: result.candidates.length, hidden: result.hidden }, null, 2));
  } finally {
    connection.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error(`Message retention failed: ${error.message}`);
  process.exitCode = 1;
});
