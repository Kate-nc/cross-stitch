# Mobile Implementation Plan

Source audits: [mobile-1-touch-targets](mobile-1-touch-targets.md), [mobile-2-layout](mobile-2-layout.md), [mobile-3-typography](mobile-3-typography.md), [mobile-4-navigation](mobile-4-navigation.md), [mobile-5-forms](mobile-5-forms.md), [mobile-6-performance](mobile-6-performance.md), [mobile-7-gestures](mobile-7-gestures.md), [mobile-8-a11y](mobile-8-a11y.md).

Mobile = ≤480px, tablet = 481–1024px, desktop = >1024px.

## Cross-cutting infrastructure

No new framework. The whole project is vanilla CSS in [styles.css](styles.css) with React (Babel-CDN) for components. Mobile-first additions all go into the single stylesheet, preferring new `@media (min-width:601px)` or `@media (min-width:1025px)` overrides where possible. New JS event-handler code uses pointer events (already used by the Creator canvas pipeline).

Two small shared additions land early:
- A `.icon-btn` / press-state utility block in styles.css.
- A `@media (max-width:480px)` typography + touch-target floor block.

## Work units (in execution order)

| # | Title | Scope | Reports addressed |
|---|---|---|---|
| WU-1 | Pointer-event parity for crop / lasso / palette / header dropdowns | M | gestures #1, #2, #3, #5 |
| WU-2 | Hover-only menus → click + `:focus-within` | S | layout #7, #8; nav #3 |
| WU-3 | Clamp `ContextMenu` to viewport | S | layout #1 |
| WU-4 | Toast width math + safe area | S | layout #4 |
| WU-5 | Command-palette mobile widths + focus outline | S | layout #5, a11y #12 |
| WU-6 | Mobile-first responsive grid foundations | M | layout #2, #3, #13, #14 |
| WU-7 | Stack `SplitPane` + scroll Creator tab strip on mobile | M | layout #6, nav #4 |
| WU-8 | Mobile typography + 44×44 touch-target floor | M | touch-targets #1–4,#6,#9,#10; typography #1,#2,#4,#5,#11 |
| WU-9 | Form input attributes pass (inputMode / step / maxLength / enterkeyhint / autocomplete) | S | forms #1,#2,#4,#5,#6 |
| WU-10 | Replace blocking `alert()` with inline errors | M | forms #3 |
| WU-11 | `:active` press states + skip-to-content link | S | gestures #4, a11y #6 |
| WU-12 | Aria-label pass on icon-only buttons | M | a11y #2, #3, #4, #7, #8, #9 |
| WU-13 | Landscape modal max-height + autocomplete bounding | S | a11y #5, forms #8, forms #11 |
| WU-14 | Animate `transform` instead of layout properties | S | perf #3 |
| WU-15 | Passive listener flags on non-`preventDefault` handlers | S | perf #8 |
| WU-16 | Long-press → context menu (Creator) | M | gestures #7 |
| WU-17 | Truncation: title tooltip + mobile 2-line clamp | S | typography #3, #10 |
| WU-18 | Hardware-back closes top modal | M | nav #1 |

## NEEDS-DECISION (skipped during automated execution)

- **Hamburger drawer for top nav (nav #2)** — the current 3-tab strip fits at ≥360px once typography sizing is fixed; replacing it with a drawer is a UX direction question (left vs bottom, persistent vs modal). Defer until after WU-8 is shipped and re-measured.
- **Preferences modal mobile collapse (nav #5)** — wizard-style vs horizontally-scrolled chip strip. Both impact desktop affordance.
- **Swipe-to-delete & swipe-to-dismiss (gestures #8, #9)** — non-trivial gesture conflicts with internal scrolling, requires undo affordance design.
- **Babel pre-transpile + JS bundle splitting (perf #1, #2)** — adds a build step; affects every script tag and the SW; should be done as its own initiative.
- **Service Worker: lazy-load Babel + PDF (perf #4)** — needs a migration story for installed PWAs that already have v3 cache.
- **Sidebar / PreviewCanvas conditional render (perf #5)** — risk of losing in-progress canvas state when the panel unmounts.
- **Hover-only swatch tooltip touch fallback design (layout #7)** — covered partly by WU-2 (`:focus-within`), but a tap-to-show popover variant is a UX decision.

## Validation requirements (every WU)

- Test viewports: 320, 375, 428, 768, 1024, 1280px.
- No horizontal page overflow at any width.
- All changed interactive elements ≥ 44×44px tap area on `(pointer:coarse)`.
- `npm test -- --runInBand` passes.
- Rebuild creator bundle (`node build-creator-bundle.js`) when any `creator/*.js` changes.
- Commit per WU, message format `responsive: <change> (mobile-<n> #<id>...)`.
