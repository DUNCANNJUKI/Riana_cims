const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';
const PROVIDER_TIMEOUT_MS = Number(process.env.NOTIFICATION_PROVIDER_TIMEOUT_MS || 10000);

const providerSignal = () => AbortSignal.timeout(PROVIDER_TIMEOUT_MS);

const requiredEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const joinUrl = (base, path) => `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const emailSubjects = {
  request_created: 'New change request created',
  approval_needed: 'Change request awaiting approval',
  approved: 'Change request approved',
  rejected: 'Change request rejected',
  assigned: 'Change request assigned',
  commenced: 'Change request work commenced',
  completed: 'Change request completed',
  waiting_clarification: 'Change request needs clarification',
  login_verification: 'Your RIANA verification code',
  welcome: 'Welcome to RIANA CIMS',
  assignment: 'New RIANA CIMS assignment',
  assignment_updated: 'RIANA CIMS assignment updated',
  password_changed: 'Your RIANA CIMS password was changed',
  password_reset: 'Reset your RIANA CIMS password',
  feedback_requested: 'RIANA installation feedback requested',
  general: 'RIANA CIMS notification',
};

const buildNotificationHtml = (notification) => {
  const title = emailSubjects[notification.notificationType] || 'RIANA CIMS notification';
  const rows = [
    ['Ticket', notification.ticketNumber], ['Client', notification.clientName],
    ['Request', notification.requestDescription], ['Approved by', notification.approverName],
    ['Developer', notification.developerName], ['Comment', notification.comment],
    ['Username', notification.username], ['Temporary password', notification.password],
    ['Login URL', notification.loginUrl], ['Account setup', notification.setupUrl],
  ].filter(([, value]) => value);
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif;color:#172033">
    <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="padding:22px 28px;background:#0d8390;color:#fff"><strong>RIANA CIMS</strong></div>
      <div style="padding:28px"><h2 style="margin-top:0">${escapeHtml(title)}</h2>
        <p>Hello ${escapeHtml(notification.recipientName || 'there')},</p>
        ${rows.map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join('')}
        ${notification.actionUrl ? `<p style="margin-top:28px"><a href="${escapeHtml(notification.actionUrl)}" style="background:#0d8390;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Open RIANA CIMS</a></p>` : ''}
      </div></div></body></html>`;
};

async function parseProviderResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

async function sendEmail(notification) {
  const apiKey = requiredEnv('BREVO_API_KEY');
  const fromEmail = requiredEnv('BREVO_FROM_EMAIL');
  const fromName = process.env.BREVO_FROM_NAME?.trim() || 'RIANA CIMS';
  if (!notification.recipientEmail) throw new Error('recipientEmail is required');
  const response = await fetch(BREVO_EMAIL_URL, {
    method: 'POST',
    signal: providerSignal(),
    headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: [{ email: notification.recipientEmail, name: notification.recipientName || notification.recipientEmail }],
      subject: emailSubjects[notification.notificationType] || 'RIANA CIMS notification',
      htmlContent: buildNotificationHtml(notification),
    }),
  });
  const data = await parseProviderResponse(response);
  if (!response.ok) throw new Error(`Brevo delivery failed (${response.status}): ${data.message || 'provider error'}`);
  return { provider: 'brevo', messageId: data.messageId || null };
}

const normalizePhone = (phone) => {
  const cleaned = String(phone || '').replace(/[^\d+]/g, '');
  if (/^0[17]\d{8}$/.test(cleaned)) return `+254${cleaned.slice(1)}`;
  if (/^254[17]\d{8}$/.test(cleaned)) return `+${cleaned}`;
  if (/^[17]\d{8}$/.test(cleaned)) return `+254${cleaned}`;
  if (/^\+254[17]\d{8}$/.test(cleaned)) return cleaned;
  throw new Error('A valid Kenyan recipient phone number is required');
};

const bTextmanHeaders = () => {
  const apiKey = requiredEnv('B_TEXTMAN_API_KEY');
  return { accept: 'application/json', authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey, 'content-type': 'application/json' };
};

async function sendSms({ phoneNumber, message }) {
  if (!message?.trim()) throw new Error('message is required');
  const baseUrl = requiredEnv('B_TEXTMAN_API_URL');
  const sendPath = process.env.B_TEXTMAN_SEND_PATH?.trim() || 'send-sms';
  const senderId = process.env.SMS_SENDER_ID?.trim() || 'RIANA';
  const response = await fetch(joinUrl(baseUrl, sendPath), {
    method: 'POST', headers: bTextmanHeaders(), signal: providerSignal(),
    body: JSON.stringify({ recipient: normalizePhone(phoneNumber), message: message.trim(), sender_id: senderId }),
  });
  const data = await parseProviderResponse(response);
  if (!response.ok) throw new Error(`B-Textman delivery failed (${response.status}): ${data.message || data.error || 'provider error'}`);
  return { provider: 'b-textman', data };
}

async function getSmsBalance() {
  const baseUrl = requiredEnv('B_TEXTMAN_API_URL');
  const balancePath = requiredEnv('B_TEXTMAN_BALANCE_PATH');
  const response = await fetch(joinUrl(baseUrl, balancePath), { headers: bTextmanHeaders(), signal: providerSignal() });
  const data = await parseProviderResponse(response);
  if (!response.ok) throw new Error(`B-Textman balance lookup failed (${response.status}): ${data.message || data.error || 'provider error'}`);
  return data;
}

async function sendVerificationCode({ channel, destination, code }) {
  if (channel === 'email') {
    return sendEmail({ recipientEmail: destination, recipientName: 'RIANA user', notificationType: 'login_verification', requestDescription: `Your verification code is ${code}. It expires in 10 minutes.` });
  }
  return sendSms({ phoneNumber: destination, message: `RIANA verification code: ${code}. Expires in 10 minutes.` });
}

async function sendWelcomeCredentials({ email, phoneNumber, name, password, loginUrl, setupUrl }) {
  const usesSecureSetup = Boolean(setupUrl);
  const message = usesSecureSetup
    ? `Welcome to RIANA CIMS. Complete your secure account setup within 30 minutes: ${setupUrl}`
    : `Welcome to RIANA CIMS. Username: ${email}. Temporary password: ${password}. Login: ${loginUrl}. You must change your password on first login.`;
  const deliveries = await Promise.allSettled([
    sendEmail({
      recipientEmail: email,
      recipientName: name || email,
      notificationType: 'welcome',
      requestDescription: usesSecureSetup
        ? 'Your account is ready. Use the secure link below within 30 minutes to choose your password.'
        : 'Your account is ready. You must change the temporary password when you first log in.',
      username: email,
      password: usesSecureSetup ? undefined : password,
      loginUrl,
      setupUrl,
      actionUrl: setupUrl || loginUrl,
    }),
    phoneNumber ? sendSms({ phoneNumber, message }) : Promise.resolve({ provider: 'b-textman', skipped: true, reason: 'No phone number' }),
  ]);
  return deliveries.map((delivery, index) => delivery.status === 'fulfilled'
    ? delivery.value
    : { provider: index === 0 ? 'brevo' : 'b-textman', error: delivery.reason?.message || 'Delivery failed' });
}

module.exports = { getSmsBalance, sendEmail, sendSms, sendVerificationCode, sendWelcomeCredentials };
