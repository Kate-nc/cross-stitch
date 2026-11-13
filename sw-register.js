// ════════════════════════════════════════════════════════════════════
// sw-register.js — registers the offline service worker and handles updates.
//
// A new build downloads in the background and then waits until every
// stitchx tab has closed, so no tab ever runs files from two builds.
// Nothing here switches to it on its own. The person can choose to switch
// straight away (Preferences > Advanced > App updates, or the "new version
// is ready" notice): window.AppUpdate.apply() tells the waiting build to
// take over and reloads this tab. Other open tabs are switched over too, so
// they are asked to reload rather than keep running the old files.
//
// window.AppUpdate = { getState, check, apply, subscribe }
//   state.status: 'unsupported' | 'checking' | 'downloading' | 'ready'
//                 | 'current' | 'failed' | 'applying'
// ════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  var ACTIVATE_MESSAGE = 'stitchx:activate-update';
  var ANNOUNCED_KEY = 'stitchx_update_announced';
  // Set by apply() and kept across its reload, so this tab still knows the
  // switch was its own if the fallback reload beats the activation.
  var APPLYING_KEY = 'stitchx_update_applying';
  var APPLYING_MS = 2 * 60 * 1000;
  var supported = 'serviceWorker' in navigator;
  var registration = null;
  var applying = false;
  var reloading = false;
  var announced = null;
  var listeners = [];
  var state = { status: supported ? 'checking' : 'unsupported', error: null };
  var resolveRegistered;
  var registered = new Promise(function (resolve) { resolveRegistered = resolve; });

  function set(status, error) {
    state = { status: status, error: error || null };
    listeners.slice().forEach(function (fn) { try { fn(state); } catch (_) {} });
  }
  // Applying and a failed check are sticky until something new happens;
  // otherwise the registration says where things stand.
  function refresh() {
    if (!registration || applying) return;
    if (registration.waiting) set('ready');
    else if (registration.installing) set('downloading');
    else if (state.status !== 'failed') set('current');
  }

  function reload() {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  }

  function session(key, value) {
    try {
      if (value === undefined) return sessionStorage.getItem(key);
      if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value);
    } catch (_) {}
    return null;
  }
  function appliedHere() {
    var at = Number(session(APPLYING_KEY));
    return at > 0 && Date.now() - at < APPLYING_MS;
  }

  function toast(opts) {
    try { if (window.Toast && typeof window.Toast.show === 'function') window.Toast.show(opts); } catch (_) {}
  }

  // Offer the waiting build once per tab (sessionStorage survives moving
  // between pages), and again whenever another build finishes downloading.
  function announce(fresh) {
    var waiting = registration && registration.waiting;
    if (!waiting || waiting === announced || applying || !navigator.serviceWorker.controller) return;
    announced = waiting;
    if (!fresh && session(ANNOUNCED_KEY)) return;
    session(ANNOUNCED_KEY, '1');
    toast({
      message: 'A new version of stitchx is ready.',
      type: 'info',
      duration: 12000,
      actions: [{ label: 'Update now', onClick: function () { apply(); } }]
    });
  }

  function watchInstalling(reg) {
    var worker = reg.installing;
    if (!worker) return;
    refresh();
    worker.addEventListener('statechange', function () {
      refresh();
      if (worker.state === 'installed') announce(true);
    });
  }

  function settled(worker) {
    return new Promise(function (resolve) {
      function done() {
        if (worker.state === 'installing') return;
        worker.removeEventListener('statechange', done);
        resolve(worker.state);
      }
      worker.addEventListener('statechange', done);
      done();
    });
  }

  // Ask the server for a newer build and wait until it has downloaded and
  // been checked (or failed). Resolves with the new state.
  function check() {
    if (!supported) return Promise.resolve(state);
    return registered.then(function (reg) {
      if (!reg) { set('failed', 'stitchx could not set up its offline copy in this browser.'); return state; }
      if (applying) return state;
      if (reg.waiting) { set('ready'); return state; }
      if (reg.installing) set('downloading'); else set('checking');
      return reg.update().then(function () {
        var worker = reg.installing;
        if (!worker) { set('current'); refresh(); return state; }
        set('downloading');
        return settled(worker).then(function (end) {
          if (end === 'redundant' && !reg.waiting) {
            set('failed', 'The new version could not be downloaded. Check your connection and try again.');
          } else {
            set('current');
            refresh();
          }
          return state;
        });
      }, function () {
        set('failed', navigator.onLine === false
          ? 'You are offline. Connect to the internet to check for a new version.'
          : 'Could not reach stitchx to check for a new version. Try again in a moment.');
        return state;
      });
    });
  }

  // Switch to the waiting build now and reload this tab. Resolves false if
  // there is nothing waiting.
  function apply() {
    if (!supported) return Promise.resolve(false);
    return registered.then(function (reg) {
      var waiting = reg && reg.waiting;
      if (!waiting) { refresh(); return false; }
      applying = true;
      session(APPLYING_KEY, String(Date.now()));
      set('applying');
      waiting.addEventListener('statechange', function () {
        if (waiting.state === 'activated' || waiting.state === 'redundant') { session(APPLYING_KEY, null); reload(); }
      });
      // A page the old build never controlled gets no controllerchange; the
      // statechange above covers it. This is the last resort, and keeps the
      // marker so the reloaded page still treats the switch as its own.
      setTimeout(reload, 15000);
      waiting.postMessage({ type: ACTIVATE_MESSAGE });
      return true;
    });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  window.AppUpdate = {
    getState: function () { return state; },
    check: check,
    apply: apply,
    subscribe: subscribe
  };

  if (!supported) return;

  // Another tab chose Update now: this tab's files are the old build but its
  // requests are now answered by the new one, so it should reload soon.
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (applying || appliedHere()) { session(APPLYING_KEY, null); reload(); return; }
    toast({
      message: 'stitchx was updated in another tab. Reload this tab to carry on with the new version.',
      type: 'warning',
      duration: 0,
      actions: [{ label: 'Reload', onClick: reload }]
    });
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(function (reg) {
        console.log('SW registered, scope:', reg.scope);
        registration = reg;
        resolveRegistered(reg);
        // Forget a stale marker from an update this tab gave up on.
        if (!appliedHere()) session(APPLYING_KEY, null);
        reg.addEventListener('updatefound', function () { watchInstalling(reg); });
        watchInstalling(reg);
        refresh();
        announce(false);
        // Look for a new build every 10 minutes. It downloads in the
        // background and waits; only the person can switch to it early.
        setInterval(function () { reg.update().catch(function () {}); }, 10 * 60 * 1000);
      })
      .catch(function (err) {
        console.error('SW registration failed:', err);
        resolveRegistered(null);
      });
  });
})();
