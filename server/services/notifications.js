const nodemailer = require('nodemailer');
const { parsePhoneNumberFromString } = require('libphonenumber-js/max');
const PROVIDER_TIMEOUT_MS = Number(process.env.NOTIFICATION_PROVIDER_TIMEOUT_MS || 10000);
let smtpTransport;
let lastSmtpStatus = { testedAt: null, success: null, action: null, error: null, response: null };

const providerSignal = () => AbortSignal.timeout(PROVIDER_TIMEOUT_MS);

const requiredEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const smtpPassword = () => {
  const value = process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS;
  if (typeof value !== 'string' || value.length === 0) throw new Error('SMTP_PASSWORD or SMTP_PASS is not configured');
  return value;
};

const configuredSender = () => {
  const combined = String(process.env.SMTP_FROM || '').trim();
  const match = combined.match(/^([^<>]*)<([^<>]+)>$/);
  return {
    name: process.env.SMTP_FROM_NAME?.trim() || match?.[1]?.trim() || 'RIANA CIMS',
    address: process.env.SMTP_FROM_EMAIL?.trim() || match?.[2]?.trim() || requiredEnv('SMTP_USER'),
  };
};

const smtpConfiguration = () => {
  const host = requiredEnv('SMTP_HOST');
  const port = Number(process.env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT must be a valid TCP port');
  return {
    host,
    port,
    secure: String(process.env.SMTP_SECURE || (port === 465 ? 'true' : 'false')).toLowerCase() === 'true',
    user: requiredEnv('SMTP_USER'),
  };
};

const getSmtpTransport = () => {
  if (smtpTransport) return smtpTransport;
  const { host, port, secure, user } = smtpConfiguration();
  smtpTransport = nodemailer.createTransport({
    host,
    port,
    secure,
    pool: true,
    maxConnections: Math.max(1, Number(process.env.SMTP_MAX_CONNECTIONS || 3)),
    maxMessages: Math.max(1, Number(process.env.SMTP_MAX_MESSAGES || 50)),
    rateDelta: 1000,
    rateLimit: Math.max(1, Number(process.env.SMTP_RATE_LIMIT || 5)),
    auth: { user, pass: smtpPassword() },
    connectionTimeout: PROVIDER_TIMEOUT_MS,
    greetingTimeout: PROVIDER_TIMEOUT_MS,
    socketTimeout: PROVIDER_TIMEOUT_MS,
    disableFileAccess: true,
    disableUrlAccess: true,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
  });
  return smtpTransport;
};

const smtpStatus = () => {
  try {
    const config = smtpConfiguration();
    return {
      configured: Boolean(process.env.SMTP_PASSWORD || process.env.SMTP_PASS),
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user,
      fromEmail: configuredSender().address,
      ...lastSmtpStatus,
    };
  } catch (error) {
    return { configured: false, ...lastSmtpStatus, error: lastSmtpStatus.error || error.message };
  }
};

async function verifySmtpConnection() {
  const testedAt = new Date().toISOString();
  try {
    await getSmtpTransport().verify();
    lastSmtpStatus = { testedAt, success: true, action: 'connection', error: null, response: 'SMTP connection, TLS, and authentication succeeded.' };
    console.info(JSON.stringify({ event: 'smtp_connection_verified', testedAt }));
    return smtpStatus();
  } catch (error) {
    lastSmtpStatus = { testedAt, success: false, action: 'connection', error: error.message, response: null };
    console.error(JSON.stringify({ event: 'smtp_connection_failed', testedAt, code: error.code || null, message: error.message }));
    throw error;
  }
}

const joinUrl = (base, path) => `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const safeHttpUrl = (value, fallback = '') => {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
};

const safeThemeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
const safeFontFamily = (value) => {
  const supported = new Set(['Arial', 'Inter', 'Roboto', 'Helvetica', 'Verdana', 'Tahoma']);
  return supported.has(String(value || '').trim()) ? String(value).trim() : 'Arial';
};

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
  support_guide: 'Your RIANA CIMS support guide',
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
      </div><div style="padding:16px 28px;border-top:1px solid #e5e7eb;text-align:center;color:#78879a;font-size:11px"><strong>RIANA CIMS</strong><br>Powered by Riana Atomations</div></div></body></html>`;
};

