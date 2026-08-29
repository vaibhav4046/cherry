/* Cherry service worker: caches the static shell only. Workspace records live
   in IndexedDB and are NEVER cached here. */
const CACHE = 'cherry-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/cherry.svg'];

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
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok && (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname))) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached ?? caches.match('/index.html'));
      return cached ?? network;
    }),
  );
});
