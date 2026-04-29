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

  var ACCEPT = '.oxs,.xml,.json,.pdf,image/*';

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
      return Promise.reject(new Error('ImportEngine not loaded'));
    }
    return ENGINE.importPattern(file, opts).then(function (result) {
      if (!result.ok) {
        var msg = (result.error && result.error.message) || 'Import failed.';
        if (window.toast && typeof window.toast.error === 'function') {
          window.toast.error(msg);
        } else if (typeof alert === 'function') {
          alert(msg);
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
    });
  }

  function saveAndNavigate(project, opts) {
    var nav = opts.navigate !== false;
    // Default destination is the project library at /home so the user can
    // see their freshly-imported pattern in context. Callers can override
    // with opts.navigateTo (e.g. 'stitch.html' to drop straight into the
    // tracker).
    var destination = opts.navigateTo || 'home.html';
    var storage = window.ProjectStorage;
    if (!storage || typeof storage.save !== 'function') {
      // Fall back to legacy single-project storage if available.
      // NOTE: 'auto_save' projects are excluded from listProjects(), so the
      // pattern won't appear in the library — but the tracker can still
      // load it. Surface a console warning so this failure mode is visible.
      if (typeof window.saveProjectToDB === 'function') {
        console.warn('[import] ProjectStorage unavailable — using legacy auto_save key. Pattern will not appear in the library.');
        return Promise.resolve(window.saveProjectToDB('auto_save', project)).then(function () {
          if (nav) window.location.href = 'stitch.html';
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
    // Set the active-project pointer BEFORE the async save resolves so
    // any concurrent reload still picks up the new project. The tracker's
    // boot path reads localStorage synchronously and then awaits the
    // IndexedDB get(), so the pointer is the source of truth.
    try {
      if (typeof storage.setActiveProject === 'function') storage.setActiveProject(id);
      else localStorage.setItem('crossstitch_active_project', id);
    } catch (_) {}
    return Promise.resolve(storage.save(project)).then(function () {
      if (nav) window.location.href = destination;
      return { action: 'confirm', project: project, id: id };
    }).catch(function (err) {
      // Save failed — clear the active pointer so the user isn't stranded
      // pointing at a project that doesn't exist in the store.
      try { if (typeof storage.clearActiveProject === 'function') storage.clearActiveProject(); } catch (_) {}
      console.error('[import] Failed to save imported project:', err);
      if (typeof alert === 'function') alert('Could not save the imported pattern: ' + (err && err.message || err));
      throw err;
    });
  }

  window.ImportEngine = Object.assign(window.ImportEngine || {}, {
    openImportPicker: openImportPicker,
    importAndReview: importAndReview,
    saveAndNavigate: saveAndNavigate,
  });
})();
