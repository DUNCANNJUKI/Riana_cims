const CAPABILITY_DEFINITIONS = [
  { code: 'clients.view', group: 'Clients', label: 'View clients' },
  { code: 'clients.manage', group: 'Clients', label: 'Add, edit, and delete clients' },
  { code: 'installations.view', group: 'Installations', label: 'View installations' },
  { code: 'installations.manage', group: 'Installations', label: 'Add, edit, and update installations' },
  { code: 'assignments.view', group: 'Assignments', label: 'View assigned technicians' },
  { code: 'assignments.manage', group: 'Assignments', label: 'Assign technicians and update assignments' },
  { code: 'progress.view', group: 'Installation progress', label: 'View installation progress' },
  { code: 'progress.manage', group: 'Installation progress', label: 'Update installation progress' },
  { code: 'reports.view', group: 'Reports', label: 'Preview and download all reports' },
  { code: 'finances.view', group: 'Finance', label: 'View installation budgets' },
  { code: 'finances.manage', group: 'Finance', label: 'Add, edit, and delete installation budgets' },
  { code: 'analytics.view', group: 'Analytics', label: 'View analytics' },
  { code: 'announcements.manage', group: 'Administration', label: 'Manage announcements' },
  { code: 'import.manage', group: 'Administration', label: 'Import system data' },
  { code: 'users.manage', group: 'Administration', label: 'Manage non-privileged users' },
  { code: 'company.manage', group: 'Administration', label: 'Manage company settings and branding' },
  { code: 'subsidiaries.manage', group: 'Administration', label: 'Add, edit, and delete subsidiaries' },
  { code: 'backup.manage', group: 'Administration', label: 'View and create database backups' },
];

const ALL_CAPABILITIES = new Set(CAPABILITY_DEFINITIONS.map(({ code }) => code));
const VIEW_ONLY = new Set([
  'clients.view', 'installations.view', 'assignments.view', 'progress.view', 'reports.view',
]);
const ADMIN_CAPABILITIES = new Set([
  'clients.view', 'clients.manage', 'installations.view', 'installations.manage',
  'assignments.view', 'assignments.manage', 'progress.view', 'progress.manage',
  'reports.view', 'finances.view', 'finances.manage', 'analytics.view',
  'announcements.manage', 'import.manage', 'users.manage',
]);
const TEAMLEAD_CAPABILITIES = new Set([
  'clients.view', 'clients.manage', 'installations.view', 'installations.manage',
  'assignments.view', 'assignments.manage', 'progress.view', 'progress.manage',
  'reports.view', 'finances.view', 'finances.manage', 'analytics.view',
  'announcements.manage', 'import.manage',
]);

const ROLE_CAPABILITIES = {
  SuperAdmin: ALL_CAPABILITIES,
  Management: new Set([...ALL_CAPABILITIES].filter((code) => !['installations.manage', 'progress.manage'].includes(code))),
  Admin: ADMIN_CAPABILITIES,
  Teamlead: TEAMLEAD_CAPABILITIES,
  Finance: VIEW_ONLY,
  Sales: new Set(['reports.view']),
  Developer: new Set(),
  User: new Set(['clients.view', 'installations.view', 'installations.manage', 'reports.view']),
};
const ROLE_DENIED_CAPABILITIES = {
  Management: new Set(['installations.manage', 'progress.manage']),
};

const normalizePermissions = (value) => {
  if (Array.isArray(value)) return value.filter((code) => ALL_CAPABILITIES.has(code));
  if (!value) return [];
  return String(value).split(',').map((code) => code.trim()).filter((code) => ALL_CAPABILITIES.has(code));
};

const getEffectiveCapabilities = (role, extraPermissions) => Array.from(new Set([
  ...(ROLE_CAPABILITIES[role] || []),
  ...normalizePermissions(extraPermissions),
])).filter((capability) => !(ROLE_DENIED_CAPABILITIES[role]?.has(capability))).sort();

const hasCapability = (user, capability) => (
  !(ROLE_DENIED_CAPABILITIES[user?.role]?.has(capability)) && (user?.role === 'SuperAdmin'
  || (ROLE_CAPABILITIES[user?.role]?.has(capability) ?? false)
  || normalizePermissions(user?.extra_permissions).includes(capability)
  || normalizePermissions(user?.permissions).includes(capability)
));

const requireCapability = (capability) => (req, res, next) => (
  hasCapability(req.user, capability)
    ? next()
    : res.status(403).json({ error: 'Insufficient permissions.' })
);

const requireAnyCapability = (...capabilities) => (req, res, next) => (
  capabilities.some((capability) => hasCapability(req.user, capability))
    ? next()
    : res.status(403).json({ error: 'Insufficient permissions.' })
);

module.exports = {
  ALL_CAPABILITIES,
  CAPABILITY_DEFINITIONS,
  ROLE_CAPABILITIES,
  getEffectiveCapabilities,
  hasCapability,
  normalizePermissions,
  requireCapability,
  requireAnyCapability,
};