const detailRow = (icon, label, value, options = {}) => {
  const safeValue = escapeHtml(value);
  const content = options.url
    ? `<a href="${escapeHtml(options.url)}" style="color:${options.color};font-weight:700;text-decoration:underline;word-break:break-all">${safeValue}</a>`
    : `<div style="margin-top:4px;color:#172033;font-size:14px;font-weight:700;word-break:break-word">${safeValue}</div>`;
  return `<tr><td style="padding:0 0 8px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #dce3ec;border-radius:7px;background:#fff">
      <tr><td width="38" valign="top" style="padding:12px 0 12px 12px;font-size:17px">${icon}</td>
      <td style="padding:10px 12px 10px 6px"><div style="color:#68778b;font-size:11px">${escapeHtml(label)}</div>${content}</td></tr>
    </table></td></tr>`;
};

const buildWelcomeEmailHtml = (notification) => {
  const branding = notification.branding || {};
  const companyName = String(branding.name || 'RIANA CIMS').trim().slice(0, 120) || 'RIANA CIMS';
  const primaryColor = safeThemeColor(branding.primaryColor, '#0D8390');
  const secondaryColor = safeThemeColor(branding.secondaryColor, '#2563EB');
  const fontFamily = safeFontFamily(branding.fontFamily);
  const loginUrl = safeHttpUrl(notification.loginUrl);
  const setupUrl = safeHttpUrl(notification.setupUrl);
  const logoUrl = safeHttpUrl(branding.logoUrl);
  const logoSource = branding.logoContent ? 'cid:system-logo' : logoUrl;
  const logo = logoSource
    ? `<img src="${escapeHtml(logoSource)}" width="116" alt="${escapeHtml(companyName)} logo" style="display:block;max-width:116px;max-height:72px;margin:0 auto 16px;object-fit:contain">`
    : '';
  const greetingName = notification.recipientName || 'there';
  const rows = [
    detailRow('🌐', 'Login URL', loginUrl, { url: loginUrl, color: primaryColor }),
    detailRow('✉️', 'Email / Username', notification.username || notification.recipientEmail),
    detailRow('🔐', 'Secure Password Setup', 'Create your password using the button below'),
    detailRow('🎓', 'Role', notification.role || 'User'),
  ].join('');

  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f3f6f9;font-family:${fontFamily},Arial,sans-serif;color:#172033">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6f9"><tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
        <tr><td align="center" style="padding:28px 24px;background:${primaryColor};background-image:linear-gradient(135deg,${primaryColor},${secondaryColor});color:#fff">
          ${logo}<div style="font-size:22px;font-weight:800;line-height:1.25">Welcome to ${escapeHtml(companyName)}</div>
          <div style="margin-top:8px;font-size:13px;opacity:.95">Your account is ready — here are your login details</div>
        </td></tr>
        <tr><td style="padding:28px 24px">
          <p style="margin:0 0 18px;font-size:14px"><strong>Hi ${escapeHtml(greetingName)},</strong></p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.65">Welcome to ${escapeHtml(companyName)}. Your account has been created by an administrator. Use the secure link below to create your password, then sign in and manage your work.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:14px;background:#f8fafc;border:1px solid #dce3ec;border-radius:8px">
            <tr><td style="padding:0 0 12px;color:#50627a;font-size:12px;font-weight:800;letter-spacing:.3px">🔑 YOUR LOGIN CREDENTIALS</td></tr>
            ${rows}
          </table>
          <div style="padding-top:20px;text-align:center"><a href="${escapeHtml(setupUrl)}" style="display:inline-block;padding:13px 22px;border-radius:7px;background:${primaryColor};color:#fff;font-size:14px;font-weight:800;text-decoration:none">Create Your Password</a></div>
          <p style="margin:16px 0 0;text-align:center;color:#68778b;font-size:12px;line-height:1.5">For your security, this setup link expires in 30 minutes. If it expires, use “Forgot your password?” on the login page.</p>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;text-align:center;color:#78879a;font-size:11px"><strong>${escapeHtml(companyName)}</strong><br>Powered by Riana Atomations</td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
};

