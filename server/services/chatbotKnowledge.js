const { hasCapability } = require('../security/accessControl');

const RIANA_ASSISTANT_SYSTEM_PROMPT = [
  'You are the Riana CIMS Assistant. Help users with verified information and supported actions available inside Riana CIMS.',
  'Be friendly, concise and direct. For normal questions, answer in one to three short sentences. Do not provide long explanations unless the user asks for details.',
  'For greetings, greet the user briefly and ask how you can help with Riana CIMS.',
  'Use only data returned by approved Riana CIMS tools, APIs, database services and verified knowledge records. Never guess, assume or invent system data.',
  'If information is unavailable, say that it is not available in Riana CIMS. If useful, ask for one missing identifier such as a client name, branch, department, installation reference or ticket number.',
  'Do not answer unrelated general-knowledge questions. Politely state that you assist with Riana CIMS information only.',
  'Always respect the logged-in user role and permissions. Never expose credentials, secrets, hidden audit records or unauthorized data.',
  'Do not repeat the user question. Do not add unnecessary background, conclusions or offers. Keep answers precise.',
].join(' ');

const SYSTEM_OVERVIEW = 'RIANA CIMS covers dashboard oversight, My Tasks, clients, installations, assigned technicians, installation progress, E-Handover, feedback, reports, analytics, finance, users, company settings, subsidiaries, announcements, chat, Developers workflows, external systems, security, and support.';
const DEFAULT_ASSISTANT_TIME_ZONE = process.env.RIANA_ASSISTANT_TIME_ZONE || process.env.TZ || 'Africa/Nairobi';

const normalizeText = (message) => String(message || '')
  .replace(/[\u2018\u2019]/g, "'")
  .replace(/[\u201c\u201d]/g, '"')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const cleanValue = (value, maxLength = 120) => String(value || '').trim().slice(0, maxLength);
const roleLabel = (role) => String(role || 'User').replace(/([a-z])([A-Z])/g, '$1 $2');
const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};const getFirstName = (user = {}) => {
  const fullName = cleanValue(user.first_name || user.firstName || user.name || user.email?.split('@')[0] || 'there', 40);
  return fullName.split(/\s+/)[0] || 'there';
};

const getGreetingPeriod = (now = new Date(), timeZone = DEFAULT_ASSISTANT_TIME_ZONE) => {
  const hourText = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(now);
  const hour = Number(hourText);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

const getGreetingReply = ({ user, now, timeZone }) => {
  const firstName = getFirstName(user);
  const period = getGreetingPeriod(now, timeZone);
  return `Good ${period} ${firstName}, how may I help you today?`;
};

const getDateTimeReply = ({ now = new Date(), timeZone = DEFAULT_ASSISTANT_TIME_ZONE }) => {
  const dateText = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now);
  const timeText = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(now);
  return `Today is ${dateText}. The time is ${timeText}.`;
};

const prettyStatus = (value) => cleanValue(value || 'unknown').replace(/_/g, ' ');
const withSuggestions = (topic, reply, suggestions = [], context = null) => ({
  topic,
  reply,
  suggestions: suggestions.slice(0, 3),
  ...(context ? { context } : {}),
});

