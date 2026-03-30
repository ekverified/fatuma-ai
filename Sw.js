/**
 * FATUMA AI — Service Worker v7
 * Enables: offline support, background sync, push notifications, install prompt
 * Strategy: Cache-first for assets, Network-first for API calls
 */

const SW_VERSION = 'fatuma-v7';
const STATIC_CACHE = `${SW_VERSION}-static`;
const DYNAMIC_CACHE = `${SW_VERSION}-dynamic`;

// Files to cache immediately on install (app shell)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  // Google Fonts fallback — cached after first load
];

// URLs that should NEVER be cached (always network)
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

// ── Install: pre-cache app shell ──────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing', SW_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Pre-caching app shell');
        // Use individual adds so one failure doesn't break all
        return Promise.allSettled(
          PRECACHE_ASSETS.map(url => 
            cache.add(url).catch(err => console.warn('[SW] Pre-cache failed:', url, err))
          )
        );
      })
      .then(() => {
        console.log('[SW] Pre-cache complete');
        return self.skipWaiting(); // Activate immediately
      })
  );
});

// ── Activate: clean old caches ────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating', SW_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys => {
        const toDelete = keys.filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE);
        return Promise.all(toDelete.map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        }));
      })
      .then(() => self.clients.claim()) // Take control immediately
      .then(() => {
        // Notify all clients that SW is ready
        return self.clients.matchAll({ includeUncontrolled: true });
      })
      .then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_ACTIVATED', version: SW_VERSION }));
      })
  );
});

// ── Fetch: smart routing ──────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and non-http(s)
  if (!url.protocol.startsWith('http')) return;

  // Network-only: API calls (never cache AI/news responses)
  if (NETWORK_ONLY.some(domain => url.hostname.includes(domain) || url.pathname.includes('/api/'))) {
    event.respondWith(
      fetch(request).catch(() => 
        new Response(
          JSON.stringify({ error: { message: 'You are offline. Please check your connection and try again.' } }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // Cache-first for same-origin static assets (HTML, CSS, JS, images)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request)
        .then(cached => {
          if (cached) {
            // Return cached, also update in background (stale-while-revalidate)
            const fetchPromise = fetch(request)
              .then(networkResp => {
                if (networkResp.ok) {
                  caches.open(STATIC_CACHE).then(c => c.put(request, networkResp.clone()));
                }
                return networkResp;
              })
              .catch(() => {}); // Silent fail on background update
            return cached;
          }
          // Not in cache — fetch and cache
          return fetch(request).then(networkResp => {
            if (networkResp.ok) {
              const clone = networkResp.clone();
              caches.open(STATIC_CACHE).then(c => c.put(request, clone));
            }
            return networkResp;
          }).catch(() => {
            // Offline fallback
            if (request.destination === 'document') {
              return caches.match('/index.html');
            }
          });
        })
    );
    return;
  }

  // Network-first for external resources (fonts, CDN etc.)
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

// ── Background sync (for offline message queue) ───────────────
self.addEventListener('sync', event => {
  console.log('[SW] Background sync:', event.tag);
  // Future: sync queued messages when back online
});

// ── Push notifications (future) ───────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Fatuma AI', {
      body: data.body || 'You have a new message',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});

console.log('[SW] Service Worker loaded:', SW_VERSION);
