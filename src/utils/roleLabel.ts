export const formatRoleLabel = (role?: string | null): string => {
  if (role === 'InventoryOfficer') return 'Inventory Officer';
  if (role === 'SuperAdmin') return 'Super Admin';
  if (role === 'Teamlead') return 'Team Lead';
  return role || 'User';
};
