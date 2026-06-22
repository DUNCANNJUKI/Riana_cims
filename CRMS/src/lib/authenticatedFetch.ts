const nativeFetch = window.fetch.bind(window);
let installed = false;

export function installAuthenticatedFetch() {
  if (installed) return;
  installed = true;
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/api/crms')) return nativeFetch(input, init);

    const token = localStorage.getItem('riana-auth-token');
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return nativeFetch(input, { ...init, credentials: init.credentials || 'include', headers });
  };
}
