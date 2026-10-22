/* sync-export-scheduler.js: when the automatic folder export may run.
 *
 * This is the debounce, cooldown and in-flight exclusion behind SyncEngine.triggerAutoExport, and nothing else. It does
 * not know about folders, permissions, files, events or toasts: the engine passes in `run`, which does the write and
 * owns every notification, and this decides only when `run` is called.
 *
 *   * The first save after a quiet period runs after FAST_EXPORT_DELAY, so a user who edits and closes the tab does
 *     not lose the change.
 *   * Saves inside COOLDOWN_MS of the START of the last real write wait for the end of that cooldown (never less than
 *     FAST_EXPORT_DELAY), so autosave firing on every stitch cannot produce a write every few seconds.
 *   * A save while a timer is pending joins it. A save while a write is running only marks a follow-up as queued;
 *     when the write settles, at most one follow-up is scheduled.
 *
 * `run(markWriteStarted)` is called from the timer. It returns undefined when it has nothing to do (no export is then
 * in flight and nothing is queued), or a Promise that always settles: that Promise is the in-flight window.
 * `markWriteStarted()` stamps the start of a real write; call it only when bytes are about to be written, so a refused
 * attempt does not delay the next genuine one. The stamp and the timer read the global Date and setTimeout when used,
 * so a test that replaces them is honoured. Nothing is cancelled: a pending timer fires even if the folder has since
 * been disconnected or auto-sync switched off, and `run` decides what to do then.
 *
 * Loaded as a plain <script> before sync-engine.js on every page that loads it, from sw.js's precache list, and by
 * require() in tests.
 */
(function (root) {
  var FAST_EXPORT_DELAY = 2000;
  var COOLDOWN_MS = 30000;

  function create(run) {
    var timer = null;
    // Start (not completion) of the most recent real write, and whether one is running right now. See schedule for
    // why both are needed.
    var lastStartedAt = 0;
    var inFlight = false;
    var queued = false;

    // The debounce previously leaked: the timer handle was cleared at the START of its callback, before the (async)
    // write finished, and the cooldown was measured from the last *completed* export. A save arriving mid-write
    // therefore saw no scheduled timer and a stale "last export" far in the past, so it scheduled a fresh write on the
    // 2s fast path immediately. With autosave firing on every stitch this produced a write roughly every 6 seconds -
    // a real device logged 20 exports of a 5.93 MB file in 3.5 minutes, straight into a cloud-synced folder from a
    // phone.
    //
    // Now an in-flight export blocks scheduling outright and sets a queued flag, so a burst collapses to: the current
    // write, then at most one more once the cooldown has elapsed.
    function schedule() {
      if (inFlight) { queued = true; return; }
      if (timer) return; // already scheduled - coalesce into it
      var sinceStart = Date.now() - lastStartedAt;
      var delay = (lastStartedAt === 0 || sinceStart >= COOLDOWN_MS)
        ? FAST_EXPORT_DELAY
        : Math.max(FAST_EXPORT_DELAY, COOLDOWN_MS - sinceStart);
      timer = setTimeout(fire, delay);
    }

    function markWriteStarted() { lastStartedAt = Date.now(); }

    function fire() {
      timer = null;
      var work = run(markWriteStarted);
      if (!work) return;
      inFlight = true;
      queued = false;
      work.then(settle, settle);
    }

    function settle() {
      inFlight = false;
      if (queued) {
        queued = false;
        schedule();
      }
    }

    return { schedule: schedule };
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SyncExportScheduler = api;
})(typeof window !== 'undefined' ? window : this);
