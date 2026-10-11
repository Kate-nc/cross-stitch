// cross-tab-resolution.js — INT-7 Phase B-3
// ══════════════════════════════════════════════════════════════════════════
// When another browser tab/window saves the project that *this* tab
// currently has open, we surface a richer prompt than the default
// "warning" toast from cross-tab-coord.js: a modal letting the user
// either reload (drop their in-flight edits to pick up the remote save)
// or keep editing (their next save will overwrite the remote write).
//
// Three policy modes, stored under the UserPrefs key
// `crossTabConflictPolicy`:
//   "prompt" — show ConfirmDialog (default).
//   "reload" — silently reload to pick up the remote save.
//   "keep"   — do nothing; this tab's next save will overwrite.
// Under "prompt" the page may first try to merge the other tab's marks into its own
// (registerMerger); the question is only asked if it cannot.
//
// This module is also the user-facing decision engine for
// ProjectStorage.saveChecked()'s `{ ok: false, reason: 'conflict' }`
// result. Callers can `await window.CrossTabResolution.handle(info)` to
// get back `'reload'` or `'keep'` (and the module performs the reload
// for them when appropriate).
//
// Safari <15.4 / no-BroadcastChannel:
//   cross-tab-coord exposes a noop public surface, so onProjectChanged
//   simply never fires. saveChecked-driven calls into handle() still
//   work (they don't depend on BroadcastChannel).
//
// Idempotent install: safe to load twice; second load is a no-op.
// ══════════════════════════════════════════════════════════════════════════

