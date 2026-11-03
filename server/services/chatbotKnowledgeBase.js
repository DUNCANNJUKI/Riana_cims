const { hasCapability } = require('../security/accessControl');

const VERIFIED_VERSION = '2026.11.03';

const article = (entry) => Object.freeze({
  status: 'implemented',
  verifiedVersion: VERIFIED_VERSION,
  source: 'repository implementation audit',
  ...entry,
});

const KNOWLEDGE_ARTICLES = Object.freeze([
  article({ id: 'installations-create', module: 'installations', title: 'Create an installation', capability: 'installations.manage', keywords: ['create installation', 'new installation', 'add installation', 'register installation'], answer: 'Open Installations and choose Add Installation. Select the client, branch and department, complete the required installation details, then save. The action is available only when your effective permissions include installation management.', steps: ['Open Installations.', 'Choose Add Installation.', 'Select the client, branch and department.', 'Complete the required installation details.', 'Review and save.'], suggestions: ['How do I assign a technician?', 'Where can I see installation progress?'] }),
  article({ id: 'assignments-manage', module: 'assignments', title: 'Assign a technician', capability: 'assignments.manage', keywords: ['assign technician', 'allocate technician', 'technician assignment', 'missing technician'], answer: 'Open Assigned Technicians, select the installation, and add the authorized hardware or software technician. If a technician is missing, confirm the user is active and that the installation, branch, and subsidiary scope match.', steps: ['Open Assigned Technicians.', 'Select the installation.', 'Choose the hardware or software technician.', 'Set the schedule or assignment details.', 'Save the assignment.'], suggestions: ['Why is my assigned technician missing?', 'How do I update installation progress?'] }),
  article({ id: 'progress-view', module: 'progress', title: 'Installation progress', capability: 'progress.view', keywords: ['installation progress', 'see progress', 'update progress', 'project progress'], answer: 'Open Installation Progress to review status, completion and notes for installations you are authorized to see. Updating progress requires the separate progress-management permission; Management is intentionally view-only.', suggestions: ['How do I find pending work?', 'How do reports work?'] }),
  article({ id: 'finance-budget', module: 'finances', title: 'Create an installation budget', capability: 'finances.view', keywords: ['create budget', 'installation budget', 'budget calculation', 'assigned technician missing', 'accommodation expense', 'per diem', 'transport expense'], answer: 'Installation budgets are technician-expense based. Select an installation and branch, review the assigned technicians, then enter accommodation, transport, meals or per diem, and other expenses for each technician. The installation total is the sum of those technician expenses; this workflow does not add shared project costs.', steps: ['Open Finances.', 'Select the installation budget workflow.', 'Choose the installation and branch.', 'Review the automatically retrieved assigned technicians.', 'Enter each technician’s accommodation, transport, meals or per diem, and other expenses.', 'Review the calculated total and save if you have finance-management permission.'], suggestions: ['Why is my assigned technician missing?', 'How is the budget total calculated?'] }),
  article({ id: 'inventory-register', module: 'inventory', title: 'Register hardware', capability: 'inventory.register', keywords: ['register hardware', 'add hardware', 'inventory registration', 'official model'], answer: 'Open Hardware & Inventory and use the registration action available to your role. Select an approved official model, enter the required identity and location details, and submit. Field registrations may require approval before becoming issued inventory.', suggestions: ['How do I generate a serial number?', 'How do I print a QR label?'] }),
  article({ id: 'inventory-serials', module: 'inventory', title: 'Generate serial numbers', capability: 'inventory.generate_serial', keywords: ['generate serial', 'serial number', 'duplicate serial', 'bulk serial'], answer: 'Open Hardware & Inventory and use Generate Serials. Select the approved model and required quantity, review the generated identities, and issue them. Duplicate serials are rejected; do not manually reuse an existing asset identity.', suggestions: ['How do I register hardware?', 'How do I print a QR label?'] }),
  article({ id: 'handover', module: 'handover', title: 'Generate and upload E-Handover', capability: 'installations.view', keywords: ['handover report', 'generate handover', 'upload signed handover', 'client sign off'], answer: 'Open the installation and generate its E-Handover, verify the equipment table, obtain client sign-off, then upload the signed document. Equipment with quantity zero is shown as Not installed.', suggestions: ['How do I preview a report?', 'Where can I see installation progress?'] }),
  article({ id: 'feedback', module: 'installations', title: 'Submit installation feedback', capability: 'installations.view', keywords: ['submit feedback', 'client feedback', 'feedback rating', 'feedback error'], answer: 'Feedback is submitted from the installation feedback flow or its authorized feedback link. Complete the available rating and comments, then submit once. If submission fails, confirm the link has not expired and that all required fields are complete.', suggestions: ['How do I generate a handover report?', 'Where can I find reports?'] }),
  article({ id: 'reports', module: 'reports', title: 'Preview and export reports', capability: 'reports.view', keywords: ['find reports', 'preview report', 'download report', 'pdf export', 'csv export', 'report generation'], answer: 'Open Reports, choose the available report, apply its filters, then preview or download. Preview and PDF output use the same filtered data. Report availability remains permission-scoped.', suggestions: ['How do I preview a report?', 'Why can’t I access a module?'] }),
  article({ id: 'developer-requests', module: 'developers', title: 'Client change requests', roles: ['SuperAdmin', 'Admin', 'Management', 'Teamlead', 'Developer', 'Sales'], keywords: ['change request', 'developer request', 'new request', 'request approval', 'ticket status'], answer: 'Open Developers to review permitted change requests. New Request is available to SuperAdmin, Admin, Management, Teamlead, and Sales; assignments and approvals are shown only to the CRMS roles configured for those routes.', suggestions: ['Where is my pending work?', 'How do I check a ticket status?'] }),
  article({ id: 'communication-calls', module: 'chat', title: 'Audio, video and screen sharing', keywords: ['audio call', 'video call', 'microphone', 'camera', 'speaker', 'share screen', 'call not working'], answer: 'Open Chat, select an active user, and start an audio or video call. Browser permission is required for the microphone, camera, and screen sharing. If a device is unavailable, check the browser site permissions and operating-system privacy settings, then reselect the device in call settings; never disable account security controls.', suggestions: ['How do notifications work?', 'Where are saved messages?'] }),
  article({ id: 'communication-history', module: 'chat', title: 'Messages, saved items and history', keywords: ['direct message', 'group message', 'saved message', 'archive conversation', 'message history', 'chat'], answer: 'Use Chat for direct messages, replies, attachments, reactions, saved messages, read state, typing state and call signaling. Conversation visibility and personal history preferences affect only the signed-in user and do not expose another user’s private history.', suggestions: ['How do I start a video call?', 'How do notifications work?'] }),
  article({ id: 'account-security', module: 'account', title: 'Password, TOTP, passkeys and sessions', keywords: ['change password', 'passkey', 'authenticator', 'totp', 'recovery code', 'device session', 'two factor', '2fa', 'secure sign out'], answer: 'Open your profile and Account & Security. You can change your password, configure authenticator-app TOTP, regenerate recovery codes, register passkeys, and review device sessions where supported. Never share a password, OTP, recovery code, session token, or private key.', suggestions: ['How do I register a passkey?', 'How do I enable authenticator verification?'] }),
  article({ id: 'scheduling', module: 'calendar', title: 'Schedules and workload calendar', keywords: ['schedule installation', 'technician schedule', 'calendar', 'reminder', 'timezone'], answer: 'Open Workload Calendar to review authorized technician and installation schedules. Dates are handled with the configured system and user timezone; verify the selected date and timezone before changing a schedule.', suggestions: ['How do I assign a technician?', 'Where can I see installation progress?'] }),
  article({ id: 'administration', module: 'company', title: 'System administration', capability: 'users.manage', keywords: ['manage users', 'roles permissions', 'subsidiary configuration', 'audit logs', 'company settings', 'session administration'], answer: 'Administrative features are permission separated. Users manages approved accounts and extra permissions; Company Settings manages branding and configuration; subsidiaries and backups require their own capabilities; Audit Logs is restricted to SuperAdmin.', suggestions: ['Why can’t I access a module?', 'How do roles and permissions work?'] }),
  article({ id: 'access', module: 'security', title: 'Module access restrictions', keywords: ['cannot access module', "can't access", 'access denied', 'missing menu', 'permission'], answer: 'Module access is determined on the server from your role plus approved extra permissions and subsidiary scope. A hidden or unavailable module usually means your account lacks the required capability. Ask an authorized administrator to review your role; do not attempt to bypass the restriction.', suggestions: ['How do roles and permissions work?', 'Where can I find support?'] }),
]);

