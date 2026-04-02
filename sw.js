const CACHE_NAME = 'HeloxAi-v2';
const OFFLINE_URL = '/offline.html';
const MESSAGE_DB = 'chat-db';
const MESSAGE_STORE = 'outbox';
const MESSAGE_HISTORY_STORE = 'history';

// Cache app shell & assets
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/styles.css',
  '/main.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// ================================
// INSTALL & CACHE APP SHELL
// ================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

// ================================
// ACTIVATE & CLEAN OLD CACHES
// ================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activated');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ================================
// FETCH HANDLER (Unified Strategy)
// ================================
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. Network Only: API Calls & Auth (Supabase)
  // We don't cache these because chat data changes constantly.
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co')) {
    return event.respondWith(fetch(event.request));
  }

  // 2. Cache First: Images & Media
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico)$/)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        
        try {
          const network = await fetch(event.request);
          cache.put(event.request, network.clone());
          return network;
        } catch (e) {
          // Return placeholder or ignore if offline
          return new Response(); 
        }
      })
    );
    return;
  }

  // 3. Stale-While-Revalidate: HTML, CSS, JS
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      
      const networkPromise = fetch(event.request)
        .then((res) => {
          // Update cache with fresh version
          cache.put(event.request, res.clone());
          return res;
        })
        .catch(() => {
          // If network fails, return cached version
          return cached;
        });

      // Return cached immediately, or wait for network if not cached
      return cached || networkPromise;
    }).catch(() => {
      // Ultimate fallback for Navigation requests
      if (event.request.mode === 'navigate') {
        return caches.match(OFFLINE_URL);
      }
    })
  );
});

// ================================
// BACKGROUND SYNC FOR MESSAGES
// ================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    console.log('[SW] Syncing messages...');
    event.waitUntil(sendPendingMessages());
  }
});

// ================================
// INDEXEDDB HELPERS
// ================================
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MESSAGE_DB, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(MESSAGE_STORE)) db.createObjectStore(MESSAGE_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(MESSAGE_HISTORY_STORE)) db.createObjectStore(MESSAGE_HISTORY_STORE, { keyPath: 'id' });
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = reject;
  });
}

async function getPendingMessages() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(MESSAGE_STORE, 'readonly');
    const store = tx.objectStore(MESSAGE_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

async function deleteMessage(id) {
  const db = await openDB();
  const tx = db.transaction(MESSAGE_STORE, 'readwrite');
  tx.objectStore(MESSAGE_STORE).delete(id);
  return tx.complete;
}

async function sendPendingMessages() {
  const messages = await getPendingMessages();
  for (const msg of messages) {
    try {
      const res = await fetch('/api/sendMessage', { // Replace with your actual endpoint
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      });
      if (res.ok) await deleteMessage(msg.id);
    } catch (err) {
      console.warn('[SW] Failed to sync:', msg, err);
    }
  }
}

// ================================
// PUSH NOTIFICATIONS
// ================================
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'HeloxAi';
  const options = {
    body: data.body || 'You have a new update.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: data.url || '/',
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data || '/'));
});
