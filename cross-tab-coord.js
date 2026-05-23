// cross-tab-coord.js
// INT-7 cross-tab project coordination.
//
// ── Visibility tier (shipped earlier) ────────────────────────────────────────
// When the same project is edited in two browser tabs, the tab whose
// auto-save fires second silently overwrites the first tab's changes. The
// visibility tier surfaces a sticky toast so the user knows it is happening
// and can reload.
//
// ── Phase A (this file) ─────────────────────────────────────────────────────
// Adds the public `onProjectChanged(cb)` subscription hook that the rest of
// the INT-7 work (detection, resolution, locks, channel unification) builds
// on. Self-broadcasts are already filtered by the `sourceTabId === TAB_ID`
// guard, so no extra suppression API is needed — subscribers only ever see
// remote saves.
//
// ── Wire-up ──────────────────────────────────────────────────────────────────
//   • ProjectStorage.save() broadcasts {type:'project-saved', projectId,
//     sourceTabId, updatedAt} on BroadcastChannel('cs-project-changed').
//   • Every page that loads this file subscribes. When an incoming message
//     names the currently-active project (per localStorage) and the source
//     tab is not us, we surface a sticky warning toast pointing to a reload.
//   • Any subscriber registered via `onProjectChanged(cb)` additionally
//     receives the parsed payload for every non-self message (regardless of
//     whether it names the active project — the subscriber decides what to
//     do with it).
//
// ── Not handled here (queued under INT-7-full) ───────────────────────────────
//   • Conflict detection (compare updatedAt vs locally-seen value) — Phase B.
//   • Resolution prompt + user preference — Phase B (resolution UI).
//   • Per-store locks for destructive ops — Phase C.
//   • Cross-tab stash signalling — Phase E (see drift note in
//     reports/int-7-sync-notes.md; the existing 'cs:stashChanged' event is
//     same-window only and there is no BroadcastChannel for stash today).
//   • Safari < 15.4 storage-event fallback (BroadcastChannel undefined
//     there) — Phase D. The module stays loaded as a graceful no-op while
//     keeping its full public surface, so callers don't need to feature-
//     detect; subscribers simply never fire.
//
// ── Public surface (window.CrossTabCoord) ────────────────────────────────────
//   • tabId                 — per-tab UUID, useful for logging and lock IDs.
//   • broadcastProjectSaved — used by ProjectStorage.save() after IDB commit.
//   • onProjectChanged(cb)  — returns an unsubscribe function. Supports
//                             multiple concurrent subscribers. Callback
//                             receives the parsed message payload.

(function () {
  if (typeof window === 'undefined') return;
  if (window.CrossTabCoord) return; // idempotent

  // ── Module constants ───────────────────────────────────────────────────────
  var CHANNEL_NAME = 'cs-project-changed';
  var ACTIVE_KEY = 'crossstitch_active_project';
  var TOAST_THROTTLE_MS = 8000;
  var TOAST_DURATION_MS = 10000;
  var MSG_TYPE_PROJECT_SAVED = 'project-saved';

  // ── Tab identity ───────────────────────────────────────────────────────────
  // Per-tab UUID (cheap; doesn't need crypto strength).
  function _mkTabId() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    } catch (_) {}
    return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }
  var TAB_ID = _mkTabId();

  // ── Subscriber set ─────────────────────────────────────────────────────────
  // Multiple concurrent subscribers are supported. Each gets the parsed
  // payload for every non-self message. Errors in one subscriber must not
  // break delivery to the others.
  var _subscribers = [];

  function onProjectChanged(cb) {
    if (typeof cb !== 'function') return function () {};
    _subscribers.push(cb);
    return function unsubscribe() {
      var i = _subscribers.indexOf(cb);
      if (i !== -1) _subscribers.splice(i, 1);
    };
  }

  function _fanout(payload) {
    // Snapshot so unsubscribes during iteration don't skip a subscriber.
    var subs = _subscribers.slice();
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](payload); }
      catch (err) {
        try { console.error('[cross-tab] subscriber threw:', err); } catch (_) {}
      }
    }
  }

  // ── Channel ────────────────────────────────────────────────────────────────
  // Safari < 15.4: BroadcastChannel is undefined. We stay loaded but become
  // a graceful no-op: broadcasts drop, subscribers register normally and
  // simply never fire, the public surface stays intact. The storage-event
  // fallback for those browsers is Phase D.
  var channel = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try { channel = new BroadcastChannel(CHANNEL_NAME); }
    catch (_) { channel = null; }
  }

  function _activeProjectId() {
    try { return localStorage.getItem(ACTIVE_KEY) || null; } catch (_) { return null; }
  }

  var _toastShownAt = 0;
  function _showToast(projectId) {
    var now = Date.now();
    // Throttle: don't spam if both tabs save rapidly.
    if (now - _toastShownAt < TOAST_THROTTLE_MS) return;
    _toastShownAt = now;
    var msg = 'This project was changed in another tab. Reload to see the latest version — unsaved edits in this tab will be lost.';
    if (window.Toast && window.Toast.show) {
      window.Toast.show({ message: msg, type: 'warning', duration: TOAST_DURATION_MS });
    } else {
      try { console.warn('[cross-tab]', msg, '(project ' + projectId + ')'); } catch (_) {}
    }
  }

  if (channel) {
    channel.onmessage = function (ev) {
      var data = ev && ev.data;
      if (!data || data.type !== MSG_TYPE_PROJECT_SAVED) return;
      if (!data.projectId) return;
      // Own broadcast — never delivered to handlers or subscribers.
      if (data.sourceTabId === TAB_ID) return;

      // Subscribers see every relevant remote change. Filtering by active
      // project is the caller's responsibility — Tracker/Creator typically
      // check, but Home/Manager dashboards may want every project's signal.
      _fanout(data);

      // Default toast UX preserved: only nag if this tab is currently
      // looking at the same project. Subscribers cannot cancel the toast.
      var active = _activeProjectId();
      if (!active || active !== data.projectId) return;
      _showToast(data.projectId);
    };
  }

  function broadcastProjectSaved(projectId, updatedAt) {
    if (!channel || !projectId) return;
    try {
      channel.postMessage({
        type: MSG_TYPE_PROJECT_SAVED,
        projectId: projectId,
        sourceTabId: TAB_ID,
        updatedAt: updatedAt || Date.now()
      });
    } catch (_) {}
  }

  window.CrossTabCoord = {
    tabId: TAB_ID,
    broadcastProjectSaved: broadcastProjectSaved,
    onProjectChanged: onProjectChanged
  };
})();