const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (value) => new Set(normalize(value).split(' ').filter((token) => token.length > 2));

const canReadArticle = (user, entry) => {
  if (entry.capability && !hasCapability(user || {}, entry.capability)) return false;
  if (entry.roles && !entry.roles.includes(user?.role)) return false;
  return entry.status === 'implemented';
};

const scoreArticle = (query, entry, currentModule) => {
  const normalizedQuery = normalize(query);
  const queryTokens = tokens(query);
  let score = currentModule && entry.module === currentModule ? 2 : 0;
  for (const phrase of entry.keywords) {
    const normalizedPhrase = normalize(phrase);
    if (normalizedQuery.includes(normalizedPhrase)) score += 8;
    for (const token of tokens(phrase)) if (queryTokens.has(token)) score += 1;
  }
  return score;
};

const retrieveKnowledge = ({ query, user, currentModule }) => KNOWLEDGE_ARTICLES
  .filter((entry) => canReadArticle(user, entry))
  .map((entry) => ({ entry, score: scoreArticle(query, entry, currentModule) }))
  .filter(({ score }) => score >= 3)
  .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
  .slice(0, 3);

const formatKnowledgeAnswer = (entry, detailed = false) => {
  if (!detailed || !entry.steps?.length) return entry.answer;
  return `${entry.answer}\n\n${entry.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`;
};

const suggestionsFor = ({ user, currentModule }) => KNOWLEDGE_ARTICLES
  .filter((entry) => canReadArticle(user, entry) && (!currentModule || entry.module === currentModule))
  .slice(0, 3)
  .map((entry) => entry.keywords[0]);

module.exports = { KNOWLEDGE_ARTICLES, VERIFIED_VERSION, formatKnowledgeAnswer, retrieveKnowledge, suggestionsFor };
