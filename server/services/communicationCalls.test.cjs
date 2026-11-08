const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createIceServers, isValidCallSignalPayload, canManageCallRecording } = require('./communicationCalls');

test('ICE configuration returns STUN only when TURN credentials are incomplete', () => {
  assert.deepEqual(createIceServers('user-1', { WEBRTC_TURN_URL: 'turn:relay.example' }), [{ urls: 'stun:stun.l.google.com:19302' }]);
  assert.deepEqual(createIceServers('', { WEBRTC_TURN_URL: 'turn:relay.example', WEBRTC_TURN_SHARED_SECRET: 'secret' }), [{ urls: 'stun:stun.l.google.com:19302' }]);
});

test('TURN REST credentials are user-scoped, expiring, and signed with the server secret', () => {
  const now = Date.UTC(2026, 10, 4, 12, 0, 0);
  const env = { WEBRTC_TURN_URLS: 'turn:relay.example, turns:relay.example:5349', WEBRTC_TURN_SHARED_SECRET: 'server-secret' };
  const [stun, turn] = createIceServers('user-1', env, now);
  const [otherStun, otherTurn] = createIceServers('user-2', env, now);
  assert.deepEqual(stun, { urls: 'stun:stun.l.google.com:19302' });
  assert.deepEqual(turn.urls, ['turn:relay.example', 'turns:relay.example:5349']);
  assert.equal(turn.username, `${now / 1000 + 3600}:user-1`);
  assert.equal(turn.credential, crypto.createHmac('sha1', env.WEBRTC_TURN_SHARED_SECRET).update(turn.username).digest('base64'));
  assert.notEqual(turn.username, otherTurn.username);
  assert.notEqual(turn.credential, otherTurn.credential);
  assert.deepEqual(otherStun, stun);
});

test('meeting reactions accept only the supported transient emoji payloads', () => {
  for (const emoji of ['👍', '❤️', '👏', '😂', '🎉', '😊']) assert.equal(isValidCallSignalPayload('reaction', { emoji }), true);
  assert.equal(isValidCallSignalPayload('reaction', { emoji: '😡' }), false);
  assert.equal(isValidCallSignalPayload('reaction', { emoji: '👍', userId: 'spoofed' }), false);
});

test('engagement, media, and recording signals reject malformed or extra client-controlled fields', () => {
  assert.equal(isValidCallSignalPayload('hand-state', { raised: true }), true);
  assert.equal(isValidCallSignalPayload('hand-state', { raised: true, targetUserId: 'user-2' }), true);
  assert.equal(isValidCallSignalPayload('hand-state', { raised: true, targetUserId: 'x'.repeat(65) }), false);
  assert.equal(isValidCallSignalPayload('media-state', { audioEnabled: true, videoEnabled: false, screenSharing: false }), true);
  assert.equal(isValidCallSignalPayload('media-state', { audioEnabled: true, videoEnabled: false, screenSharing: false, userId: 'spoofed' }), false);
  assert.equal(isValidCallSignalPayload('spotlight', { userId: null }), true);
  assert.equal(isValidCallSignalPayload('spotlight', { userId: 'user-2', isOrganizer: true }), false);
  assert.equal(isValidCallSignalPayload('recording-state', { active: true, recordingId: 'rec-1', startedBy: 'user-1', startedByName: 'Duncan', startedAt: '2026-11-07T19:00:00Z' }), true);
  assert.equal(isValidCallSignalPayload('recording-state', { active: false, recordingId: null }), true);
  assert.equal(isValidCallSignalPayload('recording-state', { active: true, spoofedField: 'bad' }), false);
  assert.equal(isValidCallSignalPayload('rejoin', {}), true);
  assert.equal(isValidCallSignalPayload('rejoin', { offer: 'spoofed' }), false);
});

test('recording authorization allows call host, recording initiator, and authorized leadership roles', () => {
  assert.equal(canManageCallRecording({ id: 'host-1', role: 'Support' }, 'host-1'), true);
  assert.equal(canManageCallRecording({ id: 'user-2', role: 'SuperAdmin' }, 'host-1'), true);
  assert.equal(canManageCallRecording({ id: 'user-3', role: 'Management' }, 'host-1'), true);
  assert.equal(canManageCallRecording({ id: 'user-4', role: 'Support' }, 'host-1'), false);
  assert.equal(canManageCallRecording({ id: 'user-4', role: 'Support' }, 'host-1', 'user-4'), true);
});

test('SDP and ICE candidate payloads have shape and size bounds', () => {
  assert.equal(isValidCallSignalPayload('offer', { type: 'offer', sdp: 'v=0\r\n' }), true);
  assert.equal(isValidCallSignalPayload('answer', { type: 'offer', sdp: 'v=0' }), false);
  assert.equal(isValidCallSignalPayload('offer', { type: 'offer', sdp: 'x'.repeat(200_001) }), false);
  assert.equal(isValidCallSignalPayload('ice-candidate', { candidate: 'candidate:1' }), true);
  assert.equal(isValidCallSignalPayload('ice-candidate', { candidate: 'x'.repeat(4097) }), false);
});