async function parseProviderResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

const EMAIL_PATTERN = /^[^\s@<>(),;:\\"\[\]]+@[^\s@<>(),;:\\"\[\]]+\.[^\s@<>(),;:\\"\[\]]+$/;
const validatedMailbox = (value, fieldName) => {
  const email = String(value || '').trim();
  if (!EMAIL_PATTERN.test(email) || /[\r\n]/.test(email)) throw new Error(`${fieldName} must be a valid email address`);
  return email;
};
const validatedMailboxList = (value, fieldName) => {
  if (!value) return undefined;
  const values = Array.isArray(value) ? value : [value];
  return values.map(email => ({ address: validatedMailbox(email, fieldName) }));
};
const plainTextFor = (notification, subject) => [
  subject,
  `Hello ${notification.recipientName || 'there'},`,
  notification.requestDescription,
  notification.ticketNumber && `Ticket: ${notification.ticketNumber}`,
  notification.clientName && `Client: ${notification.clientName}`,
  notification.username && `Username: ${notification.username}`,
  notification.loginUrl && `Login URL: ${notification.loginUrl}`,
  notification.setupUrl && `Account setup: ${notification.setupUrl}`,
  notification.actionUrl && `Open RIANA CIMS: ${notification.actionUrl}`,
  '',
  'RIANA CIMS',
  'Powered by Riana Atomations',
].filter(Boolean).join('\n\n');
const safeAttachments = (attachments = []) => {
  if (!Array.isArray(attachments)) throw new Error('attachments must be an array');
  let totalBytes = 0;
  return attachments.map((attachment, index) => {
    if (!Buffer.isBuffer(attachment?.content)) throw new Error(`Attachment ${index + 1} must provide in-memory content`);
    totalBytes += attachment.content.length;
    if (totalBytes > 10 * 1024 * 1024) throw new Error('Total attachment size exceeds 10MB');
    return {
      filename: String(attachment.filename || `attachment-${index + 1}`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160),
      content: attachment.content,
      contentType: attachment.contentType || 'application/octet-stream',
      ...(attachment.cid ? { cid: String(attachment.cid).replace(/[^a-zA-Z0-9._@-]/g, '') } : {}),
    };
  });
};
const transientSmtpFailure = (error) => ['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EAI_AGAIN'].includes(error?.code)
  || [421, 450, 451, 452].includes(Number(error?.responseCode));
const sendMailWithRetry = async (message) => {
  const attempts = Math.max(1, Math.min(5, Number(process.env.SMTP_RETRY_ATTEMPTS || 3)));
  const baseDelayMs = Math.max(100, Math.min(5000, Number(process.env.SMTP_RETRY_BASE_DELAY_MS || 500)));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await getSmtpTransport().sendMail(message);
    } catch (error) {
      const willRetry = attempt < attempts && transientSmtpFailure(error);
      console.error(JSON.stringify({ event: willRetry ? 'smtp_retry' : 'smtp_send_failed', attempt, code: error.code || null, responseCode: error.responseCode || null, message: error.message }));
      if (!willRetry) {
        lastSmtpStatus = { testedAt: new Date().toISOString(), success: false, action: 'send', error: error.message, response: null };
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, baseDelayMs * (2 ** (attempt - 1))));
    }
  }
  throw new Error('SMTP delivery failed');
};

