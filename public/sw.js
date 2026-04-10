const CACHE_VERSION = 'arcane-vault-v2';
const STATIC_ASSETS = ['/', '/index.html', '/manifest.json', '/favicon.svg'];
const MAX_CACHE_ITEMS = 500;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Trim cache to prevent unbounded growth
async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > max) {
    await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
  }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Supabase: always network
  if (url.hostname.includes('supabase.co')) return;

  // Scryfall API: network-first, cache fallback, with size limit
  if (url.hostname === 'api.scryfall.com' || url.hostname.includes('scryfall.io')) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then((cache) => {
          cache.put(e.request, clone);
          trimCache(CACHE_VERSION, MAX_CACHE_ITEMS);
        });
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Google Fonts: cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.match(e.request).then((cached) =>
        cached || fetch(e.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(e.request, clone));
          return res;
        })
      )
    );
    return;
  }

  // Static: stale-while-revalidate (serve cache, update in background)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((res) => {
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
