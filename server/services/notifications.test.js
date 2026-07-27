const test = require('node:test');
const assert = require('node:assert/strict');
const { buildNotificationHtml, buildWelcomeEmailHtml, normalizePhone, sendWelcomeCredentials } = require('./notifications');
const { normalizeNotificationType, subjectForNotification } = require('./notificationTypes');

test('normalizes local and international phone formats', () => {
  assert.equal(normalizePhone('0712 345 678'), '+254712345678');
  assert.equal(normalizePhone('254712345678'), '+254712345678');
  assert.equal(normalizePhone('+254712345678'), '+254712345678');
  assert.equal(normalizePhone('+14155552671'), '+14155552671');
});

test('rejects missing or invalid welcome SMS destinations', () => {
  assert.throws(() => normalizePhone(''), /valid international recipient mobile/i);
  assert.throws(() => normalizePhone('0201234567'), /valid international recipient mobile/i);
});

test('requires a secure setup URL for welcome delivery', async () => {
  await assert.rejects(
    sendWelcomeCredentials({
      email: 'new.user@riana.co',
      phoneNumber: '+254712345678',
      loginUrl: 'https://cims.example.test/',
    }),
    /setupUrl is required/i,
  );
});

test('welcome template escapes content and rejects unsafe theme and URL values', () => {
  const html = buildWelcomeEmailHtml({
    recipientEmail: 'user@riana.co',
    recipientName: '<script>alert(1)</script>',
    username: 'user@riana.co',
    role: '<img src=x onerror=alert(1)>',
    loginUrl: 'javascript:alert(1)',
    setupUrl: 'https://cims.example.test/reset-password?token=safe',
    branding: { name: '<b>Unsafe</b>', primaryColor: 'red;position:fixed', fontFamily: 'Arial;src:url(evil)' },
  });
  assert.doesNotMatch(html, /<script>|<img src=x|javascript:alert|position:fixed|src:url/i);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /#0D8390/i);
});
test('welcome template avoids mojibake artifacts', () => {
  const html = buildWelcomeEmailHtml({
    recipientEmail: 'user@riana.co',
    recipientName: 'User',
    username: 'user@riana.co',
    role: 'User',
    loginUrl: 'https://cims.example.test/',
    setupUrl: 'https://cims.example.test/reset-password?token=safe',
    branding: { name: 'RIANA CIMS', primaryColor: '#0D8390', secondaryColor: '#2563EB', fontFamily: 'Arial' },
  });
  assert.match(html, /<meta charset="UTF-8">/);
  assert.match(html, /Your account is ready - here are your login details/);
  assert.match(html, /YOUR LOGIN CREDENTIALS/);
  assert.doesNotMatch(html, /Ã|Â|â|ð|Å|Œ|€/);
});

test('appreciation notifications use message labels and safe greetings', () => {
  const html = buildNotificationHtml({
    notificationType: 'APPRECIATION',
    clientName: 'Lifecare',
    requestDescription: 'Thank you for your feedback, we appreciate it.',
  });
  assert.match(html, /Thank you for your feedback/);
  assert.match(html, /<strong>Client:<\/strong> Lifecare/);
  assert.match(html, /<strong>Message:<\/strong> Thank you for your feedback, we appreciate it\./);
  assert.match(html, /<p>Hello,<\/p>/);
  assert.doesNotMatch(html, /<strong>Request:<\/strong>|undefined|null|Hello\s+,/i);
});

test('notification type config normalizes legacy and canonical subjects', () => {
  assert.equal(normalizeNotificationType('thank-you', 'thank you for the response'), 'GENERAL');
  assert.equal(normalizeNotificationType('', 'thank you for the response'), 'APPRECIATION');
  assert.equal(normalizeNotificationType('assigned', 'A task was assigned'), 'ASSIGNMENT');
  assert.equal(subjectForNotification({ notificationType: 'REQUEST', clientName: 'Lifecare' }), 'New request from Lifecare');
  assert.equal(subjectForNotification({ notificationType: 'APPRECIATION' }), 'Thank you for your feedback');
  assert.equal(subjectForNotification({ notificationType: 'assigned' }), 'Change request assigned');
});