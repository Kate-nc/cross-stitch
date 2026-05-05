# Phase 1 Verification — Group E: Stash sort, Project-stats visibility, Tracker net stitches

**Commits**:
- E1 — `410da6f` Add a sort option for the stash (`manager-app.js`).
- E2 — `3044d38` Project stats visibility fixes (`stats-page.js`, `styles.css`, `tracker-app.js`).
- E3 — `0f528c9` fix stitch tracker — net-stitches accounting (`tracker-app.js`).

## E1 — Stash sort

**Intended**: Add a sort dropdown (number / colour / name / owned-desc / owned-asc) to the manager's thread list.

**Trace**:
- State: `const [threadSort, setThreadSort] = useState("number")` ([manager-app.js#L54](manager-app.js#L54))
- Sort applied after filter: [manager-app.js#L709–719](manager-app.js#L709)
- Dropdown UI: [manager-app.js#L910–912](manager-app.js#L910)

**Implementation**: ✅ IMPLEMENTED. Sort runs after filter; dependency array includes `threadSort`.

**Failure modes**:
- Per-session only (no localStorage persistence). ⚠️ Likely intentional but not documented.
- Anchor threads (composite id `anchor:403`) are sorted alphanumerically alongside DMC ids — produces a reasonable but mixed order.
- Filter+search+sort interaction: independent state hooks; no interference.

**Regression**: ✅ SAFE.

## E2 — Project-stats visibility

**Intended**: Clicking a project on the standalone Stats page navigates to the Tracker AND auto-opens that project's per-project stats. CSS overflow fix prevents the Lifetime chip popover from being clipped.

**Trace**:
- `handleViewProject(id)` ([stats-page.js#L1798–1813](stats-page.js#L1798)): calls `onNavigateToProject(id)`, then polls `window.__openTrackerStats(id)` up to 50× at 40 ms intervals.
- `window.__openTrackerStats(targetId)` ([tracker-app.js#L3340–3344](tracker-app.js#L3340)): `setStatsTab(targetId \|\| projectIdRef.current \|\| 'all'); setStatsView(true);`
- CSS: `overflow-x:auto` moved from `.gsd-tabs` to `.gsd-tabs-inner` so absolutely-positioned children no longer clipped vertically.

**Implementation**: ✅ IMPLEMENTED. Polling logic correct; the `targetId || ...` chain preserves no-arg behaviour for the existing header Stats link.

**Failure modes**:
- Tracker takes >2 s to mount (slow network, large project). 🔍 UNVERIFIABLE without runtime test — silent failure (polling stops, no toast). **DEFECT-010 (LOW)**.
- `__openTrackerStats` throws → polling stops, error not surfaced.
- User clicks a different project mid-poll → two competing pollers; later one wins. No leak (50-attempt cap).
- CSS change inadvertently reveals horizontal overflow elsewhere — verified scope; the change is on `.gsd-tabs` only.

**Regression**: ✅ SAFE for header Stats link (no-arg call still works).

## E3 — Tracker net stitches

**Intended**: Auto-session live counter and end-session deltas now use *net* stitches (completed − undone), not gross. Historical session reducer prefers `sess.netStitches` if present.

**Trace**:
1. `recordAutoActivity` ([tracker-app.js#L1762](tracker-app.js#L1762)): `setLiveAutoStitches(stitchesCompleted - stitchesUndone)` (was `stitchesCompleted` only).
2. End-session button ([tracker-app.js#L5704](tracker-app.js#L5704)): `netSessionDelta = liveAutoStitches` (was `liveAutoStitches - _undone`, which double-subtracted).
3. SessionSummaryModal `prevAvgSpeed` reducer: `typeof sess.netStitches === 'number' ? sess.netStitches : (sess.stitchesCompleted || 0)`.

**Implementation**: ✅ IMPLEMENTED.

**Failure modes**:
- User undoes more stitches in this session than they completed (e.g. clearing pre-existing stitches): `liveAutoStitches` becomes negative. The display is unguarded — meter / progress chip can show "−5 stitches" or compute progress percentages > 100. **DEFECT-011 (LOW)**.
- Mixed legacy/new sessions in `prevAvgSpeed`: ✅ SAFE — fallback to `stitchesCompleted` keeps the average computable, though it's not strictly comparable to the new net-based values. Cosmetic only.

**Regression**: ✅ SAFE. The double-subtraction bug it fixes was a previous arithmetic error; the new code is consistent with itself.

**Group verdict**: All three changes are clean. Two LOW defects (silent polling timeout; negative-stitch display) noted.
