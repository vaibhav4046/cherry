/* Cherry service worker: caches the static shell only. Workspace records live
   in IndexedDB and are NEVER cached here.

   Strategy (v4): network-first for navigations and the HTML shell, cache-first
   for hashed /assets/ files.

   Why: a cache-first shell keeps serving an old index.html after a deploy, and
   that old HTML points at asset hashes the server no longer has. The returning
   visitor then gets a blank page. Navigations therefore always try the network
   first and fall back to the cached shell only when offline. Hashed assets are
   immutable, so cache-first is safe and keeps the app fast offline. */
const CACHE = 'cherry-shell-v4';
const SHELL = ['/index.html', '/manifest.webmanifest', '/cherry.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Never intercept localhost runner calls.
  if (url.port === '47821') return;

  const isNavigation =
    event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html';

  if (isNavigation) {
    // Network first, bypassing the HTTP cache: a fresh deploy must reach
    // returning visitors immediately, and a stale shell would point at asset
    // hashes the server no longer serves.
    const fresh = new Request(event.request.url, { cache: 'reload', credentials: 'same-origin', headers: event.request.headers, redirect: 'follow' });
    event.respondWith(
      fetch(fresh)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put('/index.html', clone));
          }
          return response;
        })
        // Offline: always fall back to the most recently fetched shell, never to
        // an install-time snapshot that may point at assets a later deploy removed.
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Static shell files are cached under their own URLs. Keeping them out of
  // the navigation branch prevents an icon or manifest response from ever
  // replacing the cached /index.html fallback.
  if (SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached ?? fetch(event.request)),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    // Hashed assets are immutable: cache first, fill the cache on a miss.
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      }),
    );
  }
});
