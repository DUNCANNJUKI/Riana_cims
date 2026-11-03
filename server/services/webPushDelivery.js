'use strict';

const isValidVapidSubject = (value) => /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$|^https:\/\//i.test(String(value || ''));

const readVapidConfiguration = (environment = process.env) => {
  const configuration = {
    subject: String(environment.VAPID_SUBJECT || '').trim(),
    publicKey: String(environment.VAPID_PUBLIC_KEY || '').trim(),
    privateKey: String(environment.VAPID_PRIVATE_KEY || '').trim(),
  };
  const configured = isValidVapidSubject(configuration.subject) && configuration.publicKey.length >= 40 && configuration.privateKey.length >= 20;
  return { ...configuration, configured };
};

const minutesOfDay = (value) => {
  const match = String(value || '').match(/^(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const isWithinQuietHours = (preference, now = new Date()) => {
  if (!preference?.quiet_hours_enabled) return false;
  const start = minutesOfDay(preference.quiet_hours_start);
  const end = minutesOfDay(preference.quiet_hours_end);
  if (start == null || end == null || start === end) return false;
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: preference.timezone || 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
  const current = Number(parts.hour) * 60 + Number(parts.minute);
  return start < end ? current >= start && current < end : current >= start || current < end;
};

const notificationAllowed = (preference, notificationType, now) => {
  if (preference?.notifications_enabled === 0 || preference?.notifications_enabled === false || preference?.do_not_disturb) return false;
  if (notificationType === 'message' && (preference?.message_notifications === 0 || preference?.message_notifications === false)) return false;
  if ((notificationType === 'incoming_call' || notificationType === 'missed_call') && (preference?.call_notifications === 0 || preference?.call_notifications === false)) return false;
  return !isWithinQuietHours(preference, now);
};

const safePayload = ({ type, entityId, title, body, url = '/' }) => JSON.stringify({
  type: String(type || '').slice(0, 50),
  entityId: entityId ? String(entityId).slice(0, 36) : undefined,
  title: String(title || 'RIANA CIMS').slice(0, 100),
  body: String(body || '').slice(0, 180),
  url: String(url || '/').startsWith('/') ? String(url).slice(0, 300) : '/',
});

const createWebPushTransport = (environment = process.env) => {
  const configuration = readVapidConfiguration(environment);
  if (!configuration.configured) return { configured: false, send: async () => ({ disabled: true, reason: 'VAPID_NOT_CONFIGURED' }) };
  let webPush;
  try { webPush = require('web-push'); } catch { return { configured: false, send: async () => ({ disabled: true, reason: 'WEB_PUSH_MODULE_UNAVAILABLE' }) }; }
  webPush.setVapidDetails(configuration.subject, configuration.publicKey, configuration.privateKey);
  return { configured: true, send: (subscription, payload) => webPush.sendNotification(subscription, payload, { TTL: 60, urgency: 'high' }) };
};

const createPushDeliveryService = ({ pool, transport = createWebPushTransport(), now = () => new Date() }) => ({
  async deliver(userId, notification) {
    if (!transport.configured) return { configured: false, sent: 0, failed: 0, expired: 0, suppressed: 0 };
    const [[preference = {}]] = await pool.query('SELECT * FROM communication_preferences WHERE user_id=?', [userId]);
    if (!notificationAllowed(preference, notification.type, now())) return { configured: true, sent: 0, failed: 0, expired: 0, suppressed: 1 };
    const [subscriptions] = await pool.query('SELECT * FROM push_subscriptions WHERE user_id=? AND disabled_at IS NULL AND (expires_at IS NULL OR expires_at>UTC_TIMESTAMP())', [userId]);
    const result = { configured: true, sent: 0, failed: 0, expired: 0, suppressed: 0 };
    const payload = safePayload(notification);
    for (const subscription of subscriptions) {
      const deduplicationKey = `${notification.type}:${notification.entityId || 'none'}:${subscription.id}`.slice(0, 160);
      const [claim] = await pool.query(`INSERT IGNORE INTO notification_deliveries (id,user_id,subscription_id,deduplication_key,notification_type,entity_id) VALUES (UUID(),?,?,?,?,?)`, [userId, subscription.id, deduplicationKey, notification.type, notification.entityId || null]);
      if (!claim.affectedRows) { result.suppressed += 1; continue; }
      try {
        await transport.send({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret } }, payload);
        await pool.query(`UPDATE notification_deliveries SET status='sent',attempt_count=attempt_count+1,delivered_at=UTC_TIMESTAMP() WHERE user_id=? AND deduplication_key=? AND subscription_id=?`, [userId, deduplicationKey, subscription.id]);
        await pool.query('UPDATE push_subscriptions SET last_success_at=UTC_TIMESTAMP(),failure_count=0 WHERE id=?', [subscription.id]);
        result.sent += 1;
      } catch (error) {
        const statusCode = Number(error?.statusCode || error?.status || 0);
        const expired = statusCode === 404 || statusCode === 410;
        await pool.query(`UPDATE notification_deliveries SET status=?,attempt_count=attempt_count+1,last_error_code=? WHERE user_id=? AND deduplication_key=? AND subscription_id=?`, [expired ? 'expired' : 'failed', String(statusCode || 'DELIVERY_ERROR').slice(0, 80), userId, deduplicationKey, subscription.id]);
        await pool.query('UPDATE push_subscriptions SET failure_count=failure_count+1,disabled_at=CASE WHEN ? THEN UTC_TIMESTAMP() ELSE disabled_at END WHERE id=?', [expired, subscription.id]);
        if (expired) result.expired += 1; else result.failed += 1;
      }
    }
    return result;
  },
});

module.exports = { createPushDeliveryService, createWebPushTransport, isWithinQuietHours, notificationAllowed, readVapidConfiguration, safePayload };
