self.addEventListener('push', event => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  const title = String(payload.title || 'RIANA CIMS').slice(0, 100);
  const options = {
    body: String(payload.body || '').slice(0, 180),
    icon: '/pwa-icon.svg',
    badge: '/pwa-icon.svg',
    tag: `${String(payload.type || 'notification')}:${String(payload.entityId || 'general')}`,
    renotify: false,
    data: { url: String(payload.url || '/').startsWith('/') ? String(payload.url || '/') : '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      if ('navigate' in existing) await existing.navigate(targetUrl);
      return;
    }
    return self.clients.openWindow(targetUrl);
  }));
});
