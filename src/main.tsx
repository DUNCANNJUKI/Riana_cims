import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { refreshReleaseCaches } from './utils/releaseCache';

const preventStaleLocalShell = () => {
  if (!('serviceWorker' in navigator)) return;

  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  if (isLocalHost) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => undefined);

      if ('caches' in window) {
        caches.keys()
          .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
          .catch(() => undefined);
      }
    });
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