(function () {
  "use strict";
  if (typeof window === "undefined") return;
  if (window.CrossTabResolution) return;

  var POLICY_KEY      = "crossTabConflictPolicy";
  var ACTIVE_KEY      = "crossstitch_active_project";
  var DEFAULT_POLICY  = "prompt";
  var VALID_POLICIES  = { prompt: 1, reload: 1, keep: 1 };

  // Guard against re-entrant prompts: if a modal is already open we
  // resolve subsequent broadcasts as "keep" (user is mid-decision; the
  // currently open prompt will cover the same project either way).
  var _modalOpen = false;

  function getPolicy() {
    try {
      if (window.UserPrefs && typeof window.UserPrefs.get === "function") {
        var v = window.UserPrefs.get(POLICY_KEY);
        if (v && VALID_POLICIES[v]) return v;
      }
    } catch (_) {}
    return DEFAULT_POLICY;
  }

  function activeProjectId() {
    try { return localStorage.getItem(ACTIVE_KEY) || null; }
    catch (_) { return null; }
  }

  function performReload() {
    try {
      if (window.location && typeof window.location.reload === "function") {
        window.location.reload();
      }
    } catch (_) {}
  }

  // Tell the page whether a conflict question is open, so the save badge can say the
  // changes are not saved yet instead of "saved".
  function announceConflict(open) {
    try {
      if (typeof CustomEvent === "function") {
        window.dispatchEvent(new CustomEvent("cs:conflictState", { detail: { open: open } }));
      }
    } catch (_) {}
  }

  function showConflictModal(info) {
    if (_modalOpen) return Promise.resolve("keep");
    if (!window.ConfirmDialog || typeof window.ConfirmDialog.show !== "function") {
      // No modal infrastructure — fail safe by keeping the user's edits.
      return Promise.resolve("keep");
    }
    _modalOpen = true;
    announceConflict(true);
    var shown;
    try {
      shown = window.ConfirmDialog.show({
        title: "Project changed in another tab",
        message:
          "This project was just saved in another browser tab or window. " +
          "Reload to pick up the latest version, or keep your current edits " +
          "(your next save will overwrite the remote version).",
        confirmLabel: "Reload",
        cancelLabel: "Keep my edits",
        danger: false
      });
    } catch (_) {
      _modalOpen = false;
      announceConflict(false);
      return Promise.resolve("keep");
    }
    return Promise.resolve(shown).then(function (ok) {
      _modalOpen = false;
      announceConflict(false);
      return ok ? "reload" : "keep";
    }, function () {
      _modalOpen = false;
      announceConflict(false);
      return "keep";
    });
  }

  // handle(info) — single entry point for all conflict signals.
  //   info?.projectId      — required for the broadcast path; optional
  //                          for direct saveChecked-driven calls (the
  //                          caller already knows it's the active one).
  //   info?.remoteWriteAt  — informational; not used in the decision.
  //   info?.remoteWriteTabId — informational; not used in the decision.
  //
  // Returns Promise<'reload' | 'keep'>. When the decision is 'reload',
  // this function performs the reload itself (the returned promise will
  // typically not settle observably, because the page is gone).
  function handle(info) {
    info = info || {};
    var policy = getPolicy();
    if (policy === "reload") {
      performReload();
      return Promise.resolve("reload");
    }
    if (policy === "keep") {
      return Promise.resolve("keep");
    }
    function ask() {
      return showConflictModal(info).then(function (decision) {
        if (decision === "reload") performReload();
        return decision;
      });
    }
    // No merger (the Creator, the library): ask at once, as before.
    if (!_merger) return ask();
    return tryMerge(info).then(function (merged) { return merged ? "merged" : ask(); });
  }

  // The page that owns the open project can register a merger: a function that tries to
  // combine the other tab's save with this tab's work and resolves true if it did (so
  // there is nothing to ask). It resolves false, or fails, to leave the question to the
  // user. Only the "prompt" policy merges; "reload" and "keep" are explicit choices.
  var _merger = null;
  var _merging = null;
  function registerMerger(fn) {
    _merger = typeof fn === "function" ? fn : null;
    return function () { if (_merger === fn) _merger = null; };
  }
  function tryMerge(info) {
    if (!_merger || _modalOpen) return Promise.resolve(false);
    // A second signal while a merge runs joins it rather than starting another.
    if (_merging) return _merging;
    _merging = Promise.resolve().then(function () { return _merger(info); }).then(
      function (ok) { _merging = null; return !!ok; },
      function () { _merging = null; return false; }
    );
    return _merging;
  }

  // saveWithConflictResolution(project)
  // Shared wiring for the shipped INT-7 save path:
  //   1. Prefer ProjectStorage.saveChecked() when available so stale reads are
  //      detected before the write.
  //   2. On conflict, route through handle(...) so the user's policy decides
  //      whether to reload or keep local edits.
  //   3. If the user keeps local edits, perform a plain save() to intentionally
  //      overwrite the remote version.
  // Returns Promise<{ ok, id, reason?, resolvedConflict?, decision? }>.
  function saveWithConflictResolution(project) {
    if (!window.ProjectStorage || typeof window.ProjectStorage.save !== "function") {
      return Promise.reject(new Error("ProjectStorage.save is unavailable"));
    }
    var storage = window.ProjectStorage;

    function activate(id) {
      try {
        if (id && typeof storage.setActiveProject === "function") {
          storage.setActiveProject(id);
        }
      } catch (_) {}
      return id;
    }

    function plainSave(meta) {
      return storage.save(project).then(function (id) {
        activate(id);
        return {
          ok: true,
          id: id,
          resolvedConflict: !!(meta && meta.resolvedConflict),
          decision: meta && meta.decision ? meta.decision : null
        };
      });
    }

    if (typeof storage.saveChecked !== "function") {
      return plainSave();
    }

    return storage.saveChecked(project).then(function (result) {
      if (!result || result.ok !== false) {
        var id = activate((result && result.id) || project.id || null);
        return { ok: true, id: id };
      }
      if (result.reason !== "conflict") {
        return result;
      }
      return handle({
        projectId: result.id || project.id || null,
        remoteWriteAt: result.remoteWriteAt,
        remoteWriteTabId: result.remoteWriteTabId
      }).then(function (decision) {
        if (decision === "reload") {
          return {
            ok: false,
            id: result.id || project.id || null,
            reason: "reloaded"
          };
        }
        if (decision === "merged") {
          // The page took the other tab's marks into its own state and will save the
          // combined result itself; this (older) record must not be written.
          return {
            ok: false,
            id: result.id || project.id || null,
            reason: "merged"
          };
        }
        return plainSave({ resolvedConflict: true, decision: decision });
      });
    });
  }

  function onBroadcast(payload) {
    if (!payload || !payload.projectId) return;
    var active = activeProjectId();
    if (!active || active !== payload.projectId) return;
    // Don't block; fire-and-forget. handle() owns the policy decision and
    // its own re-entrancy guard.
    try {
      handle({
        projectId: payload.projectId,
        remoteWriteAt: payload.lastWriteAt,
        remoteWriteTabId: payload.lastWriteTabId
      }).then(function (decision) {
        // "Keep my edits" answers the question for that save: note it as seen so this tab's
        // next save does not ask the same thing again (it would otherwise still look stale).
        if (decision === "keep" && window.CrossTabCoord && typeof window.CrossTabCoord.noteSeen === "function") {
          try { window.CrossTabCoord.noteSeen(payload.projectId, payload.lastWriteAt, payload.lastWriteTabId); } catch (_) {}
        }
      }, function () {});
    } catch (_) {}
  }

  function init() {
    if (!window.CrossTabCoord) return;
    // Take over the active-project notification. cross-tab-coord's default
    // warning toast steps aside so we don't double-notify.
    try { window.CrossTabCoord._suppressActiveToast = true; } catch (_) {}
    if (typeof window.CrossTabCoord.onProjectChanged === "function") {
      try { window.CrossTabCoord.onProjectChanged(onBroadcast); } catch (_) {}
    }
  }

  window.CrossTabResolution = {
    handle: handle,
    registerMerger: registerMerger,
    saveWithConflictResolution: saveWithConflictResolution,
    // Exposed for tests and for the (future) preferences UI:
    _getPolicy: getPolicy,
    _POLICY_KEY: POLICY_KEY
  };

  // cross-tab-coord.js loads before this module (see HTML script order),
  // so its IIFE has already run. Wire up immediately.
  init();
})();
