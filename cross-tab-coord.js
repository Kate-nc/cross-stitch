// cross-tab-coord.js
// INT-7 minimal visibility layer — see docs/_archive (or wiki) for the full plan.
//
// Purpose: when the same project is edited in two browser tabs, the tab whose
// auto-save fires second silently overwrites the first tab's changes. Until a
// proper merge/lock layer exists, we at least *tell* the user it is happening
// so they can act (reload to pick up the other tab's state, or close the
// extra tab).
//
// Wire-up:
//   • ProjectStorage.save() broadcasts {type:'project-saved', projectId,
//     sourceTabId, updatedAt} on BroadcastChannel('cs-project-changed').
//   • Every page that loads this file subscribes. When an incoming message
//     names the currently-active project (per localStorage) and the source
//     tab is not us, we surface a sticky info toast pointing to a reload.
//
// Not handled here (queued under INT-7-full):
//   • Conflict detection (compare updatedAt vs locally-seen value).
//   • Automatic merge of independent edits.
//   • Per-store locks (CrossStitchDB.projects vs stash_manager_db.patterns).
//   • Safari <15.4 storage-event fallback (BroadcastChannel undefined there).
//
// Public surface: this file is fire-and-forget. It exposes
// `window.CrossTabCoord.tabId` for debugging and
// `window.CrossTabCoord.broadcastProjectSaved(projectId, updatedAt)` for
// ProjectStorage.save() wire-up.

(function () {
  if (typeof window === 'undefined') return;
  if (window.CrossTabCoord) return; // idempotent

  var CHANNEL_NAME = 'cs-project-changed';
  var ACTIVE_KEY = 'crossstitch_active_project';

  // Per-tab UUID (cheap; doesn't need crypto strength).
  function _mkTabId() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    } catch (_) {}
    return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }
  var TAB_ID = _mkTabId();

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
    if (now - _toastShownAt < 8000) return;
    _toastShownAt = now;
    var msg = 'This project was changed in another tab. Reload to see the latest version — unsaved edits in this tab will be lost.';
    if (window.Toast && window.Toast.show) {
      window.Toast.show({ message: msg, type: 'warning', duration: 10000 });
    } else {
      try { console.warn('[cross-tab]', msg, '(project ' + projectId + ')'); } catch (_) {}
    }
  }

  if (channel) {
    channel.onmessage = function (ev) {
      var data = ev && ev.data;
      if (!data || data.type !== 'project-saved') return;
      if (!data.projectId) return;
      if (data.sourceTabId === TAB_ID) return; // own broadcast
      // Only nag if this tab is currently looking at the same project.
      var active = _activeProjectId();
      if (!active || active !== data.projectId) return;
      _showToast(data.projectId);
    };
  }

  function broadcastProjectSaved(projectId, updatedAt) {
    if (!channel || !projectId) return;
    try {
      channel.postMessage({
        type: 'project-saved',
        projectId: projectId,
        sourceTabId: TAB_ID,
        updatedAt: updatedAt || Date.now()
      });
    } catch (_) {}
  }

  window.CrossTabCoord = {
    tabId: TAB_ID,
    broadcastProjectSaved: broadcastProjectSaved
  };
})();
