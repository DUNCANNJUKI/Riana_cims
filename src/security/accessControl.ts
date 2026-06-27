import type { User } from '@/types';

export type Capability =
  | 'clients.view' | 'clients.manage'
  | 'installations.view' | 'installations.manage'
  | 'assignments.view' | 'assignments.manage'
  | 'progress.view' | 'progress.manage'
  | 'reports.view'
  | 'finances.view' | 'finances.manage'
  | 'analytics.view' | 'announcements.manage' | 'import.manage'
  | 'users.manage' | 'company.manage' | 'subsidiaries.manage' | 'backup.manage';

export const CAPABILITY_DEFINITIONS: Array<{ code: Capability; group: string; label: string }> = [
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
  { code: 'subsidiaries.manage', group: 'Administration', label: 'Manage subsidiaries' },
  { code: 'backup.manage', group: 'Administration', label: 'Manage database backups' },
];

const all = CAPABILITY_DEFINITIONS.map(({ code }) => code);
const roleCapabilities: Record<User['role'], Capability[]> = {
  SuperAdmin: all,
  Management: all.filter((code) => !['installations.manage', 'progress.manage'].includes(code)),
  Admin: ['clients.view','clients.manage','installations.view','installations.manage','assignments.view','assignments.manage','progress.view','progress.manage','reports.view','finances.view','finances.manage','analytics.view','announcements.manage','import.manage','users.manage'],
  Teamlead: ['clients.view','clients.manage','installations.view','installations.manage','assignments.view','assignments.manage','progress.view','progress.manage','reports.view','finances.view','finances.manage','analytics.view','announcements.manage','import.manage'],
  Finance: ['clients.view','installations.view','assignments.view','progress.view','reports.view'],
  Sales: ['reports.view'],
  Developer: [],
  User: ['clients.view','installations.view','installations.manage','reports.view'],
};
const roleDeniedCapabilities: Partial<Record<User['role'], Capability[]>> = {
  Management: ['installations.manage', 'progress.manage'],
};

export const can = (user: Pick<User, 'role' | 'permissions' | 'extra_permissions'>, capability: Capability) => (
  !roleDeniedCapabilities[user.role]?.includes(capability) && (user.role === 'SuperAdmin'
  || roleCapabilities[user.role]?.includes(capability)
  || user.permissions?.includes(capability)
  || user.extra_permissions?.includes(capability)
));

export const isCapabilityDeniedForRole = (role: User['role'], capability: Capability) => roleDeniedCapabilities[role]?.includes(capability) || false;

export const baseCapabilitiesForRole = (role: User['role']) => roleCapabilities[role] || [];
