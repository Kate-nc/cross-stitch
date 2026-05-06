/* import-engine/wireApp.js — Glue between the engine and the host app.
 *
 * Exposes window.ImportEngine.openImportPicker() — opens a file picker that
 * accepts all supported pattern formats, runs the import pipeline (in a Web
 * Worker if available, or on the main thread as a fallback), shows the
 * review modal, and on confirm saves the project to ProjectStorage and
 * navigates the user to the stitch tracker.
 */

(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  // Build stamp — bump this string whenever you change wireApp.js so a
  // user can verify (in the browser console) that they're running the
  // current bundle and not a stale service-worker copy. If you don't see
  // this log on page load, the SW is serving an old cache.
  var BUILD = 'wireApp v4 (2026-04-30 — modal trace + session breadcrumbs)';
  try { console.info('[ImportEngine]', BUILD); } catch (_) {}
  // Also expose it for assertion in DevTools: `window.ImportEngine.__build`.
  try {
    window.ImportEngine = window.ImportEngine || {};
    window.ImportEngine.__build = BUILD;
  } catch (_) {}

  // On every load, clear any breadcrumbs left in sessionStorage by a
  // previous import so they don't leak across pages. (Diagnostic console
  // dumps were removed; set window.__IMPORT_DEBUG = true and re-add
  // ad-hoc logging if you need to trace a regression.)
  try {
    var __traceKeys = ['__import_trace_openReview', '__import_trace_modalClose', '__import_trace_save', '__import_trace_navigate', '__import_trace_creatorBoot'];
    __traceKeys.forEach(function (k) { sessionStorage.removeItem(k); });
  } catch (_) {}

  var ACCEPT = '.oxs,.xml,.json,.pdf,image/*';

  // One-time global listener so any unhandled promise rejection coming from
  // the import pipeline (e.g. PDF strategy throwing, classifier blowing up,
  // openReview rejecting) is logged loudly instead of disappearing.
  if (!window.__importEngineRejectionHandlerInstalled && typeof window.addEventListener === 'function') {
    window.__importEngineRejectionHandlerInstalled = true;
    window.addEventListener('unhandledrejection', function (ev) {
      try {
        var r = ev && ev.reason;
        // Only react to things that look like they came from the import path
        // to avoid spamming the console for unrelated rejections.
        var msg = (r && (r.message || r.toString && r.toString())) || '';
        if (/import|pattern|pdf|oxs/i.test(msg) || (r && r.code && /IMPORT|PATTERN/i.test(r.code))) {
          console.error('[ImportEngine] Unhandled rejection in import pipeline:', r);
          if (window.Toast && typeof window.Toast.show === 'function') {
            window.Toast.show({
              message: 'Import failed: ' + msg,
              type: 'error',
              duration: 8000,
            });
          }
        }
      } catch (_) {}
    });
  }

  function openImportPicker(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = opts.accept || ACCEPT;
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      input.addEventListener('change', function () {
        var f = input.files && input.files[0];
        if (input.parentNode) input.parentNode.removeChild(input);
        if (!f) { resolve(null); return; }
        importAndReview(f, opts).then(resolve);
      });
      input.click();
    });
  }

  function importAndReview(file, opts) {
    opts = opts || {};
    var ENGINE = window.ImportEngine;
    if (!ENGINE || typeof ENGINE.importPattern !== 'function') {
      var notLoaded = 'ImportEngine not loaded';
      console.error('[import]', notLoaded);
      if (window.Toast && window.Toast.show) {
        window.Toast.show({ message: notLoaded, type: 'error', duration: 8000 });
      } else if (typeof alert === 'function') {
        alert(notLoaded);
      }
      return Promise.reject(new Error(notLoaded));
    }
    return ENGINE.importPattern(file, opts).then(function (result) {
      if (!result.ok) {
        var msg = (result.error && result.error.message) || 'Import failed.';
        console.error('[import] pipeline returned not-ok:', result);
        if (window.Toast && window.Toast.show) {
          window.Toast.show({ message: 'Import failed: ' + msg, type: 'error', duration: 10000 });
        } else if (window.toast && typeof window.toast.error === 'function') {
          window.toast.error(msg);
        } else if (typeof alert === 'function') {
          alert('Import failed: ' + msg);
        }
        return { action: 'cancel', error: result.error };
      }
      // Always show the review modal in v1 (no auto-import).
      var url = null;
      try { url = URL.createObjectURL(file); } catch (_) {}
      return ENGINE.openReview({
        project: result.project,
        raw: result.raw,
        warnings: result.warnings,
        coverage: result.confidence && result.confidence.overall,
        reviewMode: result.reviewMode,
        originalFileUrl: url,
      }).then(function (out) {
        if (url) try { URL.revokeObjectURL(url); } catch (_) {}
        if (out.action === 'confirm' && out.project) {
          return saveAndNavigate(out.project, opts);
        }
        return out;
      });
    }).catch(function (err) {
      // Final safety net: anything thrown by importPattern, openReview, or
      // saveAndNavigate that wasn't already handled lands here.
      console.error('[import] unhandled error in importAndReview:', err);
      try {
        if (window.Toast && window.Toast.show) {
          window.Toast.show({
            message: 'Import failed: ' + ((err && err.message) || err),
            type: 'error',
            duration: 10000,
          });
        } else if (typeof alert === 'function') {
          alert('Import failed: ' + ((err && err.message) || err));
        }
      } catch (_) {}
      throw err;
    });
  }

  // Returns true when `destination` (a relative URL like 'home.html') is
  // the page the user is already viewing. Used to skip a same-page
  // navigation that would otherwise present as a jarring full-page reload
  // immediately after an import succeeds.
  function isCurrentPage(destination) {
    try {
      if (!destination || typeof window === 'undefined' || !window.location) return false;
      var dest = String(destination).split('?')[0].split('#')[0].toLowerCase();
      var here = String(window.location.pathname || '').toLowerCase();
      var hereFile = here.substring(here.lastIndexOf('/') + 1) || 'home.html';
      var destFile = dest.substring(dest.lastIndexOf('/') + 1);
      if (!destFile) destFile = 'home.html';
      return hereFile === destFile;
    } catch (_) { return false; }
  }

  function showImportToast(project) {
    try {
      if (window.Toast && typeof window.Toast.show === 'function') {
        var name = (project && project.name) ? project.name : 'pattern';
        window.Toast.show({
          message: 'Imported "' + name + '".',
          type: 'success',
          duration: 5000,
        });
        return true;
      }
    } catch (_) {}
    return false;
  }

  function showImportError(err) {
    var msg = 'Could not save the imported pattern: ' + (err && err.message || err);
    try {
      if (window.Toast && typeof window.Toast.show === 'function') {
        window.Toast.show({ message: msg, type: 'error', duration: 8000 });
        return;
      }
    } catch (_) {}
    if (typeof alert === 'function') alert(msg);
  }

  function saveAndNavigate(project, opts) {
    var nav = opts.navigate !== false;
    // Default destination is the Creator/edit interface (create.html) so
    // the user lands directly on the freshly-imported pattern with the
    // full editing toolset available. The ?from=home query bypasses the
    // create.html redirect guard and matches the convention used by the
    // home page's "Edit" project tile. Callers can override with
    // opts.navigateTo (e.g. 'stitch.html' to drop straight into the
    // tracker, or 'home.html' to return to the library).
    var destination = opts.navigateTo || 'create.html?from=home';
    var storage = window.ProjectStorage;
    if (!storage || typeof storage.save !== 'function') {
      // Fall back to legacy single-project storage if available.
      // NOTE: 'auto_save' projects are excluded from listProjects(), so the
      // pattern won't appear in the library — but the tracker can still
      // load it. Surface a console warning so this failure mode is visible.
      if (typeof window.saveProjectToDB === 'function') {
        console.warn('[import] ProjectStorage unavailable — using legacy auto_save key. Pattern will not appear in the library.');
        return Promise.resolve(window.saveProjectToDB('auto_save', project)).then(function () {
          showImportToast(project);
          if (nav) window.location.href = destination;
          return { action: 'confirm', project: project };
        });
      }
      return Promise.reject(new Error('No project storage available.'));
    }
    // Use the canonical newId() (with random suffix) to avoid collisions
    // when two imports happen in the same millisecond. Only assign if the
    // project doesn't already have one (re-imports keep their identity).
    var id = project.id;
    if (!id || typeof id !== 'string' || !id.startsWith('proj_')) {
      id = (typeof storage.newId === 'function') ? storage.newId() : ('proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
    }
    project.id = id;
    var now = new Date().toISOString();
    project.updatedAt = now;
    if (!project.createdAt) project.createdAt = now;
    if (!project.v) project.v = 8;
    if (!project.name) project.name = 'Imported pattern';

    // Sanity-check the project shape BEFORE we save: the Creator boot
    // path requires both project.pattern (an array) and project.settings
    // (an object). Without these the editor silently shows the welcome
    // card after navigation, which looks like the import failed.
    var shape = {
      hasPattern: !!project.pattern,
      patternIsArray: Array.isArray(project.pattern),
      patternLen: Array.isArray(project.pattern) ? project.pattern.length : null,
      hasSettings: !!project.settings,
      settingsKeys: project.settings ? Object.keys(project.settings) : null,
      w: project.w, h: project.h, name: project.name, id: project.id,
    };
    try { sessionStorage.setItem('__import_trace_save', JSON.stringify({ at: Date.now(), shape: shape })); } catch (_) {}
    if (!Array.isArray(project.pattern) || !project.pattern.length) {
      var emptyMsg = 'The imported pattern has no cells — nothing to save. The source file may be unsupported.';
      console.error('[import] project has no pattern array; aborting save:', shape);
      showImportError({ message: emptyMsg });
      return Promise.reject(new Error(emptyMsg));
    }
    if (!project.settings || typeof project.settings !== 'object') {
      var noSettingsMsg = 'The imported pattern is missing settings (sW/sH/fabricCt). It cannot be opened.';
      console.error('[import] project has no settings; aborting save:', shape);
      showImportError({ message: noSettingsMsg });
      return Promise.reject(new Error(noSettingsMsg));
    }
    // Set the active-project pointer BEFORE the async save resolves so
    // any concurrent reload still picks up the new project. The tracker's
    // boot path reads localStorage synchronously and then awaits the
    // IndexedDB get(), so the pointer is the source of truth.
    try {
      if (typeof storage.setActiveProject === 'function') storage.setActiveProject(id);
      else localStorage.setItem('crossstitch_active_project', id);
    } catch (_) {}
    return Promise.resolve(storage.save(project)).then(function () {
      // Post-save sanity check: read the project back from IDB to confirm
      // it really is there. If listProjects/get returns nothing the user
      // would see the welcome card after navigation with no clue why —
      // surface it loudly here instead.
      var verify = (typeof storage.get === 'function')
        ? Promise.resolve(storage.get(id))
        : Promise.resolve(null);
      return verify.then(function (rt) {
        if (!rt || !rt.pattern || !rt.settings) {
          console.error('[import] read-back failed or project is malformed in IDB:', rt);
          // Don't throw — the toast warns the user and we still navigate
          // so they can see the empty editor and try again.
          try {
            if (window.Toast && typeof window.Toast.show === 'function') {
              window.Toast.show({
                message: 'Saved the pattern but it could not be read back from storage. The editor may show as empty — please try importing again.',
                type: 'warning',
                duration: 10000,
              });
            }
          } catch (_) {}
        } else {
          showImportToast(project);
        }
        // Always navigate to the destination on success. The new project is
        // recorded as the active project (above), so the destination page
        // will load it fresh on boot — including the case where the user
        // triggered the import from the destination page itself (e.g.
        // importing a PDF from inside the Creator), where a reload is
        // required to swap the running React state for the new project.
        if (nav) {
          var skipSamePage = opts.skipSamePageNav === true
            || (opts.navigateTo && isCurrentPage(opts.navigateTo) && /home\.html/i.test(opts.navigateTo));
          if (!skipSamePage) {
            try { sessionStorage.setItem('__import_trace_navigate', JSON.stringify({ at: Date.now(), destination: destination, projectId: id })); } catch (_) {}
            window.location.href = destination;
          }
        }
        return { action: 'confirm', project: project, id: id };
      });
    }).catch(function (err) {
      // Save failed — clear the active pointer so the user isn't stranded
      // pointing at a project that doesn't exist in the store.
      try { if (typeof storage.clearActiveProject === 'function') storage.clearActiveProject(); } catch (_) {}
      console.error('[import] Failed to save imported project:', err);
      showImportError(err);
      throw err;
    });
  }

  window.ImportEngine = Object.assign(window.ImportEngine || {}, {
    openImportPicker: openImportPicker,
    importAndReview: importAndReview,
    saveAndNavigate: saveAndNavigate,
    _isCurrentPage: isCurrentPage,
  });
})();
