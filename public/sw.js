// Service worker de Coberturas.
// Los datos siempre vienen de internet (Supabase): acá no se guarda nada de eso.
// Solo se guardan los archivos de la app, para que abra rápido, y una página
// "Sin conexión" para cuando no hay internet.

const VERSION = 'coberturas-v2';
const SHELL = ['/offline.html', '/icons/icon-192.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Páginas: siempre de internet; sin conexión, el aviso.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }

  // Archivos de la app con nombre versionado (no cambian nunca): primero los guardados.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then(cache => cache.put(request, copy));
        }
        return response;
      }))
    );
  }
});

// Avisos (Web Push): el servidor manda { title, body, url, tag }.
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Coberturas', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    tag: data.tag,          // el mismo aviso no se repite en la bandeja
    data: { url: data.url || '/' }
  }));
});

// Al tocar el aviso: si la app está abierta, va a esa pantalla; si no, la abre.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const open = windows.find(w => w.url.startsWith(self.location.origin));
    if (open) return open.navigate(url).then(w => (w || open).focus());
    return self.clients.openWindow(url);
  }));
});
