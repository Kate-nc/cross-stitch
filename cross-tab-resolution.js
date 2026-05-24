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

  function showConflictModal(info) {
    if (_modalOpen) return Promise.resolve("keep");
    if (!window.ConfirmDialog || typeof window.ConfirmDialog.show !== "function") {
      // No modal infrastructure — fail safe by keeping the user's edits.
      return Promise.resolve("keep");
    }
    _modalOpen = true;
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
      return Promise.resolve("keep");
    }
    return Promise.resolve(shown).then(function (ok) {
      _modalOpen = false;
      return ok ? "reload" : "keep";
    }, function () {
      _modalOpen = false;
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
    return showConflictModal(info).then(function (decision) {
      if (decision === "reload") performReload();
      return decision;
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
      });
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
    // Exposed for tests and for the (future) preferences UI:
    _getPolicy: getPolicy,
    _POLICY_KEY: POLICY_KEY
  };

  // cross-tab-coord.js loads before this module (see HTML script order),
  // so its IIFE has already run. Wire up immediately.
  init();
})();
