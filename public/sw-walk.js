/* MiniVAN Walk service worker — caches app shell + last walk JSON for offline open. */
const SHELL = 'antelope-walk-shell-v1';
const DATA = 'antelope-walk-data-v1';

const SHELL_URLS = [
  '/walk-manifest.webmanifest',
  '/walk-icons/icon-192.png',
  '/walk-icons/icon-512.png',
  '/maplibre-gl.css',
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
          .filter((k) => k !== SHELL && k !== DATA)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Cache-first for walk API GET (turf snapshot) — network then cache
  if (req.method === 'GET' && url.pathname.startsWith('/api/public/walk/')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(DATA).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.open(DATA).then((c) => c.match(req)).then((r) => r || Response.error()))
    );
    return;
  }

  // Navigation to /walk/* — network first, fall back to a minimal offline shell
  if (req.mode === 'navigate' && url.pathname.startsWith('/walk/')) {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(
            `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Walk offline</title></head><body style="font-family:system-ui;padding:2rem"><h1>Offline</h1><p>Open this walk link again when you had connectivity once — your turf is cached in the app.</p><script>location.reload()</script></body></html>`,
            { headers: { 'Content-Type': 'text/html' } }
          )
      )
    );
    return;
  }

  // Shell assets
  if (SHELL_URLS.some((u) => url.pathname === u)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'walk-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then((clients) => {
        for (const c of clients) {
          c.postMessage({ type: 'walk-sync' });
        }
      })
    );
  }
});
