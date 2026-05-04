# Real-Time Stash Deduction — Phase 1 Design Spec

**Status:** Draft — awaiting UI proposal selection before implementation begins.  
**Scope:** Core calculation engine, state model, waste preferences, coexistence rules.

---

## 1.1 — Per-Stitch Thread Cost Calculation

### Core formula

The thread length consumed by a single full cross stitch is derived directly from the
same formula already in `threadCalc.js`. No new magic numbers are introduced.

```
holePitchCm  = 2.54 / fabricCount          // cm between holes at a given fabric count
threadPerStitchCm = holePitchCm × 4.8 × strandCount
```

The 4.8 coefficient is the established cross-stitch thread-path multiplier: a full
cross stitch makes two diagonal passes over the hole pitch in both directions, plus
needle-back thread on the reverse. It is already used in `stitchesToSkeins()` in
`threadCalc.js` and must not be changed here.

Converting to inches (1 inch = 2.54 cm):

```
threadPerStitchIn = (1.0 / fabricCount) × 4.8 × strandCount
                  = 4.8 × strandCount / fabricCount
```

Examples:

| fabricCount | strandCount | threadPerStitchIn |
|-------------|-------------|-------------------|
| 11          | 2           | 0.873             |
| 14          | 2           | 0.686             |
| 16          | 2           | 0.600             |
| 18          | 2           | 0.533             |
| 28          | 2           | 0.343             |
| 14          | 1           | 0.343             |
| 14          | 3           | 1.029             |

**Higher fabric count → smaller physical stitch → less thread per stitch.**  
**Higher strand count → more thread pulled per stitch.**

### Conversion to fractional skeins

A standard DMC skein contains 6 strands each 8 metres (≈ 315 inches) long.  
Total single-strand thread per skein: `6 × 315 = 1890 inches`.

```
SKEIN_TOTAL_IN = 6 × SKEIN_LENGTH_IN   // 6 × 315 = 1890 inches
skeinsConsumed = totalInchesConsumed / SKEIN_TOTAL_IN
```

`SKEIN_LENGTH_IN = 315` is sourced from `constants.js`; `SKEIN_TOTAL_IN` is a
derived constant, not a new magic number.

This is consistent with `stitchesToSkeins()`:

```
stitchesToSkeins result = (N × threadPerStitchCm) / (8m × 100 × 6 × (1 − wasteFactor))
                        = (N × threadPerStitchIn × 2.54) / (315 × 2.54 × 6 × (1−wf))
                        = (N × threadPerStitchIn) / (1890 × (1−wf))
```

So the existing model and the new model share the same denominator; only the
waste treatment differs (see section 1.2).

---

## 1.2 — Waste Factor Model

### Why the existing `wasteFactor` is insufficient for real-time use

`stitchesToSkeins()` applies waste as a single fraction reducing the usable skein
length: `usable = skeinLength × (1 − wasteFactor)`. This is correct for estimating
how many skeins to *buy* but is unhelpful for real-time deduction because:

- It cannot distinguish between different *sources* of waste (tails vs. mistakes vs.
  running short at the end of a run).
- It cannot be tuned without touching the purchase estimate.
- It does not decrease waste proportionally when the user changes behaviour (e.g.,
  longer runs mean fewer tails, so lower effective waste).

### New waste preferences model

Four user-adjustable parameters with sensible defaults:

#### `tailAllowanceIn` — Thread tail allowance
- **What it controls:** Inches of thread wasted each time the user starts or ends a
  thread run (anchoring in and burying the tail on the back). One run = one start
  tail + one end tail = `2 × tailAllowanceIn` inches wasted per run.
- **Default:** 1.5 inches per tail (3 inches per run)
- **Range:** 0.5 – 4.0 inches
- **Reasoning:** 1.5 inches is the minimum length a stitcher can comfortably hold to
  anchor or weave in a tail. More experienced stitchers tend toward 1.0 inch (they are
  precise), beginners toward 2.0–3.0 (they leave longer tails for safety). 1.5 is the
  midpoint of confident intermediate stitching.

#### `threadRunLength` — Average stitches per thread run
- **What it controls:** How many stitches the user completes before cutting the thread
  and starting a fresh one. Determines how often `tailAllowanceIn` is charged.
- **Default:** 30 stitches
- **Range:** 10 – 100 stitches
- **Reasoning:** A typical stitcher working with 2 strands on 14-count fabric cuts
  roughly every 25–40 stitches. 30 is a realistic midpoint. Methodical stitchers using
  longer runs (park-and-travel or parking) should set this higher; those who cut
  frequently (sectioning a colour region) lower.
