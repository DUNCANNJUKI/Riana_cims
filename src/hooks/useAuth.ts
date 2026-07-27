import { useState, useEffect } from 'react';
import { User, AuthState } from '@/types';
import { apiClient, setAuthToken, clearAuthToken, getAuthToken } from '@/integrations/apiClient';

const clearStoredAuth = () => {
  clearAuthToken();
  localStorage.removeItem('riana_user');
  localStorage.removeItem('crms-user-session');
  localStorage.removeItem('crms-user-id');
  localStorage.removeItem('crms-user-role');
  localStorage.removeItem('crms-auth-token');
};

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true
  });

  const fetchUserProfile = async () => {
    try {
      const data = await apiClient.get('/auth/me');
      if (data && data.user) {
        localStorage.setItem('riana_user', JSON.stringify(data.user));
        setAuthState({
          user: data.user,
          isAuthenticated: true,
          isLoading: false
        });
        return data.user;
      } else {
        throw new Error('User data not found');
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      clearStoredAuth();
      setAuthState({
        user: null,
        isAuthenticated: false,
        isLoading: false
      });
      return null;
    }
  };

  useEffect(() => {
    // Check for stored token and user
    const token = getAuthToken();
    const storedUser = localStorage.getItem('riana_user');
    
    if (token && storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setAuthState({
          user,
          isAuthenticated: true,
          isLoading: false
        });
        // Optionally refresh profile from server to ensure data is up to date
        fetchUserProfile();
      } catch {
        clearStoredAuth();
        setAuthState({
          user: null,
          isAuthenticated: false,
          isLoading: false
        });
      }
    } else {
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    if (!authState.isAuthenticated) return;

    const checkSession = () => {
      if (!getAuthToken()) return;
      void apiClient.get('/auth/session-status').catch(() => undefined);
    };

    const interval = window.setInterval(checkSession, 45_000);
    const handleFocus = () => checkSession();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkSession();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [authState.isAuthenticated]);

  const completeLogin = (data: any) => {
    setAuthToken(data.token);
    localStorage.setItem('riana_user', JSON.stringify(data.user));
    setAuthState({ user: data.user, isAuthenticated: true, isLoading: false });
        return data.user;
  };

  const login = async (email: string, password: string): Promise<any> => {
    setAuthState(prev => ({ ...prev, isLoading: true }));

    try {
      const data = await apiClient.post('/auth/login', { email, password });
      
      if (data.requiresTwoFactor) {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return data;
      }
      if (data.token && data.user) {
        completeLogin(data);
        return data;
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      setAuthState({
        user: null,
        isAuthenticated: false,
        isLoading: false
      });
      throw error;
    }
  };

  const verifyTwoFactor = async (challengeId: string, code: string): Promise<void> => {
    setAuthState(prev => ({ ...prev, isLoading: true }));
    try {
      const data = await apiClient.post('/auth/verify-2fa', { challengeId, code });
      if (!data.token || !data.user) throw new Error('Invalid verification response');
      completeLogin(data);
    } catch (error) {
      setAuthState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  };

  const logout = (): void => {
    const token = getAuthToken();
    if (token) void apiClient.post('/auth/logout', {}).catch(() => undefined);
    clearStoredAuth();
    setAuthState({
      user: null,
      isAuthenticated: false,
      isLoading: false
    });
    window.location.href = '/';
  };

  const updateFirstLogin = async () => {

    if (authState.user) {
      try {
        await apiClient.patch('/auth/first-login', {});
        setAuthState(prev => {
          const newUser = prev.user ? { ...prev.user, first_login: false } : null;
          if (newUser) {
            localStorage.setItem('riana_user', JSON.stringify(newUser));
          }
          return {
            ...prev,
            user: newUser
          };
        });
      } catch (error) {
        console.error('Error updating first login:', error);
      }
    }
  };

  const changePassword = async (newPassword: string) => {
    try {
      await apiClient.patch('/auth/password', { password: newPassword });
    } catch (error) {
      console.error('Error changing password:', error);
      throw error;
    }
  };

  return {
    ...authState,
    login,
    verifyTwoFactor,
    logout,
    updateFirstLogin,
    changePassword,
    refreshUserProfile: fetchUserProfile
  };
};
