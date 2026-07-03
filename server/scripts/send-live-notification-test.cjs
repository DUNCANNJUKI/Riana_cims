const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const { sendEmail, sendSms } = require('../services/notifications');

process.env.SMTP_HOST ||= 'mail.rianacims.name.ng';
process.env.SMTP_PORT ||= '465';
process.env.SMTP_SECURE ||= 'true';
process.env.SMTP_USER ||= 'info@rianacims.name.ng';
process.env.SMTP_FROM_EMAIL ||= 'info@rianacims.name.ng';
process.env.SMTP_FROM_NAME ||= 'RIANA CIMS';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.join('=')];
}));

async function run() {
  if (args.confirm !== 'live') throw new Error('Live delivery requires --confirm=live');
  if (!args.email && !args.phone) throw new Error('Provide --email, --phone, or both');
  if (args.email && process.env.SMTP_FROM_EMAIL?.trim().toLowerCase() !== 'info@rianacims.name.ng') {
    throw new Error('SMTP_FROM_EMAIL must be info@rianacims.name.ng before testing');
  }

  const sentAt = new Date().toISOString();
  const loginUrl = String(process.env.CIMS_LOGIN_URL || 'https://rianacims.name.ng').replace(/\/+$/, '');
  const deliveries = [];
  if (args.email) deliveries.push(['email', sendEmail({
      recipientEmail: args.email,
      recipientName: 'RIANA delivery test recipient',
      notificationType: 'welcome',
      username: args.email,
      role: 'Test Recipient',
      loginUrl,
      setupUrl: `${loginUrl}/reset-password?token=DELIVERY-TEST-NOT-ACTIVE`,
      deliveryTest: true,
      branding: {
        name: 'RIANA CIMS', primaryColor: '#1A91AB', secondaryColor: '#2563EB', fontFamily: 'Inter',
        logoUrl: `${loginUrl}/Riana_logo.png`,
      },
    })]);
  if (args.phone) deliveries.push(['sms', sendSms({
      phoneNumber: args.phone,
      message: `[TEST] RIANA CIMS production SMS delivery test completed at ${sentAt}. No action is required.`,
    })]);
  const settled = await Promise.allSettled(deliveries.map(([, task]) => task));
  const result = {
    sentAt,
    fromEmail: process.env.SMTP_FROM_EMAIL,
  };
  deliveries.forEach(([channel], index) => {
    const delivery = settled[index];
    result[channel] = delivery.status === 'fulfilled'
      ? { success: true, ...delivery.value }
      : { success: false, error: delivery.reason.message };
  });
  console.log(JSON.stringify(result, null, 2));
  if (Object.values(result).some((value) => value && typeof value === 'object' && value.success === false)) process.exitCode = 1;
}

run().catch((error) => {
  console.error(`Live notification test failed: ${error.message}`);
  process.exitCode = 1;
});
