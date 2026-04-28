var CACHE_NAME = 'cross-stitch-cache-v26';

var PRECACHE_URLS = [
  // HTML pages
  './home.html',
  './index.html',
  './create.html',
  './stitch.html',
  './manager.html',
  // PERF (perf-6 #9): embroidery.html/embroidery.js are opt-in experimental (default off);
  // dropped from precache — runtime stale-while-revalidate caches them on first visit.

  // PWA manifest
  './manifest.json',
  './assets/icons/app-icon.svg',

  // Shared local assets
  './styles.css',
  './constants.js',
  './dmc-data.js',
  './anchor-data.js',
  './thread-conversions.js',
  './starter-kits.js',
  './colour-utils.js',
  './helpers.js',
  './icons.js',
  './import-formats.js',
  './components.js',
  './header.js',
  './modals.js',
  './threadCalc.js',
  './project-storage.js',
  './stash-bridge.js',

  // Page-specific local scripts
  './home-screen.js',
  './home-app.js',
  './palette-swap.js',
  './user-prefs.js',
  './sw-register.js',

  // Creator app bundle (compiled from creator/ sub-components)
  './creator/bundle.js',
  './creator-main.js',
  './tracker-app.js',
  './manager-app.js',

  // Lazy-loaded local assets
  './pdf-importer.js',
  './pdf.worker.min.js',
  './backup-restore.js',
  './sync-engine.js',
  './pdf-export-worker.js',
  './assets/fonts/CrossStitchSymbols.base64.js',
  './assets/fonts/CrossStitchSymbols.ttf',

  // External CDN dependencies (exact versioned URLs from HTML)
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.9/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  './assets/fontkit.umd.min.js'
];

// Install: pre-cache all assets individually so one failure doesn't block the rest
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.all(
        PRECACHE_URLS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('SW install: failed to cache', url, err);
          });
        })
      );
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
      fetch(event.request).then(function (response) {
        // Cache the latest copy for offline use only when the response succeeded
        if (response.ok && response.type === 'basic') {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function () {
        return caches.match(event.request).then(function (cached) {
          return cached || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // CDN scripts/styles (version-pinned URLs): cache-first, network fallback.
  // Local same-origin assets: stale-while-revalidate so new deployments are
  // picked up on the next page load instead of being pinned forever to the
  // copy that was cached when CACHE_NAME was last bumped.
  var isCDN = url.hostname === 'cdnjs.cloudflare.com';
  var isLocalAsset = url.origin === self.location.origin;

  if (isCDN) {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        if (cached) return cached;
        return fetch(event.request).then(function (response) {
          if (response.ok && event.request.method === 'GET') {
            var clone = response.clone();
            var cacheWrite = caches.open(CACHE_NAME).then(function (cache) {
              return cache.put(event.request, clone);
            });
            event.waitUntil(cacheWrite);
          }
          return response;
        });
      }).catch(function () {
        return new Response('', { status: 503, statusText: 'Offline' });
      })
    );
    return;
  }

  if (isLocalAsset) {
    // Don't intercept the service worker script itself — let the browser handle
    // it normally so updates aren't masked by Cache Storage.
    if (url.pathname.endsWith('/sw.js')) return;

    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(event.request).then(function (cached) {
          var revalidationPromise = fetch(event.request).then(function (response) {
            if (response.ok && event.request.method === 'GET') {
              return cache.put(event.request, response.clone()).then(function () {
                return response;
              });
            }
            return response;
          }).catch(function () {
            return cached || new Response('', { status: 503, statusText: 'Offline' });
          });
          event.waitUntil(revalidationPromise);
          // Serve cached copy immediately if present (fast), refresh in background.
          // If not cached, wait for the network.
          return cached || revalidationPromise;
        });
      })
    );
    return;
  }

  // Everything else: network-only / passthrough
});
