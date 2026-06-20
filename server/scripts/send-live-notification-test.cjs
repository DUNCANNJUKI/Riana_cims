const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const { sendEmail, sendSms } = require('../services/notifications');

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.join('=')];
}));

async function run() {
  if (args.confirm !== 'live') throw new Error('Live delivery requires --confirm=live');
  if (!args.email || !args.phone) throw new Error('Both --email and --phone are required');
  if (process.env.BREVO_FROM_EMAIL?.trim().toLowerCase() !== 'info@riana.co') {
    throw new Error('BREVO_FROM_EMAIL must be info@riana.co before testing');
  }

  const sentAt = new Date().toISOString();
  const [email, sms] = await Promise.allSettled([
    sendEmail({
      recipientEmail: args.email,
      recipientName: 'RIANA delivery test recipient',
      notificationType: 'general',
      requestDescription: `RIANA CIMS production email delivery test completed at ${sentAt}.`,
    }),
    sendSms({
      phoneNumber: args.phone,
      message: `RIANA CIMS production SMS delivery test completed at ${sentAt}.`,
    }),
  ]);
  const result = {
    sentAt,
    fromEmail: process.env.BREVO_FROM_EMAIL,
    email: email.status === 'fulfilled' ? { success: true, ...email.value } : { success: false, error: email.reason.message },
    sms: sms.status === 'fulfilled' ? { success: true, ...sms.value } : { success: false, error: sms.reason.message },
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.email.success || !result.sms.success) process.exitCode = 1;
}

run().catch((error) => {
  console.error(`Live notification test failed: ${error.message}`);
  process.exitCode = 1;
});
