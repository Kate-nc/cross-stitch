// wake-lock.js  —  Screen Wake Lock wrapper
//
// Prevents mobile/tablet screens from sleeping while the user is actively
// stitching. Wraps the modern Screen Wake Lock API with full lifecycle
// management, race-condition guards, and automatic re-acquisition after a
// tab-visibility change.
//
// Architecture
// ════════════
//   WakeLockManager  — vanilla-JS class, no React dependency, fully testable
//   useWakeLock      — thin React hook (window.useWakeLock), defined only when
//                      React is available at load time
//
// Both are published as browser globals; the class is also exported via a
// CommonJS shim so the test suite can require() it directly from Node.

/* ═══════════════════════════════════════════════════════════════════════════
   WakeLockManager
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Manages a Screen Wake Lock sentinel with the following guarantees:
 *
 *  Stale-sentinel prevention
 *    The existing sentinel's reference is always cleared before a new one is
 *    stored. The onrelease handler receives the sentinel it was attached to as
 *    a closure argument and ignores the event if a newer sentinel has already
 *    taken over (see _onSentinelRelease).
 *
 *  Async race-condition prevention
 *    _pending is set synchronously at the top of _requestLock (before the
 *    first await) and cleared in the finally block. Both acquire() and
 *    _requestLock() guard on _pending || isActive, so rapid calls collapse
 *    into a single in-flight request.
 *
 *  Memory-leak prevention
 *    The sentinel listener uses { once: true } so it auto-removes on first
 *    call. The document visibilitychange listener is keyed on a stable bound
 *    method reference (_onVisibilityChange), so addEventListener and
 *    removeEventListener always operate on the same function object.
 *    destroy() removes all listeners and nulls the onStateChange callback.
 */
class WakeLockManager {
  constructor() {
    // Active WakeLockSentinel, or null when no lock is held
    this._sentinel = null;
    // True while a .request() promise is in flight — blocks double-requests
    this._pending = false;
    // Whether the consumer has asked for the lock to be held.  Drives the
    // visibility-change re-acquisition logic.
    this._userWantsLock = false;
    // Optional callback: invoked with { isActive, isSupported, error } on
    // every state change.  Set by the hook or other consumers.
    this.onStateChange = null;

    // isSupported is stable for the lifetime of the manager — check once.
    // Use != null (not 'in') because Object.defineProperty stubs in tests and
    // some browsers set navigator.wakeLock = undefined in insecure contexts.
    this._isSupported = typeof navigator !== 'undefined' && navigator.wakeLock != null;
    this._error = null;

    // Stable bound reference so add/removeEventListener match the same object
    this._onVisibilityChange = this._handleVisibilityChange.bind(this);
  }

  // ── Public read-only state ─────────────────────────────────────────────

  /** True when the browser API is available and the page is on HTTPS. */
  get isSupported() { return this._isSupported; }

  /** True when a wake lock sentinel is currently held and not released. */
  get isActive() { return this._sentinel !== null && !this._sentinel.released; }

  /** The last error thrown by the wake lock API, or null. */
  get error() { return this._error; }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Request the screen wake lock.  Safe to call even if one is already held —
   * duplicate requests are silently ignored.
   * @returns {Promise<void>}
   */
  async acquire() {
    if (!this._isSupported) {
      // Build an appropriate error and notify without touching the DOM/API
      try {
        this._error = new DOMException(
          'Screen Wake Lock API is not supported in this browser or context (requires HTTPS).',
          'NotSupportedError'
        );
      } catch (_) {
        // DOMException not available in very old environments — plain Error
        this._error = Object.assign(new Error(
          'Screen Wake Lock API is not supported in this browser or context (requires HTTPS).'
        ), { name: 'NotSupportedError' });
      }
      this._notify();
      return;
    }

    // Guard: a request is already in flight or a sentinel is active
    if (this._pending || this.isActive) return;

    this._userWantsLock = true;
    await this._requestLock();
  }

  /**
   * Release the wake lock.  Sets _userWantsLock = false so the visibility
   * listener will not attempt to re-acquire.
   * @returns {Promise<void>}
   */
  async release() {
    this._userWantsLock = false;
    this._removeVisibilityListener();

    if (this._sentinel && !this._sentinel.released) {
      try {
        await this._sentinel.release();
      } catch (_) {
        // Sentinel may already have been released by the browser — ignore
      }
    }

    // _clearSentinel is also called by the onrelease handler, but we call it
    // here too in case the sentinel never fires the event (e.g. mocks, race)
    this._clearSentinel();
    this._notify();
  }

  /**
   * Toggle: release if the lock is currently wanted/active, acquire if not.
   * @returns {Promise<void>}
   */
  async toggle() {
    if (this._userWantsLock) {
      await this.release();
    } else {
      await this.acquire();
    }
  }

  /**
   * Release the sentinel (fire-and-forget) and remove all event listeners.
   * Call this when the consuming component unmounts to prevent memory leaks.
   */
  destroy() {
    this._userWantsLock = false;
    // Null the callback FIRST so no state-change notifications fire during the
    // synchronous teardown path (release() may invoke sentinel handlers inline).
    this.onStateChange = null;
    this._removeVisibilityListener();

    // Release in the background — no need to await during cleanup
    if (this._sentinel && !this._sentinel.released) {
      this._sentinel.release().catch(() => {});
    }
    this._clearSentinel();
  }

