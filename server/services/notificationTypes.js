const CANONICAL_TYPES = new Set([
  'REQUEST',
  'APPRECIATION',
  'ACKNOWLEDGEMENT',
  'UPDATE',
  'REMINDER',
  'RESOLUTION',
  'ASSIGNMENT',
  'APPROVAL',
  'REJECTION',
  'ESCALATION',
  'GENERAL',
]);

const TYPE_ALIASES = {
  request_created: 'REQUEST',
  approval_needed: 'APPROVAL',
  approved: 'APPROVAL',
  rejected: 'REJECTION',
  assigned: 'ASSIGNMENT',
  assignment: 'ASSIGNMENT',
  assignment_updated: 'UPDATE',
  commenced: 'UPDATE',
  completed: 'RESOLUTION',
  waiting_clarification: 'REQUEST',
  feedback_requested: 'REQUEST',
  feedback_thank_you: 'APPRECIATION',
  password_changed: 'GENERAL',
  password_reset: 'REMINDER',
  login_verification: 'GENERAL',
  welcome: 'GENERAL',
  support_guide: 'GENERAL',
};

const notificationTypeConfig = {
  REQUEST: { label: 'Request', defaultSubject: 'New request' },
  APPRECIATION: { label: 'Message', defaultSubject: 'Thank you for your feedback' },
  ACKNOWLEDGEMENT: { label: 'Acknowledgement', defaultSubject: 'Acknowledgement received' },
  UPDATE: { label: 'Update', defaultSubject: 'Client update' },
  REMINDER: { label: 'Reminder', defaultSubject: 'Reminder: Pending action' },
  RESOLUTION: { label: 'Resolution', defaultSubject: 'Issue resolved' },
  ASSIGNMENT: { label: 'Assignment', defaultSubject: 'New task assigned' },
  APPROVAL: { label: 'Approval', defaultSubject: 'Request approved' },
  REJECTION: { label: 'Decision', defaultSubject: 'Request update' },
  ESCALATION: { label: 'Escalation', defaultSubject: 'Escalation notice' },
  GENERAL: { label: 'Message', defaultSubject: 'RIANA CIMS notification' },
};
const LEGACY_SUBJECTS = {
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
  feedback_thank_you: 'Thank you for your feedback',
  support_guide: 'Your RIANA CIMS support guide',
};
const inferNotificationType = (message = '') => {
  const value = String(message || '').toLowerCase();
  if (/\b(thank you|thanks|we appreciate|appreciate it|grateful)\b/.test(value)) return 'APPRECIATION';
  if (/\b(resolved|completed|fixed)\b/.test(value)) return 'RESOLUTION';
  if (/\b(assigned|allocated)\b/.test(value)) return 'ASSIGNMENT';
  if (/\b(approved|authorized)\b/.test(value)) return 'APPROVAL';
  if (/\b(rejected|declined)\b/.test(value)) return 'REJECTION';
  if (/\b(reminder|pending action|follow up|follow-up)\b/.test(value)) return 'REMINDER';
  if (/\b(please provide|kindly assist|request)\b/.test(value)) return 'REQUEST';
  return 'GENERAL';
};

const normalizeNotificationType = (value, message) => {
  const raw = String(value || '').trim();
  if (!raw) return inferNotificationType(message);
  const upper = raw.toUpperCase().replace(/[-\s]+/g, '_');
  if (CANONICAL_TYPES.has(upper)) return upper;
  return TYPE_ALIASES[raw.toLowerCase()] || 'GENERAL';
};

const displayValue = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const subjectForNotification = (notification = {}) => {
  const explicit = displayValue(notification.subject);
  if (explicit) return explicit.slice(0, 180);
  const legacySubject = LEGACY_SUBJECTS[String(notification.notificationType || '').trim().toLowerCase()];
  if (legacySubject) return legacySubject;
  const notificationType = normalizeNotificationType(notification.notificationType, notification.requestDescription || notification.message);
  const clientName = displayValue(notification.clientName);
  if (notificationType === 'REQUEST' && clientName) return `New request from ${clientName}`.slice(0, 180);
  if (notificationType === 'UPDATE' && clientName) return `Update regarding ${clientName}`.slice(0, 180);
  if (notificationType === 'RESOLUTION' && clientName) return `Issue resolved for ${clientName}`.slice(0, 180);
  return notificationTypeConfig[notificationType].defaultSubject;
};

const labelForNotification = (notification = {}) => {
  const notificationType = normalizeNotificationType(notification.notificationType, notification.requestDescription || notification.message);
  return notificationTypeConfig[notificationType].label;
};

module.exports = {
  CANONICAL_TYPES,
  inferNotificationType,
  labelForNotification,
  LEGACY_SUBJECTS,
  normalizeNotificationType,
  notificationTypeConfig,
  subjectForNotification,
};
