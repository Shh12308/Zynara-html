// ================================
// 🧠 AI Chat PWA Service Worker
// Full Offline Support + Push + Background Sync
// ================================

const CACHE_NAME = 'chat-app-cache-v2';
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
  '/images/icon-192x192.png',
  '/images/icon-512x512.png',
  '/images/avatars/',
  '/images/emojis/',
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
// FETCH HANDLER (Stale-While-Revalidate + Offline)
// ================================
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never cache Google Ads / Supabase auth
  if (url.hostname.includes('googlesyndication.com') || url.hostname.includes('googleadservices.com') || url.hostname.includes('supabase.co')) {
    return event.respondWith(fetch(event.request));
  }

  // Handle images/media & emojis
  if (
    url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg)$/) ||
    url.pathname.startsWith('/avatars/') ||
    url.pathname.startsWith('/emojis/')
  ) {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((res) => { cache.put(event.request, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    }));
    return;
  }

  // Default: HTML/JS/CSS (stale-while-revalidate)
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((res) => { cache.put(event.request, res.clone()); return res; })
        .catch(() => cached || caches.match(OFFLINE_URL));
      return cached || network;
    })
  );
});

// ================================
// OFFLINE FALLBACK
// ================================
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request).catch(() => {
      if (event.request.headers.get('accept')?.includes('text/html')) {
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

async function saveMessageOffline(msg) {
  const db = await openDB();
  const tx = db.transaction(MESSAGE_STORE, 'readwrite');
  tx.objectStore(MESSAGE_STORE).put(msg);
  return tx.complete;
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

// ================================
// SEND PENDING MESSAGES
// ================================
async function sendPendingMessages() {
  const messages = await getPendingMessages();
  for (const msg of messages) {
    try {
      const res = await fetch('/api/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      });
      if (res.ok) await deleteMessage(msg.id);
    } catch (err) {
      console.warn('[SW] Failed to send:', msg, err);
    }
  }
}

// ================================
// SAVE CHAT HISTORY OFFLINE
// ================================
async function saveChatHistory(messages) {
  const db = await openDB();
  const tx = db.transaction(MESSAGE_HISTORY_STORE, 'readwrite');
  messages.forEach(msg => tx.objectStore(MESSAGE_HISTORY_STORE).put(msg));
  return tx.complete;
}

async function getChatHistory(chatId) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(MESSAGE_HISTORY_STORE, 'readonly');
    const store = tx.objectStore(MESSAGE_HISTORY_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const chatMessages = req.result.filter(m => m.chatId === chatId);
      resolve(chatMessages);
    };
  });
}

// ================================
// PUSH NOTIFICATIONS
// ================================
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || '💬 New Message';
  const options = {
    body: data.body || 'You received a new chat message!',
    icon: '/images/icon-192x192.png',
    badge: '/images/icon-192x192.png',
    data: data.url || '/',
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data || '/'));
});

// ================================
// ONE SIGNAL SUPPORT
// ================================
importScripts('https://cdn.onesignal.com/sdks/OneSignalSDKWorker.js');