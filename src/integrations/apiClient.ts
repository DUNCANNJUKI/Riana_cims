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

  const response = await fetch(resolveApiEndpointUrl(endpoint), {
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
