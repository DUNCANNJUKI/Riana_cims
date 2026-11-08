import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { refreshReleaseCaches } from './utils/releaseCache';

const preventStaleLocalShell = () => {
  if (!('serviceWorker' in navigator)) return;

  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  if (import.meta.env.DEV || isLocalHost) {
    window.addEventListener('load', async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const localRegistrations = registrations.filter((registration) => {
          const scope = new URL(registration.scope);
          return scope.origin === window.location.origin && ['/', '/developers/'].includes(scope.pathname);
        });
        await Promise.all(localRegistrations.map((registration) => registration.unregister()));

        if ('caches' in window) {
          const keys = await caches.keys();
          const appCaches = keys.filter((key) => key.startsWith('riana-') || key.startsWith('workbox-'));
          await Promise.all(appCaches.map((key) => caches.delete(key)));
        }

        const reloadFlag = 'riana-local-worker-reload';
        if (navigator.serviceWorker.controller && sessionStorage.getItem(reloadFlag) !== '1') {
          sessionStorage.setItem(reloadFlag, '1');
          window.location.reload();
        } else {
          sessionStorage.removeItem(reloadFlag);
        }
      } catch {
        // Cache cleanup is best-effort; the development app remains usable if browser APIs fail.
      }
    }, { once: true });
    return;
  }

  let refreshed = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshed) return;
    refreshed = true;
    window.location.reload();
  });
};

const recoverFromStaleChunkFailure = () => {
  const staleChunkPattern = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk .* failed/i;
  const reloadFlag = 'riana-stale-chunk-reload';

  const clearBrowserAppCache = async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  };

  const recover = () => {
    if (sessionStorage.getItem(reloadFlag) === '1') return;
    sessionStorage.setItem(reloadFlag, '1');
    clearBrowserAppCache()
      .catch(() => undefined)
      .finally(() => window.location.reload());
  };

  window.addEventListener('error', (event) => {
    const message = event.error?.message || event.message || '';
    if (staleChunkPattern.test(message)) recover();
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason || '');
    if (staleChunkPattern.test(message)) recover();
  });
};

preventStaleLocalShell();
refreshReleaseCaches();
recoverFromStaleChunkFailure();

createRoot(document.getElementById("root")!).render(<App />);
