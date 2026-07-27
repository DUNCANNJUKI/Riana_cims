const configuredDevelopmentApiUrl = import.meta.env.DEV
  ? import.meta.env.VITE_API_URL?.trim()
  : undefined;

// Use the Vite proxy in development and the deployed origin in production.
// A relative URL also works from another workstation on the LAN and prevents
// that workstation from incorrectly calling its own localhost:8081.
export const API_URL = (configuredDevelopmentApiUrl || '/api').replace(/\/$/, '');

export const getAuthToken = () => {
  return localStorage.getItem('riana-auth-token');
};

export const setAuthToken = (token: string) => {
  localStorage.setItem('riana-auth-token', token);
};

export const clearAuthToken = () => {
  localStorage.removeItem('riana-auth-token');
};
const AUTH_FAILURE_CODES = new Set(['SESSION_REPLACED', 'SESSION_REVOKED', 'TOKEN_EXPIRED', 'ACCOUNT_DISABLED']);
const AUTH_MESSAGE_KEY = 'riana-auth-message';
const NON_SESSION_401_ENDPOINTS = [/\/auth\/login$/i, /\/auth\/verify-2fa$/i, /\/auth\/verify-password$/i];

const sessionMessageFor = (code?: string, fallback?: string) => {
  if (code === 'SESSION_REPLACED') return 'Your account was signed in on another device. Please sign in again if this was not you.';
  if (code === 'ACCOUNT_DISABLED') return 'Your account is disabled. Contact an administrator.';
  if (code === 'TOKEN_EXPIRED') return 'Your session has expired. Please sign in again.';
  return fallback || 'Your session is no longer active. Please sign in again.';
};

const endpointCanReturnBusiness401 = (endpoint: string) => NON_SESSION_401_ENDPOINTS.some((pattern) => pattern.test(endpoint));

export const consumeAuthRedirectMessage = () => {
  const message = sessionStorage.getItem(AUTH_MESSAGE_KEY);
  if (message) sessionStorage.removeItem(AUTH_MESSAGE_KEY);
  return message;
};

const clearLocalAuthState = () => {
  clearAuthToken();
  localStorage.removeItem('riana_user');
  localStorage.removeItem('crms-user-session');
  localStorage.removeItem('crms-user-id');
  localStorage.removeItem('crms-user-role');
  localStorage.removeItem('crms-auth-token');
};

const handleUnauthorizedResponse = (endpoint: string, token: string | null, errorData: any) => {
  const code = typeof errorData?.code === 'string' ? errorData.code : undefined;
  const shouldClearSession = AUTH_FAILURE_CODES.has(code || '') || (Boolean(token) && !endpointCanReturnBusiness401(endpoint));
  if (!shouldClearSession) return;
  clearLocalAuthState();
  sessionStorage.setItem(AUTH_MESSAGE_KEY, sessionMessageFor(code, errorData?.message || errorData?.error));
  if (window.location.pathname === '/') window.location.reload();
  else window.location.assign('/');
};

const handleMaintenanceResponse = (errorData: any) => {
  if (errorData?.code !== 'MAINTENANCE_MODE') return;
  clearLocalAuthState();
  sessionStorage.setItem(AUTH_MESSAGE_KEY, errorData?.message || 'System is currently under maintenance.');
  if (window.location.pathname !== '/maintenance') window.location.assign('/maintenance');
};
const resolveApiEndpointUrl = (endpoint: string) => {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const normalizedBase = API_URL.replace(/\/$/, '');
  const baseIsApiRoot = normalizedBase === '/api' || /\/api$/i.test(normalizedBase);

  if (baseIsApiRoot && normalizedEndpoint.startsWith('/api/')) {
    if (/^https?:\/\//i.test(normalizedBase)) {
      return `${new URL(normalizedBase).origin}${normalizedEndpoint}`;
    }
    return normalizedEndpoint;
  }

  return `${normalizedBase}${normalizedEndpoint}`;
};
export const apiFetch = async (endpoint: string, options: RequestInit = {}, retries = 3) => {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(resolveApiEndpointUrl(endpoint), {
      ...options,
      cache: options.cache || 'no-store',
      credentials: options.credentials || 'include',
      headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) handleUnauthorizedResponse(endpoint, token, errorData);
      if (response.status === 503) handleMaintenanceResponse(errorData);
      const error = new Error(errorData.error || errorData.message || response.statusText || 'API Request Failed');
      (error as Error & { status?: number; code?: string }).status = response.status;
      (error as Error & { status?: number; code?: string }).code = errorData.code;
      throw error;
    }

    return response.json();
  } catch (error: any) {
    const method = (options.method || 'GET').toUpperCase();
    const isSafeToRetry = method === 'GET' || method === 'HEAD';
    if (isSafeToRetry && retries > 0 && (error.message.includes('Failed to fetch') || error.name === 'TypeError')) {
      console.warn(`API request failed, retrying... (${retries} left)`, endpoint);
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      return apiFetch(endpoint, options, retries - 1);
    }
    throw error;
  }
};

export const fetchAuthenticatedBlob = async (endpoint: string): Promise<Blob> => {
  const token = getAuthToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(resolveApiEndpointUrl(endpoint), {
    method: 'GET',
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 401) handleUnauthorizedResponse(endpoint, token, errorData);
    if (response.status === 503) handleMaintenanceResponse(errorData);
    const error = new Error(errorData.error || errorData.message || response.statusText || 'File request failed');
    (error as Error & { status?: number; code?: string }).status = response.status;
    (error as Error & { status?: number; code?: string }).code = errorData.code;
    throw error;
  }

  return response.blob();
};

export const downloadAuthenticatedFile = async (endpoint: string, fileName: string) => {
  const blob = await fetchAuthenticatedBlob(endpoint);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
};

export const previewAuthenticatedFile = async (endpoint: string) => {
  const previewWindow = window.open('', '_blank');
  if (previewWindow) previewWindow.opener = null;
  try {
    const blob = await fetchAuthenticatedBlob(endpoint);
    const objectUrl = URL.createObjectURL(blob);
    if (previewWindow) previewWindow.location.href = objectUrl;
    else window.location.assign(objectUrl);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    previewWindow?.close();
    throw error;
  }
};

export const apiClient = {
  get: (endpoint: string) => apiFetch(endpoint, { method: 'GET' }),
  post: (endpoint: string, body: any) => apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint: string, body: any) => apiFetch(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (endpoint: string, body: any) => apiFetch(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (endpoint: string) => apiFetch(endpoint, { method: 'DELETE' })
};
