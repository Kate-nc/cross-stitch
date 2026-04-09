var CACHE_NAME = 'cross-stitch-cache-v1';

var PRECACHE_URLS = [
  // HTML pages
  './index.html',
  './stitch.html',
  './manager.html',
  './embroidery.html',

  // Shared local assets
  './styles.css',
  './constants.js',
  './dmc-data.js',
  './colour-utils.js',
  './helpers.js',
  './import-formats.js',
  './components.js',
  './header.js',
  './modals.js',
  './threadCalc.js',
  './project-storage.js',
  './stash-bridge.js',

  // Page-specific local scripts
  './home-screen.js',
  './palette-swap.js',
  './tracker-app.js',
  './manager-app.js',
  './embroidery.js',

  // Lazy-loaded local assets
  './pdf-importer.js',
  './pdf.worker.min.js',

  // External CDN dependencies (exact versioned URLs from HTML)
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.9/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
];

// Install: pre-cache all assets
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      try {
        return cache.addAll(PRECACHE_URLS);
      } catch (err) {
        console.error('SW install: cache.addAll() threw synchronously:', err);
        return Promise.reject(err);
      }
    }).catch(function (err) {
      console.error('SW install: failed to pre-cache. Check URLs below.');
      // Log each URL so the failing one can be identified
      PRECACHE_URLS.forEach(function (url) { console.log('  -', url); });
      throw err;
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// Activate: clean up old caches
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) { return caches.delete(name); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Fetch: strategy varies by request type
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  // Only handle http/https requests
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Navigation requests (HTML pages): network-first, cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function () {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Local assets and CDN scripts/styles: cache-first, network fallback
  var isCDN = url.hostname === 'cdnjs.cloudflare.com';
  var isLocalAsset = url.origin === self.location.origin;

  if (isCDN || isLocalAsset) {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        return cached || fetch(event.request).then(function (response) {
          // Cache successful responses for future offline use
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else: network-only / passthrough
});
