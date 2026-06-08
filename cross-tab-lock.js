// cross-tab-lock.js
// INT-7 Phase C — cross-tab destructive-op advisory locks.
//
// ── What this is ─────────────────────────────────────────────────────────────
// A best-effort coordination layer for destructive operations that span the
// whole database (e.g. backup restore) or that wipe/replace a single project
// (e.g. Creator regenerate, reset). Before performing such an op, the
// initiating tab asks any peer tab "are you currently using this project?"
// and waits a short window for objections. If any peer is actively editing
// the targeted project, it responds with a deny so the caller can prompt
// the user before destroying the peer's working state.
//
// ── Why advisory ─────────────────────────────────────────────────────────────
// A true mutex over IndexedDB across tabs is expensive and fragile (no
// timeouts, no crash recovery without complex bookkeeping). The 250 ms
// poll-for-objections model used here is good enough for the realistic
// failure mode (two users in two tabs racing on the same project) without
// adding a stuck-lock failure mode of its own.
//
// ── Mechanism ────────────────────────────────────────────────────────────────
// All messages flow over BroadcastChannel('cs-project-lock'):
//
//   • Requester broadcasts {type:'lock-request', requestId, sourceTabId,
//     projectId, opLabel}.
//   • Any peer tab whose localStorage[crossstitch_active_project] matches
//     payload.projectId (or, when payload.projectId === '*', any non-null
//     active project) immediately broadcasts {type:'lock-deny', requestId,
//     denyingTabId, denyingActiveProject}.
//   • Requester collects denials for `timeoutMs` (default 250 ms) and
//     resolves {ok, denials}.
//
// For short-lived critical sections that must not overlap across tabs (the
// stash bridge's read-modify-write transactions on manager_state), the same
// module also exposes a lease-based mutex:
//
//   • acquire(resourceId, opLabel, options) polls a localStorage-backed lease
//     record until it can atomically write-and-verify ownership.
//   • On success it resolves {ok:true, token, release()}, where release() is
//     idempotent and clears the lease only if this tab still owns it.
//   • On timeout it resolves {ok:false, reason:'timeout', release()}. Callers
//     may warn and proceed unlocked rather than hanging forever.
//   • If localStorage/BroadcastChannel support is unavailable, acquire()
//     degrades to {ok:true, degraded:true, release()} so current behaviour is
//     preserved.
//
// Special projectId '*' is used by whole-DB ops (backup restore) — it
// matches any peer that has a project open.
//
// ── Graceful fallback ────────────────────────────────────────────────────────
// Safari < 15.4 has no BroadcastChannel. The module loads as a no-op:
// requestLock() always resolves {ok:true, denials:[]}, so destructive ops
// proceed exactly as today.
//
// ── Public surface (window.CrossTabLock) ────────────────────────────────────
//   • tabId               — per-tab identifier (UUID, reused from
//                           CrossTabCoord when available so logs line up).
//   • requestLock(projectId, opLabel, options)
//                         — Promise<{ok, denials}>. `options.timeoutMs`
//                           overrides the 250 ms default (clamped 50-2000).
//                           Use projectId === '*' for whole-DB ops.
//   • acquire(resourceId, opLabel, options)
//                         — Promise<{ok, token, release, degraded?, reason?}>.
//                           `options.timeoutMs` is clamped 50-2000 ms;
//                           `options.leaseMs` is clamped 250-10000 ms.

