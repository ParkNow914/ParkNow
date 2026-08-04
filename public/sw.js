/* public/sw.js — Service Worker do ParkNow (PWA)
 *
 * Estratégia conservadora para NÃO quebrar o app:
 *  - /api, /socket.io e /uploads: NUNCA interceptados (sempre rede).
 *  - Navegações (HTML): network-first com fallback para /offline.html.
 *  - Estáticos same-origin (css/js/img/fontes): stale-while-revalidate.
 *  - Cross-origin (CDNs): deixa passar (sem cache) para evitar opacidade/stale.
 *  - Cache versionado; caches antigos são limpos no activate.
 */
const CACHE = 'parknow-v1';
const PRECACHE = ['/', '/offline.html', '/manifest.json', '/img/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isBypass(url) {
  return (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/uploads')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // só GET é cacheável

  const url = new URL(request.url);

  // Bypass total para API/sockets/uploads e cross-origin (CDNs).
  if (url.origin !== self.location.origin || isBypass(url)) return;

  // Navegações: network-first, cai para offline.html se a rede falhar.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request).then((r) => r || caches.match('/offline.html')))
    );
    return;
  }

  // Estáticos same-origin: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
