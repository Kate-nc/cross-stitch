# B5 — Multi-Select Dashboard + Rich Cards with Progress Thumbnails — Completion Report

## Files

**Added**
- `tests/multiSelectDashboard.test.js` — 27 source-contract + behavioural cases (Part 1–4 + CSS).

**Modified**
- `home-screen.js` — main work: selection state, bulk handlers, bulk action bar, lazy `PartialStitchThumb` payload load on both `ProjectCard` and the hero card.
- `project-storage.js` — added `deleteMany(ids)` and `setStateMany(ids, state)` thin wrappers (behaviour identical to looped per-id calls; existing signatures unchanged).
- `icons.js` — added `Icons.archive` (24×24 viewBox, stroke `currentColor`, matches existing icon style).
- `styles.css` — appended `/* B5 — Multi-select dashboard + rich cards */` block.
- `tests/__snapshots__/icons.test.js.snap` — refreshed via `-u` for the new `archive` entry.

**Not modified** — `tracker-app.js`, `manager-app.js`, `creator/*`, `header.js`, `help-drawer.js`, `useDragMark.js`, `components/PartialStitchThumb.js`. No `// TODO [B5]:` markers were necessary.

## B1 (PartialStitchThumb) API observations

The B1 component's existing prop interface (`pattern`, `done`, `w`, `h`, `size`, `palette`, `projectId`, `className`, `alt`) was **sufficient with no adjustments**. In particular:

- The cache key already keys on `projectId`, so the dashboard's shared `payloadCache` Map plus the LRU inside `PartialStitchThumb` interact cleanly — no double-cache.
- The component's null-tolerant fallback (renders a fully-ghosted thumb when `done == null`) made the lazy-load fallback path trivial: I render the static `proj.thumbnail` only while the payload is `null`, then swap to `PartialStitchThumb` once `pattern` arrives.
- No worker offload was needed; thumbs render at `size: 96`, well below the 50 ms gate the B1 report calls out.

## Bulk action shape (Part 4)

```
selected: Set<string>
selectionMode: boolean
payloadCacheRef: React.useRef(new Map<string, {pattern, done, w, h}>)
```

- `handleBulkArchive()` → `ProjectStorage.setStateMany(ids, 'paused')` + local `setStates` mirror, clear selection, exit mode, success toast `"N project(s) archived"`.
- `handleBulkDelete()` → `window.confirm("Delete N projects? This cannot be undone.")` then `ProjectStorage.deleteMany(ids)`. The existing `cs:projectsChanged` event fired by `delete()` already triggers the dashboard reload, which in turn intersects the now-stale selection set — no manual refresh needed.
- `handleBulkExport()` → placeholder toast `"Bulk export coming in B4"`. Real export deferred to B4 by brief.
- **Move to category** button: hidden. There is no separate category infrastructure in this codebase — the existing `cs_projectStates` map (`active` / `queued` / `paused` / `complete` / `design`) **is** the categorisation. The brief explicitly says "if no categories exist, hide this button entirely", so no UI was added.

## Continue bar coexistence decision

**Hide the Continue bar while selection mode is active.** Rationale: the bulk action bar is a sticky strip with up to four primary buttons; stacking a second sticky strip above it on a narrow viewport (~390px wide phones) overflowed the viewport into a scroll-locked sandwich. Hiding Continue while the user is in a transient bulk-edit context is also semantically clean — the user has explicitly switched into "manage many" mode. Implemented as `!selectionMode && continueProj && h(...)` so the bar reappears the instant Escape / Clear / completing a bulk action exits selection mode.

## PERF NOTE (Option A — lazy per-card payload load)

Implemented Option A: each `ProjectCard` mounts an effect that calls `ProjectStorage.get(proj.id)` once and stores `{pattern, done, w, h}` on a `Map` ref shared at the dashboard level (`payloadCacheRef`). Re-renders never refetch. The hero card on `HomeScreen` follows the same pattern with its own state, since at most one hero is ever rendered. Inline `// PERF NOTE` comments at both sites reference Option A's choice.

This avoids re-introducing the perf problem the meta store solved: a 50-project user pays for at most one full-payload fetch per visible card (≤ ~10 active cards typical), not 50 fetches up front.

## Cross-cutting details

- **No emoji** — bulk bar uses `Icons.archive`, `Icons.trash`, `Icons.check`. New `archive` icon added to `icons.js` (24×24, currentColor, matches existing style); `trash` and `check` already existed. Snapshot refreshed.
- **British English** — Archive, Cancel, Categorise (button absent here), `colour(s)` for the new thread-count line.
- **Mobile (≤480px)** — bulk bar wraps to `overflow-x: auto` instead of breaking layout; Continue button bumped to 36px min-height; long-press uses 500ms + 10px movement guard so scrolling a long project list never accidentally enters selection mode.
- **Toast API** — every call passes the required options object (`{message, type}`).
- **Categories** — none exist as a separate concept; states are the categorisation. Move-to-category button intentionally absent (per brief gating).

## Test results

`npm test -- --runInBand`:
- Before B5: **825 passing**, 75 suites.
- After B5: **852 passing**, 76 suites (+27 new). Snapshot refreshed (icons), no failing tests.

`npm run lint:terminology`: clean.

## Deferred items

- **Bulk export** → B4. Placeholder toast in place; no export pipeline wired.
- **Inline confirm modal** — `window.confirm` is used (matches `preferences-modal.js` pattern). If the team wants a styled overlay confirm, B3 has a natural integration point.
- **Drag-mark coexistence** — multi-select touch handler runs at the card root; `useDragMark` (B2) operates inside the tracker canvas. No collision possible.

## Cache key bumps

None. No cached client surface changed (no `creator/*` edits, no `creator-main.js` cache key touched).

## Cross-track issues

None observed. `creator/bundle.js` was **not** rebuilt (no `creator/*` source touched).

## Unblocks

**Unblocks: B3+B4 epic — proceed when at least one of {B2, B6} is also merged (both are).**

## Commit

`feat(dashboard): multi-select + rich cards with progress thumbnails [B5]` → SHA `41eb19f`.
