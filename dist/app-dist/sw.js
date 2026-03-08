const CACHE_NAME = 'curse-run-v2-shell-v3';
const CORE_ASSETS = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/sw.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isApi = url.pathname.startsWith('/api/');
  const isNavigation = request.mode === 'navigate';
  const isStaticAsset = url.origin === self.location.origin && (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css'));

  if (isApi) {
    event.respondWith(
      fetch(request).catch(() => {
        if (url.pathname === '/api/time') {
          return new Response(JSON.stringify({ serverTimeMs: Date.now(), offline: true }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
          });
        }
        return new Response(JSON.stringify({ error: 'offline_unavailable' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503
        });
      })
    );
    return;
  }

  if (isNavigation) {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((res) => {
            const cloned = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned)).catch(() => undefined);
            return res;
          })
          .catch(() => cached);
        return cached ?? networkFetch;
      })
    );
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).catch(() => caches.match('/index.html'))));
});
