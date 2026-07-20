const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.local') });
const { sendEmail, sendSms, sendWhatsApp, whatsappConfigured } = require('../services/notifications');

process.env.SMTP_HOST ||= 'smtp-mail.outlook.com';
process.env.SMTP_PORT ||= '587';
process.env.SMTP_SECURE ||= 'false';
process.env.SMTP_USER ||= 'notifications@qsys-ea.com';
process.env.SMTP_FROM_EMAIL ||= 'notifications@qsys-ea.com';
process.env.SMTP_FROM_NAME ||= 'QSYS Notifications';
process.env.AFRICASTALKING_USERNAME ||= 'QSYS';
process.env.AFRICASTALKING_SMS_URL ||= 'https://api.africastalking.com/version1/messaging';
process.env.AFRICASTALKING_BALANCE_URL ||= 'https://api.africastalking.com/version1/user';
process.env.SMS_SENDER_ID ||= 'Q-SYS';
process.env.ENABLE_WHATSAPP_NOTIFICATIONS ||= 'true';
process.env.BEEM_WHATSAPP_API_URL ||= 'https://apichatcore.beem.africa/v1/chat-send';
process.env.BEEM_WHATSAPP_TEMPLATE_ID ||= '479';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...value] = arg.replace(/^--/, '').split('=');
  return [key, value.join('=')];
}));

const logoBranding = (loginUrl) => {
  const logoCandidates = [
    path.join(__dirname, '../../public/Riana_logo_transparent.png'),
    path.join(__dirname, '../../public/Riana_mark_transparent.png'),
    path.join(__dirname, '../../public/Riana_logo.png'),
    path.join(__dirname, '../../dist/Riana_logo_transparent.png'),
    path.join(__dirname, '../../dist/Riana_mark_transparent.png'),
    path.join(__dirname, '../../dist/Riana_logo.png'),
    path.join(__dirname, '../../client/dist/Riana_logo_transparent.png'),
    path.join(__dirname, '../../client/dist/Riana_mark_transparent.png'),
    path.join(__dirname, '../../client/dist/Riana_logo.png'),
  ];
  const logoPath = logoCandidates.find(candidate => fs.existsSync(candidate));
  const branding = {
    name: 'RIANA CIMS',
    primaryColor: '#1A91AB',
    secondaryColor: '#2563EB',
    fontFamily: 'Inter',
  };
  if (logoPath) {
    branding.logoContent = fs.readFileSync(logoPath);
    branding.logoFilename = path.basename(logoPath);
    branding.logoContentType = 'image/png';
  } else {
    branding.logoUrl = `${loginUrl}/Riana_mark_transparent.png`;
  }
  return branding;
};

async function run() {
  if (args.confirm !== 'live') throw new Error('Live delivery requires --confirm=live');
  if (!args.email && !args.phone) throw new Error('Provide --email, --phone, or both');
  if (args.email && process.env.SMTP_FROM_EMAIL?.trim().toLowerCase() !== 'notifications@qsys-ea.com') {
    throw new Error('SMTP_FROM_EMAIL must be notifications@qsys-ea.com before testing');
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
      branding: logoBranding(loginUrl),
    })]);
  if (args.phone) {
    const message = `[TEST] RIANA CIMS production SMS delivery test completed at ${sentAt}. No action is required.`;
    deliveries.push(['sms', sendSms({ phoneNumber: args.phone, message })]);
    if (whatsappConfigured()) deliveries.push(['whatsapp', sendWhatsApp({
      phoneNumber: args.phone,
      message,
      recipientName: 'RIANA delivery test recipient',
      serviceName: 'Live delivery test',
      bookingDate: new Date().toLocaleDateString('en-GB'),
      notificationType: 'general',
    })]);
  }
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
