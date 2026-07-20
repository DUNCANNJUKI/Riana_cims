const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
process.env.SMTP_HOST ||= 'smtp-mail.outlook.com';
process.env.SMTP_PORT ||= '587';
process.env.SMTP_SECURE ||= 'false';
process.env.SMTP_USER ||= 'notifications@qsys-ea.com';
process.env.SMTP_PASSWORD ||= 'mock-smtp-password';
process.env.SMTP_FROM_EMAIL ||= 'notifications@qsys-ea.com';
process.env.SMTP_FROM_NAME ||= 'QSYS Notifications';
process.env.SMTP_RETRY_ATTEMPTS ||= '3';
process.env.SMTP_RETRY_BASE_DELAY_MS ||= '100';
process.env.AFRICASTALKING_USERNAME ||= 'QSYS';
process.env.AFRICASTALKING_API_KEY ||= 'mock-africas-talking-key';
process.env.AFRICASTALKING_SMS_URL ||= 'https://api.africastalking.com/version1/messaging';
process.env.AFRICASTALKING_BALANCE_URL ||= 'https://api.africastalking.com/version1/user';
process.env.SMS_SENDER_ID ||= 'Q-SYS';
process.env.ENABLE_WHATSAPP_NOTIFICATIONS ||= 'true';
process.env.BEEM_WHATSAPP_API_URL ||= 'https://apichatcore.beem.africa/v1/chat-send';
process.env.BEEM_WHATSAPP_USER_ID ||= 'mock-beem-user-id';
process.env.BEEM_WHATSAPP_AUTHORIZATION ||= 'Basic mock-beem-token';
process.env.BEEM_WHATSAPP_TEMPLATE_ID ||= '479';

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
  if (String(url).includes('/messaging')) {
    return { ok: true, status: 201, text: async () => JSON.stringify({ SMSMessageData: { Recipients: [{ status: 'Success', statusCode: 100 }] } }) };
  }
  if (String(url).includes('/version1/user')) {
    return { ok: true, status: 200, text: async () => JSON.stringify({ UserData: { balance: 'KES 100.00' } }) };
  }
  if (String(url).includes('/chat-send')) {
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: true, message: 'queued' }) };
  }
  return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
};

const {
  getSmsBalance,
  sendEmail,
  sendSms,
  sendWelcomeCredentials,
  sendWhatsApp,
  smsStatus,
  smtpStatus,
  verifySmtpConnection,
  whatsappStatus,
} = require('../services/notifications');
const { sendUserNotification } = require('../services/notificationDispatcher');

