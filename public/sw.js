// Hirobius Ops — service worker.
//
// Strategy:
//   - HTML / navigation requests       → network-first, fall back to cache
//     (so new routes self-heal and the SW never strands the SPA on a stale
//     index.html with old route metadata).
//   - Static GET assets (JS/CSS/img)   → cache-first.
//   - POST /api/route                  → never intercepted (auto-assigner).
//   - non-GET in general               → never intercepted.

// v3: /ops/sessions removed from the shell — the route was retired and the
// cached entry meant every home-screen launch (manifest start_url) opened on
// the 404 page. Bumping CACHE_NAME purges the stale shell on installed clients.
const CACHE_NAME = 'hirobius-ops-v3';
const APP_SHELL = ['/', '/ops', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;

  // Detect SPA navigation: either the browser-tagged 'navigate' destination
  // or any request that accepts text/html. Network-first so route additions
  // / removals propagate immediately on the next page load.
  const isNavigation =
    request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((m) => m || caches.match('/index.html'))),
    );
    return;
  }

  // Static assets: cache-first, populate on miss.
  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(request, clone));
          }
          return response;
        })
      );
    }),
  );
});
