const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
process.env.SMTP_HOST ||= 'mail.rianacims.name.ng';
process.env.SMTP_PORT ||= '465';
process.env.SMTP_SECURE ||= 'true';
process.env.SMTP_USER ||= 'info@rianacims.name.ng';
process.env.SMTP_PASSWORD ||= 'mock-smtp-password';
process.env.SMTP_FROM_EMAIL ||= 'info@rianacims.name.ng';
process.env.SMTP_FROM_NAME ||= 'RIANA CIMS';
process.env.SMTP_RETRY_ATTEMPTS ||= '3';
process.env.SMTP_RETRY_BASE_DELAY_MS ||= '100';
process.env.B_TEXTMAN_API_KEY ||= 'mock-sms-key';
process.env.B_TEXTMAN_API_URL ||= 'https://sms.example.test/functions/v1';
process.env.B_TEXTMAN_SEND_PATH ||= 'send-sms';
process.env.SMS_SENDER_ID ||= 'RIANA';

const calls = [];
const smtpCalls = [];
let smtpOptions;
let smtpAttempts = 0;
let smtpFailuresRemaining = 1;
const nodemailer = require('nodemailer');
nodemailer.createTransport = (options) => {
  smtpOptions = options;
  return {
    verify: async () => true,
    sendMail: async (message) => {
      smtpAttempts += 1;
      if (smtpFailuresRemaining > 0) {
        smtpFailuresRemaining -= 1;
        throw Object.assign(new Error('Temporary SMTP test failure'), { code: 'ETIMEDOUT' });
      }
      smtpCalls.push(message);
      return { messageId: 'smtp-test-id', accepted: [message.to[0].address], rejected: [] };
    },
  };
};
global.fetch = async (url, options = {}) => {
  calls.push({ url: String(url), options });
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(url.includes('brevo.com') ? { messageId: 'test-id' } : { balance: 100 }),
  };
};

const { getSmsBalance, sendEmail, sendSms, sendWelcomeCredentials, smtpStatus, verifySmtpConnection } = require('../services/notifications');
const { sendUserNotification } = require('../services/notificationDispatcher');

async function verify() {
  process.env.B_TEXTMAN_BALANCE_PATH ||= 'balance-test';
  await verifySmtpConnection();
  await sendEmail({
    recipientEmail: 'test@example.com', recipientName: 'Test User',
    notificationType: 'approved', ticketNumber: 'CR-TEST', clientName: 'Test Client',
    requestDescription: 'Provider wiring test',
  });
  await sendSms({ phoneNumber: '0712345678', message: 'Provider wiring test' });
  await getSmsBalance();
  await sendWelcomeCredentials({
    email: 'new.user@riana.co', phoneNumber: '0712345678', name: 'New User',
    role: 'Developer',
    password: 'MUST-NOT-LEAK-Temporary123!',
    loginUrl: 'https://cims.riana.co/',
    setupUrl: 'https://cims.riana.co/reset-password?token=mock-secure-setup-token',
    branding: {
      name: 'RIANA CIMS', primaryColor: '#1A91AB', secondaryColor: '#2563EB', fontFamily: 'Inter',
      logoContent: Buffer.from('mock-logo'), logoFilename: 'riana-logo.png', logoContentType: 'image/png',
    },
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

  assert.equal(smtpCalls.length, 5);
  assert.equal(smtpAttempts, 6);
  assert.equal(calls.length, 4);
  assert.equal(smtpOptions.host, 'mail.rianacims.name.ng');
  assert.equal(smtpOptions.port, 465);
  assert.equal(smtpOptions.secure, true);
  assert.equal(smtpOptions.pool, true);
  assert.equal(smtpOptions.rateLimit, 5);
  assert.equal(smtpOptions.auth.user, 'info@rianacims.name.ng');
  assert.equal(smtpOptions.tls.rejectUnauthorized, true);
  assert.equal(smtpOptions.disableFileAccess, true);
  assert.equal(smtpOptions.disableUrlAccess, true);
  const smsPayload = JSON.parse(calls[0].options.body);
  assert.equal(smsPayload.recipient, '+254712345678');
  assert.equal(smsPayload.sender_id, process.env.SMS_SENDER_ID);
  assert.ok(calls[0].url.endsWith(`/${process.env.B_TEXTMAN_SEND_PATH || 'send-sms'}`));
  assert.ok(calls[1].url.endsWith(`/${process.env.B_TEXTMAN_BALANCE_PATH}`));
  const welcomeEmail = smtpCalls[1];
  assert.equal(welcomeEmail.from.address, 'info@rianacims.name.ng');
  assert.match(welcomeEmail.html, /new\.user@riana\.co/);
  assert.match(welcomeEmail.html, /Login URL/i);
  assert.match(welcomeEmail.html, /https:\/\/cims\.riana\.co\//);
  assert.match(welcomeEmail.html, /reset-password\?token=mock-secure-setup-token/);
  assert.match(welcomeEmail.html, /create your password/i);
  assert.match(welcomeEmail.html, /Welcome to RIANA CIMS/);
  assert.match(welcomeEmail.html, /Developer/);
  assert.match(welcomeEmail.html, /#1A91AB/i);
  assert.match(welcomeEmail.html, /cid:system-logo/);
  assert.match(welcomeEmail.html, /Powered by Riana Atomations/);
  assert.match(welcomeEmail.text, /Powered by Riana Atomations/);
  assert.equal(welcomeEmail.attachments[0].cid, 'system-logo');
  assert.doesNotMatch(welcomeEmail.html, /MUST-NOT-LEAK|Temporary123!/);
  const welcomeSms = JSON.parse(calls[2].options.body);
  assert.match(welcomeSms.message, /Username: new\.user@riana\.co/);
  assert.match(welcomeSms.message, /Login: https:\/\/cims\.riana\.co\//);
  assert.match(welcomeSms.message, /reset-password\?token=mock-secure-setup-token/);
  assert.doesNotMatch(welcomeSms.message, /MUST-NOT-LEAK|Temporary123!/);
  assert.equal(smtpCalls[2].subject, 'New RIANA CIMS assignment');
  assert.match(JSON.parse(calls[3].options.body).message, /new assignment/i);
  assert.equal(smtpCalls[3].subject, 'Your RIANA CIMS password was changed');
  assert.equal(smtpCalls[4].subject, 'RIANA installation feedback requested');
  assert.ok(databaseCalls.some(call => call.sql.includes('INSERT INTO crms_notifications')));
  assert.ok(databaseCalls.some(call => call.sql.includes('email_sent = ?, sms_sent = ?') && call.params[0] === true && call.params[1] === true));
  assert.equal(smtpStatus().success, true);
  assert.doesNotMatch(JSON.stringify(smtpStatus()), /mock-smtp-password/);
  console.log('Notification provider wiring verified without sending external messages.');
}

verify().catch((error) => {
  console.error(`Notification provider verification failed: ${error.message}`);
  process.exitCode = 1;
});
