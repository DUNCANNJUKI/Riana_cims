'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCandidateQuery, resolveRetentionOptions, runRetentionBatch } = require('../services/messageRetention');

test('retention is dry-run by default', () => {
  const options = resolveRetentionOptions({}, []);
  assert.equal(options.dryRun, true);
  assert.equal(options.retentionDays, 30);
  assert.equal(options.batchSize, 250);
});

test('execution requires both configuration and explicit flag', () => {
  assert.equal(resolveRetentionOptions({ COMMUNICATION_RETENTION_EXECUTION_ENABLED: 'true' }, []).dryRun, true);
  assert.equal(resolveRetentionOptions({}, ['--execute']).dryRun, true);
  assert.equal(resolveRetentionOptions({ COMMUNICATION_RETENTION_EXECUTION_ENABLED: 'true' }, ['--execute']).dryRun, false);
});

test('candidate query protects keep-history, saved messages, legal holds, and already hidden rows', () => {
  const sql = buildCandidateQuery();
  assert.match(sql, /pref\.keep_history/);
  assert.match(sql, /saved\.id IS NULL/);
  assert.match(sql, /hold\.released_at IS NULL/);
  assert.match(sql, /visibility\.hidden_at IS NULL/);
});

test('dry-run never opens a transaction or writes', async () => {
  const calls = [];
  const connection = {
    query: async (sql) => { calls.push(sql); return [[{ message_id: 'm1', user_id: 'u1' }]]; },
    beginTransaction: async () => { throw new Error('must not begin'); },
  };
  const result = await runRetentionBatch(connection, { dryRun: true, retentionDays: 30, batchSize: 10 });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.hidden, 0);
  assert.equal(calls.length, 1);
});

test('execute hides only candidate user visibility inside one transaction', async () => {
  const writes = [];
  let committed = false;
  const connection = {
    query: async (sql, values) => {
      if (sql.includes('SELECT candidate')) return [[{ message_id: 'm1', user_id: 'u1' }, { message_id: 'm1', user_id: 'u2' }]];
      writes.push(values);
      return [{ affectedRows: 1 }];
    },
    beginTransaction: async () => undefined,
    commit: async () => { committed = true; },
    rollback: async () => undefined,
  };
  const result = await runRetentionBatch(connection, { dryRun: false, retentionDays: 30, batchSize: 10 });
  assert.deepEqual(writes, [['m1', 'u1'], ['m1', 'u2']]);
  assert.equal(result.hidden, 2);
  assert.equal(committed, true);
});
