/* Volunteer portal service worker — reuse MiniVAN walk offline shell pattern. */
const SHELL = 'antelope-portal-shell-v1';

const SHELL_URLS = [
  '/portal-manifest.webmanifest',
  '/walk-icons/icon-192.png',
  '/walk-icons/icon-512.png',
  '/portal',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL)
          .filter((k) => k.startsWith('antelope-portal-'))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.mode === 'navigate' && url.pathname.startsWith('/portal')) {
    event.respondWith(
      fetch(req).catch(
        () =>
          caches.match('/portal').then(
            (r) =>
              r ||
              new Response(
                `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Portal offline</title></head><body style="font-family:system-ui;padding:2rem"><h1>Offline</h1><p>Reconnect to sync your shifts and tasks.</p></body></html>`,
                { headers: { 'Content-Type': 'text/html' } }
              )
          )
      )
    );
    return;
  }

  if (SHELL_URLS.some((u) => url.pathname === u)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
  }
});
