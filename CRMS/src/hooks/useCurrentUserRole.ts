import { useMemo } from 'react';
import type { Database } from '@crms/integrations/supabase/types';
import { getCimsUser } from '@crms/lib/cimsSession';

type AppRole = Database['public']['Enums']['app_role'];

interface UserRoleState {
  userId: string | null;
  profileId: string | null;
  userName: string | null;
  userEmail: string | null;
  roles: AppRole[];
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isSeniorDeveloper: boolean;
  isDeveloper: boolean;
  isSales: boolean;
  isLoading: boolean;
  canManageClients: boolean;
  canManageUsers: boolean;
  canCreateRequests: boolean;
  canAssignDevelopers: boolean;
  canApprove: boolean;
  canViewReports: boolean;
  canUpdateRequestStatus: boolean;
  canAddComments: boolean;
}

export function useCurrentUserRole(): UserRoleState {
  return useMemo(() => {
    const user = getCimsUser();
    const roleMap: Record<string, AppRole> = {
      SuperAdmin: 'admin',
      Admin: 'admin',
      Management: 'admin',
      Teamlead: 'senior_developer',
      Developer: 'developer',
      Sales: 'sales',
    };
    const effectiveRole = user?.module_roles?.crms || user?.role;
    const mappedRole = effectiveRole ? roleMap[effectiveRole] : undefined;
    const roles = mappedRole ? [mappedRole] : [];

    const isAdmin = roles.includes('admin');
    const isSuperAdmin = user?.role === 'SuperAdmin';
    const isSeniorDeveloper = roles.includes('senior_developer');
    const isDeveloper = roles.includes('developer');
    const isSales = roles.includes('sales');

    return {
      userId: user?.id || null,
      profileId: user?.id || null,
      userName: `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || null,
      userEmail: user?.email || null,
      roles,
      isSuperAdmin,
      isAdmin,
      isSeniorDeveloper,
      isDeveloper,
      isSales,
      isLoading: false,
      canManageClients: isAdmin || isSeniorDeveloper,
      canManageUsers: false,
      canCreateRequests: isAdmin || isSeniorDeveloper || isSales,
      canAssignDevelopers: isAdmin || isSeniorDeveloper,
      canApprove: isAdmin || isSales,
      canViewReports: isAdmin || isSeniorDeveloper || isSales,
      canUpdateRequestStatus: isDeveloper || isAdmin || isSeniorDeveloper,
      canAddComments: isDeveloper || isAdmin || isSeniorDeveloper,
    };
  }, []);
}

// Demo mode hook - for development without authentication
export function useDemoRole(): UserRoleState {
  // In demo mode, simulate an admin user
  return {
    userId: 'demo-user',
    profileId: 'demo-profile',
    userName: 'Demo User',
    userEmail: 'demo@example.com',
    roles: ['admin', 'senior_developer'],
    isSuperAdmin: true,
    isAdmin: true,
    isSeniorDeveloper: true,
    isDeveloper: false,
    isSales: false,
    isLoading: false,
    canManageClients: true,
    canManageUsers: false,
    canCreateRequests: true,
    canAssignDevelopers: true,
    canApprove: true,
    canViewReports: true,
    canUpdateRequestStatus: true,
    canAddComments: true,
  };
}
