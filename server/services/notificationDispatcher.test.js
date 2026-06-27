const test = require('node:test');
const assert = require('node:assert/strict');
const { deliverUserNotification } = require('./notificationDispatcher');

test('dispatcher persists in-app notification and records successful email and SMS delivery', async () => {
  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.startsWith('SELECT id,email')) {
        return [[{
          id: 'recipient-1',
          email: 'recipient@example.test',
          phone_number: '0712345678',
          first_name: 'Test',
          last_name: 'Recipient',
        }]];
      }
      return [[]];
    },
  };
  const deliveries = [];
  const providers = {
    async sendEmail(payload) { deliveries.push({ channel: 'email', payload }); return { messageId: 'email-1' }; },
    async sendSms(payload) { deliveries.push({ channel: 'sms', payload }); return { messageId: 'sms-1' }; },
  };

  const result = await deliverUserNotification({
    pool,
    userId: 'recipient-1',
    requestId: 'request-1',
    title: 'Task assigned',
    message: 'A Developers task was assigned.',
    notificationType: 'assigned',
    email: true,
    sms: true,
  }, providers);

  assert.equal(result.emailSent, true);
  assert.equal(result.smsSent, true);
  assert.deepEqual(deliveries.map((delivery) => delivery.channel), ['email', 'sms']);
  assert.match(queries[1].sql, /INSERT INTO crms_notifications/);
  assert.match(queries[2].sql, /UPDATE crms_notifications SET email_sent = \?, sms_sent = \?/);
  assert.deepEqual(queries[2].params.slice(0, 2), [true, true]);
});