async function verify() {
  await verifySmtpConnection();
  await sendEmail({
    recipientEmail: 'test@example.com', recipientName: 'Test User',
    notificationType: 'approved', ticketNumber: 'CR-TEST', clientName: 'Test Client',
    requestDescription: 'Provider wiring test',
  });
  await sendSms({ phoneNumber: '0712345678', message: 'Provider wiring test' });
  await getSmsBalance();
  await sendWhatsApp({ phoneNumber: '0712345678', message: 'Provider wiring test', recipientName: 'Test User', serviceName: 'Provider test', bookingDate: '19/07/2026' });
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
  assert.equal(calls.length, 7);
  assert.equal(smtpOptions.host, 'smtp-mail.outlook.com');
  assert.equal(smtpOptions.port, 587);
  assert.equal(smtpOptions.secure, false);
  assert.equal(smtpOptions.pool, true);
  assert.equal(smtpOptions.rateLimit, 5);
  assert.equal(smtpOptions.auth.user, 'notifications@qsys-ea.com');
  assert.equal(smtpOptions.tls.rejectUnauthorized, true);
  assert.equal(smtpOptions.disableFileAccess, true);
  assert.equal(smtpOptions.disableUrlAccess, true);

  const smsPayload = new URLSearchParams(calls[0].options.body.toString());
  assert.equal(smsPayload.get('username'), process.env.AFRICASTALKING_USERNAME);
  assert.equal(smsPayload.get('to'), '+254712345678');
  assert.equal(smsPayload.get('from'), process.env.SMS_SENDER_ID);
  assert.equal(calls[0].options.headers.apiKey, process.env.AFRICASTALKING_API_KEY);
  assert.equal(calls[0].url, process.env.AFRICASTALKING_SMS_URL);
  assert.ok(calls[1].url.startsWith(process.env.AFRICASTALKING_BALANCE_URL));

  const directWhatsappPayload = JSON.parse(calls[2].options.body);
  assert.equal(directWhatsappPayload.user_id, process.env.BEEM_WHATSAPP_USER_ID);
  assert.equal(directWhatsappPayload.from_addr, '+254712345678');
  assert.equal(directWhatsappPayload.messageTemplateData.id, 479);
  assert.equal(directWhatsappPayload.params[0].param0, 'Test User');
  assert.equal(calls[2].options.headers.authorization, process.env.BEEM_WHATSAPP_AUTHORIZATION);

  const welcomeEmail = smtpCalls[1];
  assert.equal(welcomeEmail.from.address, 'notifications@qsys-ea.com');
  assert.match(welcomeEmail.html, /new\.user@riana\.co/);
  assert.match(welcomeEmail.html, /Login URL/i);
  assert.match(welcomeEmail.html, /https:\/\/cims\.riana\.co\//);
  assert.match(welcomeEmail.html, /reset-password\?token=mock-secure-setup-token/);
  assert.match(welcomeEmail.html, /create your password/i);
  assert.match(welcomeEmail.html, /Welcome to RIANA CIMS/);
  assert.match(welcomeEmail.html, /Developer/);
  assert.match(welcomeEmail.html, /#1A91AB/i);
  assert.match(welcomeEmail.html, /cid:system-logo/);
  assert.match(welcomeEmail.html, /Powered by Riana Automations/);
  assert.match(welcomeEmail.text, /Powered by Riana Automations/);
  assert.equal(welcomeEmail.attachments[0].cid, 'system-logo');
  assert.doesNotMatch(welcomeEmail.html, /MUST-NOT-LEAK|Temporary123!/);

  const welcomeSms = new URLSearchParams(calls[3].options.body.toString());
  assert.match(welcomeSms.get('message'), /Username: new\.user@riana\.co/);
  assert.match(welcomeSms.get('message'), /Login: https:\/\/cims\.riana\.co\//);
  assert.match(welcomeSms.get('message'), /reset-password\?token=mock-secure-setup-token/);
  assert.doesNotMatch(welcomeSms.get('message'), /MUST-NOT-LEAK|Temporary123!/);
  const welcomeWhatsapp = JSON.parse(calls[4].options.body);
  assert.equal(welcomeWhatsapp.params[0].param0, 'New User');
  assert.equal(welcomeWhatsapp.params[0].param1, 'RIANA CIMS account setup');

  assert.equal(smtpCalls[2].subject, 'New RIANA CIMS assignment');
  const dispatchedSms = new URLSearchParams(calls[5].options.body.toString());
  assert.match(dispatchedSms.get('message'), /new assignment/i);
  const dispatchedWhatsapp = JSON.parse(calls[6].options.body);
  assert.equal(dispatchedWhatsapp.params[0].param0, 'Riana Developer');
  assert.equal(smtpCalls[3].subject, 'Your RIANA CIMS password was changed');
  assert.equal(smtpCalls[4].subject, 'RIANA installation feedback requested');
  assert.ok(databaseCalls.some(call => call.sql.includes('INSERT INTO crms_notifications')));
  assert.ok(databaseCalls.some(call => call.sql.includes('email_sent = ?, sms_sent = ?') && call.params[0] === true && call.params[1] === true));
  assert.equal(smtpStatus().success, true);
  assert.equal(smsStatus().provider, 'africas-talking');
  assert.equal(whatsappStatus().provider, 'beem-whatsapp');
  assert.doesNotMatch(JSON.stringify(smtpStatus()), /mock-smtp-password/);
  console.log('Notification provider wiring verified without sending external messages.');
}

verify().catch((error) => {
  console.error(`Notification provider verification failed: ${error.message}`);
  process.exitCode = 1;
});
