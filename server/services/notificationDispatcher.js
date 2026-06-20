const { v4: uuidv4 } = require('uuid');
const { sendEmail, sendSms } = require('./notifications');

const USER_TYPES = new Set(['info', 'success', 'warning', 'error']);

const userName = (user) =>
  `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;

async function deliverUserNotification({
  pool,
  userId,
  title,
  message,
  type = 'info',
  actionUrl = null,
  emailActionUrl,
  requestId = null,
  notificationType = 'general',
  email = true,
  sms = false,
  smsMessage,
  details = {},
}) {
  const [users] = await pool.query(
    'SELECT id,email,phone_number,first_name,last_name FROM user_profiles WHERE id = ? LIMIT 1',
    [userId],
  );
  if (!users.length) return { userId, skipped: true, reason: 'User not found' };

  const user = users[0];
  const notificationId = uuidv4();
  await pool.query(
    `INSERT INTO crms_notifications
      (id,user_id,request_id,title,message,type,\`read\`,action_url,email_sent,sms_sent)
     VALUES (?,?,?,?,?,?,FALSE,?,FALSE,FALSE)`,
    [
      notificationId,
      user.id,
      requestId,
      title,
      message,
      USER_TYPES.has(type) ? type : 'info',
      actionUrl,
    ],
  );

  const deliveries = [];
  if (email && user.email) {
    deliveries.push({
      channel: 'email',
      promise: sendEmail({
        recipientEmail: user.email,
        recipientName: userName(user),
        notificationType,
        requestDescription: message,
        actionUrl: emailActionUrl || actionUrl,
        ...details,
      }),
    });
  }
  if (sms && user.phone_number) {
    deliveries.push({
      channel: 'sms',
      promise: sendSms({ phoneNumber: user.phone_number, message: smsMessage || message }),
    });
  }

  const settled = await Promise.allSettled(deliveries.map(delivery => delivery.promise));
  const results = settled.map((result, index) => ({
    channel: deliveries[index].channel,
    success: result.status === 'fulfilled',
    ...(result.status === 'fulfilled'
      ? { result: result.value }
      : { error: result.reason?.message || 'Delivery failed' }),
  }));
  const emailSent = results.some(result => result.channel === 'email' && result.success);
  const smsSent = results.some(result => result.channel === 'sms' && result.success);
  await pool.query(
    'UPDATE crms_notifications SET email_sent = ?, sms_sent = ? WHERE id = ?',
    [emailSent, smsSent, notificationId],
  );

  for (const result of results) {
    if (!result.success) console.error(`Notification ${result.channel} delivery failed for user ${user.id}: ${result.error}`);
  }

  return { notificationId, userId: user.id, emailSent, smsSent, deliveries: results };
}

async function sendUserNotification(options) {
  try {
    return await deliverUserNotification(options);
  } catch (error) {
    console.error(`Notification dispatch failed for user ${options.userId}: ${error.message}`);
    return { userId: options.userId, error: error.message, emailSent: false, smsSent: false };
  }
}

async function sendUsersNotification(options) {
  const userIds = [...new Set((options.userIds || []).filter(Boolean))];
  return Promise.all(userIds.map(userId => sendUserNotification({ ...options, userId })));
}

module.exports = { sendUserNotification, sendUsersNotification };
