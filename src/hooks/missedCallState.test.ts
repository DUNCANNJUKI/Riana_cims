import test from 'node:test';
import assert from 'node:assert/strict';
import { filterDismissedMissedCalls, mergeUndismissedMissedCalls, persistThenDismissMissedCall } from './missedCallState.ts';

const missed = (id: string) => ({ id, message_kind: 'call', call_status: 'missed' });

test('dismissed call snapshots and late signaling events stay suppressed', () => {
  const dismissed = new Set(['call-1']);
  const current = [missed('call-1'), missed('call-2')];
  assert.deepEqual(filterDismissedMissedCalls([missed('call-1'), missed('call-3')], dismissed), [missed('call-3')]);
  assert.deepEqual(mergeUndismissedMissedCalls(current, [missed('call-1'), missed('call-3')], dismissed), [missed('call-3'), missed('call-2')]);
});

test('dismissal commits to local UI only after the server persistence succeeds', async () => {
  let resolvePersist!: () => void;
  let committed = false;
  const pending = persistThenDismissMissedCall(
    () => new Promise<void>(resolve => { resolvePersist = resolve; }),
    () => { committed = true; },
  );
  assert.equal(committed, false);
  resolvePersist();
  await pending;
  assert.equal(committed, true);
});

test('failed persistence leaves the missed call visible', async () => {
  let committed = false;
  await assert.rejects(persistThenDismissMissedCall(
    async () => { throw new Error('database unavailable'); },
    () => { committed = true; },
  ), /database unavailable/);
  assert.equal(committed, false);
});
