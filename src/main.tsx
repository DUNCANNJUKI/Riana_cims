import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

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

preventStaleLocalShell();

createRoot(document.getElementById("root")!).render(<App />);
