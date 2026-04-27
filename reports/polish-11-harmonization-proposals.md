# Polish Pass 11 — Harmonisation Proposals

**Audit date:** 2026-04-27  
**Scope:** items from Polish 10 where a simple token-snap won't fix the underlying disharmony — they require a layout, interaction, or component-pattern change. Two solution sketches per item; pick one and proceed.

Wireframes referenced below would live under `reports/polish-wireframes/` (text descriptions provided here; ASCII sketches inline).

---

## P1. Empty-state component pattern (Polish 5, C4)

**Current:** 8 surfaces render bare blank space when their data is empty. There is one ad-hoc helper in [creator/MaterialsHub.js](creator/MaterialsHub.js#L150) (`emptyState()`) and one inline render in [home-app.js](home-app.js#L123). No shared component, no shared CSS class, no consistent visual.

**Why a token-snap doesn't fix it:** the issue is a missing component, not a value mismatch.

### Solution A — single shared component in `components.js`

Add `window.AppEmptyState({icon, headline, body, action})` to [components.js](components.js). Render:

```
┌──────────────────────────────────────────────┐
│                                              │
│              [icon 32px, muted]              │
│                                              │
│           Headline (text-lg, primary)        │
│           Short body (text-sm, secondary)    │
│           [ Optional action button ]         │
│                                              │
└──────────────────────────────────────────────┘
```

CSS: `min-height: 240px`, padding `var(--s-6) var(--s-4)`, centered flex column. Single class `.app-empty-state`. Each consumer passes its own copy + icon.

**Pros:** one place to change; consistent visual; consumes Workshop tokens.  
**Cons:** every empty surface needs its renderer updated.

### Solution B — CSS class only, leave consumers to write JSX

Define `.app-empty-state` in [styles.css](styles.css) with the layout above; document the markup pattern in [AGENTS.md](AGENTS.md). Consumers write the JSX themselves.

**Pros:** no new component file; minimal diff per consumer.  
**Cons:** drift returns within a year; consumers will skip the icon or the body.

**Recommendation:** **A**. Aligns with the existing `window.*` component pattern (`AppInfoPopover`, `Toast`, `Icons`).

---

## P2. Z-index scale (Polish 4, M5)

**Current:** 10 → 10000 with duplicates (Polish 4 inventory). No semantic system; new components copy-paste numbers.

### Solution A — CSS variable scale

Add to `:root` in [styles.css](styles.css):

```css
--z-base: 1; --z-sticky: 100; --z-dropdown: 400;
--z-fab: 450; --z-action-bar: 500; --z-backdrop: 900;
--z-modal: 1000; --z-toast: 1100; --z-coachmark: 1200;
```

Sweep all `z-index: <number>` to `var(--z-*)`. Keep numbers identical to current values where possible to minimise behavioural change; use the rename as the consolidation step.

**Pros:** minimal behavioural risk; semantic names; visible in DevTools.  
**Cons:** ~25 changes across [styles.css](styles.css).

### Solution B — flatten to 100-step scale

Round every value to the nearest hundred (10→100, 201→200, 500→500, 999→900, 10000→1200). Drop the variable layer.

**Pros:** simpler.  
**Cons:** still hardcoded; same drift risk.

**Recommendation:** **A**.

---

## P3. Right panel on tablet widths (Polish 4, H4)

**Current:** `.rpanel` is a fixed 280px sidebar at all widths ≥ mobile breakpoint, crushing the canvas to ~520px on an 800px tablet.

### Solution A — drawer-ise at < 1024px

Reuse the mobile bottom-sheet treatment (`.lpanel`-style) for the right panel on `(max-width: 1024px)`. The desktop sidebar dock applies only at `(min-width: 1024px)`. The hamburger / strip toggle in [creator/Sidebar.js](creator/Sidebar.js) opens it.

```
Desktop (≥1024px):                Tablet (<1024px):
┌─────────┬──────────┬──────┐    ┌──────────────────┐
│         │  canvas  │ rpan │    │      canvas      │
│ lpan    │          │ (280)│    │                  │
└─────────┴──────────┴──────┘    │                  │
                                  ├──────────────────┤
                                  │  [▲ Tools panel] │
                                  └──────────────────┘
```

**Pros:** consistent with the existing `.lpanel` mobile pattern; canvas gets full width.  
**Cons:** an extra click to access tools on iPad; needs a discoverable toggle.

### Solution B — collapse `.rpanel` to a 56px rail at 800–1023px

Show only icons in a vertical rail; click an icon expands the full 280px panel as an overlay over the canvas.

**Pros:** tools remain visible.  
**Cons:** new component pattern; more design work.

**Recommendation:** **A** for parity with mobile and minimal new design.

---

## P4. `confirm()` dialogs (Polish 8, H11)

**Current:** four `confirm()` calls with vague text ("Continue?"). Native dialog is jarring against the Workshop UI and the buttons are OS-controlled.

### Solution A — replace with the existing modal infrastructure

Use the `Overlay` system already in [components/Overlay.js](components/Overlay.js) and [modals.js](modals.js). Each call site renders a small confirm modal with named verbs ("Discard edits and regenerate" / "Cancel").

**Pros:** themed, accessible, consistent.  
**Cons:** synchronous → asynchronous refactor at each call site (must convert `if (confirm(...)) { ... }` to a promise).

### Solution B — keep `confirm()`, fix only the message text

Rewrite messages to name the object and consequence; leave the native dialog.

**Pros:** trivial.  
**Cons:** still inconsistent visual; no theme support.

**Recommendation:** **A**, but staged — start with the riskiest one ([creator/useProjectIO.js](creator/useProjectIO.js#L478) "reset stitching progress").

---

## P5. Long-press / touch context menu (Polish 7, C7)

**Current:** [creator/ContextMenu.js](creator/ContextMenu.js) listens on `pointerdown` (right-click only). Touch users cannot reach the canvas context actions (highlight, magnify).

### Solution A — long-press timer

In the canvas pointer handlers, start a 500ms timer on `pointerdown` and cancel on `pointermove` (>10px) or `pointerup` before timeout. Fire the existing context menu on timeout.

**Pros:** zero new UI; works on every touch device; small change.  
**Cons:** users may not discover it; conflicts with single-tap stitch action — needs careful debouncing.

### Solution B — persistent "tools" toolbar above canvas on touch

Promote the most-used context-menu actions to a small floating toolbar (Workshop chip style) anchored above the canvas at `(pointer: coarse)`. Long-press still works, but the toolbar provides discoverability.

**Pros:** discoverable; faster than long-press for common actions.  
**Cons:** more screen real estate consumed; new UI.

**Recommendation:** **A** as the immediate fix (closes the accessibility gap), **B** as a follow-up enhancement.

---

## P6. Sticky positioning conflicts (Polish 4, C2 / M19)

**Current:** Tracker info-strip uses `top: 100px` hardcoded; Creator `.rpanel` and nested `.rp-tabs` both `position: sticky`.

### Solution A — CSS custom property for header height

Define `--app-header-height` at `:root` (set to 48px for desktop, recalculated for mobile/notched devices via JS or `env()`-based CSS). All sticky offsets read it.

**Pros:** single source of truth; survives header changes.  
**Cons:** small JS sync needed if header height changes responsively.

### Solution B — pure CSS using `env(safe-area-inset-top)` math

Replace `top: 100px` with `top: calc(48px + env(safe-area-inset-top, 0))` everywhere.

**Pros:** no JS.  
**Cons:** assumes header height never changes; doesn't fix the nested-sticky issue.

**Recommendation:** **A** (survives future header tweaks).

---

## P7. Canvas safe-area padding (Polish 4, M15)

Already a small CSS-only fix — no harmonisation alternative needed. Use `padding-bottom: calc(56px + 56px + env(safe-area-inset-bottom, 0))` and remove the duplicated `height` declaration.

---

## P8. Modal systems split (Polish 4, M13)

**Current:** legacy `.modal-*` (in [styles.css](styles.css#L228)) and newer `.overlay-*` system coexist with subtly different padding (14×20 vs 16×20) and behaviour.

### Solution A — migrate legacy callers to `.overlay-*`

Convert remaining `.modal-overlay` users (a handful in [modals.js](modals.js)) to the newer `Overlay` API.

**Pros:** single system; consistent animation; consistent padding.  
**Cons:** modest refactor; risk of regressions.

### Solution B — delete one CSS variant; force both classes to share padding

Drop `.modal-header { padding: 14px 20px }` in favour of `.overlay-title`'s 16×20.

**Pros:** trivial.  
**Cons:** preserves the duplicate API.

**Recommendation:** **A** — cleaner final state; do as a follow-up after the main polish PRs.

---

## Phasing

1. Phase A (immediate, this PR): P1 (empty-state component), P2 (z-index scale), P6 (header-height var) plus all the Polish-10 quick wins.
2. Phase B (next PR, requires review): P3 (rpanel drawer-ise), P5 (long-press), P4 (confirm replacement, staged).
3. Phase C (future): P8 (modal system convergence), pinch-to-zoom, virtualisation.
