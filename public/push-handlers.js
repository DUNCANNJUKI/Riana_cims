function notificationUrl(value) {
  try {
    const target = new URL(value || '/', self.location.origin);
    if (target.origin === self.location.origin) return target;
  } catch { /* Fall back to the app. */ }
  return new URL('/', self.location.origin);
}

self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  if (!payload || typeof payload !== 'object') return;
  const title = String(payload.title || 'RIANA CIMS').slice(0, 100);
  const callId = payload.type === 'incoming_call' && /^[a-f0-9-]{36}$/i.test(payload.entityId) ? payload.entityId : null;
  const target = notificationUrl(payload.url);
  if (callId) target.searchParams.set('incomingCall', callId);
  const options = {
    body: String(payload.body || '').slice(0, 180),
    icon: '/pwa/startup-any-192-v3.png',
    badge: '/pwa-icon.svg',
    tag: `${String(payload.type || 'notification')}:${String(payload.entityId || 'general')}`,
    renotify: false,
    data: { url: target.href, callId },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = notificationUrl(event.notification.data?.url);
  const callId = event.notification.data?.callId;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin && new URL(client.url).pathname === targetUrl.pathname);
    if (existing) {
      await existing.focus();
      if (callId) existing.postMessage({ type: 'riana-incoming-call-notification', callId });
      else if (targetUrl.pathname !== '/' || targetUrl.search || targetUrl.hash) await existing.navigate(targetUrl.href);
      return;
    }
    return self.clients.openWindow(targetUrl.href);
  }));
});
