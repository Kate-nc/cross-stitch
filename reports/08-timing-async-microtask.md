# Report 08 — Timing, Async, and Microtask Ordering

## Summary

Comprehensive audit for Safari/WebKit-specific timing and async race conditions. **Risk Level: HIGH**.

Found **5 critical blockers** and **8+ medium/low issues** that cause silent failures on Safari due to fundamental differences in how Safari handles:
1. IndexedDB transaction auto-commit when `await` is used inside callbacks
2. Canvas rendering pipeline synchronisation
3. Animation frame scheduling
4. Image loading state checks
5. Service Worker lifecycle timing

These issues manifest as:
- Silent IDB failures (data loss, stash migration failing)
- Corrupt canvas rendering (blank pattern displays)
- Navigation timing issues

## Findings

### F-01: IDB Transaction Auto-Commit on `await` Inside Callback — BLOCKER
- **File**: [stash-bridge.js](../stash-bridge.js#L158), lines 158–186
- **Code**:
  ```javascript
  async function migrateSchemaToV2() {
    const db = await openManagerDB();  // ← await yields, Safari auto-commits transaction
    await new Promise((resolve, reject) => {
      const tx = db.transaction("manager_state", "readwrite");
      const store = tx.objectStore("manager_state");
      const req = store.get("threads");
      req.onsuccess = () => {
        // tx may already be auto-committed here on Safari
        store.put(migrated, "threads");  // WRITE FAILS SILENTLY
  ```
- **Issue**: Safari closes IDB transactions if no request is added within the same microtask tick. The `await openManagerDB()` causes Safari to auto-commit the outer transaction. The write inside `req.onsuccess` is lost.
- **Also affects**: [stash-bridge.js](../stash-bridge.js#L210) `migrateSchemaToV3()` — identical pattern.
- **Severity**: blocker — stash migrations fail silently; user stash data never upgrades to composite key format

### F-02: Promise.all() Inside IDB Transaction — HIGH
- **File**: [stash-bridge.js](../stash-bridge.js#L730), lines 730–740
- **Code**:
  ```javascript
  const [threadsData, patternsData] = await Promise.all([
    new Promise((r, j) => { const q = store.get("threads"); q.onsuccess = () => r(q.result || {}); }),
    new Promise((r, j) => { const q = store.get("patterns"); q.onsuccess = () => r(q.result || []); })
  ]);
  ```
- **Issue**: `await Promise.all()` inside a transaction scope causes Safari to auto-commit the transaction before either promise resolves. Both reads fail silently.
- **Also affects**: [stash-bridge.js](../stash-bridge.js#L783) `whatCanIStart()` — identical pattern.
- **Severity**: high — conflict detection and shopping list calculations return wrong results

### F-03: canvas getImageData() After drawImage() Without Sync Guarantee — HIGH
- **File**: [embroidery.js](../embroidery.js#L631), lines 631–633
- **Code**:
  ```javascript
  scC.getContext('2d').drawImage(tmpC, 0, 0, CW, CH, 0, 0, pw, ph);
  const scaledD = scC.getContext('2d').getImageData(0, 0, pw, ph);  // Read immediately
  ```
- **Issue**: Safari doesn't guarantee that `drawImage()` completes synchronously. `getImageData()` called immediately after may read a blank or partially-rendered canvas. On Chromium, `drawImage()` is synchronous within the same task.
- **Severity**: high — image segmentation in the embroidery tool produces blank output on Safari

### F-04: Image.src Set But onload May Not Fire on Safari — HIGH
- **File**: [embroidery.js](../embroidery.js#L901), lines 901–920
- **Code**:
  ```javascript
  var img = new Image();
  img.onload = () => { ... ctx.drawImage(img, ...); };
  img.onerror = () => { /* error handling */ };
  img.src = ev.target.result;  // data URL
  ```
- **Issue**: If the data URL is already cached or synchronously decodable, Safari may fire `onload` before `img.src` assignment completes its microtask. No check for `img.complete` before calling `ctx.drawImage(img, ...)`.
- **Also affects**: [embroidery.js](../embroidery.js#L989) — another `ctx.drawImage(img, ...)` without `img.complete` check.
- **Severity**: high — imported image renders as blank; segmentation produces no output

### F-05: Double requestAnimationFrame Chain — MEDIUM
- **File**: [home-app.js](../home-app.js#L469), lines 469–470
- **Code**:
  ```javascript
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { window.location.href = href; });
  });
  ```
- **Issue**: Double-rAF timing assumption differs between Chromium and Safari. On Safari, the inner rAF may fire sooner or later than expected. If Safari renders the page transition before navigation completes, user sees a flash.
- **Severity**: medium

### F-06: Service Worker Activation Reload Timing — MEDIUM
- **File**: [sw-register.js](../sw-register.js#L24), lines 24–32
- **Code**:
  ```javascript
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) { refreshing = true; ... window.location.reload(); }
  });
  ```
- **Issue**: `controllerchange` fires at different lifecycle points in Safari vs Chromium. Immediate reload may occur before new assets are cached (user sees old version) or the event fires multiple times.
- **Severity**: medium

### F-07: setTimeout(0) vs Microtask Queue Ordering — MEDIUM
- **File**: Multiple — [create.html](../create.html#L157), [command-palette.js](../command-palette.js#L514), [components.js](../components.js#L89), 20+ locations
- **Code**: `setTimeout(function () { inputEl.focus(); }, 0);`
- **Issue**: `setTimeout(fn, 0)` is used for micro-task yielding. On Chromium, `setTimeout(0)` fires after the microtask queue drains. On Safari, timing relative to Promise.then() callbacks may differ, causing focus management and modal timing to fire out of order.
- **Severity**: medium

### F-08: React useEffect Async Without Confirmed Cleanup — MEDIUM
- **File**: [home-app.js](../home-app.js#L454), line 454
- **Code**: Uses `cancelled` flag, but Promise resolution between unmount schedule and cleanup may race on Safari.
- **Issue**: "Can't perform a React state update on an unmounted component" warning possible on Safari. No data loss but console noise and potential subtle state inconsistencies.
- **Severity**: medium

### F-09: Web Worker Message Ordering — LOW
- **File**: [generate-worker.js](../generate-worker.js#L52), [analysis-worker.js](../analysis-worker.js#L287)
- **Code**: `postMessage({ type: 'progress', ... })` then `postMessage({ type: 'result', ... })`
- **Issue**: Messages sent without ACK/response ID matching. If the main thread receives `result` before `progress` (possible in Safari's event loop), the UI state machine transitions incorrectly.
- **Severity**: low

### F-10: Concurrent Read Transactions — LOW
- **File**: [project-storage.js](../project-storage.js#L238)
- **Code**: `await Promise.all(projectIds.map(id => this.get(id).catch(...)))`
- **Issue**: Multiple simultaneous `get(id)` calls open multiple read transactions. On Safari, concurrent transactions have different ordering guarantees. Worst case is stale data in a brief window (self-healing on next read).
- **Severity**: low

## TODO — Priority-Ordered Fix List

### CRITICAL (Fix Before Production on Safari)

1. **Remove `await` inside IDB transaction callbacks in [stash-bridge.js](../stash-bridge.js)** — Refactor `migrateSchemaToV2()` and `migrateSchemaToV3()`: prepare data outside transaction, then do single write inside. Test on Safari explicitly.

2. **Replace `Promise.all()` inside transaction with sequential reads** — `detectConflicts()` and `whatCanIStart()` in [stash-bridge.js](../stash-bridge.js): read one store, then the other, without `await` between reads.

3. **Add Canvas render-to-read sync in [embroidery.js](../embroidery.js#L631)** — After `drawImage()`, call `ctx.canvas.toDataURL()` to force rasterisation before `getImageData()`. Or use `createImageBitmap()` for off-screen rendering.

4. **Check `img.complete` before using Image in [embroidery.js](../embroidery.js#L901)** — Add: `if (!img.complete) return;` before `ctx.drawImage(img, ...)`, or use `await img.decode()`.

### HIGH (Affects UX)

5. **Replace double-requestAnimationFrame in [home-app.js](../home-app.js#L469)** — Change to: `requestAnimationFrame(() => { queueMicrotask(() => { window.location.href = href; }); })` or `setTimeout(() => { window.location.href = href; }, 16)`.

6. **Add explicit reload guard in [sw-register.js](../sw-register.js)** — Track whether a reload is in flight to prevent double-reload on Safari.

### MEDIUM (Polish)

7. **Consolidate `setTimeout(0)` usage** — Consider using `queueMicrotask()` where precision isn't needed; avoids Safari/Chromium ordering difference.

8. **Add request/response ID to [generate-worker.js](../generate-worker.js) postMessage calls** — Match pattern in [import-engine/worker.js](../import-engine/worker.js).