- **Interaction with tail allowance:**
  `tailWastePerStitch = (tailAllowanceIn × 2) / threadRunLength`
  At defaults: `(1.5 × 2) / 30 = 0.10 inches/stitch` amortised tail waste.

#### `generalWasteMultiplier` — Catch-all waste percentage
- **What it controls:** A percentage added on top of the per-stitch cost to account for:
  - Thread tangling and re-cutting
  - Frogging (un-stitching) and re-stitching
  - Tension variation using more thread than the geometric ideal
  - Thread left on the needle at the end of a run that is too short to stitch again
  - Miscut or knotted thread discarded entirely
- **Default:** 1.10 (10% extra)
- **Range:** 1.00 (0%) – 1.30 (30%)
- **Reasoning:** 10–15% is the industry rule of thumb for craft thread waste. 10% is
  conservative (experienced stitcher, good technique). Users who frequently frog or
  stitch in poor lighting should raise it.

#### `strandCountOverride` — Strand count
- **What it controls:** The number of strands actually being stitched. Overrides the
  pattern default (typically 2) for the stitch cost calculation.
- **Default:** Pattern default (2 for fabric counts 14–22; often 2-over-2 for 28ct)
- **Range:** 1 – 6
- **Per-colour overrides:** Ideal but deferred to a later phase. Per-project is the
  minimum viable implementation.
- **Reasoning:** Some stitchers use 1 strand for fine detail, 3 for coverage on coarse
  fabric, or mix strands by colour. The waste model must reflect the actual strand count
  being used, not the pattern's suggestion.

### Effective cost formula

```
baseCostIn          = 4.8 × strandCountOverride / fabricCount
tailWastePerStitch  = (tailAllowanceIn × 2) / threadRunLength
effectiveCostIn     = (baseCostIn + tailWastePerStitch) × generalWasteMultiplier
```

**Example at defaults** (14ct, 2 strands, 1.5in tail, 30-stitch run, 1.10 multiplier):

```
baseCostIn          = 4.8 × 2 / 14   = 0.6857 in/stitch
tailWastePerStitch  = (1.5 × 2) / 30 = 0.1000 in/stitch
effectiveCostIn     = (0.6857 + 0.100) × 1.10
                    = 0.7857 × 1.10
                    = 0.8643 in/stitch

skeinsPerStitch     = 0.8643 / 1890  = 0.000457 skeins/stitch
```

**Comparison with `skeinEst` (wasteFactor = 0.20):**

```
skeinEst effective cost = baseCostIn / (1 − 0.20)
                        = 0.6857 / 0.80
                        = 0.857 in/stitch
                        → 0.000453 skeins/stitch
```

The two approaches are within 1% of each other at defaults — confirming they are
consistent models of the same underlying physical reality. The new model simply
exposes the waste sources separately so users can tune them.

### What happens when preferences change

If the user adjusts any waste preference mid-project, **all consumption figures must
be recalculated retroactively** from the source of truth (which stitches are done ×
the new waste settings). There is no running counter that drifts — see section 1.3.

---

## 1.3 — Accumulation and Deduction State

### Per-colour derived state

For each colour in the pattern, the following values are computed (never stored
redundantly) whenever the done counts or waste preferences change:

```
totalStitchesMarked  = colourDoneCounts[id].done          // already tracked
totalInchesConsumed  = totalStitchesMarked × effectiveCostIn
skeinsConsumed       = totalInchesConsumed / SKEIN_TOTAL_IN  // SKEIN_TOTAL_IN = 1890
ownedSkeins          = globalStash['dmc:' + id].owned || 0
skeinsRemaining      = ownedSkeins − skeinsConsumed       // may be negative
percentOfSkeinUsed   = (skeinsConsumed % 1.0) × 100       // position within current skein
```

`totalStitchesMarked` is already available through `colourDoneCountsRef` (the
existing `applyDoneCountsDelta` / `recomputeAllCounts` infrastructure). The new
values are derived from it — no additional tracking state is needed.

### Where state lives

**Consumption figures are derived in a `useMemo`**, re-running whenever
`colourDoneCounts`, `fabricCount`, or `wastePrefs` change. They are **not stored in
the project JSON** because they are fully recoverable from the done array + prefs.
Storing them would create a redundant, potentially drift-prone second source of truth.

The waste preferences are stored **per-project** in the project's settings object
(new `wastePrefs` key). A global "my defaults" copy is stored in `localStorage` under
`cs_pref_wastePrefs`. When a new project is created, defaults are copied from
localStorage into the project's `wastePrefs`.

