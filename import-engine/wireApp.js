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
    var storage = window.ProjectStorage;
    if (!storage || typeof storage.save !== 'function') {
      // Fall back to legacy single-project storage if available.
      if (typeof window.saveProjectToDB === 'function') {
        return Promise.resolve(window.saveProjectToDB('auto_save', project)).then(function () {
          if (nav) window.location.href = 'stitch.html';
          return { action: 'confirm', project: project };
        });
      }
      return Promise.reject(new Error('No project storage available.'));
    }
    var id = project.id || ('proj_' + Date.now());
    project.id = id;
    project.updatedAt = new Date().toISOString();
    if (!project.createdAt) project.createdAt = project.updatedAt;
    return Promise.resolve(storage.save(project)).then(function () {
      try { localStorage.setItem('crossstitch_active_project', id); } catch (_) {}
      if (nav) window.location.href = 'stitch.html';
      return { action: 'confirm', project: project };
    });
  }

  window.ImportEngine = Object.assign(window.ImportEngine || {}, {
    openImportPicker: openImportPicker,
    importAndReview: importAndReview,
    saveAndNavigate: saveAndNavigate,
  });
})();
