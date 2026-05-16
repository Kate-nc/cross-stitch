/**
 * @jest-environment jsdom
 *
 * Tests for WakeLockManager (wake-lock.js)
 *
 * navigator.wakeLock does not exist in jsdom, so each describe block that
 * exercises the live API installs a fresh mock via Object.defineProperty
 * before its tests run, then removes it in afterEach.
 *
 * The React hook (useWakeLock) is not tested here because @testing-library/
 * react is not a project dependency.  All important behaviour lives in
 * WakeLockManager, which the hook delegates to directly.
 */

'use strict';

const { WakeLockManager } = require('../wake-lock.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Drain the microtask queue so all pending promise continuations run. */
const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Create a mock WakeLockSentinel whose release() fires the registered
 * 'release' event handlers, mirroring real browser behaviour.
 */
function makeMockSentinel() {
  const releaseHandlers = [];

  const sentinel = {
    released: false,

    release: jest.fn().mockImplementation(async () => {
      sentinel.released = true;
      releaseHandlers.forEach(fn => fn());
    }),

    addEventListener: jest.fn().mockImplementation((type, handler) => {
      if (type === 'release') releaseHandlers.push(handler);
    }),

    removeEventListener: jest.fn(),

    /**
     * Test-only helper: simulate the browser releasing the sentinel
     * (e.g. tab hidden, screen locked) without calling .release() directly.
     * This triggers the registered 'release' handlers the same way the real
     * API would.
     */
    simulateExternalRelease() {
      sentinel.released = true;
      releaseHandlers.forEach(fn => fn());
    },
  };

  return sentinel;
}

/** Install a working navigator.wakeLock mock that resolves with `sentinel`. */
function installWakeLockApi(sentinel) {
  Object.defineProperty(navigator, 'wakeLock', {
    value: { request: jest.fn().mockResolvedValue(sentinel) },
    configurable: true,
    writable: true,
  });
}

/** Remove navigator.wakeLock to simulate an unsupported browser. */
function removeWakeLockApi() {
  Object.defineProperty(navigator, 'wakeLock', {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

/** Set document.visibilityState to a given value (jsdom doesn't set this). */
function setVisibilityState(value) {
  Object.defineProperty(document, 'visibilityState', {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  removeWakeLockApi();
  jest.clearAllMocks();
  // Reset visibilityState to the jsdom default
  setVisibilityState('visible');
});

// ---------------------------------------------------------------------------
// Supported environment — happy-path tests
// ---------------------------------------------------------------------------

describe('WakeLockManager — supported environment', () => {
  let sentinel;

  beforeEach(() => {
    sentinel = makeMockSentinel();
    installWakeLockApi(sentinel);
    setVisibilityState('visible');
  });

  // ── Feature detection ──────────────────────────────────────────────────

  it('reports isSupported:true when navigator.wakeLock is present', () => {
    const mgr = new WakeLockManager();
    expect(mgr.isSupported).toBe(true);
    expect(mgr.isActive).toBe(false);
    expect(mgr.error).toBeNull();
    mgr.destroy();
  });

  // ── Acquire ────────────────────────────────────────────────────────────

  it('acquires the lock and reports isActive:true', async () => {
    const mgr = new WakeLockManager();
    const changes = [];
    mgr.onStateChange = s => changes.push({ ...s });

    await mgr.acquire();

    expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen');
    expect(mgr.isActive).toBe(true);
    expect(mgr.error).toBeNull();
    // The final notified state must reflect the active lock
    expect(changes.at(-1)).toEqual({ isActive: true, isSupported: true, error: null });
    mgr.destroy();
  });

  it('attaches a release listener to the sentinel', async () => {
    const mgr = new WakeLockManager();
    await mgr.acquire();

    expect(sentinel.addEventListener).toHaveBeenCalledWith(
      'release',
      expect.any(Function),
      { once: true }
    );
    mgr.destroy();
  });

  // ── Double-request prevention ──────────────────────────────────────────

  it('does not call request() again when a lock is already active', async () => {
    const mgr = new WakeLockManager();
    await mgr.acquire();
    await mgr.acquire(); // second call — should be a no-op
    expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);
    mgr.destroy();
  });

  it('does not call request() again while a request is pending', async () => {
    const mgr = new WakeLockManager();

    // Start two acquires simultaneously (before either resolves)
    const p1 = mgr.acquire();
    const p2 = mgr.acquire(); // _pending is true — should be blocked
    await Promise.all([p1, p2]);

    expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);
    mgr.destroy();
  });

  // ── Release ────────────────────────────────────────────────────────────

  it('releases the lock and reports isActive:false', async () => {
    const mgr = new WakeLockManager();
    await mgr.acquire();
    await mgr.release();

    expect(sentinel.release).toHaveBeenCalledTimes(1);
    expect(mgr.isActive).toBe(false);
    mgr.destroy();
  });

  it('clears _userWantsLock on release so visibility listener will not re-acquire', async () => {
    const mgr = new WakeLockManager();
    await mgr.acquire();
    await mgr.release();
    expect(mgr._userWantsLock).toBe(false);
    mgr.destroy();
  });

  // ── Toggle ─────────────────────────────────────────────────────────────

  it('toggle acquires when inactive', async () => {
    const mgr = new WakeLockManager();
    await mgr.toggle();
    expect(mgr.isActive).toBe(true);
    mgr.destroy();
  });

  it('toggle releases when active', async () => {
    const mgr = new WakeLockManager();
    await mgr.acquire();
    await mgr.toggle();
    expect(mgr.isActive).toBe(false);
    mgr.destroy();
  });

  // ── Visibility re-acquisition ──────────────────────────────────────────

  it('re-acquires when the tab becomes visible after a browser-initiated release', async () => {
    const mgr = new WakeLockManager();
    await mgr.acquire();
    expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);

    // Simulate browser releasing sentinel (screen locked, tab hidden, etc.)
    const newSentinel = makeMockSentinel();
    navigator.wakeLock.request.mockResolvedValue(newSentinel);
    sentinel.simulateExternalRelease();

    // Tab becomes visible again
    setVisibilityState('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();

    expect(navigator.wakeLock.request).toHaveBeenCalledTimes(2);
    expect(mgr.isActive).toBe(true);
    mgr.destroy();
  });

  it('does NOT re-acquire on visibilitychange after an explicit release()', async () => {
    const mgr = new WakeLockManager();
    await mgr.acquire();
    await mgr.release(); // user explicitly released — _userWantsLock = false

    setVisibilityState('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();

    // Only the original acquire — no re-acquire
    expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);
    mgr.destroy();
  });

  it('does NOT re-acquire when visibilityState is not "visible"', async () => {
    const mgr = new WakeLockManager();
    await mgr.acquire();
    sentinel.simulateExternalRelease();

    // Suppose the tab is still hidden when the event fires
    setVisibilityState('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();

    // Still only one request (the original acquire)
    expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);
    mgr.destroy();
  });

  // ── Stale-sentinel guard ───────────────────────────────────────────────

  it('ignores a release event from an old sentinel after rapid re-acquire', async () => {
    const mgr = new WakeLockManager();
    const changes = [];
    mgr.onStateChange = s => changes.push({ ...s });

    await mgr.acquire();
    const oldSentinel = sentinel;

    // Set up a fresh sentinel for the next request
    const freshSentinel = makeMockSentinel();
    navigator.wakeLock.request.mockResolvedValue(freshSentinel);

    // Simulate: old sentinel fires release, then tab becomes visible and
    // re-acquires with freshSentinel — then oldSentinel.onrelease fires again
    oldSentinel.simulateExternalRelease(); // clears _sentinel

    setVisibilityState('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks(); // _requestLock resolves with freshSentinel

    // Now the manager holds freshSentinel.  Replay the old sentinel's release
    // event (shouldn't clear the new sentinel)
    const isActiveBefore = mgr.isActive;
    // Manually invoke with the OLD sentinel — should be ignored
    mgr._onSentinelRelease(oldSentinel);

    expect(mgr.isActive).toBe(isActiveBefore); // unchanged — stale event ignored
    mgr.destroy();
  });

  // ── Destroy / cleanup ──────────────────────────────────────────────────

  it('destroy() removes the visibilitychange listener', async () => {
    const removeSpy = jest.spyOn(document, 'removeEventListener');
    const mgr = new WakeLockManager();
    await mgr.acquire();

    mgr.destroy();

    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('destroy() releases an active sentinel in the background', async () => {
    const mgr = new WakeLockManager();
    await mgr.acquire();
    mgr.destroy();
    await flushMicrotasks();

    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it('destroy() nulls onStateChange so no callbacks fire after unmount', async () => {
    const mgr = new WakeLockManager();
    let callCount = 0;
    mgr.onStateChange = () => { callCount++; };

    await mgr.acquire();
    callCount = 0; // reset after acquire notification

    mgr.destroy();
    await flushMicrotasks();

    // Nothing fired after destroy()
    expect(callCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Unsupported environment
// ---------------------------------------------------------------------------

describe('WakeLockManager — unsupported browser (no navigator.wakeLock)', () => {
  beforeEach(() => removeWakeLockApi());

  it('reports isSupported:false', () => {
    const mgr = new WakeLockManager();
    expect(mgr.isSupported).toBe(false);
    mgr.destroy();
  });

  it('sets a NotSupportedError and fires onStateChange when acquire() is called', async () => {
    const mgr = new WakeLockManager();
    const changes = [];
    mgr.onStateChange = s => changes.push({ ...s });

    await mgr.acquire();

    expect(mgr.isActive).toBe(false);
    expect(mgr.error).not.toBeNull();
    expect(mgr.error.name).toBe('NotSupportedError');
    expect(changes).toHaveLength(1);
    expect(changes[0].isActive).toBe(false);
    expect(changes[0].isSupported).toBe(false);
    mgr.destroy();
  });

  it('release() is a safe no-op when unsupported', async () => {
    const mgr = new WakeLockManager();
    await expect(mgr.release()).resolves.toBeUndefined();
    mgr.destroy();
  });
});

// ---------------------------------------------------------------------------
// NotAllowedError  (Low Power Mode / Battery Saver / policy denial)
// ---------------------------------------------------------------------------

describe('WakeLockManager — NotAllowedError (e.g. Low Power Mode)', () => {
  let notAllowedError;

  beforeEach(() => {
    notAllowedError = new DOMException('The wake lock request was denied.', 'NotAllowedError');
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: jest.fn().mockRejectedValue(notAllowedError) },
      configurable: true,
      writable: true,
    });
  });

  it('stores the NotAllowedError and reports isActive:false', async () => {
    const mgr = new WakeLockManager();
    await mgr.acquire();

    expect(mgr.isActive).toBe(false);
    expect(mgr.error).toBe(notAllowedError);
    expect(mgr.error.name).toBe('NotAllowedError');
    mgr.destroy();
  });

  it('clears _userWantsLock after NotAllowedError so re-acquire loop is broken', async () => {
    const mgr = new WakeLockManager();
    await mgr.acquire();

    expect(mgr._userWantsLock).toBe(false);
    mgr.destroy();
  });

  it('does NOT retry on visibilitychange after NotAllowedError', async () => {
    const mgr = new WakeLockManager();
    await mgr.acquire(); // fails — _userWantsLock cleared

    setVisibilityState('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();

    // request() was called exactly once — no retry loop
    expect(navigator.wakeLock.request).toHaveBeenCalledTimes(1);
    mgr.destroy();
  });

  it('fires onStateChange with the error even when the request is denied', async () => {
    const mgr = new WakeLockManager();
    const changes = [];
    mgr.onStateChange = s => changes.push({ ...s });

    await mgr.acquire();

    expect(changes).toHaveLength(1);
    expect(changes[0].error).toBe(notAllowedError);
    expect(changes[0].isActive).toBe(false);
    mgr.destroy();
  });
});

// ---------------------------------------------------------------------------
// State change notifications
// ---------------------------------------------------------------------------

describe('WakeLockManager — onStateChange callback', () => {
  let sentinel;

  beforeEach(() => {
    sentinel = makeMockSentinel();
    installWakeLockApi(sentinel);
    setVisibilityState('visible');
  });

  it('notifies with isActive:true after a successful acquire', async () => {
    const mgr = new WakeLockManager();
    const states = [];
    mgr.onStateChange = s => states.push({ ...s });

    await mgr.acquire();

    expect(states.at(-1)).toMatchObject({ isActive: true, isSupported: true, error: null });
    mgr.destroy();
  });

  it('notifies with isActive:false after release()', async () => {
    const mgr = new WakeLockManager();
    const states = [];
    mgr.onStateChange = s => states.push({ ...s });

    await mgr.acquire();
    await mgr.release();

    expect(states.at(-1)).toMatchObject({ isActive: false, isSupported: true, error: null });
    mgr.destroy();
  });

  it('notifies with isActive:false when the browser releases the sentinel', async () => {
    const mgr = new WakeLockManager();
    const states = [];
    mgr.onStateChange = s => states.push({ ...s });

    await mgr.acquire();
    sentinel.simulateExternalRelease();

    expect(states.at(-1)).toMatchObject({ isActive: false, isSupported: true, error: null });
    mgr.destroy();
  });
});