async function sendEmail(notification) {
  const configuredFrom = configuredSender();
  const fromEmail = configuredFrom.address;
  const fromName = String(notification.fromName || configuredFrom.name).trim().replace(/[\r\n]/g, '').slice(0, 120);
  const recipientEmail = validatedMailbox(notification.recipientEmail, 'recipientEmail');
  const logoAttachments = notification.notificationType === 'welcome' && Buffer.isBuffer(notification.branding?.logoContent)
    ? [{
        filename: notification.branding.logoFilename || 'system-logo.png',
        content: notification.branding.logoContent,
        contentType: notification.branding.logoContentType || 'image/png',
        cid: 'system-logo',
      }]
    : [];
  const attachments = safeAttachments([...logoAttachments, ...(notification.attachments || [])]);
  const baseSubject = emailSubjects[notification.notificationType] || 'RIANA CIMS notification';
  const subject = notification.deliveryTest ? `[TEST] ${baseSubject}` : baseSubject;
  const info = await sendMailWithRetry({
    from: { name: fromName, address: validatedMailbox(fromEmail, 'SMTP_FROM_EMAIL') },
    to: [{ address: recipientEmail, name: String(notification.recipientName || recipientEmail).replace(/[\r\n]/g, '').slice(0, 120) }],
    cc: validatedMailboxList(notification.cc, 'cc'),
    bcc: validatedMailboxList(notification.bcc, 'bcc'),
    replyTo: notification.replyTo ? validatedMailbox(notification.replyTo, 'replyTo') : undefined,
    subject,
    text: notification.text || plainTextFor(notification, subject),
    html: notification.html || (notification.notificationType === 'welcome' ? buildWelcomeEmailHtml(notification) : buildNotificationHtml(notification)),
    ...(attachments.length ? { attachments } : {}),
  });
  lastSmtpStatus = { testedAt: new Date().toISOString(), success: true, action: 'send', error: null, response: info.response || 'Message accepted by SMTP server.' };
  console.info(JSON.stringify({ event: 'smtp_email_accepted', messageId: info.messageId || null, accepted: info.accepted?.length || 0, rejected: info.rejected?.length || 0 }));
  return {
    provider: 'smtp',
    messageId: info.messageId || null,
    accepted: Array.isArray(info.accepted) ? info.accepted.length : 0,
    rejected: Array.isArray(info.rejected) ? info.rejected.length : 0,
  };
}

const normalizePhone = (phone) => {
  const cleaned = String(phone || '').trim();
  const defaultCountry = String(process.env.DEFAULT_PHONE_COUNTRY || 'KE').trim().toUpperCase();
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  const type = parsed?.getType();
  if (!parsed?.isValid() || !['MOBILE', 'FIXED_LINE_OR_MOBILE'].includes(type)) {
    throw new Error('A valid international recipient mobile phone number is required');
  }
  return parsed.number;
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
  const providerStatus = String(data.status || '').trim().toLowerCase();
  const providerRejected = data.success === false || data.ok === false || ['failed', 'error', 'rejected'].includes(providerStatus);
  if (!response.ok || providerRejected) {
    throw new Error(`B-Textman delivery failed (${response.status}): ${data.message || data.error || providerStatus || 'provider error'}`);
  }
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

async function sendWelcomeCredentials({ email, phoneNumber, name, role, loginUrl, setupUrl, branding, deliveryTest = false }) {
  if (!setupUrl) throw new Error('setupUrl is required for secure account onboarding');
  const message = `Welcome to RIANA CIMS. Username: ${email}. Login: ${loginUrl}. Set your password within 30 minutes: ${setupUrl}`;
  const deliveries = await Promise.allSettled([
    sendEmail({
      recipientEmail: email,
      recipientName: name || email,
      notificationType: 'welcome',
      requestDescription: 'Your account is ready. Your username and login URL are below. Use the secure account-setup link within 30 minutes to choose your password.',
      username: email,
      loginUrl,
      setupUrl,
      actionUrl: setupUrl,
      role,
      branding,
      deliveryTest,
    }),
    phoneNumber ? sendSms({ phoneNumber, message }) : Promise.resolve({ provider: 'b-textman', skipped: true, reason: 'No phone number' }),
  ]);
  return deliveries.map((delivery, index) => delivery.status === 'fulfilled'
    ? delivery.value
    : { provider: index === 0 ? 'smtp' : 'b-textman', error: delivery.reason?.message || 'Delivery failed' });
}

module.exports = { buildWelcomeEmailHtml, getSmsBalance, normalizePhone, sendEmail, sendSms, sendVerificationCode, sendWelcomeCredentials, smtpStatus, verifySmtpConnection };
