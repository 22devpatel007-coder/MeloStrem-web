/**
 * client/public/service-worker.js
 *
 * MeloStream Production Service Worker
 *
 * Strategy:
 *   - App shell (HTML, JS, CSS)  → Cache First, fallback to network
 *   - API requests (/api/*)      → Network First, no cache
 *   - Audio/media (Cloudinary)   → Network Only (too large to cache)
 *   - Offline fallback           → /offline.html
 *
 * Lifecycle:
 *   install   → pre-cache app shell
 *   activate  → delete old caches
 *   fetch     → route requests per strategy above
 *   message   → handle SKIP_WAITING from serviceWorkerRegistration.js
 */

const CACHE_NAME = 'melostream-shell-v1';

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
];

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  // Do NOT call self.skipWaiting() here.
  // We wait for the explicit SKIP_WAITING message from the update banner
  // so the user controls when the new SW takes over.
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // Take control of all open clients immediately after activation
      return self.clients.claim();
    })
  );
});

// ── Message: handle SKIP_WAITING from serviceWorkerRegistration.js ────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Fetch: route requests ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Ignore non-GET requests entirely (POST, PATCH, DELETE etc.)
  if (request.method !== 'GET') {
    return;
  }

  // 2. Ignore chrome-extension and non-http(s) schemes
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // 3. API requests → Network First, never cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkOnly(request));
    return;
  }

  // 4. Cloudinary / external audio/image CDN → Network Only
  if (
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('res.cloudinary.com')
  ) {
    event.respondWith(networkOnly(request));
    return;
  }

  // 5. Firebase Auth / Firestore → Network Only
  if (
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com')
  ) {
    event.respondWith(networkOnly(request));
    return;
  }

  // 6. App shell HTML navigation requests → Cache First with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }

  // 7. Static assets (JS, CSS, icons, fonts) → Cache First
  event.respondWith(cacheFirst(request));
});

// ── Strategies ────────────────────────────────────────────────────────────────

/**
 * Cache First: serve from cache if available, else fetch and cache.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  try {
    const response = await fetch(request);
    // Only cache valid, same-origin responses
    if (
      response.ok &&
      response.type === 'basic'
    ) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // No cache hit, no network — nothing we can do for static assets
    return new Response('Asset unavailable offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

/**
 * Network Only: always go to network, never touch cache.
 */
async function networkOnly(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Network unavailable', offline: true }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Navigation handler: try network first for HTML pages,
 * fall back to cache, then offline.html.
 */
async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    const offline = await caches.match('/offline.html');
    if (offline) return offline;

    return new Response('<h1>You are offline</h1>', {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}