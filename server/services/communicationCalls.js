const crypto = require('crypto');

const MEETING_REACTIONS = new Set(['👍', '❤️', '👏', '😂', '🎉', '😊']);
const RECORDING_AUTHORIZED_ROLES = new Set(['SuperAdmin', 'Admin', 'Management', 'Teamlead']);

const createIceServers = (userId, env = process.env, now = Date.now()) => {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  const turnUrls = String(env.WEBRTC_TURN_URLS || env.WEBRTC_TURN_URL || '')
    .split(',')
    .map(value => value.trim())
    .filter(value => /^turns?:/i.test(value));
  const sharedSecret = String(env.WEBRTC_TURN_SHARED_SECRET || '').trim();
  if (!turnUrls.length || !sharedSecret || !String(userId || '').trim()) return iceServers;

  const username = `${Math.floor(now / 1000) + 3600}:${String(userId)}`;
  const credential = crypto.createHmac('sha1', sharedSecret).update(username).digest('base64');
  iceServers.push({ urls: turnUrls, username, credential });
  return iceServers;
};

const canManageCallRecording = (user, callSenderId, recordingInitiatorId = null) => {
  if (!user || !user.id) return false;
  const userId = String(user.id);
  if (callSenderId && userId === String(callSenderId)) return true;
  if (recordingInitiatorId && userId === String(recordingInitiatorId)) return true;
  if (user.role && RECORDING_AUTHORIZED_ROLES.has(String(user.role))) return true;
  return false;
};

const isValidCallSignalPayload = (signalType, payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const keys = Object.keys(payload);
  switch (signalType) {
    case 'reaction':
      return typeof payload.emoji === 'string' && MEETING_REACTIONS.has(payload.emoji) && keys.length === 1 && keys[0] === 'emoji';
    case 'hand-state':
      return typeof payload.raised === 'boolean'
        && keys.every(key => ['raised', 'targetUserId'].includes(key))
        && (payload.targetUserId === undefined || (typeof payload.targetUserId === 'string' && payload.targetUserId.length <= 64));
    case 'media-state':
      return typeof payload.audioEnabled === 'boolean'
        && typeof payload.videoEnabled === 'boolean'
        && typeof payload.screenSharing === 'boolean'
        && keys.every(key => ['audioEnabled', 'videoEnabled', 'screenSharing'].includes(key));
    case 'spotlight':
      return (payload.userId === null || (typeof payload.userId === 'string' && payload.userId.length <= 64))
        && keys.length === 1 && keys[0] === 'userId';
    case 'recording-state':
      return typeof payload.active === 'boolean'
        && keys.every(key => ['active', 'recordingId', 'startedBy', 'startedByName', 'startedAt'].includes(key))
        && (payload.recordingId === undefined || payload.recordingId === null || (typeof payload.recordingId === 'string' && payload.recordingId.length <= 64))
        && (payload.startedBy === undefined || payload.startedBy === null || (typeof payload.startedBy === 'string' && payload.startedBy.length <= 64))
        && (payload.startedByName === undefined || payload.startedByName === null || (typeof payload.startedByName === 'string' && payload.startedByName.length <= 128))
        && (payload.startedAt === undefined || payload.startedAt === null || (typeof payload.startedAt === 'string' && payload.startedAt.length <= 64));
    case 'rejoin':
      return keys.length === 0;
    case 'offer':
    case 'answer':
      return payload.type === signalType
        && typeof payload.sdp === 'string' && payload.sdp.length <= 200_000;
    case 'ice-candidate':
      return typeof payload.candidate === 'string' && payload.candidate.length <= 4096;
    default:
      return false;
  }
};

module.exports = { createIceServers, isValidCallSignalPayload, canManageCallRecording };
