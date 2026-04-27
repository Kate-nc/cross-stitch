# Option 2 — Implementation Plans

Two parallel investigations:

1. **Plan A — Creator implementation** (this PR): concrete code-level steps to ship Option 2 in the Pattern Creator (edit mode).
2. **Plan B — App-wide principle propagation** (future PRs): how the same "summary chip + popover, calm action bar, one canonical home per datum" principles apply to Tracker, Stash Manager, /home, and Stats.

---

## Plan A — Creator (edit mode)

### Order of work

1. CSS z-index fix (Export menu).
2. `creator/PatternInfoPopover.js` (new component).
3. `creator/ActionBar.js` refactor (mode switch + Pattern info chip, drop the four-stat block).
4. `creator/Sidebar.js` — remove the `[← Create] [Start Tracking →]` bottom bar.
5. `creator/ProjectTab.js` — drop the Pattern Summary section, add a small discoverability callout, keep the planner content.
6. `creator-main.js` — wire `appMode` + `onSwitchToCreate` into `ActionBar`.
7. `build-creator-bundle.js` — add the new file to the concatenation order.
8. Bump `CREATOR_CACHE_KEY` in `index.html` so cached bundles refresh.
9. Rebuild + run `npm test -- --runInBand`.

### Step-by-step (file:line targets confirmed against current source)

**1. `styles.css`** — `.creator-actionbar__menu { z-index: 50 }` → `1000`. The toolbar row is `z-index: 99` and the topbar `100`; bumping to 1000 keeps the menu above both without reordering anything else.

**2. `creator/PatternInfoPopover.js`** — new component, mirrors the existing menu pattern in `ActionBar.js` (Escape + click-outside via `pointerdown`). Exposes `window.CreatorPatternInfoPopover`. Props: `open`, `onClose`, `triggerRef`, `sW`, `sH`, `fabricCt`, `colourCount`, `skeinEstimate`, `totalStitchable`, `difficulty`, `solidPct`, `totalTime`, `doneCount`. Mobile (`<600px`) renders as a bottom sheet via CSS only.

**3. `creator/ActionBar.js`**
- Remove the four-stat block (`statsBlock` variable + render call).
- Add segmented mode switch `[Create | Edit | Track]` using the roving-tabindex pattern from `creator/MaterialsHub.js:88-116`.
- Add a `Pattern info ▾` chip that toggles the popover. Chevron uses `Icons.chevronDown()`.
- New props: `appMode`, `onSwitchToCreate`. Existing `onTrackPattern` stays.

**4. `creator/Sidebar.js`** — delete the `editActions` block (`[← Create]` and `[Start Tracking →]` buttons rendered at the bottom of the edit-mode sidebar). The sidebar gains vertical space; both actions now live in the top action bar.

**5. `creator/ProjectTab.js`** — remove the Pattern Summary section. Add a single dashed callout at the top of the tab pointing users at "Pattern info ▾". Time Estimate slider and Finished Size table stay (they're planner content, not duplicated stats).

**6. `creator-main.js`** — pass `appMode={state.appMode}` and `onSwitchToCreate={...}` to `ActionBar`. The handler mirrors the previous sidebar behaviour: confirm if `editHistory.length > 0`, then `setAppMode('create')` and `setSidebarTab('image')`.

**7. `build-creator-bundle.js`** — insert `'creator/PatternInfoPopover.js'` into the `ORDER` array before `creator/ActionBar.js`.

**8. `index.html`** — bump `CREATOR_CACHE_KEY` so users with a cached bundle pick up the new code.

**9. Tests** — `tests/creatorActionBar.test.js` already validates ActionBar contents; update it for the new structure (mode switch, chip, no four-stat block). Existing tests use `eval()` on raw source, so the changes are mostly string-match updates.

### Risks

| Step | Risk | Mitigation |
|---|---|---|
| 1 | New menu z-index might clip a future modal | Modals use `z-index: 1100+`; menu at 1000 stays below them |
| 2 | Popover focus trap | Mirror existing menu (no full trap; just Escape + click-outside) |
| 3 | ActionBar refactor regressions | Keep all existing handlers; add only new optional props |
| 4 | User loses muscle memory for `Start Tracking` | Track is now in the top mode switch — same horizontal area, more discoverable |
| 5 | Project tab feels empty | Discoverability callout + planner content keeps it useful |

---

## Plan B — App-wide propagation (future)

Detailed survey of Tracker, Manager, /home and Stats with proposed Option-2-style consolidations is captured below. Phase recommendation: build a shared `window.AppInfoPopover` in `components.js` and shared `.app-info-chip` / `.app-info-popover` CSS tokens, then ship one surface per PR (Tracker first, Stats last).

### Tracker

- **Redundancy**: progress % shown in header bar AND info strip; "Today" stitch count duplicated in info strip + Sessions tab + Stats tab.
- **Proposed**: `Progress info ▾` chip on the info strip → popover with Done / Today / This week / Time remaining. Header keeps the always-visible progress bar.
- **Scope**: small. **Value**: medium. Best first surface to validate the shared component.

### Stash Manager

- **Redundancy**: stats strip (`owned · to-buy · low stock`) duplicates Alert cards which duplicate per-card badges.
- **Proposed**: `Stash ▾` chip → popover with totals + low-stock count + conflict count. Alert cards collapse into a "smart hub" that surfaces only the most critical alert by default.
- **Scope**: large. **Value**: high.

### /home

- **Redundancy**: Active Project Card + first row of Projects List show the same data. Per-row `[Track] [Edit]` buttons multiply quickly.
- **Proposed**: collapse Active card on mobile to a single chip; convert per-row buttons to a `⋯` overflow menu; click name → project-metadata popover.
- **Scope**: medium. **Value**: medium-high.

### Stats

- **Redundancy**: 13 vertical sections, many overlapping (Lifetime Stitches in Activity + Showcase + share modal; weekly totals in summary card + heatmap + insights).
- **Proposed**: `Lifetime ▾` overview chip in the header + 4 collapsible "Insight Families" (Stitching Rhythm / Stash & Inventory / Project Planning / Advanced). Replace the visibility-toggles sidebar with a `View: [Dashboard] [Custom]` segmented control.
- **Scope**: large. **Value**: high.

### Shared scaffolding to introduce first

- `components.js` → `window.AppInfoPopover({ trigger, children, isOpen, onToggle, onClose })`.
- `styles.css` → `.app-info-chip`, `.app-info-popover`, `.app-info-grid`, `.app-info-divider`, `.app-badge--{success|warning|danger}`.
- The Creator's `PatternInfoPopover` lands first as a Creator-specific component; once Tracker adopts the same chip pattern, refactor both to use `AppInfoPopover` from `components.js`.

### Recommended phasing

1. Phase 1 — Tracker progress chip (proof of concept).
2. Phase 2 — Stash Manager (highest value).
3. Phase 3 — /home (mobile wins).
4. Phase 4 — Stats restructure (largest, gather feedback first).
