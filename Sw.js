/**
 * FATUMA AI — Service Worker v8
 * Pure Friend & Counsellor Mode
 * Enables: Offline support, caching, install prompt
 * Strategy: Cache-first for static assets, Network-first for API
 */

const SW_VERSION = 'fatuma-v8';
const STATIC_CACHE = `${SW_VERSION}-static`;
const DYNAMIC_CACHE = `${SW_VERSION}-dynamic`;

// Files to cache immediately (App Shell)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Never cache these (always go to network)
const NETWORK_ONLY = [
  'fatuma-backend.onrender.com',
  'api.groq.com',
  'generativelanguage.googleapis.com',
  'api.mistral.ai',
  'api.together.xyz',
  'openrouter.ai',
  'api.anthropic.com',
  'api.openai.com',
];

// ── Install: Pre-cache app shell ──────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing', SW_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Pre-caching app shell...');
        return Promise.allSettled(
          PRECACHE_ASSETS.map(url => 
            cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: Clean old caches ────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating', SW_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys => {
        const toDelete = keys.filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE);
        return Promise.all(toDelete.map(k => caches.delete(k)));
      })
      .then(() => self.clients.claim())
      .then(() => {
        return self.clients.matchAll({ includeUncontrolled: true });
      })
      .then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_ACTIVATED', version: SW_VERSION }));
      })
  );
});

// ── Fetch: Smart routing ──────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET' || !url.protocol.startsWith('http')) return;

  // Always network for API calls (chat backend)
  if (NETWORK_ONLY.some(domain => url.hostname.includes(domain) || url.pathname.includes('/api/'))) {
    event.respondWith(
      fetch(request).catch(() => 
        new Response(
          JSON.stringify({ error: { message: "You are offline. Please check your connection." } }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // Cache-first for static assets (same origin)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request)
        .then(cached => {
          if (cached) {
            // Stale-while-revalidate
            fetch(request).then(networkResp => {
              if (networkResp && networkResp.ok) {
                caches.open(STATIC_CACHE).then(c => c.put(request, networkResp.clone()));
              }
            }).catch(() => {});
            return cached;
          }

          return fetch(request).then(networkResp => {
            if (networkResp && networkResp.ok) {
              const clone = networkResp.clone();
              caches.open(STATIC_CACHE).then(c => c.put(request, clone));
            }
            return networkResp;
          }).catch(() => {
            // Offline fallback for HTML
            if (request.destination === 'document') {
              return caches.match('/index.html');
            }
          });
        })
    );
    return;
  }

  // Network-first for external resources (fonts, etc.)
  event.respondWith(
    fetch(request)
      .then(resp => {
        if (resp.ok && resp.type !== 'opaque') {
          const clone = resp.clone();
          caches.open(DYNAMIC_CACHE).then(c => c.put(request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(request))
  );
});

// ── Message handler ───────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: SW_VERSION });
  }
});

console.log('[SW] Service Worker loaded:', SW_VERSION);