  // ── Private ────────────────────────────────────────────────────────────

  async _requestLock() {
    // Double-guard: _pending is set synchronously before the first await, so
    // any subsequent synchronous call to acquire() or _requestLock() will see
    // _pending = true and bail out immediately.
    if (this._pending || this.isActive) return;

    this._pending = true;
    this._error = null;

    try {
      const newSentinel = await navigator.wakeLock.request('screen');

      // release() may have been called while request() was pending.
      // If the user no longer wants a lock, immediately release this sentinel
      // and exit without wiring listeners or publishing active state.
      if (!this._userWantsLock) {
        try {
          await newSentinel.release();
        } catch (_) {
          // Ignore: browser may have already released it.
        }
        this._clearSentinel();
        this._notify();
        return;
      }

      // Clear any stale sentinel reference before storing the new one
      this._clearSentinel();
      this._sentinel = newSentinel;

      // Attach release listener with { once: true } so it auto-removes and
      // cannot fire more than once.  Pass the sentinel as an argument to
      // _onSentinelRelease so stale-sentinel comparisons are exact.
      newSentinel.addEventListener(
        'release',
        () => this._onSentinelRelease(newSentinel),
        { once: true }
      );

      // Start listening for visibility changes so we can re-acquire after the
      // browser silently drops the lock (tab hidden, screen locked, etc.)
      this._addVisibilityListener();
      this._notify();

    } catch (err) {
      this._error = err;

      // For NotAllowedError (Low Power Mode, Battery Saver, denied by policy)
      // or NotSupportedError, clear the user-intent flag so the visibility
      // listener does not retry indefinitely.
      if (err.name === 'NotAllowedError' || err.name === 'NotSupportedError') {
        this._userWantsLock = false;
      }
      this._notify();

    } finally {
      this._pending = false;
    }
  }

  /**
   * Called when the browser fires the 'release' event on the sentinel.
   * The releasedSentinel argument guards against stale events: if our current
   * sentinel has already been replaced (rapid re-acquire), we ignore the old
   * event rather than incorrectly clearing the new sentinel.
   */
  _onSentinelRelease(releasedSentinel) {
    if (this._sentinel === releasedSentinel) {
      this._clearSentinel();
      this._notify();
    }
  }

  /** Null out the sentinel reference.  Never releases — callers handle that. */
  _clearSentinel() {
    this._sentinel = null;
  }

  /**
   * Re-acquire the lock when the tab becomes visible again.  The browser
   * automatically drops the sentinel when the tab is hidden, the screen is
   * locked, or the user switches away — this handler restores it.
   */
  _handleVisibilityChange() {
    if (document.visibilityState === 'visible' && this._userWantsLock) {
      // _requestLock guards internally against _pending and isActive, so
      // calling it here is always safe — the promise return is intentionally
      // not awaited (we're inside a synchronous event handler).
      this._requestLock();
    }
  }

  _addVisibilityListener() {
    // Remove first to ensure only one listener is ever registered at a time
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    document.addEventListener('visibilitychange', this._onVisibilityChange);
  }

  _removeVisibilityListener() {
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }

  _notify() {
    if (typeof this.onStateChange === 'function') {
      this.onStateChange({
        isActive: this.isActive,
        isSupported: this._isSupported,
        error: this._error,
      });
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   useWakeLock  —  React hook (requires React 18 global)
   ═══════════════════════════════════════════════════════════════════════════ */

if (typeof React !== 'undefined' && typeof window !== 'undefined') {
  /**
   * React hook that wraps WakeLockManager.
   *
   * Returns:
   *   isActive    {boolean}       A sentinel is currently held
   *   isSupported {boolean}       navigator.wakeLock exists in this browser
   *   error       {Error|null}    Last API error, or null
   *   acquire     {() => Promise} Request the wake lock
   *   release     {() => Promise} Release the wake lock
   *   toggle      {() => Promise} Acquire if inactive, release if active
   *
   * Usage:
   *   const { isActive, isSupported, toggle } = useWakeLock();
   *
   *   <button onClick={toggle}>
   *     {isActive ? 'Wake lock ON' : 'Wake lock OFF'}
   *   </button>
   */
  window.useWakeLock = function useWakeLock() {
    const { useState, useEffect, useRef, useCallback } = React;

    const [state, setState] = useState(() => ({
      isActive: false,
      isSupported: typeof navigator !== 'undefined' && navigator.wakeLock != null,
      error: null,
    }));

    const managerRef = useRef(null);

    useEffect(() => {
      const manager = new WakeLockManager();
      manager.onStateChange = setState;
      managerRef.current = manager;

      return () => {
        manager.destroy();
        managerRef.current = null;
      };
    }, []); // empty deps — one manager per component mount

    const acquire = useCallback(() => managerRef.current?.acquire(), []);
    const release = useCallback(() => managerRef.current?.release(), []);
    const toggle  = useCallback(() => managerRef.current?.toggle(),  []);

    return { ...state, acquire, release, toggle };
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Browser globals + CommonJS shim
   ═══════════════════════════════════════════════════════════════════════════ */

if (typeof window !== 'undefined') {
  window.WakeLockManager = WakeLockManager;
}

// CommonJS export so Jest can require() this file directly without eval tricks
if (typeof module !== 'undefined') {
  module.exports = { WakeLockManager };
}
