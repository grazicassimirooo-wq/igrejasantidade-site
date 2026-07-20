/* ============================================================
   Service Worker · IBSS App
   Estratégia: cache first pra estáticos, network first pra HTML
   ============================================================ */
const CACHE = 'ibss-v4';
const STATIC = [
  './',
  './index.html',
  './firebase-sync.js',
  './logo.png',
  './moto.mp4',
  './moto-poster.jpg',
  './video-igreja.mp4',
  './poster-video.jpg',
  './ic-192.png',
  './ic-512.png',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; /* deixa passar external (Spotify, fonts) */

  /* HTML: network first (sempre pega o mais novo se online) */
  if (req.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return r;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  /* Estáticos: cache first */
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return r;
    }))
  );
});
