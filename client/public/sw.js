self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  const payload = event.data?.json() ?? { title: 'minimum.chat' };
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body ?? '',
      data: payload.data ?? {},
      tag: payload.data?.group_id ? `invite-${payload.data.group_id}` : undefined,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        const app = clients.find((c) => c.url.startsWith(self.registration.scope));
        return app ? app.focus() : self.clients.openWindow('/');
      })
  );
});
