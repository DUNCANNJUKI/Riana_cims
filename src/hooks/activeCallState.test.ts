import test from 'node:test';
import assert from 'node:assert/strict';
import { activeCallAfterUpdate, clearMatchingActiveCall, isPendingCallInvitation } from './activeCallState.ts';

const call = (id: string, status = 'accepted', participantStatus = 'accepted') => ({
  id,
  sender_id: 'organizer',
  call_status: status,
  call_participants: [{ user_id: 'member', status: participantStatus }],
});

test('late termination and participant departure for another call preserve the current meeting', () => {
  const active = call('current');
  for (const status of ['declined', 'ended', 'missed', 'cancelled', 'expired', 'failed']) {
    assert.equal(activeCallAfterUpdate(active, call('previous', status), 'member'), active);
    assert.equal(activeCallAfterUpdate(active, call('previous', 'accepted', status), 'member'), active);
  }
});

test('unrelated invitations and accepted updates cannot replace an active meeting', () => {
  const active = call('current');
  assert.equal(activeCallAfterUpdate(active, call('other', 'ringing', 'ringing'), 'member'), active);
  assert.equal(activeCallAfterUpdate(active, call('other'), 'member'), active);
  assert.equal(clearMatchingActiveCall(active, 'other'), active);
});

test('updates and termination still apply to the matching active meeting', () => {
  const active = call('current');
  const updated = { ...active, spotlight_user_id: 'member' };
  assert.equal(activeCallAfterUpdate(active, updated, 'member'), updated);
  assert.equal(activeCallAfterUpdate(active, call('current', 'ended'), 'member'), null);
  assert.equal(activeCallAfterUpdate(active, call('current', 'accepted', 'ended'), 'member'), null);
  assert.equal(clearMatchingActiveCall(active, 'current'), null);
});

test('pending invitation updates never activate media before acceptance', () => {
  const pending = call('invitation', 'ringing', 'invited');
  assert.equal(isPendingCallInvitation(pending, 'member'), true);
  assert.equal(activeCallAfterUpdate(null, pending, 'member'), null);
  assert.equal(isPendingCallInvitation(call('invitation', 'ended', 'ringing'), 'member'), false);
  assert.equal(isPendingCallInvitation(call('invitation', 'missed', 'invited'), 'member'), false);
  const accepted = call('invitation');
  assert.equal(activeCallAfterUpdate(null, accepted, 'member'), null);
  const outgoing = call('outgoing', 'ringing', 'accepted');
  assert.equal(activeCallAfterUpdate(null, outgoing, 'organizer'), null);
});

test('a following call update cannot reactivate a call answered on another device', () => {
  const answeredElsewhere = call('answered-elsewhere');
  assert.equal(activeCallAfterUpdate(null, answeredElsewhere, 'member', true), null);
  assert.equal(activeCallAfterUpdate(answeredElsewhere, answeredElsewhere, 'member', true), null);
  const active = call('current');
  assert.equal(activeCallAfterUpdate(active, answeredElsewhere, 'member', true), active);
});