```json
// Inside project.settings:
"wastePrefs": {
  "enabled": false,
  "tailAllowanceIn": 1.5,
  "threadRunLength": 30,
  "generalWasteMultiplier": 1.10,
  "strandCountOverride": null
}
```

`enabled: false` means the feature is off and the existing completion-modal path runs
unchanged. `strandCountOverride: null` means use the per-pattern default.

### When the stash write happens

**Strategy: debounced session-end write (30-second idle debounce + unload flush).**

Rationale:

| Option | Pros | Cons |
|--------|------|------|
| Per-stitch (on every mark) | Always up to date | IndexedDB write on every tap — 400ms latency on mobile; risk of write failure mid-session corrupting intermediate state |
| Fixed interval (e.g., every 30s) | Predictable | May write consumption for stitches about to be undone |
| Idle debounce + unload | Batches naturally; stitching pauses trigger a write | Data loss if browser crashes within the debounce window |
| Explicit save button | Zero surprise writes | User must remember to press it; loses value of "automatic" |

**Chosen approach — idle debounce + unload flush:**

1. Every time the done state changes (any stitch marked or unmarked), reset a 30-second
   debounce timer.
2. When the timer fires (user has stopped marking stitches for 30 seconds), write the
   accumulated consumption per colour to `stitch_manager_db` via `StashBridge`.
3. On `beforeunload` (page close), flush any pending debounced write immediately.
4. On session summary display (existing modal), flush immediately before showing
   updated stash numbers.

**Maximum data loss window:** 30 seconds of stitching activity plus any stitches
marked after the last flush but before a crash. At 40 stitches/hour, 30 seconds ≈ 0.3
stitches average — negligible. The worst case (crash immediately after the 30-second
timer resets) loses one burst of marking, typically < 60 stitches.

### Stash write format

Each write calls `StashBridge.updateThreadOwned(id, newOwnedValue)`, where
`newOwnedValue = Math.max(0, originalOwnedAtProjectStart − skeinsConsumedSoFar)`.

The "original owned at project start" is **snapshotted once** when the project is
loaded and real-time deduction is active, stored in the project's runtime state
(not persisted to disk). On reload, the snapshot is reconstructed from the current
stash minus the saved consumption figures for that project. This ensures that loading
the project in two tabs does not double-count.

Actually — to avoid per-project "consumption ledger" complexity in v1, the simpler
approach: **write owned directly** as `ownedSkeins − skeinsConsumedNow`. This is
idempotent: re-applying the same consumption value (after a reload) produces the same
stash level. It is equivalent to "the stash reflects how much you own right now, after
accounting for this project."

⚠️ This means two simultaneously-tracked projects using the same colour can conflict.
See section 1.4 (edge cases) for the multi-project note.

### Undo handling

When the user un-marks stitches (via the undo button, bulk row undo, or dragging to
un-mark), `applyDoneCountsDelta` already decrements `colourDoneCounts[id].done`.
The `useMemo` that derives consumption re-runs automatically with the lower count,
producing a lower `skeinsConsumed`. The next debounced write (or the flush on the next
action) writes the revised lower value to the stash — effectively crediting the thread
back.

This requires no special undo path: consumption is derived, so un-marking a stitch
automatically reduces it. If the stash was already written, the next write will
correct it. The maximum discrepancy window is the debounce period (30 seconds).

---

## 1.4 — Migration and Coexistence

### Users with real-time deduction disabled (default)

Zero change to existing behaviour. The `wastePrefs.enabled` flag defaults to `false`.
When `false`:
- The "Threads needed" panel shows owned vs. required exactly as today.
- The completion modal offers the existing three options (Deduct Full, Deduct Partial,
  Skip) unchanged.
- Manual +/− stash buttons work exactly as today.
- The `wastePrefs` object is stored in the project but ignored by all calculations.

### Enabling mid-project (retroactive reconciliation)

When the user enables real-time deduction on a project where some stitches are already
marked done:

1. Calculate `skeinsConsumedSoFar` for each colour using the current waste preferences
   applied to the existing done counts.
2. Show a **one-time reconciliation modal**:
   - "You've already completed X stitches. Estimated thread consumed: [table per colour]."
   - "Apply this deduction to your stash now?"
   - Options: **Apply** / **Skip (start tracking from here with no initial deduction)**.
3. If Apply: write `StashBridge.updateThreadOwned(id, Math.max(0, owned − consumed))`
   for each colour, then mark `wastePrefs.reconciledAt = new Date().toISOString()`.
4. If Skip: set `wastePrefs.consumptionBaseline` = the done counts at the moment of
   enabling. Future consumption is calculated only for stitches marked *after* this
   baseline. Retroactive stitches are treated as having zero cost.
