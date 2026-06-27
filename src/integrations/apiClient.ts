const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
const localHostnames = new Set(['localhost', '127.0.0.1', '::1']);
const safeConfiguredApiUrl = (() => {
  if (!configuredApiUrl || typeof window === 'undefined') return configuredApiUrl;
  try {
    const configured = new URL(configuredApiUrl);
    if (localHostnames.has(configured.hostname) && localHostnames.has(window.location.hostname)) return undefined;
    return configuredApiUrl;
  } catch {
    return undefined;
  }
})();
const browserApiUrl = typeof window !== 'undefined'
  ? (['5173', '8090'].includes(window.location.port)
      ? `http://${window.location.hostname}:8081/api`
      : `${window.location.origin}/api`)
  : 'http://localhost:8081/api';

export const API_URL = (safeConfiguredApiUrl || browserApiUrl).replace(/\/$/, '');

export const getAuthToken = () => {
  return localStorage.getItem('riana-auth-token');
};

export const setAuthToken = (token: string) => {
  localStorage.setItem('riana-auth-token', token);
};

export const clearAuthToken = () => {
  localStorage.removeItem('riana-auth-token');
};

export const apiFetch = async (endpoint: string, options: RequestInit = {}, retries = 3) => {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      cache: options.cache || 'no-store',
      credentials: options.credentials || 'include',
      headers
    });

    if (!response.ok) {
      if (response.status === 401) {
        clearAuthToken();
        localStorage.removeItem('riana_user');
        window.location.href = '/';
      }
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || response.statusText || 'API Request Failed');
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

  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'GET',
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearAuthToken();
      localStorage.removeItem('riana_user');
      window.location.assign('/');
    }
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || response.statusText || 'File request failed');
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
