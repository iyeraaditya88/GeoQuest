// GeoQuest service worker: makes the app installable and fast to reopen.
//  • Pages: network first (so sign-in and updates always win), the last good copy when offline.
//  • Built assets, textures, icons, fonts: cache first (their URLs are versioned or never change).
//  • Map data (nature.json, admin1/*): served from cache, refreshed in the background.
//  • /api and the sign-in pages: never cached.
// Also shows the morning reminders (Web Push) and opens the Daily challenge when one is tapped.
const VERSION = 'v2';
const PAGES = `gq-pages-${VERSION}`;
const STATIC = `gq-static-${VERSION}`;
const DATA = `gq-data-${VERSION}`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // Keep a copy of the app page from the start (skipped when not signed in: that's a redirect).
  event.waitUntil((async () => {
    try {
      const res = await fetch('/', { credentials: 'same-origin' });
      if (res.ok && !res.redirected) await (await caches.open(PAGES)).put('/', res);
    } catch { /* offline right now — the next visit will store it */ }
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PAGES, STATIC, DATA]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const NO_CACHE = /^\/(api\/|login|welcome|setup)/;
const isStatic = (url) => url.origin === self.location.origin
  ? /^\/(assets|textures|icons)\//.test(url.pathname)
  : url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com';
const isData = (url) => url.origin === self.location.origin && (url.pathname === '/nature.json' || url.pathname.startsWith('/admin1/'));

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && (res.type === 'basic' || res.type === 'cors')) cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(DATA);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  if (hit) { event.waitUntil(fresh.catch(() => {})); return hit; }
  return fresh;
}

async function page(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    // Only keep the real app page — not a redirect to sign-in.
    if (res.ok && res.type === 'basic' && !res.redirected) cache.put('/', res.clone()).catch(() => {});
    return res;
  } catch {
    return (await cache.match('/')) || new Response('<!doctype html><meta name="viewport" content="width=device-width"><body style="background:#03050d;color:#e8edf7;font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0;text-align:center"><div><h2>You’re offline</h2><p>Reconnect to explore the globe.</p></div>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && NO_CACHE.test(url.pathname)) return;
  if (req.mode === 'navigate') { event.respondWith(page(req)); return; }
  if (isStatic(url)) { event.respondWith(cacheFirst(req)); return; }
  if (isData(url)) { event.respondWith(staleWhileRevalidate(req, event)); return; }
});

// ── Morning reminders ──
self.addEventListener('push', (event) => {
  let note = {};
  try { note = event.data ? event.data.json() : {}; } catch { /* not JSON */ }
  const url = typeof note.url === 'string' && note.url.startsWith('/') ? note.url : '/?daily=1';
  event.waitUntil(self.registration.showNotification(note.title || 'GeoQuest', {
    body: note.body || 'Today’s Daily challenge is waiting.',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: note.tag || 'daily', // a newer one replaces an older one
    renotify: false,
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/?daily=1', self.location.origin);
  event.waitUntil((async () => {
    // Reuse an open GeoQuest (and tell it to open the Daily); otherwise open one.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin !== self.location.origin) continue;
      await w.focus();
      w.postMessage({ type: 'open-daily' });
      return;
    }
    await self.clients.openWindow(url.href);
  })());
});
