// lazy-modules.js — defer situational modules until something asks for them.
//
// Why this exists
// ───────────────
// Several modules are loaded on all five entry pages but are only needed once
// the user acts: the help drawer, backup/restore, the sync engine. They are
// registered here as *stubs* — an event listener, or an object with the same
// method names — that call window.loadScript() on first use and then hand the
// call to the real module.
//
// What this actually buys, measured (Pixel 5, 4x CPU throttle, stitch.html) —
// see Part 10 of reports/mobile-freeze-large-patterns.md:
//   • Bytes and requests: deterministic, and the real reason to do this.
//   • Main-thread time: small. V8 compiles function bodies lazily and Chromium
//     parses off-thread while streaming, so a big file of function
//     declarations costs almost nothing to evaluate. Do not assume a module is
//     expensive because it is large — measure it. sync-engine.js is 185 KB and
//     evaluates in 2.5 ms; stash-bridge.js is 60 KB and costs 35 ms, because it
//     runs an IndexedDB migration at load.
//
// Rules for anything added here
// ─────────────────────────────
//   1. The stub must satisfy every *synchronous* feature test its callers make.
//      command-palette.js gates a menu entry on
//      `typeof window.BackupRestore.downloadBackup === 'function'`, so the stub
//      has to expose that name before the real file is anywhere near the page.
//   2. Anything a caller uses synchronously for its *return value* cannot be
//      proxied and needs its call site converted to load-then-call instead.
//   3. Stubs must be idempotent and must remove themselves before replaying an
//      event, or the replay re-enters the stub.
(function () {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof window.loadScript !== 'function') return; // runtime-loaders.js must load first

  var loaded = Object.create(null);

  // Load `src` once. Resolves immediately if `test()` already passes, which is
  // what makes a page that still has a static <script> tag for the module (or a
  // second stub for the same file) safe.
  function ensure(src, test) {
    if (loaded[src]) return loaded[src];
    loaded[src] = window.loadScript(src, { test: test });
    return loaded[src];
  }

  // ── help-drawer.js ──────────────────────────────────────────────────────
  // Triggers are all global: the cs:openHelp / cs:openHelpDesign /
  // cs:openShortcuts events, the "?" key, and window.HelpDrawer.open() called
  // directly by coaching.js ("Learn more") and components.js.
  var HELP_SRC = 'help-drawer.js';
  var helpTest = function () { return !!(window.HelpDrawer && window.HelpDrawer.__real); };
  var HELP_EVENTS = ['cs:openHelp', 'cs:openHelpDesign', 'cs:openShortcuts'];
  var helpListeners = [];
  var helpKeyHandler = null;

  function detachHelpStubs() {
    helpListeners.forEach(function (l) { window.removeEventListener(l.name, l.fn); });
    helpListeners.length = 0;
    if (helpKeyHandler) { document.removeEventListener('keydown', helpKeyHandler, true); helpKeyHandler = null; }
  }

  // Load the drawer, then re-fire `replay` so the real module's own listener —
  // which only exists once the file has run — receives it. The stubs are
  // detached first, otherwise the replay lands back here.
  function loadHelp(replay, detail) {
    detachHelpStubs();
    return ensure(HELP_SRC, helpTest).then(function () {
      if (replay) window.dispatchEvent(new CustomEvent(replay, { detail: detail }));
    });
  }

  HELP_EVENTS.forEach(function (name) {
    var fn = function (e) { loadHelp(name, e && e.detail); };
    helpListeners.push({ name: name, fn: fn });
    window.addEventListener(name, fn);
  });

  // "?" opens the drawer on the Shortcuts tab. The real module installs its own
  // keydown handler, so this one only ever has to service the first press; it
  // replays as cs:openShortcuts rather than re-synthesising the key event.
  // Capture phase, matching where the drawer's own handler sits.
  helpKeyHandler = function (e) {
    if (e.defaultPrevented || e.key !== '?') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    e.preventDefault();
    loadHelp('cs:openShortcuts', null);
  };
  document.addEventListener('keydown', helpKeyHandler, true);

  // coaching.js calls window.HelpDrawer.open() with no fallback, so the global
  // has to exist up front. Replaced wholesale when the real file runs.
  if (!window.HelpDrawer) {
    window.HelpDrawer = {
      open: function (opts) {
        detachHelpStubs();
        return ensure(HELP_SRC, helpTest).then(function () {
          if (window.HelpDrawer && window.HelpDrawer.__real) window.HelpDrawer.open(opts);
        });
      },
      toggle: function (opts) {
        detachHelpStubs();
        return ensure(HELP_SRC, helpTest).then(function () {
          if (window.HelpDrawer && window.HelpDrawer.__real) window.HelpDrawer.toggle(opts);
        });
      },
      // Nothing is mounted before the module loads, so these are exact.
      close: function () {},
      isOpen: function () { return false; },
      __stub: true,
    };
  }

  // ── backup-restore.js ───────────────────────────────────────────────────
  // Every consumer of the async methods (header.js, manager-app.js,
  // preferences-modal.js, command-palette.js) already treats them as
  // promise-returning, so a proxy is transparent. parseBackupText() and
  // validate() are synchronous and are NOT proxied — their two call sites are
  // converted to await window.loadBackupRestore() first.
  var BACKUP_SRC = 'backup-restore.js';
  var backupTest = function () { return !!(window.BackupRestore && !window.BackupRestore.__stub); };

  window.loadBackupRestore = function () {
    return ensure(BACKUP_SRC, backupTest).then(function () { return window.BackupRestore; });
  };

  if (!window.BackupRestore) {
    var backupAsync = ['downloadBackup', 'restore', 'restoreBackup'];
    var backupStub = { __stub: true };
    backupAsync.forEach(function (m) {
      backupStub[m] = function () {
        var args = Array.prototype.slice.call(arguments);
        return window.loadBackupRestore().then(function (real) {
          if (!real || real.__stub || typeof real[m] !== 'function') {
            throw new Error('backup-restore.js loaded but ' + m + ' is missing');
          }
          return real[m].apply(real, args);
        });
      };
    });
    window.BackupRestore = backupStub;
  }

  // ── Not here, and why ───────────────────────────────────────────────────
  // sync-engine.js, modals.js, preferences-modal.js, command-palette.js and
  // stash-bridge.js were all assessed for this list and left out. The reasons
  // are measured rather than assumed and are recorded in Part 10 of
  // reports/mobile-freeze-large-patterns.md. The short version: they are large
  // but cheap to evaluate (sync-engine.js is 185 KB and 2.5 ms), and their call
  // sites read synchronous return values during render — SyncEngine
  // .getSyncStatus() alone is called from header.js and home-screen.js while
  // painting — which a proxy cannot serve.

  // Test/diagnostic surface: which lazy modules have been pulled in so far.
  window.__lazyModulesLoaded = function () { return Object.keys(loaded); };
})();
