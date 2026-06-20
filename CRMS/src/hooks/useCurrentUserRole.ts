import { useState, useEffect } from 'react';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface UserRoleState {
  userId: string | null;
  profileId: string | null;
  userName: string | null;
  userEmail: string | null;
  roles: AppRole[];
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
  const [state, setState] = useState<UserRoleState>({
    userId: null,
    profileId: null,
    userName: null,
    userEmail: null,
    roles: [],
    isAdmin: false,
    isSeniorDeveloper: false,
    isDeveloper: false,
    isSales: false,
    isLoading: true,
    canManageClients: false,
    canManageUsers: false,
    canCreateRequests: false,
    canAssignDevelopers: false,
    canApprove: false,
    canViewReports: false,
    canUpdateRequestStatus: false,
    canAddComments: false,
  });

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const userId = localStorage.getItem('crms-user-id');

        if (!userId) {
          setState(prev => ({ ...prev, isLoading: false }));
          return;
        }

        // Get profile (from local API)
        const pRes = await fetch(`/api/crms/profiles`);
        const profiles = await pRes.json();
        const profile = profiles.find((p: any) => p.user_id === userId || p.id === userId);

        // Get user roles (from local API)
        const rRes = await fetch(`/api/crms/user_roles`);
        const allRoles = await rRes.json();
        const userRoles = allRoles.filter((r: any) => r.user_id === userId || r.user_id === profile?.id);

        const roles = (userRoles || []).map(r => r.role) as AppRole[];

        const isAdmin = roles.includes('admin');
        const isSeniorDeveloper = roles.includes('senior_developer');
        const isDeveloper = roles.includes('developer');
        const isSales = roles.includes('sales');

        setState({
          userId: userId,
          profileId: profile?.id || null,
          userName: profile?.name || null,
          userEmail: profile?.email || null,
          roles,
          isAdmin,
          isSeniorDeveloper,
          isDeveloper,
          isSales,
          isLoading: false,
          // Admin & Senior Developer can manage clients
          canManageClients: isAdmin || isSeniorDeveloper,
          // Only Admin can manage users
          canManageUsers: isAdmin,
          // Admin & Senior Developer can create requests
          canCreateRequests: isAdmin || isSeniorDeveloper,
          // Admin & Senior Developer can assign developers
          canAssignDevelopers: isAdmin || isSeniorDeveloper,
          // Admin & Sales can approve/hold/reject requests
          canApprove: isAdmin || isSales,
          // Admin, Senior Developer, Sales can view reports
          canViewReports: isAdmin || isSeniorDeveloper || isSales,
          // Developer can update request status (in_progress, waiting, complete)
          canUpdateRequestStatus: isDeveloper || isAdmin || isSeniorDeveloper,
          // Developer can add comments
          canAddComments: isDeveloper || isAdmin || isSeniorDeveloper,
        });
      } catch (error) {
        console.error('Error fetching user role:', error);
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    fetchUserRole();

    // Listen for local storage changes
    const handleStorageChange = () => {
      fetchUserRole();
    };
    window.addEventListener('storage', handleStorageChange);

    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return state;
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
    isAdmin: true,
    isSeniorDeveloper: true,
    isDeveloper: false,
    isSales: false,
    isLoading: false,
    canManageClients: true,
    canManageUsers: true,
    canCreateRequests: true,
    canAssignDevelopers: true,
    canApprove: true,
    canViewReports: true,
    canUpdateRequestStatus: true,
    canAddComments: true,
  };
}
