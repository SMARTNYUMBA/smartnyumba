/**
 * SmartNyumba Pro — Service Worker
 *
 * Strategy:
 *  - App shell (HTML/CSS/JS): Cache-First with network fallback
 *  - API requests: Network-First with cache fallback for GET requests
 *  - POST/PUT/DELETE: Always network, queue if offline (for check-ins)
 *
 * Offline queue: stores failed POST requests (visitor check-ins, meter readings)
 * and replays them when connectivity is restored.
 */

const CACHE_NAME    = 'snp-v1';
const OFFLINE_QUEUE = 'snp-offline-queue';

// Assets to pre-cache on install (app shell)
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// API routes that can be served from cache when offline
const CACHEABLE_API = [
  '/api/properties',
  '/api/units',
  '/api/health',
];

// ── Install: pre-cache app shell ──────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== OFFLINE_QUEUE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: routing strategy ───────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET for API — handle in background sync
  if (request.method !== 'GET') {
    if (url.pathname.startsWith('/api/')) {
      event.respondWith(networkWithOfflineQueue(request));
    }
    return;
  }

  // API GET — network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    const isCacheable = CACHEABLE_API.some(p => url.pathname.startsWith(p));
    if (isCacheable) {
      event.respondWith(networkFirstWithCache(request));
    }
    return; // Other API GETs: let them go to network normally
  }

  // App shell (HTML navigation) — cache first, network fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(cached => cached || fetch(request))
    );
    return;
  }

  // Static assets — cache first
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
        }
        return response;
      });
    })
  );
});

// Network-first with cache fallback for GET API calls
async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'You are offline', offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// For offline POST requests — attempt network, queue on failure
async function networkWithOfflineQueue(request) {
  try {
    return await fetch(request.clone());
  } catch {
    // Store in offline queue for sync when back online
    const body = await request.clone().text().catch(() => '{}');
    const entry = {
      url:     request.url,
      method:  request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
      queuedAt: Date.now(),
    };
    const cache = await caches.open(OFFLINE_QUEUE);
    const existing = await cache.match('queue').then(r => r?.json()).catch(() => []);
    await cache.put('queue', new Response(JSON.stringify([...existing, entry])));

    return new Response(JSON.stringify({
      success: false,
      offline: true,
      queued: true,
      message: 'You are offline. This action has been queued and will sync when connectivity is restored.',
    }), {
      status:  202,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── Background sync: replay queued requests ───────────────────
self.addEventListener('sync', async event => {
  if (event.tag !== 'snp-sync') return;
  event.waitUntil(replayQueue());
});

// BUG FIX: the Background Sync API above only ever fires if something
// called `registration.sync.register('snp-sync')` from the page — that
// call never existed anywhere in this app (see main.jsx), so queued
// offline check-ins/readings were stored but NEVER replayed, silently,
// forever. Also: Background Sync isn't supported on iOS Safari at all
// (a large share of mobile users), so it can never be the only
// mechanism. Add a message-based fallback the client can always call —
// on reconnect, and once on load in case items were already queued.
self.addEventListener('message', event => {
  if (event.data?.type === 'REPLAY_QUEUE') {
    event.waitUntil(replayQueue());
  }
});

async function replayQueue() {
  const cache = await caches.open(OFFLINE_QUEUE);
  const queueResponse = await cache.match('queue').catch(() => null);
  if (!queueResponse) return;

  const queue = await queueResponse.json().catch(() => []);
  if (!queue.length) return;

  const remaining = [];
  for (const entry of queue) {
    try {
      const resp = await fetch(entry.url, {
        method:  entry.method,
        headers: entry.headers,
        body:    entry.body || undefined,
      });
      if (!resp.ok) remaining.push(entry); // keep if server error
    } catch {
      remaining.push(entry); // keep if still offline
    }
  }

  await cache.put('queue', new Response(JSON.stringify(remaining)));

  // Notify all clients of sync result
  const clients = await self.clients.matchAll();
  clients.forEach(c => c.postMessage({
    type:    'SYNC_COMPLETE',
    synced:  queue.length - remaining.length,
    pending: remaining.length,
  }));
}

// ── Push notifications ────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  // BUG FIX: event.data.json() returns a Promise — this was never
  // awaited, so `data` was always the Promise object itself, not the
  // parsed payload. data.title/data.body/data.url were therefore always
  // undefined, and EVERY push notification silently fell back to the
  // generic "SmartNyumba" title with an empty body and a link to "/",
  // no matter what the actual notification was about (rent due,
  // maintenance update, new message, etc).
  event.waitUntil((async () => {
    let data;
    try { data = await event.data.json(); }
    catch { data = { title: 'SmartNyumba', body: event.data.text() }; }
    return self.registration.showNotification(data.title || 'SmartNyumba', {
      body:  data.body  || '',
      icon:  '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag:   data.tag   || 'snp-notification',
      data:  { url: data.url || '/' },
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const existing = clients.find(c => c.url.includes(url));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
