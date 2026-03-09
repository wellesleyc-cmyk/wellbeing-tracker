const CACHE_NAME = 'wellbeing-v1';

const APP_SHELL_FILES = [
  '/wellbeing-tracker/',
  '/wellbeing-tracker/index.html',
  '/wellbeing-tracker/manifest.json',
  '/wellbeing-tracker/css/styles.css',
  '/wellbeing-tracker/js/app.js',
  '/wellbeing-tracker/js/db.js',
  '/wellbeing-tracker/js/location.js',
  '/wellbeing-tracker/js/survey.js',
  '/wellbeing-tracker/js/history.js',
  '/wellbeing-tracker/js/export.js',
];

// Install: cache all app shell files and skip waiting to activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      self.skipWaiting(),
      caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES)),
    ])
  );
});

// Activate: remove any stale caches from previous versions
self.addEventListener('activate', (event) => {
  self.clients.claim();
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
});

// Fetch: network-only for Nominatim; cache-first for everything else
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-only for reverse geocoding requests
  if (url.hostname === 'nominatim.openstreetmap.org') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first strategy for all other requests
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Only cache valid, same-origin or CORS responses
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (networkResponse.type === 'basic' || networkResponse.type === 'cors')
        ) {
          const responseToCache = networkResponse.clone();
          // Fire-and-forget: cache the response without blocking the reply
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
