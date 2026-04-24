# C4 — Materials Hub Visual Hierarchy Refresh Plan

## Executive Summary

- **Goal:** Make the Materials & Output sub-tabs (Threads / Stash status / Shopping / Output) visually subordinate to the main Sidebar page selector so first-time users perceive them as filters within one page rather than a second navigation row.
- **Risk surface:** All four sub-tabs share one container (`.materials-hub`) and three of the four panels are mounted unconditionally — visual restructuring must not change mount order or break the existing `app.materialsTab` guard inside child tabs ([creator/MaterialsHub.js](creator/MaterialsHub.js#L262-L268)).
- **Approach:** Re-skin the sub-tab strip as an indented "pill rail" inside a softer surface band, add a persistent breadcrumb micro-label ("Materials & Output › Threads"), align the four empty states to one shared component, and tighten the palette grid touch target on ≤480 px. No JS API changes; CSS-led with small markup additions.
- **Sequencing:** Five PRs, each <200 LOC — (1) shared `EmptyState` component + Threads/Shopping migration, (2) sub-tab pill restyle + breadcrumb, (3) palette grid mobile density, (4) Stash + Output empty states, (5) snapshot + a11y test additions.
- **Outcome:** Visual cue tells the user "you're inside one page, switching views" rather than "you've moved pages"; mobile mis-tap rate on palette swatches drops; empty states read in one consistent voice and use [icons.js](icons.js) glyphs (no emojis, per [AGENTS.md](AGENTS.md)).

---

## 1. Goal

The B4 epic collapsed three former top-level pages (Materials, Prepare, Export) into a single Materials & Output hub with four sub-tabs. The fix-3.2 patch added an indented strip and a "View:" prefix label, but the audit ([reports/ux-8-post-B-audit.md](reports/ux-8-post-B-audit.md#L74-L90)) records that sub-tabs still read like a second navigation row, that empty-state copy across blends/shopping/threads is inconsistent, and that mobile users mis-tap the palette grid. C4 finishes the visual hierarchy work: the sub-tabs become unambiguously a filter within one page, the user always sees a breadcrumb that reminds them which Sidebar page they're on, the palette grid becomes touch-friendly on phones, and every empty panel speaks in one voice with one shared layout. No new features ship — this is a polish ticket.

---

## 2. Current State

### 2.1 Component structure

- **Hub component:** [creator/MaterialsHub.js](creator/MaterialsHub.js#L12-L17) — top-level guard `app.tab !== 'materials'` returns null.
- **Sub-tab definitions:** [creator/MaterialsHub.js](creator/MaterialsHub.js#L68-L73) — array of `{id, label, icon}` for Threads, Stash status, Shopping, Output. Icons resolved via `window.Icons.thread`, `Icons.layers`, `Icons.shoppingCart`, `Icons.download`.
- **Sub-tab button factory:** [creator/MaterialsHub.js](creator/MaterialsHub.js#L76-L89) — emits `<button role="tab" aria-selected>` with class `mh-subtab` (+`on` when active).
- **Render tree:** [creator/MaterialsHub.js](creator/MaterialsHub.js#L249-L269) — wraps `.mh-subtabs-wrap` (label + nav) above `.mh-body` containing `CreatorLegendTab`, `CreatorPrepareTab`, conditional `shoppingPanel()`, and `CreatorExportTab`.
- **Sidebar host:** [creator/Sidebar.js](creator/Sidebar.js) — renders the main page tabs above the hub; the hub appears only when `app.tab === 'materials'`.

### 2.2 Current styles

- **Strip wrapper:** [styles.css](styles.css#L3649-L3656) — `.mh-subtabs-wrap` uses `--surface-2` background and 16 px left padding.
- **"View:" label:** [styles.css](styles.css#L3657-L3663) — uppercase 11 px caption.
- **Sub-tab pills:** [styles.css](styles.css#L3665-L3667) — `.mh-subtab` 8×14 padding, 36 px min height, accent fill on `.on`.
- **Mobile rules:** [styles.css](styles.css#L3688-L3699) — horizontal scroll with right-edge mask, 44 × 44 minimum touch target.

### 2.3 Empty states (inconsistency snapshot)

- **Shopping empty:** [creator/MaterialsHub.js](creator/MaterialsHub.js#L94-L99) — `mh-shopping-empty` div with inline styles, two-line copy, no icon.
- **Threads empty:** [creator/LegendTab.js](creator/LegendTab.js) — different markup, separate copy register.
- **Stash empty:** [creator/PrepareTab.js](creator/PrepareTab.js) — owns its own messaging.
- **Output empty:** [creator/ExportTab.js](creator/ExportTab.js) — different again.

The audit's empty-state finding is correct: each panel rolls its own.

### 2.4 Palette grid density

- **Owner:** [creator/PrepareTab.js](creator/PrepareTab.js) renders the palette swatch grid that the Stash view consumes; cell sizing is set by `.mh-body` children rather than the hub itself ([styles.css](styles.css#L3669)).
- **Mobile gap:** swatches inherit desktop sizing on viewports ≤480 px, where audit observed mis-taps.

---

## 3. Proposed Visual Treatment

### 3.1 Sub-tab pill style

Move from a flat horizontal strip that mimics primary tabs to an **indented pill rail** that visually nests under the Sidebar's main page selector:

- **Container indent:** 24 px `padding-left` on `.mh-subtabs-wrap` (currently 16) so the strip is clearly inset from the page selector edge above.
- **Container background:** keep `--surface-2`, but add a subtle 2 px left accent border in `--accent` at 30 % alpha to signal "child of the active page".
- **Pill resting state:** 1 px outline in `--border`, transparent fill — pulls the pills back from competing with the solid main-tab buttons.
- **Active pill:** keep `--accent` fill but reduce font weight from 600 to 550 and add 0 px outline so it reads as "selected filter" rather than "selected page".
- **Hover:** `--surface-tertiary` fill, no outline change.

### 3.2 Container background

The hub body (`.mh-body`) currently renders directly on the page background. Add an inner card chrome:

- `.mh-body` gets `background: var(--surface-1)`, `border-radius: 0 0 12px 12px`, and an internal 14 px padding (already present).
- The strip + body together read as one inset card; the gap between them and the main Sidebar tabs above becomes the visual cue that they belong to one page.

### 3.3 Header label

Replace the silent "View:" caption with an explicit breadcrumb micro-label rendered above the strip:

```
Materials & Output  ›  Threads
```

- Span uses `Icons.pointing` (already in [icons.js](icons.js)) as the chevron between segments — never the `›` Unicode character (per [AGENTS.md](AGENTS.md) house rule).
- Breadcrumb text colour: `--text-tertiary`; active segment colour: `--text-primary`.
- The breadcrumb owns the page-name reminder, freeing the strip itself to drop the redundant "View:" prefix.

### 3.4 Breadcrumb micro-label

The breadcrumb is the **persistent reminder** that the user is still on the Materials & Output page. It updates as the active sub-tab changes, mirrors `app.materialsTab`, and lives in a new `.mh-breadcrumb` row that sits between the page selector and the pill strip. It is `aria-hidden="true"` because the same information is already exposed via the `<nav aria-label>` and the `aria-selected` pill state — the breadcrumb is a visual cue, not an a11y substitute.

---

## 4. Mobile Considerations (≤480 px)

- **Pill rail:** keep the current horizontal scroll + right-edge mask ([styles.css](styles.css#L3690-L3697)); reduce indent from 24 px back to 12 px on mobile so the rail can use full content width.
- **Breadcrumb:** truncate the leading "Materials & Output" segment to "Materials" below 480 px to keep the second segment visible without wrap.
- **Palette grid touch target:** swatches grow from current desktop sizing to a minimum 36 × 36 px hit area (still 24 × 24 visual swatch + 6 px outer hit padding) on viewports ≤480 px. Use `touch-action: manipulation` to suppress double-tap zoom on swatches.
- **Sub-tab strip height:** retain the existing 44 × 44 minimum touch target ([styles.css](styles.css#L3697)).
- **Empty-state padding:** drop from 32 px to 20 px vertical padding on mobile so the message is visible above the keyboard / fold.

---

## 5. Empty-state Copy & Icons

One shared `EmptyState` component lives at `creator/EmptyState.js` and renders:

```
<icon 32×32 in --text-tertiary>
<h4>Headline</h4>
<p>Body copy, one sentence, sentence case.</p>
[optional CTA button]
```

All copy uses British English and a single voice (informative, not jaunty).

| Sub-tab | Headline | Body | Icon | CTA |
|---|---|---|---|---|
| Threads | "No threads in this palette yet." | "Generate or import a pattern to populate the thread list." | `Icons.thread` | none |
| Stash status | "No stash data to compare against." | "Add threads to your stash from Manager → Stash to see coverage here." | `Icons.layers` | none |
| Shopping | "Your stash already covers every thread in this project." | "When you're short of a colour, the deficit will appear here." | `Icons.shoppingCart` (fallback `Icons.cart`) | none |
| Output | "Nothing to export yet." | "Generate a pattern from the Pattern page, then return here to export." | `Icons.download` | none |

**Forbidden:** no emojis, no `✓`/`›`/`✗` glyphs in copy. If a needed icon is missing, add it to [icons.js](icons.js) (24 × 24 viewBox, 1.6 stroke width, `currentColor`) before the PR that uses it.

---

## 6. Sequencing — 5 PRs (<200 LOC each)

### PR 1 — Shared EmptyState component (~120 LOC, S)

- New file `creator/EmptyState.js` exposing `window.CreatorEmptyState`.
- Add `.mh-empty` styles in [styles.css](styles.css) Materials Hub block.
- Migrate the Shopping empty branch ([creator/MaterialsHub.js](creator/MaterialsHub.js#L94-L99)) to the new component as the first consumer.
- Add `creator/EmptyState.js` to [build-creator-bundle.js](build-creator-bundle.js) source list and rebuild [creator/bundle.js](creator/bundle.js).

### PR 2 — Sub-tab pill restyle + breadcrumb (~150 LOC, M)

- CSS: tweak `.mh-subtabs-wrap` indent and accent border, restyle `.mh-subtab` resting/active states, add `.mh-breadcrumb` row.
- Markup: replace the "View:" label in [creator/MaterialsHub.js](creator/MaterialsHub.js#L250-L256) with the breadcrumb row using `Icons.pointing` between segments.
- Rebuild [creator/bundle.js](creator/bundle.js) and bump `CREATOR_CACHE_KEY` in [index.html](index.html) (per repo memory note).

### PR 3 — Palette grid mobile density (~80 LOC, S)

- CSS-only: add 36 × 36 minimum touch target, `touch-action: manipulation`, mobile spacing.
- Verify `.mh-body` overflow scrolling still works.

### PR 4 — Migrate remaining empty states (~140 LOC, M)

- Wire Threads empty branch in [creator/LegendTab.js](creator/LegendTab.js), Stash branch in [creator/PrepareTab.js](creator/PrepareTab.js), and Output branch in [creator/ExportTab.js](creator/ExportTab.js) to `CreatorEmptyState`.
- Rebuild bundle.

### PR 5 — Tests + a11y polish (~100 LOC, S)

- New `tests/materialsHubVisual.test.js` (DOM-string assertions, see §7).
- Snapshot update for [tests/icons.test.js](tests/icons.test.js) if any new icon was added.
- Add `:focus-visible` outlines to `.mh-subtab` and `.mh-empty button`.
- Verify with `npm test -- --runInBand`.

Total estimated LOC: ~590 across five PRs.

---

## 7. Tests Required

### Unit tests (Jest, follows existing extract-and-eval pattern)

- `tests/materialsHubVisual.test.js` — extract `SUBTABS` array from [creator/MaterialsHub.js](creator/MaterialsHub.js) via regex+eval, assert: (a) all four ids present, (b) each definition references an `Icons.*` function and not a string emoji, (c) labels match the breadcrumb second-segment expected values.
- `tests/emptyState.test.js` — extract the new component, render against a stub React, assert headline + body slots populate, assert no children of type `text` contain emoji codepoints (regex `/[\u{1F300}-\u{1FAFF}\u2700-\u27BF\u2300-\u23FF]/u`).
- Existing [tests/icons.test.js](tests/icons.test.js) snapshot — update with `--updateSnapshot` only if a new glyph is added (per repo memory).

### Visual snapshot

- Optional Playwright snapshot for the hub at desktop (1280) and mobile (375) widths under [tests/](tests/) — only if a Playwright fixture for the Creator already exists; otherwise defer (do not add a new harness in this ticket).

### Manual QA plan

- New `MATERIALS_HUB_VISUAL_TEST_PLAN.md` at repo root following the `*_TEST_PLAN.md` convention (per repo memory).

---

## 8. Accessibility

- **Focus visibility:** `:focus-visible` on every `.mh-subtab` and `.mh-empty button` uses a 2 px `--accent` outline with 2 px offset; never rely on the active-pill background as the focus indicator.
- **ARIA roles:** keep the existing `<nav role="tablist" aria-label="Materials sections">` ([creator/MaterialsHub.js](creator/MaterialsHub.js#L255-L257)); each pill stays `role="tab"` with `aria-selected`. The hub root keeps `role="tabpanel" aria-label="Materials and Output"`.
- **Breadcrumb:** marked `aria-hidden="true"` because the same info is already in `aria-label` and `aria-selected`; a screen-reader user gets it via the live tab name announcement, not a duplicate breadcrumb read-out.
- **Empty-state heading:** uses `<h4>` so it joins the existing in-page heading hierarchy under the Sidebar `<h2>` page title.
- **Reduced motion:** the 0.12 s transition on `.mh-subtab` already matches the Sidebar's animation budget; wrap any new animation in `@media (prefers-reduced-motion: reduce)` and disable.
- **Touch target:** mobile minimum 44 × 44 px on pills; 36 × 36 px on swatches (acceptable per WCAG 2.5.8 AAA target-size guidance for dense pickers when adjacent targets do not overlap).

---

## 9. Effort Estimate

| PR | Scope | Size | Day estimate |
|---|---|---|---|
| 1 | Shared EmptyState component + Shopping migration | S | 0.5 day |
| 2 | Sub-tab pill restyle + breadcrumb | M | 1 day |
| 3 | Palette grid mobile density | S | 0.5 day |
| 4 | Migrate Threads / Stash / Output empty states | M | 1 day |
| 5 | Tests + a11y polish | S | 0.5 day |
| **Total** | | **M** | **~3.5 days** |

Estimates assume one engineer familiar with the Creator bundle workflow (rebuild + cache-key bump) and access to a real mobile device for the touch-target verification in PR 3.

---

## 10. Open Questions

1. **Breadcrumb truncation behaviour below 480 px:** truncate first segment to "Materials" (proposed) or hide the first segment entirely and show only the active sub-tab name?
2. **Active-pill weight:** drop from 600 to 550 (proposed) or keep 600 and instead reduce the `--accent` saturation by ~15 % to soften the pill? Need a designer eyeball.
3. **Swatch hit target:** 36 × 36 minimum (proposed) vs 44 × 44 (WCAG AA target). 44 × 44 forces a single-column layout on narrow phones; need confirmation that 36 × 36 with non-overlapping targets is acceptable.
4. **Output empty-state CTA:** should it deep-link to the Pattern page (`app.setTab('pattern')`) or stay copy-only? The audit doesn't specify; defaulting to copy-only to keep the PR free of behaviour change, but worth flagging.
5. **`Icons.pointing` orientation:** the existing icon points right; confirm it renders correctly inside the breadcrumb at 12 px without re-tooling, or add a dedicated `Icons.chevronRight` (the current `Icons.chevronDown` / `chevronUp` set, per repo memory, doesn't include a sideways variant).

---

## 11. References

- [reports/ux-8-post-B-audit.md](reports/ux-8-post-B-audit.md#L74-L90) — original §3.2 finding and the C4 row in the action table at line 274.
- [reports/c3-plan-b2-default-on.md](reports/c3-plan-b2-default-on.md#L1-L20) — structural template this plan mirrors.
- [reports/c8-plan-first-stitch-coaching.md](reports/c8-plan-first-stitch-coaching.md) — sibling Quarter-C plan, same voice and PR-sizing convention.
- [creator/MaterialsHub.js](creator/MaterialsHub.js#L1-L270) — component under change.
- [creator/Sidebar.js](creator/Sidebar.js) — host that places the hub below the main page selector.
- [styles.css](styles.css#L3645-L3700) — Materials Hub style block (`.mh-*` selectors).
- [icons.js](icons.js#L37-L380) — `Icons.thread`, `Icons.layers`, `Icons.shoppingCart`, `Icons.cart`, `Icons.download`, `Icons.pointing`, `Icons.info`.
- [AGENTS.md](AGENTS.md) — house rule: no emojis in user-facing UI, use `window.Icons.{name}()`.
- [.github/copilot-instructions.md](.github/copilot-instructions.md) — Creator bundle rebuild workflow and `CREATOR_CACHE_KEY` guidance.
- [build-creator-bundle.js](build-creator-bundle.js) — source list to update when adding `creator/EmptyState.js`.
