'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPushDeliveryService, isWithinQuietHours, notificationAllowed, readVapidConfiguration, safePayload } = require('../services/webPushDelivery');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

test('incoming Web Push focuses a running window without reloading the meeting', async () => {
  const handlers = new Map();
  let shown;
  let focused = false;
  let opened;
  let message;
  const origin = 'https://cims.example';
  const id = 'f8d8a82d-bb6f-41b8-bf66-4f9ec11a4a6f';
  const client = {
    url: origin + '/',
    focus: async () => { focused = true; },
    postMessage: value => { message = value; },
    navigate: async () => assert.fail('An open workspace should not reload'),
  };
  let windows = [client];
  runInNewContext(readFileSync(join(__dirname, '../../public/push-handlers.js'), 'utf8'), { URL, self: {
    location: { origin },
    addEventListener: (event, handler) => handlers.set(event, handler),
    registration: { showNotification: async (_title, options) => { shown = options; } },
    clients: { matchAll: async () => windows, openWindow: async url => { opened = url; } },
  } });
  let completion;
  const waitUntil = promise => { completion = promise; };
  handlers.get('push')({ data: { json: () => ({ type: 'incoming_call', entityId: id, url: '//unrelated.example' }) }, waitUntil });
  await completion;
  assert.equal(shown.data.url, origin + '/?incomingCall=' + id);
  assert.equal(shown.silent, undefined);
  const click = { notification: { close() {}, data: shown.data }, waitUntil };
  handlers.get('notificationclick')(click);
  await completion;
  assert.equal(focused, true);
  assert.equal(message.type, 'riana-incoming-call-notification');
  assert.equal(message.callId, id);
  windows = [];
  handlers.get('notificationclick')(click);
  await completion;
  assert.equal(opened, shown.data.url);
});

test('VAPID validation fails closed', () => assert.equal(readVapidConfiguration({}).configured, false));
test('DND and category preferences suppress delivery', () => {
  assert.equal(notificationAllowed({ do_not_disturb: true }, 'message', new Date()), false);
  assert.equal(notificationAllowed({ notifications_enabled: true, message_notifications: false }, 'message', new Date()), false);
});
test('overnight quiet hours use the configured timezone', () => {
  const preference = { quiet_hours_enabled: true, quiet_hours_start: '22:00:00', quiet_hours_end: '06:00:00', timezone: 'UTC' };
  assert.equal(isWithinQuietHours(preference, new Date('2026-01-01T23:00:00Z')), true);
  assert.equal(isWithinQuietHours(preference, new Date('2026-01-01T12:00:00Z')), false);
});
test('payload excludes arbitrary private fields and external URLs', () => {
  const payload = JSON.parse(safePayload({ type: 'message', entityId: 'm1', title: 'New message', body: 'Open CIMS', url: 'https://evil.example', rawMessage: 'secret' }));
  assert.equal(payload.rawMessage, undefined);
  assert.equal(payload.url, '/');
});
test('delivery deduplicates per subscription and reports success', async () => {
  const queries = [];
  const pool = { query: async (sql) => {
    queries.push(sql);
    if (sql.startsWith('SELECT * FROM communication')) return [[{ notifications_enabled: true }]];
    if (sql.startsWith('SELECT * FROM push')) return [[{ id: 's1', endpoint: 'https://push.example/1', p256dh: 'p', auth_secret: 'a' }]];
    if (sql.startsWith('INSERT IGNORE')) return [{ affectedRows: 1 }];
    return [{ affectedRows: 1 }];
  } };
  const sent = [];
  const service = createPushDeliveryService({ pool, transport: { configured: true, send: async (...args) => sent.push(args) } });
  const result = await service.deliver('u1', { type: 'message', entityId: 'm1', title: 'New message', body: 'Open CIMS' });
  assert.equal(result.sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(queries.some(sql => sql.startsWith('INSERT IGNORE')), true);
});
test('expired subscriptions are disabled', async () => {
  const updates = [];
  const pool = { query: async (sql) => {
    if (sql.startsWith('SELECT * FROM communication')) return [[{}]];
    if (sql.startsWith('SELECT * FROM push')) return [[{ id: 's1', endpoint: 'https://push.example/1', p256dh: 'p', auth_secret: 'a' }]];
    if (sql.startsWith('INSERT IGNORE')) return [{ affectedRows: 1 }];
    updates.push(sql); return [{ affectedRows: 1 }];
  } };
  const service = createPushDeliveryService({ pool, transport: { configured: true, send: async () => { const error = new Error('gone'); error.statusCode = 410; throw error; } } });
  const result = await service.deliver('u1', { type: 'incoming_call', entityId: 'c1' });
  assert.equal(result.expired, 1);
  assert.equal(updates.some(sql => sql.includes('disabled_at')), true);
});
