const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const { sendEmail, sendSms } = require('../services/notifications');

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.join('=')];
}));

async function run() {
  if (args.confirm !== 'live') throw new Error('Live delivery requires --confirm=live');
  if (!args.email && !args.phone) throw new Error('Provide --email, --phone, or both');
  if (process.env.BREVO_FROM_EMAIL?.trim().toLowerCase() !== 'info@riana.co') {
    throw new Error('BREVO_FROM_EMAIL must be info@riana.co before testing');
  }

  const sentAt = new Date().toISOString();
  const deliveries = [];
  if (args.email) deliveries.push(['email', sendEmail({
      recipientEmail: args.email,
      recipientName: 'RIANA delivery test recipient',
      notificationType: 'general',
      requestDescription: `RIANA CIMS production email delivery test completed at ${sentAt}.`,
    })]);
  if (args.phone) deliveries.push(['sms', sendSms({
      phoneNumber: args.phone,
      message: `RIANA CIMS production SMS delivery test completed at ${sentAt}.`,
    })]);
  const settled = await Promise.allSettled(deliveries.map(([, task]) => task));
  const result = {
    sentAt,
    fromEmail: process.env.BREVO_FROM_EMAIL,
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