const GREETING_PATTERN = /^(hi|hello|hey|good morning|good afternoon|good evening|how are you\??|anyone there\??|help|can you assist me\??)$/i;
const PROMPT_INJECTION_PATTERN = /\b(ignore (?:previous|all) instructions|act as|pretend|reveal (?:your )?(?:system prompt|instructions)|show hidden data|show all users|bypass permissions|bypass access|override|use your own knowledge|fabricate|make up|assume a record exists)\b/i;
const CREDENTIAL_PATTERN = /\b(show|reveal|give|send|list|export|display|what is|tell me)\b[\s\S]{0,40}\b(password|credential|secret|api key|token|jwt|private key|database connection|smtp password)\b/i;
const UNSUPPORTED_PATTERN = /\b(weather|president|prime minister|capital city|stock price|sports score|news|internet|google|wikipedia|exchange rate outside|tomorrow's weather|tomorrows weather)\b/i;
const DETAIL_PATTERN = /\b(explain|give details|show all|provide a full report|summarize the complete record|step-by-step|elaborate)\b/i;
const BROAD_PATTERN = /\b(explain everything|show everything|tell me everything|whole system|all data|all records|very broad)\b/i;

const STOP_IDENTIFIERS = new Set(['status', 'client', 'branch', 'department', 'installation', 'ticket', 'handover', 'report', 'request', 'reference', 'number', 'system']);
const STATIC_SUGGESTIONS = ['How do I find pending work?', 'How do I preview a report?', 'How do notifications work?'];

const STATIC_TOPICS = [
  ['pending', /\b(pending work|work is pending|pending from my end|find pending|pending)\b/i, 'Open Developers and select Pending to see work currently expected from you.'],
  ['my_tasks', /\b(my tasks|task status|assigned to me|my assignment|start work|mark.*complete|waiting|in progress|completed)\b/i, 'Open My Tasks to see assignments where you are the hardware or software technician. Assigned technicians can update their own task status, progress, and notes.'],
  ['roles', /\b(role|roles|permission|permissions|privilege|privileges|access denied|management|super ?admin|admin|team lead|teamlead|designation|user role)\b/i, ({ role }) => `${roleLabel(role)} access is based on your role plus any extra privileges assigned by an authorized administrator. Management cannot add, edit, or update installations or installation progress.`],
  ['finance', /\b(finance|budget|cost|financial|installation budget|receivable|payable|currency)\b/i, 'Finance shows installation budget information where your role permits access. Budget records support KES, USD, EUR, GBP, UGX, TZS, RWF, ETB, ZAR, NGN, AED, INR, CNY, and JPY.'],
  ['import_backup', /\b(import|bulk upload|data import|backup|database backup|restore|maintenance|data management)\b/i, 'Use the provided CSV templates for client or installation imports. Validate source files before upload and keep backups for recovery.'],
  ['handover_guidance', /\b(e-?handover|signed document|client sign off|not installed|equipment table|upload handover)\b/i, 'Generate the E-Handover from an installation, review the equipment table, then upload the signed document after client sign-off. Equipment with quantity zero is labelled Not installed.'],
  ['reports', /\b(report|reports|pdf|preview|download|export|letterhead|logo|branding|marezi|watermark)\b/i, 'Open Reports, choose the needed report, apply filters, then preview or download. Preview and PDF output use the same filtered data.'],
  ['analytics', /\b(analytics|dashboard stats|metrics|kpi|trend|performance|summary)\b/i, 'Analytics summarizes operational totals, trends, completion status, client activity, and performance where your role permits access.'],
  ['notifications', /\b(notification|notifications|bell|email|sms|in-?app|announcement|chime|mark all read|unread)\b/i, 'The notification bell shows alerts assigned to your account. Assignment notifications route regular users to My Tasks and assignment managers to Assigned Technicians.'],
  ['chat', /\b(chat|message|messages|live chat|typing|read receipt|unread message)\b/i, 'Use the header chat icon or Help & Support to message active CIMS users. Chat supports replies, attachments, unread counts, typing state, and call signaling.'],
  ['security', /\b(login|sign in|security|session|verification code|2fa|two factor|first login|reset password|forgot password)\b/i, 'Use your approved work account to sign in. Never share passwords, verification codes, tokens, or confidential client data.'],
  ['support', /\b(help and support|manual|guide|documentation|contact admin|contact support|support guide|system requirements)\b/i, 'Help & Support includes searchable articles, role-specific guidance, RIANA Assistant, install guidance, security guidance, and verified support channels.'],
];

const classifyIntent = (message) => {
  const text = normalizeText(message);
  if (!text) return 'empty';
  if (GREETING_PATTERN.test(text)) return text.includes('how are you') ? 'wellbeing' : 'greeting';
  if (/\b(what time|current time|what date|today'?s date|date today|time now|current date)\b/.test(text)) return 'date_time';
  if (PROMPT_INJECTION_PATTERN.test(text)) return 'unauthorized';
  if (CREDENTIAL_PATTERN.test(text)) return 'credentials';
  if (UNSUPPORTED_PATTERN.test(text)) return 'unsupported';
  if (/\b(which|what) branch\b/.test(text)) return 'followup_branch';
  if (/\b(which|what) status\b/.test(text)) return 'followup_status';
  if (/\b(ticket|change request|cr-?\d|request status)\b/.test(text)) return 'change_request';
  if (/\b(installation|install|kiosk|site status)\b/.test(text) && /\b(status|reference|ref|id|check|find|lookup|branch|client)\b/.test(text)) return 'installation';
  if (/\b(handover|signed document)\b/.test(text) && /\b(status|reference|ref|id|check|find|lookup)\b/.test(text)) return 'handover';
  if (/\b(report)\b/.test(text) && /\b(status|reference|ref|id|check|find|lookup)\b/.test(text)) return 'report_lookup';
  if (/\b(branch)\b/.test(text) && /\b(check|find|lookup|status|details|is|branch)\b/.test(text)) return 'branch';
  if (/\b(department)\b/.test(text) && /\b(check|find|lookup|status|details|is|department)\b/.test(text)) return 'department';
  if (/\b(client|customer)\b/.test(text) && /\b(check|find|lookup|status|details|is|client|customer)\b/.test(text)) return 'client';
  if (BROAD_PATTERN.test(text)) return 'broad';
  return 'static';
};

const extractIdentifier = (message, intent) => {
  const raw = cleanValue(message, 180);
  const text = normalizeText(message);
  const ticket = raw.match(/\b(CR-?\d[\w-]*)\b/i) || raw.match(/\bticket\s*#?\s*([A-Z0-9-]{3,})\b/i);
  if (intent === 'change_request' && ticket) return ticket[1].toUpperCase();

  const quoted = raw.match(/["']([^"']{2,80})["']/);
  if (quoted) return cleanValue(quoted[1]);

  const labelPatterns = {
    installation: /\binstallation\s*(?:status|reference|ref|id|number|#)?\s*([A-Z0-9-]{3,})\b/i,
    client: /\b(?:client|customer)\s+(.{2,80})$/i,
    branch: /\bbranch\s+(.{2,80})$/i,
    department: /\bdepartment\s+(.{2,80})$/i,
    handover: /\bhandover\s*(?:status|reference|ref|id|number|#)?\s*([A-Z0-9-]{3,})\b/i,
    report_lookup: /\breport\s*(?:status|reference|ref|id|number|#)?\s*([A-Z0-9-]{3,})\b/i,
  };
  const match = labelPatterns[intent]?.exec(raw);
  if (match) {
    const value = cleanValue(match[1].replace(/^(status|details|for|of)\s+/i, ''));
    if (value && !STOP_IDENTIFIERS.has(value.toLowerCase())) return value;
  }

  const code = raw.match(/\b([A-Z]{2,}-?\d{2,}|[A-Z0-9]{5,})\b/i);
  if (code && !STOP_IDENTIFIERS.has(code[1].toLowerCase())) return code[1].toUpperCase();

  if (['installation', 'client', 'branch', 'department', 'handover', 'report_lookup'].includes(intent) && !/\b(status|check|find|lookup|details)\b/.test(text)) {
    return raw;
  }
  return '';
};

const permissionForIntent = {
  installation: 'installations.view',
  client: 'clients.view',
  branch: 'clients.view',
  department: 'clients.view',
  report_lookup: 'reports.view',
  handover: 'installations.view',
};

const hasIntentPermission = (user, intent) => {
  const capability = permissionForIntent[intent];
  if (!capability) return true;
  return hasCapability(user || {}, capability) || hasCapability(user || {}, capability.replace('.view', '.manage'));
};

const recordContext = (entity, record) => ({
  entity,
  reference: cleanValue(record?.reference || record?.ticket_number || record?.id),
  status: cleanValue(record?.status || record?.handover_status),
  branch: cleanValue(record?.branch || record?.branch_name || record?.client_branch),
});

const formatRecord = (intent, identifier, record) => {
  const ref = cleanValue(record.reference || record.ticket_number || record.id || identifier);
  const updated = formatDate(record.updated_at || record.created_at || record.upload_date);
  if (intent === 'installation') {
    return `Installation ${ref} is currently ${prettyStatus(record.status)}.${updated ? ` Last updated on ${updated}.` : ''}`;
  }
  if (intent === 'change_request') {
    return `Ticket ${ref} is currently ${prettyStatus(record.status)}.${record.client_name ? ` Client: ${cleanValue(record.client_name)}.` : ''}`;
  }
  if (intent === 'client') {
    const branch = cleanValue(record.branch || record.branch_name);
    return `Client ${cleanValue(record.client_name || ref)}${branch ? ` has branch ${branch}` : ' is in the system'}.`;
  }
  if (intent === 'branch') {
    return `Branch ${cleanValue(record.branch_name || record.branch || ref)}${record.client_name ? ` belongs to ${cleanValue(record.client_name)}` : ' is in the system'}.`;
  }
  if (intent === 'department') {
    return `Department ${cleanValue(record.department_name || ref)}${record.branch_name ? ` is under ${cleanValue(record.branch_name)}` : ' is in the system'}.`;
  }
  if (intent === 'handover') {
    return `Handover ${ref} is currently ${prettyStatus(record.status || record.handover_status)}.${updated ? ` Uploaded on ${updated}.` : ''}`;
  }
  return `I found ${ref} in Riana CIMS.`;
};

const lookupName = (intent) => ({
  installation: 'getInstallation',
  client: 'getClient',
  branch: 'getBranch',
  department: 'getDepartment',
  change_request: 'getChangeRequest',
  handover: 'getHandover',
  report_lookup: 'getReport',
})[intent];

const noRecordReply = (intent, identifier) => {
  const label = intent === 'change_request' ? 'ticket' : intent.replace('_lookup', '');
  return `I couldn't find ${identifier || `that ${label}`} in the system.`;
};

const resolveRecordIntent = async ({ intent, message, user, context, tools }) => {
  if (intent === 'followup_branch') {
    if (context?.branch) return withSuggestions('followup_branch', `It is assigned to the ${context.branch} branch.`, [], context);
    return withSuggestions('missing_identifier', 'Please provide the client name or reference number.');
  }
  if (intent === 'followup_status') {
    if (context?.status && context?.reference) return withSuggestions('followup_status', `${context.reference} is currently ${prettyStatus(context.status)}.`, [], context);
    return withSuggestions('missing_identifier', 'Please provide the client name or reference number.');
  }

  if (!hasIntentPermission(user, intent)) {
    return withSuggestions('unauthorized', 'You do not have permission to view that information.');
  }

  const identifier = extractIdentifier(message, intent);
  if (!identifier) {
    const prompt = intent === 'change_request'
      ? 'Please provide the ticket number.'
      : 'Please provide the client name or reference number.';
    return withSuggestions('missing_identifier', prompt);
  }

  const tool = lookupName(intent) && tools?.[lookupName(intent)];
  if (!tool) return withSuggestions('unsupported', 'That information is not available in Riana CIMS.');

  try {
    const result = await tool({ identifier, user });
    if (!result || result.status === 'not_found') return withSuggestions('no_results', noRecordReply(intent, identifier));
    if (result.status === 'unauthorized') return withSuggestions('unauthorized', 'You do not have permission to view that information.');
    if (result.status === 'multiple') return withSuggestions('missing_identifier', 'Please provide a more specific client name or reference number.');
    if (result.status === 'not_available') return withSuggestions('unsupported', 'That information is not available in Riana CIMS.');
    if (result.status === 'error') return withSuggestions('system_error', "I couldn't retrieve that information right now. Please try again.");
    const record = result.record || result;
    return withSuggestions(intent, formatRecord(intent, identifier, record), [], recordContext(intent, record));
  } catch {
    return withSuggestions('system_error', "I couldn't retrieve that information right now. Please try again.");
  }
};

const getStaticResponse = ({ message, role }) => {
  const matched = STATIC_TOPICS.find(([, pattern]) => pattern.test(String(message || '')));
  if (matched) {
    const [topic, , reply] = matched;
    return withSuggestions(topic, typeof reply === 'function' ? reply({ role }) : reply);
  }

  if (DETAIL_PATTERN.test(message) || BROAD_PATTERN.test(message)) {
    return withSuggestions('overview', `${SYSTEM_OVERVIEW} Please specify a module if you need details.`, STATIC_SUGGESTIONS);
  }

  return withSuggestions('unsupported', 'That information is not available in Riana CIMS.');
};

const getAssistantResponse = async ({ message, role, user = {}, context = null, tools = {}, now = new Date(), timeZone = DEFAULT_ASSISTANT_TIME_ZONE }) => {
  const cleanMessage = cleanValue(message, 1000);
  const intent = classifyIntent(cleanMessage);

  if (intent === 'empty') return withSuggestions('missing_message', 'Please enter a question about Riana CIMS.');
  if (intent === 'greeting') return withSuggestions('greeting', getGreetingReply({ user, now, timeZone }));
  if (intent === 'wellbeing') return withSuggestions('greeting', `I'm ready to help ${getFirstName(user)}. What would you like to know about Riana CIMS?`);
  if (intent === 'date_time') return withSuggestions('date_time', getDateTimeReply({ now, timeZone }));
  if (intent === 'unauthorized' || intent === 'credentials') return withSuggestions('unauthorized', 'You do not have permission to view that information.');
  if (intent === 'unsupported') return withSuggestions('unsupported', 'That information is not available in Riana CIMS.');
  if (intent === 'broad') return withSuggestions('overview', `${SYSTEM_OVERVIEW} Please specify a module if you need details.`, STATIC_SUGGESTIONS);

  if (['installation', 'client', 'branch', 'department', 'change_request', 'handover', 'report_lookup', 'followup_branch', 'followup_status'].includes(intent)) {
    return resolveRecordIntent({ intent, message: cleanMessage, user: { ...user, role }, context, tools });
  }

  return getStaticResponse({ message: cleanMessage, role });
};

module.exports = {
  RIANA_ASSISTANT_SYSTEM_PROMPT,
  classifyIntent,
  extractIdentifier,
  getAssistantResponse,
};