(function () {
  if (typeof window === 'undefined') return;
  if (window.CrossTabLock) return; // idempotent

  var CHANNEL_NAME = 'cs-project-lock';
  var ACTIVE_KEY = 'crossstitch_active_project';
  var DEFAULT_TIMEOUT_MS = 250;
  var MIN_TIMEOUT_MS = 50;
  var MAX_TIMEOUT_MS = 2000;
  var DEFAULT_LEASE_MS = 1500;
  var MIN_LEASE_MS = 250;
  var MAX_LEASE_MS = 10000;
  var POLL_MS = 30;
  var MSG_LOCK_REQUEST = 'lock-request';
  var MSG_LOCK_DENY = 'lock-deny';
  var MSG_LEASE_RELEASED = 'lease-released';
  var WILDCARD_PROJECT = '*';
  var LEASE_PREFIX = 'cs-lock:';

  function _mkTabId() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    } catch (_) {}
    return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  // Reuse CrossTabCoord's tabId when available so request/deny pairs in the
  // logs line up with the project-changed broadcasts. Falls back to its own
  // UUID when CrossTabCoord hasn't loaded (load order doesn't guarantee it).
  var TAB_ID = (window.CrossTabCoord && window.CrossTabCoord.tabId) || _mkTabId();

  var _pending = Object.create(null); // requestId → {denials, settle}
  var _reqCounter = 0;

  function _now() {
    return Date.now();
  }

  function _clampTimeout(timeoutMs) {
    var n = typeof timeoutMs === 'number' ? timeoutMs : DEFAULT_TIMEOUT_MS;
    if (n < MIN_TIMEOUT_MS) n = MIN_TIMEOUT_MS;
    if (n > MAX_TIMEOUT_MS) n = MAX_TIMEOUT_MS;
    return n;
  }

  function _clampLease(leaseMs) {
    var n = typeof leaseMs === 'number' ? leaseMs : DEFAULT_LEASE_MS;
    if (n < MIN_LEASE_MS) n = MIN_LEASE_MS;
    if (n > MAX_LEASE_MS) n = MAX_LEASE_MS;
    return n;
  }

  function _sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function _leaseKey(resourceId) {
    return LEASE_PREFIX + resourceId;
  }

  function _mkToken(resourceId) {
    return TAB_ID + ':' + resourceId + ':' + _now().toString(36) + ':' + Math.random().toString(36).slice(2, 8);
  }

  function _canUseLocalStorage() {
    try {
      if (typeof localStorage === 'undefined') return false;
      var key = LEASE_PREFIX + '__probe__';
      localStorage.setItem(key, '1');
      localStorage.removeItem(key);
      return true;
    } catch (_) {
      return false;
    }
  }

  function _readLease(resourceId) {
    try {
      var raw = localStorage.getItem(_leaseKey(resourceId));
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function _writeLease(resourceId, lease) {
    localStorage.setItem(_leaseKey(resourceId), JSON.stringify(lease));
  }

  function _clearLease(resourceId) {
    localStorage.removeItem(_leaseKey(resourceId));
  }

  function _isLeaseExpired(lease) {
    return !lease || typeof lease.expiresAt !== 'number' || lease.expiresAt <= _now();
  }

  function _noopRelease() {
    return Promise.resolve(false);
  }

  function _makeRelease(resourceId, token, canStore) {
    var released = false;
    return function release() {
      if (released) return Promise.resolve(false);
      released = true;
      if (!canStore || !resourceId || !token) return Promise.resolve(false);
      try {
        var current = _readLease(resourceId);
        if (current && current.token === token && current.ownerTabId === TAB_ID) {
          _clearLease(resourceId);
          if (channel) {
            try {
              channel.postMessage({
                type: MSG_LEASE_RELEASED,
                resourceId: resourceId,
                token: token,
                sourceTabId: TAB_ID
              });
            } catch (_) {}
          }
          return Promise.resolve(true);
        }
      } catch (_) {}
      return Promise.resolve(false);
    };
  }

  function _activeProjectId() {
    try { return localStorage.getItem(ACTIVE_KEY) || null; } catch (_) { return null; }
  }

  function _matchesActive(requestedProjectId) {
    var active = _activeProjectId();
    if (!active) return false;
    if (requestedProjectId === WILDCARD_PROJECT) return true;
    return requestedProjectId === active;
  }

  // ── Channel ────────────────────────────────────────────────────────────────
  var channel = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try { channel = new BroadcastChannel(CHANNEL_NAME); }
    catch (_) { channel = null; }
  }

  if (channel) {
    channel.onmessage = function (ev) {
      var data = ev && ev.data;
      if (!data || !data.type) return;

      // Ignore our own broadcasts — BroadcastChannel doesn't deliver them
      // to the sender, but be defensive in case that changes.
      if (data.sourceTabId === TAB_ID) return;

      if (data.type === MSG_LOCK_REQUEST) {
        if (!data.projectId || !data.requestId) return;
        if (!_matchesActive(data.projectId)) return;
        try {
          channel.postMessage({
            type: MSG_LOCK_DENY,
            requestId: data.requestId,
            denyingTabId: TAB_ID,
            denyingActiveProject: _activeProjectId(),
            sourceTabId: TAB_ID
          });
        } catch (_) {}
        return;
      }

      if (data.type === MSG_LOCK_DENY) {
        if (!data.requestId) return;
        var slot = _pending[data.requestId];
        if (!slot) return;
        slot.denials.push({
          tabId: data.denyingTabId || null,
          projectId: data.denyingActiveProject || null
        });
        return;
      }

      if (data.type === MSG_LEASE_RELEASED) {
        return;
      }
    };
  }

  function requestLock(projectId, opLabel, options) {
    if (!projectId) {
      return Promise.resolve({ ok: true, denials: [] });
    }
    var opts = options || {};
    var timeoutMs = _clampTimeout(opts.timeoutMs);

    // No channel → no peers can object → trivially OK.
    if (!channel) {
      return Promise.resolve({ ok: true, denials: [] });
    }

    var requestId = TAB_ID + ':' + (++_reqCounter) + ':' + Date.now().toString(36);
    var slot = { denials: [] };
    _pending[requestId] = slot;

    try {
      channel.postMessage({
        type: MSG_LOCK_REQUEST,
        requestId: requestId,
        sourceTabId: TAB_ID,
        projectId: projectId,
        opLabel: typeof opLabel === 'string' ? opLabel : ''
      });
    } catch (_) {
      // Broadcast failed — treat as no peers reachable.
      delete _pending[requestId];
      return Promise.resolve({ ok: true, denials: [] });
    }

    return new Promise(function (resolve) {
      setTimeout(function () {
        delete _pending[requestId];
        resolve({ ok: slot.denials.length === 0, denials: slot.denials });
      }, timeoutMs);
    });
  }

  async function acquire(resourceId, opLabel, options) {
    if (!resourceId) {
      return { ok: true, degraded: true, release: _noopRelease };
    }
    var opts = options || {};
    var timeoutMs = _clampTimeout(opts.timeoutMs);
    var leaseMs = _clampLease(opts.leaseMs);
    var canStore = _canUseLocalStorage();
    if (!canStore) {
      return { ok: true, degraded: true, release: _noopRelease };
    }

    var token = _mkToken(resourceId);
    var deadline = _now() + timeoutMs;
    while (_now() <= deadline) {
      try {
        var current = _readLease(resourceId);
        if (!current || _isLeaseExpired(current)) {
          _writeLease(resourceId, {
            resourceId: resourceId,
            token: token,
            ownerTabId: TAB_ID,
            opLabel: typeof opLabel === 'string' ? opLabel : '',
            acquiredAt: _now(),
            expiresAt: _now() + leaseMs
          });
          var verified = _readLease(resourceId);
          if (verified && verified.token === token && verified.ownerTabId === TAB_ID) {
            return {
              ok: true,
              token: token,
              resourceId: resourceId,
              release: _makeRelease(resourceId, token, true)
            };
          }
        }
      } catch (_) {
        break;
      }
      await _sleep(POLL_MS);
    }
    return {
      ok: false,
      reason: 'timeout',
      resourceId: resourceId,
      release: _makeRelease(resourceId, token, true)
    };
  }

  window.CrossTabLock = {
    tabId: TAB_ID,
    requestLock: requestLock,
    acquire: acquire,
    // Test-only: expose constants so behavioural tests can assert against
    // the same values used at runtime.
    _CHANNEL_NAME: CHANNEL_NAME,
    _WILDCARD_PROJECT: WILDCARD_PROJECT,
    _DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
    _DEFAULT_LEASE_MS: DEFAULT_LEASE_MS,
    _LEASE_PREFIX: LEASE_PREFIX
  };
})();