5. Going forward, real-time deduction is active.

### Disabling mid-project

When the user disables real-time deduction:

1. Show a decision modal:
   - **Keep deductions made so far:** `wastePrefs.enabled = false`. The stash levels
     already written remain. No further writes happen. The user accepts the current
     stash state.
   - **Restore stash to pre-project levels:** Re-add `skeinsConsumedSoFar` back to
     each colour in the stash (`owned + consumed`), then set `wastePrefs.enabled =
     false`. The stash is back to what it was before this project was started.
2. Either way, clear `wastePrefs.consumptionBaseline` and reset the debounce timer.

### Interaction with the completion modal (preventing double-counting)

When `progressPct >= 100`:

- If `wastePrefs.enabled = true` AND at least one stash write has been made for this
  project (`wastePrefs.lastWrittenAt` is set): replace the deduct_prompt modal with a
  **reconciliation summary modal** (see UI proposals). No second deduction is offered.
  
- If `wastePrefs.enabled = true` BUT no write has been made yet (user just finished
  while the debounce was pending): flush the consumption write first, then show the
  reconciliation summary.

- If `wastePrefs.enabled = false`: show the existing deduct_prompt modal unchanged.

The `stashDeducted` flag (already in state) is set to `true` after both the real-time
reconciliation summary is dismissed AND the legacy deduct_prompt modal is handled.
This prevents the completion modal from firing a second time regardless of path.

### Edge cases

**Blended stitches:**  
A blend stitch (two colours in one stitch) splits the consumption proportionally by
strand count. If the blend is `1:1` (one strand each), each colour receives
`effectiveCostIn × 0.5`. If `2:1`, colour A receives `2/3` and colour B `1/3` of the
cost. The `blendRatio` is stored on blend palette entries.

**0 skeins owned:**  
`skeinsRemaining = 0 − skeinsConsumed` → negative. Display as a clear shortage
indicator, not a negative number. E.g., "Need 0.8 more skeins" in an amber/red style.
Do not show "-0.8" which would be confusing.

**Thread in pattern but not in stash:**  
Show consumption tracked but owned = "unknown" (not 0). The running total is
maintained and shown (so the user can see how much they've used), but the
"remaining" comparison is unavailable. Show a dash or "—" for skeins remaining.

**Multiple projects using the same colour simultaneously:**  
In v1, deductions are per-project and write directly to the stash. If two projects
deduct the same colour, the second project's deduction is based on whatever the stash
shows when it loads — it does not see the other project's in-flight consumption until
it is flushed. This is a known limitation for v1. A future "project ledger" model
(where each project records how much it has consumed, and the stash manager aggregates
them) would solve this correctly.

**Browser crash during debounce window:**  
Stitches marked in the last 30 seconds before a crash are not written to the stash.
On reload, `colourDoneCounts` is reconstructed from the done array (which is saved on
every stitch mark via the existing auto-save path). However, the stash was not updated
to reflect those final stitches. The next debounce flush (after reload and when the
user starts stitching again, or on session start) will correct this.

**Waste preferences changed mid-project:**  
All `useMemo` dependencies include `wastePrefs`, so changing any preference immediately
recalculates consumption for all already-marked stitches. The next debounce flush
writes the revised values. This is intentional: the preferences represent the user's
best estimate of their actual technique, so retroactive application is correct.

**Fabric count changed mid-project:**  
Same as above — `fabricCount` is a `useMemo` dependency. The recalculation happens
automatically.

---

## 1.5 — Implementation touchpoints (for Phase 3 reference)

| Area | Change needed |
|------|---------------|
| `project-storage.js` schema | Add `wastePrefs` to project settings on save/load (with defaults) |
| `threadCalc.js` | Export `threadCostPerStitch(fabricCount, strandCount)` returning base cost in inches |
| `tracker-app.js` state | Add `wastePrefs` state; add `rtConsumption` useMemo |
| `tracker-app.js` debounce | Add 30s debounce + beforeunload flush for stash writes |
| `tracker-app.js` completion | Check `wastePrefs.enabled` before opening `deduct_prompt` |
| `StashBridge` | No changes needed; `updateThreadOwned` + `getGlobalStash` already sufficient |
| `user-prefs.js` | Add `cs_pref_wastePrefs` default for "my defaults" storage |
| New unit tests | `threadCostPerStitch` × stitch count ≈ `stitchesToSkeins` total; debounce; undo credit-back |

---

*End of Phase 1 spec. Proceed to Phase 2 UI proposals.*
