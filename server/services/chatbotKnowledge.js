const roleLabel = (role) => String(role || 'User').replace(/([a-z])([A-Z])/g, '$1 $2');

const topic = (id, pattern, reply, suggestions) => ({ id, pattern, reply, suggestions });

const TOPICS = [
  topic(
    'pending',
    /\b(pending|waiting approval|waiting for approval|what needs action|work queue)\b/i,
    'Open Developers and select Pending. Sales users see requests awaiting approval, developers see assigned or clarification work, and team leads see approved requests waiting for assignment or follow-up.',
    ['How do Developers notifications work?', 'How do I assign a developer?', 'How do I mark work complete?'],
  ),
  topic(
    'developers',
    /\b(developer|developers|change request|crms|approval|mark.*complete)\b/i,
    'The Developers workspace manages change requests from submission through approval, assignment, work commencement, clarification, and completion. Use Pending for items requiring your action and Reports for filtered workflow reporting.',
    ['How do I find pending work?', 'Who receives completion notifications?', 'How do I filter Developers reports?'],
  ),
  topic(
    'reports',
    /\b(report|reports|pdf|preview|download|letterhead|logo|branding)\b/i,
    'Open Reports, choose an available report, apply its filters, then select Preview or Download. RIANA reports use the standard transparent-mark header; a MAREZI client or generating user receives the approved MAREZI letterhead.',
    ['Which roles can view reports?', 'How does MAREZI branding work?', 'How do I filter Developers reports?'],
  ),
  topic(
    'handover',
    /\b(e-?handover|handover|not installed|equipment quantity|signed document)\b/i,
    'Generate the E-Handover from the installation record, review the equipment table, then upload the signed document when complete. Equipment with quantity zero is labelled Not installed in preview and PDF output.',
    ['How do I upload a signed handover?', 'Who receives handover notifications?', 'How is report branding selected?'],
  ),
  topic(
    'notifications',
    /\b(notification|notifications|email|sms|in-?app|announcement|chime)\b/i,
    'Workflow events can create in-app, email, and SMS notifications. Developers notifications cover approval requests, assignments, clarification, and completion; the assigning user is notified when assigned work is marked complete.',
    ['Who receives completion notifications?', 'How do pending items work?', 'How do announcements work?'],
  ),
  topic(
    'roles',
    /\b(role|roles|permission|permissions|privilege|privileges|finance|management|super ?admin|designation)\b/i,
    ({ role }) => `${roleLabel(role)} access follows the permissions assigned to your account. Super Admin can manage roles, designations, subsidiaries, and individual extra privileges. Finance is read-only by default; Management cannot add, edit, or update installations.`,
    ['What can Finance users view?', 'What can Management users do?', 'How are extra privileges assigned?'],
  ),
  topic(
    'clients',
    /\b(client|clients|branch|contact|feedback link)\b/i,
    'Use Clients to find client profiles, branches, contacts, subsidiary ownership, and related installation information. Available create or edit controls depend on your assigned permissions.',
    ['How do I find an installation?', 'How do I send a feedback link?', 'How do subsidiaries affect reports?'],
  ),
  topic(
    'installations',
    /\b(installation|installations|technician|assignment|progress|workload calendar)\b/i,
    'Use Installations to review installation details and progress, Assigned Technicians for technician allocation, and Installation Progress for delivery tracking. Write controls only appear when your role or extra privileges allow them.',
    ['How do I assign a technician?', 'How do I generate an E-Handover?', 'What can Finance users view?'],
  ),
  topic(
    'subsidiaries',
    /\b(subsidiary|subsidiaries|marezi|delete subsidiary)\b/i,
    'Authorized administrators manage subsidiaries in Company Settings. A subsidiary cannot be deleted while users are attached; reassign those users first. MAREZI user or client ownership automatically selects MAREZI document branding.',
    ['How does MAREZI branding work?', 'Who can manage subsidiaries?', 'How do I reassign a user?'],
  ),
  topic(
    'security',
    /\b(password|login|sign in|security|session|verification code|2fa)\b/i,
    'Use your approved work account to sign in and never share passwords or verification codes. Password and privilege changes revoke older sessions. If access fails, use password reset or contact an authorized administrator.',
    ['How long does a session stay active?', 'How do I reset my password?', 'How do I contact an administrator?'],
  ),
  topic(
    'pwa',
    /\b(pwa|install app|offline|mobile app|home screen)\b/i,
    'Open Install App from Help & Support or the application menu. If the install prompt is unavailable, use your supported browser menu and choose Install app or Add to Home Screen.',
    ['What browsers are supported?', 'How do notifications work?', 'How do I contact support?'],
  ),
  topic(
    'support',
    /\b(help|support|manual|guide|documentation|contact admin|contact support)\b/i,
    'Help & Support includes searchable articles, role-specific guidance, the RIANA Assistant, system requirements, and verified support channels. Use Email Support Guide to send the guide only to your signed-in work email.',
    ['How do I email the support guide?', 'How do I contact an administrator?', 'What can the assistant answer?'],
  ),
];

const DEFAULT_RESPONSE = {
  topic: 'general',
  reply: 'I can provide user-facing guidance for clients, installations, assigned technicians, reports, Developers workflows, notifications, roles, E-Handover, security, and support. Ask about the task you want to complete.',
  suggestions: ['How do I find pending work?', 'How do I preview a report?', 'How do I contact support?'],
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
