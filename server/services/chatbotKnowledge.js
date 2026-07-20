const roleLabel = (role) => String(role || 'User').replace(/([a-z])([A-Z])/g, '$1 $2');

const topic = (id, pattern, reply, suggestions) => ({ id, pattern, reply, suggestions });

const SYSTEM_OVERVIEW = [
  'RIANA CIMS covers dashboard oversight, My Tasks, My Profile, clients, installations, assigned technicians, installation progress, E-Handover, feedback, reports, analytics, finance, users, company settings, subsidiaries, announcements, chat, Developers workflows, external systems, security, and support.',
  'Your visible modules and write controls depend on your role, module role, and extra privileges.',
].join(' ');

const accessSummary = (role) => `${roleLabel(role)} access is based on your role plus any extra privileges assigned by an authorized administrator. If a module or button is missing, request access from an administrator rather than sharing credentials or using another account.`;

const TOPICS = [
  topic(
    'overview',
    /\b(system overview|overview|modules|functionality|functionalities|features|whole system|cims capabilities)\b/i,
    ({ role }) => `${SYSTEM_OVERVIEW} ${accessSummary(role)}`,
    ['What can my role access?', 'How do I use My Tasks?', 'How do reports work?'],
  ),
  topic(
    'navigation',
    /\b(navigate|navigation|sidebar|header|menu|where do i find|where is|open module)\b/i,
    'Use the sidebar to open available modules. The header contains notifications, user chat, theme controls, and the signed-in user menu. Regular users usually work from My Tasks and My Profile; managers use the operational modules their role permits.',
    ['Where do notifications take me?', 'What appears in My Profile?', 'How do I contact support?'],
  ),
  topic(
    'my_tasks',
    /\b(my tasks|task status|assigned to me|my assignment|start work|mark.*complete|waiting|in progress|completed)\b/i,
    'Open My Tasks to see assignments where you are the hardware or software technician. Assigned technicians can update their own task status, progress, and notes. They cannot reassign technicians or change protected client, branch, installation, or schedule fields.',
    ['Why was status access denied?', 'What appears in My Profile?', 'How do notifications route?'],
  ),
  topic(
    'profile',
    /\b(my profile|profile|account details|my details|designation|department|subsidiary|phone|contact details)\b/i,
    'My Profile shows your account identity, role or designation, email, phone, department, subsidiary, active task count, completed task count, and current assignments. Supervisory users may also see technician performance history and badges when performance data exists.',
    ['How do I update my profile picture?', 'What can my role access?', 'How do I reset my password?'],
  ),
  topic(
    'clients',
    /\b(client|clients|branch|contact|industry|contract|account manager|customer)\b/i,
    'Use Clients to search and review client profiles, branches, contact people, industry classification, contract type, subsidiary ownership, and related work. Create, edit, and delete controls appear only for accounts with client-management permission.',
    ['How do I find an installation?', 'How do feedback links work?', 'How do subsidiaries affect reports?'],
  ),
  topic(
    'handover',
    /\b(quantity is zero|quantity zero|zero quantity|equipment quantity is zero)\b/i,
    'Generate the E-Handover from an installation, review the subsidiary-specific equipment table, then upload the signed document after client sign-off. Equipment with quantity zero is labelled Not installed in preview and PDF output.',
    ['Who uploads signed handovers?', 'How does report branding work?', 'How do feedback links work?'],
  ),
  topic(
    'installations',
    /\b(installation|installations|equipment|kiosk|counter|led|screen|ups|speaker|tablet|media controller|digital signage|escalation)\b/i,
    'Use Installations to review scope, equipment quantities, schedule, assigned technicians, status, remarks, escalation details, and handover readiness. Installation write controls are permission-protected; read-only roles can still review permitted records.',
    ['How do I assign a technician?', 'How do I generate an E-Handover?', 'How do I update progress?'],
  ),
  topic(
    'assignments',
    /\b(assigned technicians|assign technician|assignment|hardware technician|software technician|technician allocation|workload calendar)\b/i,
    'Assigned Technicians is the management view for allocating hardware and software technicians, setting assignment dates, tracking branch coverage, and reviewing status. Regular technicians should use My Tasks for their own status updates.',
    ['What can I do in My Tasks?', 'How do notifications route?', 'How do I view workload calendar?'],
  ),
  topic(
    'progress',
    /\b(progress|progress percentage|waiting reason|delivery tracking|installation progress)\b/i,
    'Installation Progress summarizes delivery state, progress percentage, waiting reasons, assigned dates, completion dates, and remarks. Progress mutation is permission-controlled so delivery history remains trustworthy.',
    ['What status values are available?', 'How do reports use progress?', 'Who can update progress?'],
  ),
  topic(
    'handover',
    /\b(e-?handover|handover|signed document|client sign off|not installed|equipment table|upload handover)\b/i,
    'Generate the E-Handover from an installation, review the subsidiary-specific equipment table, then upload the signed document after client sign-off. Equipment with quantity zero is labelled Not installed in preview and PDF output.',
    ['Who uploads signed handovers?', 'How does report branding work?', 'How do feedback links work?'],
  ),
  topic(
    'feedback',
    /\b(feedback|feedback link|client feedback|rating|nps|satisfaction|survey)\b/i,
    'Client feedback links collect post-installation responses tied to the client and installation. Links should be sent only to the intended client contact, and submitted responses can support reports and service-quality review.',
    ['How do I create a feedback link?', 'Where do reports show feedback?', 'How do notifications work?'],
  ),
  topic(
    'reports',
    /\b(report|reports|pdf|preview|download|export|letterhead|logo|branding|marezi|watermark)\b/i,
    'Open Reports, choose the needed report, apply filters, then preview or download. Preview and PDF output use the same filtered data. RIANA branding is standard; MAREZI branding applies automatically when the client or generating user belongs to MAREZI.',
    ['Which roles can view reports?', 'How does MAREZI branding work?', 'How do Developers reports work?'],
  ),
  topic(
    'analytics',
    /\b(analytics|dashboard stats|metrics|kpi|trend|performance|summary)\b/i,
    'Analytics and dashboards summarize operational totals, trends, completion status, client activity, and performance context where your role permits access. These views are for oversight and decision support rather than record mutation.',
    ['How do reports work?', 'What can Management users see?', 'How do technician profiles work?'],
  ),

  topic(
    'pending',
    /\b(pending work|work is pending|pending from my end|find pending|pending)\b/i,
    'Open Developers and select Pending to see work currently expected from you, including requests awaiting action, clarification, approval, assignment, or completion based on your role.',
    ['How do Developers requests move forward?', 'Who receives completion notifications?', 'How do I filter Developers reports?'],
  ),
  topic(
    'developers',
    /\b(developer|developers|change request|crms|approval|pending|clarification|request lifecycle|sales request)\b/i,
    'The Developers workspace manages requests from submission through approval, assignment, work started, clarification where needed, completion, reports, and audit review. Pending shows the work currently expected from the signed-in user.',
    ['How do I find pending work?', 'Who receives completion notifications?', 'How do I filter Developers reports?'],
  ),
  topic(
    'notifications',
    /\b(notification|notifications|bell|email|sms|in-?app|announcement|chime|mark all read|unread)\b/i,
    'The notification bell shows alerts assigned to your account. Assignment notifications route regular users to My Tasks and assignment managers to Assigned Technicians. Depending on the event and settings, alerts may also send email or SMS.',
    ['Why did notification access fail?', 'How do announcements work?', 'How do I email support guide?'],
  ),
  topic(
    'chat',
    /\b(chat|message|messages|live chat|typing|read receipt|unread message)\b/i,
    'Use the header chat icon or Help & Support to message other active CIMS users. Chat supports replies, secure file and image attachments, attachment downloads, unread counts, typing state, message read state, and authenticated phone/video call signaling.',
    ['How do notifications work?', 'How do I contact support?', 'What does the header show?'],
  ),
  topic(
    'announcements',
    /\b(announcement|announcements|notice|noticeboard|notice board)\b/i,
    'Announcements share internal updates with targeted users or roles. Unread announcements appear in the notification bell and dashboard context until marked as read.',
    ['How do notifications work?', 'Who can manage announcements?', 'How do I contact support?'],
  ),
  topic(
    'roles',
    /\b(role|roles|permission|permissions|privilege|privileges|access denied|finance|management|super ?admin|admin|team lead|teamlead|designation|user role)\b/i,
    ({ role }) => `${accessSummary(role)} Finance is read-only by default. Management can review operational records but cannot add, edit, or update installations, and cannot mutate installation progress. Super Admin controls privileged role and permission changes.`,
    ['What can Finance users view?', 'What can Management users do?', 'Why was access denied?'],
  ),
  topic(
    'users',
    /\b(user admin|users|create user|edit user|deactivate|activate|reset.*password|module role|extra permission|permissions page)\b/i,
    'Authorized administrators can create users, update profiles, activate or deactivate accounts, assign designations, manage module roles, grant extra permissions, and reset passwords. Privileged role changes are restricted to Super Admin.',
    ['How are extra privileges assigned?', 'How do password resets work?', 'What can my role access?'],
  ),
  topic(
    'company_settings',
    /\b(company settings|settings|branding|logo|color|contract type|subsidiary equipment|equipment configuration|notification preferences)\b/i,
    'Company Settings controls organization name, logos, colors, notification preferences, contract settings, subsidiaries, and subsidiary equipment configurations. Changes can affect reports, handovers, visible branding, and notifications.',
    ['How do subsidiaries work?', 'How does report branding work?', 'Who can manage settings?'],
  ),
  topic(
    'subsidiaries',
    /\b(subsidiary|subsidiaries|marezi|qsys|uss|vms|delete subsidiary|reassign user)\b/i,
    'Authorized administrators manage subsidiaries and their equipment configurations in Company Settings. A subsidiary cannot be deleted while users remain attached; reassign those users first. MAREZI ownership can trigger MAREZI document branding.',
    ['How does MAREZI branding work?', 'Who can manage subsidiaries?', 'How do I reassign a user?'],
  ),
  topic(
    'finance',
    /\b(finance|budget|cost|financial|installation budget|receivable|payable)\b/i,
    'Finance views installation, client, assignment, progress, and report information needed for financial oversight. Finance is read-only by default, so operational edits require a permitted extra privilege assigned by an authorized administrator.',
    ['What can Finance users view?', 'How do reports work?', 'How are extra privileges assigned?'],
  ),
  topic(
    'import_backup',
    /\b(import|bulk upload|data import|backup|database backup|restore|maintenance|data management)\b/i,
    'Import, backup, and data-management tools are privileged administrative workflows. Validate source files, preserve auditability, and use backups for continuity and troubleshooting without exposing credentials or internal database details.',
    ['Who can import data?', 'Who can manage backups?', 'How do I contact an administrator?'],
  ),
  topic(
    'external',
    /\b(external system|riana optimus|optimus|external link|integrations?)\b/i,
    'External system entries such as RIANA OPTIMUS open approved related tools. Access depends on the destination system and may require separate authentication outside RIANA CIMS.',
    ['Where is RIANA OPTIMUS?', 'How do I contact support?', 'What can my role access?'],
  ),
  topic(
    'security',
    /\b(password|login|sign in|security|session|verification code|2fa|two factor|first login|reset password|forgot password)\b/i,
    'Use your approved work account to sign in. Never share passwords, verification codes, tokens, or confidential client data. Password and privilege changes revoke older sessions. Use password reset or contact an authorized administrator if access fails.',
    ['How do I reset my password?', 'Why was access denied?', 'How do I contact an administrator?'],
  ),
  topic(
    'pwa',
    /\b(pwa|install app|offline|mobile app|home screen|desktop app)\b/i,
    'Open Install App from Help & Support. On supported browsers, use the install prompt or browser menu to add RIANA CIMS to your desktop or home screen. If stale content appears after an update, hard refresh once.',
    ['What browsers are supported?', 'How do notifications work?', 'How do I troubleshoot failed requests?'],
  ),
  topic(
    'troubleshooting',
    /\b(error|failed|not working|access denied|cannot|can't|unable|troubleshoot|stale|refresh|fetch|permission denied)\b/i,
    'For access denied, confirm your role and extra privileges. For failed requests, confirm you are online and signed in, then retry. For stale UI after an update, hard refresh once. Contact an administrator for access changes or RIANA Support for system issues.',
    ['Why was access denied?', 'How do I contact support?', 'How do notifications route?'],
  ),
  topic(
    'support',
    /\b(help|support|manual|guide|documentation|contact admin|contact support|support guide|system requirements)\b/i,
    'Help & Support includes searchable articles, role-specific recommendations, RIANA Assistant, system requirements, install guidance, security guidance, and verified support channels. Email Support Guide sends guidance only to your signed-in work email.',
    ['How do I email the support guide?', 'How do I contact an administrator?', 'What can the assistant answer?'],
  ),
];

const DEFAULT_RESPONSE = {
  topic: 'general',
  reply: `${SYSTEM_OVERVIEW} Ask about a module, workflow, role, report, notification, profile, access issue, or support task and I will provide user-facing guidance from a user-facing perspective.`,
  suggestions: ['What can I do in My Tasks?', 'What can my role access?', 'How do I troubleshoot access denied?'],
};

const getAssistantResponse = ({ message, role }) => {
  const match = TOPICS.find((entry) => entry.pattern.test(String(message || '')));
  if (!match) return DEFAULT_RESPONSE;
  return {
    topic: match.id,
    reply: typeof match.reply === 'function' ? match.reply({ role }) : match.reply,
    suggestions: match.suggestions,
  };
};

module.exports = { getAssistantResponse };