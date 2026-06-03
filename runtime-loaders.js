// Shared lazy script loaders for precompiled entry bundles and deferred data.
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  var loadPromises = window.__scriptLoadPromises || (window.__scriptLoadPromises = Object.create(null));

  function makeLoadError(src, cause) {
    if (cause instanceof Error) {
      cause.src = src;
      return cause;
    }
    var err = new Error('Failed to load ' + src);
    err.src = src;
    return err;
  }

  window.showStartupFailureBanner = function (message) {
    var id = 'startup-failure-banner';
    if (document.getElementById(id)) return;
    function render() {
      if (document.getElementById(id)) return;
      var node = document.createElement('div');
      node.id = id;
      node.setAttribute('role', 'alert');
      node.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:1.2rem 2rem;background:#c0392b;color:#fff;font-family:sans-serif;font-size:0.9rem;text-align:center;z-index:99999;';
      node.textContent = message || 'This page could not load (a required library failed to download). Please check your connection and reload.';
      if (document.body) document.body.prepend(node);
    }
    if (document.body) render();
    else document.addEventListener('DOMContentLoaded', render, { once: true });
  };

  function resolveExisting(script, src, opts) {
    if (script && script.dataset && script.dataset.loaded === 'true') return Promise.resolve();
    if (opts && typeof opts.test === 'function' && opts.test()) {
      if (script && script.dataset) script.dataset.loaded = 'true';
      return Promise.resolve();
    }
    if (loadPromises[src]) return loadPromises[src];
    loadPromises[src] = new Promise(function (resolve, reject) {
      function cleanup() {
        script.removeEventListener('load', onLoad);
        script.removeEventListener('error', onError);
      }
      function onLoad() {
        if (script.dataset) script.dataset.loaded = 'true';
        cleanup();
        resolve();
      }
      function onError(event) {
        cleanup();
        delete loadPromises[src];
        if (opts && opts.failMessage) window.showStartupFailureBanner(opts.failMessage);
        reject(makeLoadError(src, event && event.error));
      }
      script.addEventListener('load', onLoad);
      script.addEventListener('error', onError);
    });
    return loadPromises[src];
  }

  window.loadScript = function (src, opts) {
    opts = opts || {};
    if (opts.test && opts.test()) return Promise.resolve();
    if (loadPromises[src]) return loadPromises[src];

    var existing = document.querySelector('script[src="' + src + '"]');
    if (existing) return resolveExisting(existing, src, opts);

    loadPromises[src] = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = function () {
        if (script.dataset) script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = function (event) {
        if (script.parentNode) script.parentNode.removeChild(script);
        delete loadPromises[src];
        if (opts.failMessage) window.showStartupFailureBanner(opts.failMessage);
        reject(makeLoadError(src, event && event.error));
      };
      if (opts.integrity) {
        script.integrity = opts.integrity;
        script.crossOrigin = opts.crossOrigin || 'anonymous';
        script.referrerPolicy = 'no-referrer';
      }
      document.head.appendChild(script);
    });
    return loadPromises[src];
  };

  window.loadAnchorData = function (opts) {
    opts = opts || {};
    return window.loadScript('anchor-data.js', {
      test: function () { return typeof window.ANCHOR !== 'undefined'; },
      failMessage: opts.failMessage
    });
  };

  window.loadThreadConversions = function (opts) {
    opts = opts || {};
    return window.loadScript('thread-conversions.js', {
      test: function () { return typeof window.CONVERSIONS !== 'undefined' || typeof window.getOfficialMatch === 'function'; },
      failMessage: opts.failMessage
    });
  };

  window.loadThreadData = function (opts) {
    opts = opts || {};
    return Promise.all([
      window.loadAnchorData(opts),
      window.loadThreadConversions(opts),
    ]);
  };
})();