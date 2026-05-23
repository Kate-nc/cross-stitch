# 02 — Cleanup

> Phase 2, area 2. Covers the **two distinct features both called "cleanup"**
> (already flagged in [00-system-map.md §6](00-system-map.md#6-naming-collision-cleanup-means-two-things)):
>
> 1. **Manual cleanup overlay** — [creator/useCleanupMode.js](../../creator/useCleanupMode.js), gated by `cleanupOpen` over `appMode === "edit"`.
> 2. **Auto stitch-cleanup pipeline step** — the `stitchCleanup` settings object passed into `runGenerationPipeline`.
>
> The two share no implementation.

---

## 1. Surface scope

| Code | Role |
|---|---|
| [creator/useCleanupMode.js](../../creator/useCleanupMode.js) | The manual hook. Owns target colour, tolerance, click/brush/auto sub-tools, mask, apply (neighbour vote). |
| [cleanup-worker.js](../../cleanup-worker.js) | Web Worker for auto-detect (manual mode's auto sub-tool). |
| [creator/useCreatorState.js:372-381](../../creator/useCreatorState.js#L372-L381) | Owns the `stitchCleanup` settings (`enabled`, `strength`, `protectDetails`, `smoothDithering`) for the auto pipeline. |
| [generate-worker.js](../../generate-worker.js) | Consumes `stitchCleanup` settings during generation. |
| [creator/generate.js](../../creator/generate.js) | Main-thread fallback that mirrors the worker logic. |
| Cleanup sidebar panel (creator-main.js / Sidebar.js) | Controls for both sets of settings. |

Tests: [tests/cleanupMode.test.js](../../tests/cleanupMode.test.js),
[tests/cleanupApply.test.js](../../tests/cleanupApply.test.js) (and similar
neighbourhood vote / mask tests under tests/).

---

## 2. Wiring correctness — manual mode

### 2.1 Hook lifecycle

[useCleanupMode.js:55](../../creator/useCleanupMode.js#L55) signature:
`useCleanupMode(state, history)` returns
`{ handlers, applyCleanup, cancelCleanup, runAutoDetect, enterCleanup, exitCleanup, ... }`.
The hook is called unconditionally from
[creator-main.js:275](../../creator-main.js#L275) inside CreatorApp. Returned
`handlers` are stored in `state.cleanupHandlersRef` for use by canvas
pointer handlers without prop-drilling.

`enterCleanup` ([useCleanupMode.js:96](../../creator/useCleanupMode.js#L96)),
`exitCleanup` ([:113](../../creator/useCleanupMode.js#L113)), and
`cancelCleanup` ([:121](../../creator/useCleanupMode.js#L121)) all terminate
and null `workerRef.current`. **Correct.**

### 2.2 Worker lifecycle

`runAutoDetect` ([:212](../../creator/useCleanupMode.js#L212)) terminates
any previous worker before starting a new one, wraps `releaseWorker` to
null the ref only if it still points at the same worker (guard against
out-of-order replies). Two error paths: `worker.onerror` and a
`worker.postMessage` `try/catch`. Both release the worker. **Correct.**

**CL-1 — No unmount cleanup.** The component-unmount path (if Creator is
mounted/unmounted via UnifiedApp on index.html) does not terminate
`workerRef.current`. `enterCleanup`/`exitCleanup`/`cancelCleanup` are
explicit user actions, not effect cleanups. Mirrors C-2 in the create
report.

### 2.3 Auto-effect re-trigger logic

Two effects drive auto-detect:

* [useCleanupMode.js:290-298](../../creator/useCleanupMode.js#L290-L298)
  — Re-run when tolerance changes while in auto sub-tool with an existing
  result.
* [useCleanupMode.js:303-308](../../creator/useCleanupMode.js#L303-L308)
  — Auto-run on first switch into auto sub-tool.

The two effects do not have overlapping dependency arrays in a way that
would cause infinite loops, and both early-return if a worker is already
running. **Correct.**

---

## 3. State correctness — manual mode

### 3.1 Atomic apply

`applyCleanup` ([useCleanupMode.js:410-466](../../creator/useCleanupMode.js#L410-L466))
takes a `prePat = pat.slice()` snapshot, computes all replacements from
that snapshot, then writes them all to `np = pat.slice()`. Order-of-write
cannot affect another cell's vote. **Correct — true atomicity.**

### 3.2 Palette rebuild preserves zero-count entries

After `setPat(np)`, `applyCleanup` calls `buildPaletteWithScratch(np)` to
get the new palette, then explicitly re-adds any palette entries that:
a) appeared in the pre-apply palette,
b) belonged to a cell that was changed,
c) are absent from the rebuilt palette.

These are re-added with `count: 0`. The user sees them as greyed-out
chips. **Correct** — matches the spec described in the source comments.

### 3.3 Undo / redo invariants

A single apply pushes **one** `{type: 'cleanup', changes}` entry into
`editHistory`. The "remove unused colours" toast triggered by the same
apply pushes a **separate** entry of type `remove_unused_colours`.

**CL-2 — Compound undo asymmetry.** A user who runs cleanup, then clicks
"Remove" on the unused-colours toast, must press Undo twice to fully
revert. Reverse order is fine if the user wants to keep the zeroed
colour-chips visible. This is consistent with how most apps treat toast
actions (toast actions are their own undoable step), but worth flagging
as a UX gotcha. Not a bug in itself; classify [question]. See §6 CL-2.

### 3.4 Replacement-search correctness

`_neighbourVote` ([:308](../../creator/useCleanupMode.js#L308)) returns
`prePat[idx]` (i.e. keeps the existing colour) when *all* 8 neighbours
are also selected. This means selecting an entire connected blob is a
no-op. **Documented behaviour.**

`_findEntry` ([:392](../../creator/useCleanupMode.js#L392)) returns
`null` if the winning id doesn't appear anywhere in `prePat`. Since vote
candidates come from `prePat` itself, this can only return null on
programmer error. The `applyCleanup` loop skips changes whose
`replacement` is `null` ([:438](../../creator/useCleanupMode.js#L438)).
Defensive but the early-return is sound.

---

## 4. Per-feature behaviour and edge cases (manual mode)

### 4.1 Target-colour default

`enterCleanup` picks the **darkest** palette colour as the default
target (via `darkestPaletteId`, scans Lab L\*). If the user previously
picked a different colour and it's still in the palette, that choice is
preserved. **Correct.**

Edge case: a project with **no** palette entries (immediately after
`resetAll`, before generation) — the panel won't open because cleanup
mode requires `pat`/`pal`. Verified by reading the `enterCleanup` early-
return on `!pal.length`. **Safe.**

### 4.2 Click sub-tool

[useCleanupMode.js:133-152](../../creator/useCleanupMode.js#L133-L152).
Toggles a single cell on every click. Skips `__skip__` / `__empty__`.
Skips cells outside the tolerance threshold of the target colour.

Edge case: clicking the same cell twice toggles off (line 149). Correct.

### 4.3 Brush sub-tool

Uses `brushMaskRef` (mutable, not React state) updated at pointer-move
frequency. Sets React state via `setCleanupPendingMask(mask.slice())` on
every move, so overlay rendering is live.

**CL-3 — Brush sets mask every pointermove.** `setCleanupPendingMask(mask.slice())`
allocates a new `Uint8Array` of size `sW × sH` on every pointermove. For a
200×200 pattern at 60 fps that is 40 000 bytes × 60 = 2.4 MB/s of
allocation pressure. Acceptable on desktop; could induce GC pauses on
mobile. [needs-approval] — could be throttled to e.g. every 4th frame or
via `requestAnimationFrame` coalescing.

Edge case: brush size 1 acts like a click without the toggle (paint-only).
Verified — `_brushPaint` only sets `mask[idx] = 1`, never clears. There is
**no erase-brush sub-tool**. [question] — intended?

### 4.4 Auto sub-tool (Web Worker)

[useCleanupMode.js:212-285](../../creator/useCleanupMode.js#L212-L285)
serialises a slim per-cell `{id, lab}` array (avoiding rgb/symbol/threads
overhead) and posts to `cleanup-worker.js`. The worker returns a 0/1
selection array which is converted to `Uint8Array` and stored as the
pending mask.

**CL-4 — Slim-pat re-allocation on every auto-detect run.** Lines 240-243
allocate a fresh `Array(sW × sH)` and 16-byte object per cell on every
tolerance-change re-run. For a 200×200 pattern: 40 000 plain objects
allocated every time the slider moves. The earlier debounce-on-tolerance
effect (line 290) does mitigate this somewhat (only runs after worker
returns), but worth noting. [question] — could be batched if it shows up
on profiles.

Edge case: switching away from auto sub-tool while the worker is mid-
flight does **not** terminate the worker. Its result will still arrive
and clobber `cleanupPendingMask`, which the other sub-tools then operate
on. See CL-5.

### 4.5 Apply (replace)

Behaviour summarised in §3.1-3.3. See [tests/cleanupApply.test.js](../../tests/cleanupApply.test.js)
for the spec-level coverage. The test suite exercises atomicity, tie-
breaks, and palette rebuild.

### 4.6 Cancel / exit

`cancelCleanup` clears the mask but stays in cleanup mode. `exitCleanup`
clears the mask **and** flips `activeTool` away. Neither pushes anything
to `editHistory`. **Correct** — a discarded selection should not be
undoable.

### 4.7 Cleanup diff overlay (separate feature)

`showCleanupDiff` ([useCreatorState.js:383](../../creator/useCreatorState.js#L383))
+ `cleanupDiff` are computed by `applyResultRef` after every successful
generation to highlight which cells the **auto** stitchCleanup pipeline
modified. Toggle lives in [creator-main.js:1064](../../creator-main.js#L1064).
This overlay is unrelated to the manual mask overlay and uses a different
draw pass in the canvas renderer.

---

## 5. Wiring correctness — auto pipeline (`stitchCleanup`)

### 5.1 Settings shape and persistence

```js
stitchCleanup = {
  enabled:         loadUserPref("creatorStitchCleanup", true) !== false,
  strength:        "balanced",         // "gentle" | "balanced" | "thorough"
  protectDetails:  loadUserPref("creatorProtectDetails", true) !== false,
  smoothDithering: loadUserPref("creatorSmoothDithering", true) !== false
};
```

Persisted: `creatorStitchCleanup`, `creatorProtectDetails`,
`creatorSmoothDithering` user prefs (localStorage). `strength` is
**not** persisted — resets to "balanced" on every reload. See CL-6.

### 5.2 Settings → worker

[useProjectIO.js:233-234](../../creator/useProjectIO.js#L233-L234) and
[creator/bundle.js:7583](../../creator/bundle.js#L7583) build the
settings bundle for the worker. The default-fallback chain
(`s.stitchCleanup.strength || "balanced"`) is correct.

In the worker ([generate-worker.js:142-154](../../generate-worker.js#L142-L154)):

```js
var cleanupEnabled = !!(stitchCleanup && stitchCleanup.enabled);
// later …
var strengthKey = Object.prototype.hasOwnProperty.call(STRENGTH_MAP, stitchCleanup.strength)
  ? stitchCleanup.strength : 'balanced';
```

Note the order: `cleanupEnabled` is set first, then a few lines later
`strengthKey` is read from `stitchCleanup.strength` *without* first
checking that `stitchCleanup` is defined. If `cleanupEnabled` is false,
`strengthKey` is still computed but not used. **No bug**, but a `null`
guard would make the code self-evidently safe. [question] CL-7.

### 5.3 Diff overlay coverage

The `showCleanupDiff` overlay gates on
`(stitchCleanup && stitchCleanup.enabled) || orphans > 0`
([usePreview.js:164](../../creator/usePreview.js#L164),
[creator/bundle.js:8434](../../creator/bundle.js#L8434)). So orphan-only
runs (with `stitchCleanup.enabled === false`) still produce the diff.
**Correct.**

---

## 6. Bugs found

### CL-1 — No worker cleanup on Creator unmount
**File**: [creator/useCleanupMode.js:55](../../creator/useCleanupMode.js#L55)
**Severity**: low
**Classification**: [auto-fix]

The hook never registers a `useEffect(() => () => terminate(), [])` for
its `workerRef`. Mirrors C-2 from [01-create.md](01-create.md#c-2--generate-worker-not-terminated-on-creator-unmount).

**Fix**: Add at the bottom of the hook body, before `return`:
```js
useEffect(function() {
  return function() {
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
  };
}, []);
```

**Regression test**: Mount a component that calls `useCleanupMode`,
invoke `runAutoDetect`, unmount before the worker `postMessage` resolves;
assert `terminate` was called on the mock.

---

### CL-2 — Cleanup + "Remove unused" is a two-step undo
**File**: [creator/useCleanupMode.js:466-483](../../creator/useCleanupMode.js#L466-L483) (toast registration)
**Severity**: low
**Classification**: [question]

Press Cleanup-Apply (1 undo entry) then click the toast's Remove button
(2nd undo entry). Pressing Undo once only reverts the Remove. UX gotcha.

**Question**: Should the Remove action *replace* the previous
cleanup-apply history entry into one combined entry, or stay as-is?

---

### CL-3 — Brush mask allocates per pointermove
**File**: [useCleanupMode.js:204-209](../../creator/useCleanupMode.js#L204-L209)
**Severity**: low
**Classification**: [needs-approval]

`setCleanupPendingMask(mask.slice())` runs on every pointermove. Acceptable
on desktop, potentially noticeable on mobile for large patterns.

**Possible fix**: Coalesce via `requestAnimationFrame`. Maintain a "dirty"
flag, and call `setCleanupPendingMask` once per frame.

---

### CL-4 — Auto-detect re-serialises full pat on every tolerance change
**File**: [useCleanupMode.js:240-243](../../creator/useCleanupMode.js#L240-L243)
**Severity**: low
**Classification**: [question]

Allocates a fresh `Array` of `{id, lab}` per cell each invocation. Could
be cached and reused across tolerance changes within the same cleanup
session (invalidated when `pat` or `cmap` changes).

**Question**: Worth caching, or premature optimisation?

---

### CL-5 — Worker result still applied after sub-tool switch
**File**: [useCleanupMode.js:248-256](../../creator/useCleanupMode.js#L248-L256)
**Severity**: low
**Classification**: [auto-fix]

If the user switches from `auto` → `click` while the auto worker is
mid-flight, the worker's response still arrives and overwrites
`cleanupPendingMask` with the auto-detected selection. This destroys any
clicks the user made in the interim.

**Repro**: Switch to auto, start detection, switch to click before it
finishes, click a few cells. The clicks disappear when the worker
returns.

**Fix**: Capture the active sub-tool at start, ignore the result if it
changed:
```js
var startedFor = state.cleanupSelTool;
// …
worker.onmessage = function(e) {
  if (state.cleanupSelTool !== startedFor) { releaseWorker(worker); return; }
  // … existing handler …
};
```

Or, simpler: terminate the worker in the `cleanupSelTool`-change effect:
```js
useEffect(function() {
  return function() {
    if (state.cleanupSelTool !== 'auto' && workerRef.current) {
      workerRef.current.terminate(); workerRef.current = null;
      state.setCleanupAutoRunning(false);
    }
  };
}, [state.cleanupSelTool]);
```

**Regression test**: Start auto-detect, change sub-tool, post the
worker result, assert `cleanupPendingMask` is unchanged.

---

### CL-6 — `stitchCleanup.strength` is not persisted
**File**: [creator/useCreatorState.js:373-381](../../creator/useCreatorState.js#L373-L381)
**Severity**: low
**Classification**: [auto-fix]

`enabled`, `protectDetails`, and `smoothDithering` are read from user
prefs; `strength` is hard-coded `"balanced"`. A user who prefers
"gentle" or "thorough" must re-set it every session.

**Fix**: Add a `creatorStitchCleanupStrength` user pref:
```js
strength: ["gentle","balanced","thorough"].includes(loadUserPref("creatorStitchCleanupStrength", "balanced"))
          ? loadUserPref("creatorStitchCleanupStrength", "balanced")
          : "balanced",
```
And persist on change.

**Regression test**: Set strength, reload, assert preserved.

---

### CL-7 — Defensive guard missing in worker
**File**: [generate-worker.js:150-154](../../generate-worker.js#L150-L154)
**Severity**: info
**Classification**: [question]

`stitchCleanup.strength` is read without a `stitchCleanup &&` guard.
Currently fine because the caller always passes the object, but the
adjacent code at line 142 *does* guard. Inconsistency only.

---

## 7. TODO / open questions for the user

1. **CL-2** — Combine Cleanup-Apply + Remove-unused into one undo entry?
2. **CL-3** — Throttle brush-mask updates to `requestAnimationFrame`?
3. **CL-4** — Cache slim-pat across tolerance changes?
4. **CL-7** — Tighten worker-side guards for self-consistency?

Auto-fix items: **CL-1**, **CL-5**, **CL-6**.
