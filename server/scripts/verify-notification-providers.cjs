const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
process.env.BREVO_API_KEY ||= 'mock-brevo-key';
process.env.BREVO_FROM_EMAIL ||= 'info@riana.co';
process.env.B_TEXTMAN_API_KEY ||= 'mock-sms-key';
process.env.B_TEXTMAN_API_URL ||= 'https://sms.example.test/functions/v1';
process.env.B_TEXTMAN_SEND_PATH ||= 'send-sms';
process.env.SMS_SENDER_ID ||= 'RIANA';

const calls = [];
global.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(url.includes('brevo.com') ? { messageId: 'test-id' } : { balance: 100 }),
  };
};

const { getSmsBalance, sendEmail, sendSms, sendWelcomeCredentials } = require('../services/notifications');
const { sendUserNotification } = require('../services/notificationDispatcher');

async function verify() {
  process.env.B_TEXTMAN_BALANCE_PATH ||= 'balance-test';
  await sendEmail({
    recipientEmail: 'test@example.com', recipientName: 'Test User',
    notificationType: 'approved', ticketNumber: 'CR-TEST', clientName: 'Test Client',
    requestDescription: 'Provider wiring test',
  });
  await sendSms({ phoneNumber: '0712345678', message: 'Provider wiring test' });
  await getSmsBalance();
  await sendWelcomeCredentials({
    email: 'new.user@riana.co', phoneNumber: '0712345678', name: 'New User',
    password: 'MUST-NOT-LEAK-Temporary123!',
    loginUrl: 'https://cims.riana.co/',
    setupUrl: 'https://cims.riana.co/reset-password?token=mock-secure-setup-token',
  });

  const databaseCalls = [];
  const fakePool = {
    query: async (sql, params) => {
      databaseCalls.push({ sql, params });
      if (sql.startsWith('SELECT id,email')) {
        return [[{ id: 'user-1', email: 'developer@riana.co', phone_number: '0712345678', first_name: 'Riana', last_name: 'Developer' }]];
      }
      return [{ affectedRows: 1 }];
    },
  };
  await sendUserNotification({
    pool: fakePool,
    userId: 'user-1',
    title: 'New installation assignment',
    message: 'You have a new assignment.',
    notificationType: 'assignment',
    email: true,
    sms: true,
  });
  await sendEmail({ recipientEmail: 'user@riana.co', notificationType: 'password_changed', requestDescription: 'Password changed.' });
  await sendEmail({ recipientEmail: 'client@example.com', notificationType: 'feedback_requested', requestDescription: 'Feedback requested.' });

  assert.equal(calls.length, 9);
  assert.equal(new URL(calls[0].url).hostname, 'api.brevo.com');
  assert.equal(calls[0].options.headers['api-key'], process.env.BREVO_API_KEY);
  const smsPayload = JSON.parse(calls[1].options.body);
  assert.equal(smsPayload.recipient, '+254712345678');
  assert.equal(smsPayload.sender_id, process.env.SMS_SENDER_ID);
  assert.ok(calls[1].url.endsWith(`/${process.env.B_TEXTMAN_SEND_PATH || 'send-sms'}`));
  assert.ok(calls[2].url.endsWith(`/${process.env.B_TEXTMAN_BALANCE_PATH}`));
  const welcomeEmail = JSON.parse(calls[3].options.body);
  assert.match(welcomeEmail.htmlContent, /new\.user@riana\.co/);
  assert.match(welcomeEmail.htmlContent, /reset-password\?token=mock-secure-setup-token/);
  assert.match(welcomeEmail.htmlContent, /choose your password/i);
  assert.doesNotMatch(welcomeEmail.htmlContent, /MUST-NOT-LEAK|Temporary123!/);
  const welcomeSms = JSON.parse(calls[4].options.body);
  assert.match(welcomeSms.message, /reset-password\?token=mock-secure-setup-token/);
  assert.doesNotMatch(welcomeSms.message, /MUST-NOT-LEAK|Temporary123!/);
  assert.equal(JSON.parse(calls[5].options.body).subject, 'New RIANA CIMS assignment');
  assert.match(JSON.parse(calls[6].options.body).message, /new assignment/i);
  assert.equal(JSON.parse(calls[7].options.body).subject, 'Your RIANA CIMS password was changed');
  assert.equal(JSON.parse(calls[8].options.body).subject, 'RIANA installation feedback requested');
  assert.ok(databaseCalls.some(call => call.sql.includes('INSERT INTO crms_notifications')));
  assert.ok(databaseCalls.some(call => call.sql.includes('email_sent = ?, sms_sent = ?') && call.params[0] === true && call.params[1] === true));
  console.log('Notification provider wiring verified without sending external messages.');
}

verify().catch((error) => {
  console.error(`Notification provider verification failed: ${error.message}`);
  process.exitCode = 1;
});
