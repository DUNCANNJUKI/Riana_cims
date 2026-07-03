const test = require('node:test');
const assert = require('node:assert/strict');
const { buildWelcomeEmailHtml, normalizePhone, sendWelcomeCredentials } = require('./notifications');

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
