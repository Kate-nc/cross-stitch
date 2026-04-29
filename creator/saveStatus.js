/* creator/saveStatus.js — Auto-save state machine helper.
 * ════════════════════════════════════════════════════════════════════════
 * Implements the "Proposal 2" save model: a debounced auto-save that
 * surfaces live status to the UI ('idle' → 'pending' → 'saving' → 'saved'
 * or 'error') instead of pretending to save silently.
 *
 * The controller is intentionally a pure ES5 module so it can be unit
 * tested without React or the DOM. The Creator's auto-save effect calls
 * `controller.schedule(saveFn)` whenever a tracked field changes; the
 * controller debounces, runs the save, and pushes status updates through
 * the callbacks supplied at construction time.
 * ════════════════════════════════════════════════════════════════════════
 */
(function (root) {
  'use strict';

  /**
   * Build a save controller.
   *
   * @param {Object} callbacks
   *   - onStatus(status):   one of 'idle' | 'pending' | 'saving' | 'saved' | 'error'
   *   - onSavedAt(date):    Date when the last successful save committed (or null)
   *   - onError(err):       Error from the most recent failed save (or null)
   *   - onFirstSaveSuccess(savedProjectId): fired exactly once per controller,
   *                          after the first successful save. Use this to open
   *                          the name-prompt modal without blocking the save.
   *
   * @param {Object} [opts]
   *   - debounceMs:         delay before running a queued save (default 1000)
   *   - savedHoldMs:        how long 'saved' lingers before fading to 'idle'
   *                          (default 2500)
   *   - now:                () => Date — injectable for tests
   *   - setTimeout / clearTimeout: injectable for tests
   *
   * @returns {Object} controller with:
   *   - schedule(saveFn): mark pending and arm the debounce; saveFn must
   *                       return a Promise that resolves with the saved
   *                       project id (or any truthy value) on success.
   *   - flush():           run any pending save immediately, returns Promise
   *   - cancel():          cancel any pending debounce/fade timers
   *   - isPending():       true when a debounce timer is armed
   *   - isInFlight():      true when a save is currently running
   */
  function createSaveController(callbacks, opts) {
    callbacks = callbacks || {};
    opts = opts || {};
    var debounceMs   = typeof opts.debounceMs   === 'number' ? opts.debounceMs   : 1000;
    var savedHoldMs  = typeof opts.savedHoldMs  === 'number' ? opts.savedHoldMs  : 2500;
    var now          = opts.now          || function () { return new Date(); };
    var setT         = opts.setTimeout   || (typeof setTimeout   !== 'undefined' ? setTimeout   : null);
    var clearT       = opts.clearTimeout || (typeof clearTimeout !== 'undefined' ? clearTimeout : null);

    function noop() {}
    var onStatus           = callbacks.onStatus           || noop;
    var onSavedAt          = callbacks.onSavedAt          || noop;
    var onError            = callbacks.onError            || noop;
    var onFirstSaveSuccess = callbacks.onFirstSaveSuccess || noop;

    var debounceTimer = null;
    var fadeTimer     = null;
    var pendingSaveFn = null;
    var inFlight      = false;
    var firstSaveDone = false;

    function clearDebounce() {
      if (debounceTimer && clearT) { clearT(debounceTimer); }
      debounceTimer = null;
    }
    function clearFade() {
      if (fadeTimer && clearT) { clearT(fadeTimer); }
      fadeTimer = null;
    }

    function runNow() {
      clearDebounce();
      clearFade();
      var saveFn = pendingSaveFn;
      pendingSaveFn = null;
      if (typeof saveFn !== 'function') { return Promise.resolve(); }
      inFlight = true;
      onStatus('saving');
      var p;
      try {
        var ret = saveFn();
        p = (ret && typeof ret.then === 'function') ? ret : Promise.resolve(ret);
      } catch (err) {
        p = Promise.reject(err);
      }
      return p.then(function (result) {
        inFlight = false;
        onError(null);
        onSavedAt(now());
        onStatus('saved');
        var wasFirst = !firstSaveDone;
        firstSaveDone = true;
        if (wasFirst) {
          try { onFirstSaveSuccess(result); } catch (_) {}
        }
        // Fade 'saved' → 'idle' after the hold window so the badge doesn't
        // permanently shout success after a single edit.
        if (setT && savedHoldMs > 0) {
          fadeTimer = setT(function () {
            fadeTimer = null;
            // Only fade if no fresh edit has come in meanwhile.
            if (!debounceTimer && !inFlight) { onStatus('idle'); }
          }, savedHoldMs);
        }
        return result;
      }, function (err) {
        inFlight = false;
        onError(err || new Error('Unknown save error'));
        onStatus('error');
        // Surface to the console so devtools users can see the stack.
        if (typeof console !== 'undefined' && console.error) {
          console.error('Auto-save failed:', err);
        }
        // Don't re-throw — the controller has already reported the error
        // through the callbacks; throwing would create an unhandled
        // rejection in production.
      });
    }

    function schedule(saveFn) {
      pendingSaveFn = saveFn;
      onStatus('pending');
      // A new edit cancels any lingering 'saved' fade so we don't briefly
      // show the success state for a stale write.
      clearFade();
      clearDebounce();
      if (!setT) { return runNow(); }
      debounceTimer = setT(function () {
        debounceTimer = null;
        runNow();
      }, debounceMs);
      return null;
    }

    function flush() {
      if (!debounceTimer && !pendingSaveFn) { return Promise.resolve(); }
      return runNow();
    }

    function cancel() {
      clearDebounce();
      clearFade();
      pendingSaveFn = null;
    }

    return {
      schedule: schedule,
      flush:    flush,
      cancel:   cancel,
      isPending:  function () { return debounceTimer !== null; },
      isInFlight: function () { return inFlight; },
      hasFirstSaveCompleted: function () { return firstSaveDone; }
    };
  }

  var api = { createSaveController: createSaveController };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (root) {
    root.SaveStatus = api;
  }
}(typeof window !== 'undefined' ? window : this));
