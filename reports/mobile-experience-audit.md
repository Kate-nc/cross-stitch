# Mobile experience audit — clunky / overlapping / freezing

**Date:** 2026-08-28 · **Branch:** `main` @ `2b34ae0` (v1.0.54)
**Scope:** all five entry pages (`home`, `manager`, `stitch`, `create`, `index`)
plus the tracker chart under realistic pattern sizes.

**Method.** Instrumented Playwright runs on an emulated Pixel 5 (393 × 851 CSS px,
`pointer: coarse`) with **4× CPU throttling** to approximate a mid-range phone.
Captured per page: `PerformanceObserver` long-tasks, total blocking time,
resource weight, DOM node count, layout-viewport vs. initial-containing-block
width, pairwise overlap of every `fixed`/`sticky` box, `elementFromPoint`
hit-testing of every control, touch-target sizes, and canvas backing-store
dimensions. The tracker was additionally loaded with generated 100 × 100 and
200 × 250 fixtures. Numbers below are measured, not estimated.

---

## Executive summary

Three independent root causes account for nearly all of the reported symptoms:

| # | Root cause | Symptom it produces |
| --- | --- | --- |
| **A** | Chart canvases are allocated at **full pattern size × zoom**, with no dimension cap | Freezing, blank chart, tab crashes on iOS |
| **B** | `.mgr-filter-bar` overflows horizontally, expanding the layout viewport to **1052 px on a 393 px screen** | Overlap, sideways drift, `position: fixed` landing 1900 px down the page |
| **C** | ~0.9–2.2 MB of **render-blocking, unminified JS** on every page + 14 k-node manager DOM | Slow, unresponsive start-up; 1.2 s blocking on manager |

Everything else is polish on top of these.

### Measured baseline (Pixel 5, 4× CPU throttle)

| Page | Wall load | Long tasks | Total blocking | Blocking JS | DOM nodes |
| --- | ---: | ---: | ---: | ---: | ---: |
| `home.html` | 887 ms | 3 | 148 ms | 897 KB | 130 |
| `manager.html` | 2 028 ms | 17 | **1 192 ms** | 1 041 KB | **14 341** |
| `stitch.html` | 1 548 ms | 4 | 369 ms | 1 141 KB | 191 |
| `create.html` | 1 654 ms | 4 | 315 ms | **2 190 KB** | 205 |
| `stitch.html` + 100 × 100 pattern | 6 039 ms to usable | 18 | 2 021 ms | — | 469 |
| `stitch.html` + 200 × 250 pattern | **8 328 ms to usable** | 33 | **6 530 ms** | — | 719 |

Google's "good" threshold for total blocking time is 200 ms. The manager is 6×
over; opening a realistic pattern in the tracker is **32×** over.

---

## A. Canvas allocation — the freeze

### A1. CRITICAL — chart canvases exceed the iOS canvas limit on ordinary patterns

The chart and every overlay size their backing store to the *entire pattern at
the current zoom*:

- [tracker-app.js:4013](../tracker-app.js#L4013) — `canvas.width=sW*scs+G+2; canvas.height=sH*scs+G+2;`
- Same pattern repeated at [4078](../tracker-app.js#L4078), [4124](../tracker-app.js#L4124),
  [4154](../tracker-app.js#L4154), [4203](../tracker-app.js#L4203), [4234](../tracker-app.js#L4234).
- `scs = max(2, round(20 * stitchZoom))` — [useCanvasOverlays.js:131](../useCanvasOverlays.js#L131).
  At the default zoom of 1, **`scs` is 20**, so each canvas is ~20 px per stitch.

Measured backing stores at default zoom:

| Pattern | Canvas | Megapixels | Memory (4 B/px) |
| --- | --- | ---: | ---: |
| 100 × 100 | 2030 × 2030 | 4.1 | 16 MB |
| 200 × 250 | **4030 × 5030** | **20.3** | **81 MB** |
| 300 × 400 (extrapolated) | 6030 × 8030 | 48.4 | 194 MB |

The measured 200 × 250 run allocated **two** canvases at 4030 × 5030 —
**40.6 Mpx / 162 MB** — before any optional overlay was switched on.

Why this is the freeze:

- **iOS Safari caps a single canvas at 16 777 216 px² (≈ 4096 × 4096).** A
  200 × 250 pattern is 20.3 Mpx — over the limit. Safari does not throw; the
  canvas silently renders **blank or white**, and Safari's total-canvas-memory
  ceiling then starts discarding backing stores, which is what a "freeze
  followed by a blank chart" looks like.
- Any dimension over 4096 px also exceeds `MAX_TEXTURE_SIZE` on many mobile
  GPUs, forcing a software-rendering fallback for the whole compositing layer.
- Up to **six overlay canvases** stack on the same geometry
  ([tracker-app.js:6008–6016](../tracker-app.js#L6008-L6016)) — thread-usage,
  recommendations, breadcrumbs, focus, counting aids. Each is conditionally
  mounted, so enabling three features on a 200 × 250 pattern asks the phone for
  ~320 MB of canvas.
- There is no cap anywhere on this path. The only `MAX_DIM` guard in the file is
  in the unrelated preview modal ([tracker-app.js:32](../tracker-app.js#L32)).

**Fix (no functional change).** Render the chart into a **viewport-sized tile**
instead of a pattern-sized surface. The draw call already accepts a viewport
rectangle — [tracker-app.js:4026](../tracker-app.js#L4026) passes `viewportRect`
to `drawStitch` — so the machinery exists; what changes is the canvas geometry
and the translate applied before drawing:

1. Size each canvas to `min(needW, clientWidth + 2 × overscan)` ×
   `min(needH, clientHeight + 2 × overscan)`, capped hard at 4096 px per side
   and ~16 Mpx total.
2. Keep the canvas absolutely positioned inside the existing scroller and
   translate its origin to the current scroll offset, redrawing on scroll
   (a `rAF`-throttled scroll handler) rather than pre-rendering everything.
3. As a smaller, strictly-additive interim guard: clamp `scs` so that
   `sW*scs ≤ 4096 && sH*scs ≤ 4096 && sW*scs*sH*scs ≤ 16e6`, and surface the
   clamp as a zoom ceiling. This costs some maximum zoom on huge patterns but
   turns a blank/frozen chart into a working one today.

Item 3 is a ~20-line change and worth shipping first; items 1–2 are the real fix.

### A2. MEDIUM — a 10 Hz React re-render in outline-highlight mode

> **Corrected after implementation.** This entry originally claimed the
> *full-size* canvas was redrawn 10 × per second. That is wrong:
> `renderStitch` passes a `viewportRect` to `drawStitch`
> ([tracker-app.js:4026](../tracker-app.js#L4026)) and the draw loops are
> bounded by it, so each tick repaints only the visible slice, not 20 Mpx.
> Severity downgraded from HIGH to MEDIUM accordingly.

[tracker-app.js:4403–4409](../tracker-app.js#L4403-L4409) starts a
`setInterval(… , 100)` that calls `setAntsOffset` — a React state update — while
`stitchView === "highlight" && focusColour && highlightMode === "outline"`.
`antsOffset` is in the dependency array of the main chart draw effect
([tracker-app.js:4027](../tracker-app.js#L4027)), so ten times a second the
whole (very large) tracker component re-renders and the visible slice of the
chart is repainted. Cheap enough on a desktop; a meaningful share of a phone's
frame budget, and it continues while the tab is in the background.

**Fix.** Ideally the outline moves to its own overlay canvas driven from a ref,
but the ants are drawn *inside* `drawStitch` on the chart canvas
([tracker-app.js:3934–3955](../tracker-app.js#L3934-L3955)), so extracting them
is a real refactor rather than a quick win. The low-risk change is to stop the
timer when it cannot be seen: skip it under `prefers-reduced-motion` and
suspend it on `visibilitychange`.

### A3. HIGH — an unconditional `requestAnimationFrame` loop that never stops

[tracker-app.js:4140–4141](../tracker-app.js#L4140-L4141):

```js
const loop=()=>{draw();recPulseRef.current=requestAnimationFrame(loop);};
loop();
```

`draw()` returns early when there are no recommendations, but **the loop keeps
scheduling itself at 60 fps regardless**, for the whole lifetime of the effect.
The effect's dependency array includes `scs`, `analysisResult` and
`recommendations`, so it is torn down and restarted on every zoom change — but
between those it runs continuously, whether or not the pulse is visible, and
whether or not the tab is in the foreground.

**Fix.** Return early *before* starting the loop when
`!recEnabled || !recommendations?.top?.length`, and stop the loop on
`visibilitychange`. Purely additive guards; the animation is unchanged when it
is actually needed.

### A4. MEDIUM — chart panning is entirely main-thread

The chart canvas sets `touchAction: "none"`
([tracker-app.js:5981](../tracker-app.js#L5981)) and registers non-passive
`touchstart` / `touchmove` / `touchend`
([tracker-app.js:5225–5227](../tracker-app.js#L5225-L5227)), so the compositor
never scrolls `.canvas-area` — every pan frame is a JS handler writing
`scrollLeft`/`scrollTop`. Combined with A1 (a 20 Mpx layer to move) this is
exactly the "clunky drag" symptom.

**Fix.** `touch-action: none` is correct while a marking gesture is in progress,
but not at rest. Set `touch-action: pan-x pan-y` by default and switch to `none`
only once the handler has decided the gesture is a mark/drag-mark (or gate on
the current tool mode — `Nav` mode should always allow native panning). That
hands one-finger panning back to the compositor without changing what marking
does.

### A5. LOW — canvases ignore `devicePixelRatio`

No file in the app reads `devicePixelRatio`. Chart canvases are therefore
rendered at 1 CSS px per device-independent pixel and upscaled by the browser —
visibly soft symbols and grid lines on every phone (DPR 2–3). This is *also* the
only reason A1 is not already three times worse, so it must be fixed **after**
the tiling work in A1, not before.

---

## B. Layout — the overlap

### B1. CRITICAL — the manager overflows horizontally and breaks `position: fixed`

Measured on `manager.html` at 393 px:

```
document.documentElement.clientWidth   393    ← the real viewport
window.innerWidth                     1052    ← layout viewport, expanded
document.documentElement.scrollWidth  1052
```

The origin is `.mgr-filter-bar` ([styles.css:2693](../styles.css#L2693)):

```css
.mgr-filter-bar{ … display:flex; align-items:center; gap:8px; flex-shrink:0; }
```

It is a single non-wrapping flex row containing a search input, ten
`white-space: nowrap` filter chips, a "Sort:" label, a `<select>` and a
"+ Bulk Add" button. Their intrinsic widths total **1052 px**. Nothing wraps,
nothing scrolls, `overflow` is `visible` — so the row pushes the document to
1052 px wide.

Consequences, all measured:

- The whole page pans sideways; two thirds of the filter bar is off-screen.
- `position: fixed` resolves against the **expanded layout viewport**, so
  `.mgr-rpanel` — declared `position:fixed; bottom:0` — was measured at
  **top 1903 px** instead of pinned to the bottom of the screen. That is the
  "parts of the interface overlap / appear in the wrong place" report.

**Fix.** Two lines, no behaviour change:

```css
.mgr-filter-bar{ flex-wrap: wrap; }              /* or, to keep one row: */
@media (max-width: 899px){
  .mgr-filter-bar{ overflow-x: auto; flex-wrap: nowrap;
                   scrollbar-width: none; -webkit-overflow-scrolling: touch; }
  .mgr-filter-bar > *{ flex-shrink: 0; }
}
```

Add a cheap regression guard: assert `documentElement.scrollWidth <=
documentElement.clientWidth + 1` on every page in the touch e2e suite. That
catches the whole class of bug, not just this instance.

### B2. HIGH — the mobile `.mgr-rpanel` drawer rule is overridden by the desktop base rule

- Mobile drawer rule: [styles.css:2126](../styles.css#L2126), inside
  `@media (pointer: coarse), (max-width: 899px)` — sets `width:100%`,
  `border-left:none`, `border-radius:16px 16px 0 0`.
- Base desktop rule: [styles.css:2706](../styles.css#L2706) — `width:280px;
  border-left:1px solid var(--border);`

Both are specificity `(0,1,0)`, and **the base rule is declared 580 lines
later**, so it wins. Measured computed style on the phone: `position: fixed`
(from the mobile rule) but `width: 280px` (from the base rule). The manager's
bottom drawer renders as a 280 px-wide stub in the corner instead of a
full-width sheet.

**Fix.** Move the base `.mgr-rpanel` declaration above the mobile media block
(the `.rpanel` equivalent at [styles.css:530](../styles.css#L530) is already
ordered correctly — this is the odd one out). Do **not** reach for
`!important`; the ordering fix is the correct one and matches how `.rpanel`
already works.

### B3. HIGH — the topbar overflows and clips its own controls on `create` / `stitch`

At 393 px the topbar's contents extend to **638 px**, but
[styles.css:750](../styles.css#L750) applies `.tb-topbar{overflow:hidden}` below
600 px. The overflow is hidden rather than fixed, so the clipped controls are
simply **unreachable** — the "File" page-menu button
(`.tb-page-btn`, measured `right: 638`) is entirely off-screen on
`create.html`, with no scroll and no overflow menu to reach it.

The nav links that survive are `24 × 44` — half the 44 px minimum on the
horizontal axis ([styles.css:489](../styles.css#L489), `padding:4px 6px`).

**Fix.** The topbar already has an overflow-menu component
(`.tb-overflow-menu`). Route the page-menu button and the nav links into it
below 600 px rather than clipping, and give `.tb-nav-link` `min-width:44px`
inside the existing `@media (pointer: coarse)` block at
[styles.css:2099](../styles.css#L2099) where the other controls are already
bumped to 44 px. This is the pattern the file already uses — it was just not
applied to these three buttons.

### B4. MEDIUM — the topbar ignores the top safe-area inset under `viewport-fit=cover`

Every page ships `viewport-fit=cover`, and `body` picks up the left/right insets
([styles.css:154](../styles.css#L154)) — but **not the top inset**.
`.tb-topbar` is `position:sticky; top:0; height:48px`
([styles.css:475](../styles.css#L475)) with no top padding, so on a notched
iPhone the logo and nav row sit under the status bar.

Compounding it, the sticky offset for the info strip is:

```css
top: calc(var(--app-header-height, 48px) + env(safe-area-inset-top, 52px));
```
[styles.css:2622](../styles.css#L2622), [2626](../styles.css#L2626)

The `52px` is a **fallback, not a floor** — it only applies when `env()` is
unsupported. On any modern browser reporting a 0 top inset the strip sticks at
48 px (correct); on a notched iPhone it sticks at ~95 px while the header still
occupies only 48 px, leaving a 47 px band through which content scrolls behind
nothing. The two values disagree in both directions.

**Fix.** Add `padding-top: env(safe-area-inset-top, 0px)` and
`height: calc(48px + env(safe-area-inset-top, 0px))` to `.tb-topbar`, then make
the strip offset simply `top: var(--app-header-height)` and set
`--app-header-height: calc(48px + env(safe-area-inset-top, 0px))` in a
`@supports (padding: max(0px))` block. One source of truth, which is what the
token comment at [styles.css:84](../styles.css#L84) already intends.

### B5. MEDIUM — `--app-header-height` is a static token that no longer matches reality

`--app-header-height: 48px` ([styles.css:88](../styles.css#L88)) is declared once
and never updated, yet it is the anchor for sticky offsets. Any page where the
header is taller (immersive mode transforms it, B4 makes it taller on notched
devices) silently mis-positions everything stickied below it.

**Fix.** Write the measured header height to the custom property from
`header.js` via a `ResizeObserver` (`document.documentElement.style
.setProperty('--app-header-height', h + 'px')`). Cheap, and it makes the token
honest.

### B6. LOW — inconsistent breakpoints across the stylesheet

The file mixes `599/600`, `399/400`, `359`, `480`, `720`, `899/900` and `1024`,
sometimes in `(pointer: coarse), (max-width: …)` unions and sometimes in
`(pointer: coarse) and (max-width: …)` intersections. Notably
`(max-width: 599px), (pointer: coarse)` at [styles.css:2288](../styles.css#L2288)
turns on the phone dock/mode-pill for *every* touch device, and a separate
`@media (min-width: 600px)` block at [styles.css:3055](../styles.css#L3055)
turns them back off for tablets — but the `!important` canvas padding from the
first block ([styles.css:2349](../styles.css#L2349)) is *not* undone, leaving
132 px of dead space at the bottom of the chart on every tablet.

**Fix.** Define three named breakpoints (phone ≤ 599, tablet 600–1023,
desktop ≥ 1024) as a documented convention and normalise. Immediately: move the
`.canvas-area` padding override into the same union as the elements it
compensates for.

---

## C. Start-up weight — the clunk

### C1. HIGH — every page ships ~0.9–2.2 MB of render-blocking, unminified JS

Every `<script>` in the five HTML pages is a plain, parser-blocking tag; only
four (`help-drawer`, `onboarding-wizard`, `command-palette`,
`preferences-modal`) carry `defer`.

| Page | Blocking JS | Deferred | Files |
| --- | ---: | ---: | ---: |
| `home.html` | 897 KB | 209 KB | 34 |
| `manager.html` | 1 041 KB | 209 KB | 42 |
| `stitch.html` | 1 141 KB | 209 KB | 50 |
| `create.html` / `index.html` | **2 190 KB** | 420 KB | 61 |

Plus a **267 KB** stylesheet on every page. None of it is minified; there is no
bundler in the build (`npm run build` only concatenates the creator bundle).

Much of this is loaded unconditionally but used rarely:
`sync-engine.js` (186 KB), `modals.js` (118 KB), `backup-restore.js` (22 KB) and
`stash-bridge.js` (61 KB) block first paint on `home.html`, where none of them is
needed until the user acts.

**Fix, in increasing order of effort — all behaviour-preserving:**

1. **Add `defer` to every local `<script>`.** They already rely on
   `DOMContentLoaded`-ordered globals and execute in document order, which
   `defer` preserves exactly. This alone removes parser blocking. *(Verify: the
   inline bootstraps such as `window.loadCreatorMain()` at
   [index.html:245](../index.html#L245) must become `defer`red external files or
   move into a `DOMContentLoaded` handler, since a `defer`red script no longer
   runs before a later inline script.)*
2. **Minify on build.** A `terser` pass over the local JS and a `lightningcss`
   pass over `styles.css` should remove 55–65 % of the bytes with zero source
   changes. Wire it into the existing `npm run build`.
3. **Lazy-load the heavy, situational modules.** `sync-engine.js`,
   `backup-restore.js` and `modals.js` behind the existing
   `runtime-loaders.js` mechanism — the app already does this for
   `creator-main` and `stats-page`, so the pattern is established.
4. **Split `styles.css`.** 267 KB of CSS is parsed on every page but each page
   uses a fraction of it. At minimum, move the creator-only and stats-only
   blocks into separate sheets loaded per page.

### C2. HIGH — the manager builds a 14 341-node DOM up front

Measured on `manager.html`: **14 341 DOM nodes**, of which 4 892 are `.seg`
gauge segments and 1 223 each of `.tcard`/`.sw`/`.info`/`.tid`/`.tnm`/`.owned`/
`.gauge`. This produces the worst blocking time of any page (**1 192 ms**) and
the longest single task (411 ms).

`content-visibility: auto` is already applied to `.tcard`
([styles.css:2713](../styles.css#L2713)), which correctly skips *layout and
paint* for off-screen cards — but it does not avoid DOM construction, React
reconciliation on every keystroke in the filter box, or the memory cost.

**Fix.** Windowing is the real answer, but a much cheaper first step preserves
behaviour exactly: render the gauge as a single element with a CSS
`repeating-linear-gradient` (or one inline SVG) instead of 4 segment `<div>`s
per card. That removes ~4 900 nodes — a third of the DOM — with no visual
change. Follow with `React.memo` on `.tcard` so filter keystrokes don't
reconcile 1 223 subtrees.

### C3. MEDIUM — global `transition: all` on every input, select and button

[styles.css:157–160](../styles.css#L157-L160):

```css
input[type=range]{ … transition: all 0.2s ease;}
input[type=checkbox]{ … transition: all 0.2s ease;}
input, select { transition: all 0.2s ease; }
button{font-family:inherit; transition: all 0.2s ease;}
```

`transition: all` makes the browser track **every** animatable property —
including layout-affecting ones like `width`, `height` and `padding` — on every
style recalculation, for every control on the page. It is repeated on
`.tcard` and `.pcard`, which on the manager means ~1 250 cards each
transitioning `all` on top of the global input/button rules.

> **Corrected after implementation.** The original text said "6 100+ elements",
> counting the 4 892 `.seg` gauge segments. Those are
> `.tcard .gauge .seg` ([styles.css:2799](../styles.css#L2799)) and carry **no**
> transition. The `transition: all` on `.seg` is on `.gauge-lg .seg`
> ([styles.css:2805](../styles.css#L2805)), a much rarer detail-panel element.

**Fix.** Replace with explicit property lists —
`transition: background-color .2s ease, border-color .2s ease, color .2s ease`.
Same perceived animation, a fraction of the recalc cost.

### C4. MEDIUM — `:hover` styling sticks after tap on touch devices

[styles.css:161–162](../styles.css#L161-L162):

```css
button:hover { filter: brightness(0.97); transform: translateY(0); }
button:active { filter: brightness(0.94); transform: translateY(0); }
```

On touch browsers `:hover` latches on after a tap and stays until the user taps
elsewhere, so buttons remain visibly dimmed — a classic source of "the UI feels
wrong/stuck". `filter` additionally promotes each hovered button to its own
compositing layer.

**Fix.** Wrap hover styling in `@media (hover: hover) and (pointer: fine)`. The
stylesheet already uses `@media (pointer: coarse)` extensively, so the idiom is
in place. Note this also affects `.tcard:hover`, `.tb-btn:hover`,
`.tb-drop-item:hover` and the ~40 other hover rules.

---

## D. Touch ergonomics

### D1. MEDIUM — iOS zooms the page whenever a form field is focused

Every measured page has inputs below the 16 px threshold at which iOS Safari
auto-zooms on focus, then leaves the page zoomed:

- `manager.html` — search input and sort `<select>` at **12 px**
  ([styles.css:2694](../styles.css#L2694))
- `create.html`, `stitch.html` — file inputs at **13.3 px**
- Toolbar name-edit fields at **11–12 px**
  ([styles.css:770](../styles.css#L770), [786](../styles.css#L786))

**Fix.** `font-size: 16px` for these controls under
`@media (pointer: coarse)`. Where 16 px would break a dense layout, the standard
workaround is `font-size: 16px; transform: scale(0.75); transform-origin: left`,
but simply allowing the field to be 16 px on phones is better here — none of
these bars is width-constrained once B1/B3 are fixed.

### D2. MEDIUM — sub-44 px touch targets throughout

Measured counts of controls under 40 px in either dimension, above the fold:
`home` 4, `create` 7, `stitch` 7, `manager` **15**, tracker with a pattern
open **20**.

Representative offenders: `.tb-nav-link` **24 × 44**; `.mgr-chip` **27 px tall**
([styles.css:2696](../styles.css#L2696)); `.ppal-utility-chip` **57 × 22**;
`.ppal-more-close` **21 × 21**; `.ppal-more-tab` **60 × 33**;
"+ Bulk Add" **87 × 28**.

The `@media (pointer: coarse)` block at
[styles.css:2096](../styles.css#L2096) already bumps a dozen classes to 44 px —
these were simply never added.

**Fix.** Extend that existing block. Prefer padding over `min-height` where a
taller box would disturb the row, and use a transparent `::after` overlay to
enlarge the hit area without changing the visual size:

```css
@media (pointer: coarse){
  .mgr-chip, .ppal-utility-chip, .ppal-more-tab { min-height:44px; }
  .tb-nav-link { min-width:44px; min-height:44px; }
  .ppal-more-close::after{ content:''; position:absolute; inset:-12px; }
}
```

### D3. MEDIUM — long-press on the chart triggers the iOS callout menu

The stylesheet contains **zero** `-webkit-touch-callout` declarations, and
neither the chart canvas nor `.canvas-area` sets `user-select: none`. On iOS a
long press on the chart raises the "Save Image / Copy" sheet, and a drag-mark
gesture starts a text selection — directly in the way of the tracker's primary
interaction.

**Fix.**

```css
.canvas-area, .canvas-area canvas{
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
```

### D4. LOW — text below 12 px in the chrome

The toolbar and manager use 10–11 px extensively
(`.tb-btn` 11 px, `.tb-zoom-lbl` 11 px, `.mgr-chip` 11 px,
`.tcard .tnm` 11 px, `.cqd-pct` 9 px, `.stash-badge` 10 px). Measured 2–3
elements per page rendering below 12 px above the fold.

**Fix.** A `@media (pointer: coarse)` floor of 12–13 px on the chrome text
tokens. Low risk once B1 and B3 have removed the width pressure that presumably
motivated the small sizes.

---

## E. Prioritised fix plan

Ordered by *user-visible improvement per unit of risk*. Items 1–5 are all
small, local and behaviour-preserving.

| # | Fix | Files | Risk | Fixes |
| --- | --- | --- | --- | --- |
| 1 | Clamp `scs` so canvases stay ≤ 4096 px/side and ≤ 16 Mpx | `useCanvasOverlays.js`, `tracker-app.js` | Low | A1 (freeze / blank chart) |
| 2 | `flex-wrap` / `overflow-x` on `.mgr-filter-bar` | `styles.css` | Very low | B1 (overlap, sideways drift, broken `fixed`) |
| 3 | Move base `.mgr-rpanel` rule above the mobile media block | `styles.css` | Very low | B2 |
| 4 | Guard the `recOverlay` rAF loop; move marching ants off React state | `tracker-app.js` | Low | A2, A3 (continuous jank, battery) |
| 5 | Wrap hover rules in `@media (hover: hover)`; drop `transition: all` | `styles.css` | Very low | C3, C4 |
| 6 | `defer` all local scripts + minify in `npm run build` | 5 × HTML, build scripts | Low–Med | C1 (start-up) |
| 7 | Topbar overflow menu instead of `overflow:hidden`; 44 px nav links | `header.js`, `styles.css` | Low | B3 (unreachable controls) |
| 8 | Safe-area-aware header + dynamic `--app-header-height` | `styles.css`, `header.js` | Low | B4, B5 |
| 9 | 16 px form fields, 44 px targets, `touch-callout: none` | `styles.css` | Very low | D1, D2, D3 |
| 10 | Gauge as one gradient element; `React.memo` on `.tcard` | `manager-app.js`, `styles.css` | Medium | C2 (manager blocking) |
| 11 | Viewport-tiled chart rendering | `tracker-app.js`, `useCanvasOverlays.js` | **High** | A1 properly, A4, enables A5 |
| 12 | `touch-action: pan-x pan-y` at rest on the chart | `tracker-app.js` | Medium | A4 (clunky panning) |
| 13 | Lazy-load `sync-engine` / `modals` / `backup-restore`; split CSS | HTML, `runtime-loaders.js` | Medium | C1 |
| 14 | Normalise breakpoints; fix the tablet `.canvas-area` padding | `styles.css` | Low | B6 |
| 15 | DPR-aware canvases (**after** 11) | `tracker-app.js` | Medium | A5 (blurry chart) |

**Suggested first pass (1–5).** Roughly a day's work, all low-risk, and it
addresses the freeze, the overlap and the continuous jank — i.e. all three
reported symptoms.

### Regression guards worth adding alongside

The existing `tests/e2e` touch suite and `tests/perf` harness are the natural
home for these:

- Assert `documentElement.scrollWidth <= clientWidth + 1` on every page at
  393 px — catches the whole B1 class of bug.
- Assert every canvas satisfies `width <= 4096 && height <= 4096 &&
  width*height <= 16e6` after loading a 300 × 400 fixture.
- Assert total blocking time under a budget (say 600 ms at 4× throttle) for
  `manager.html` and for tracker-open.
- Assert no `fixed`/`sticky` pair overlaps, and that
  `elementFromPoint` at each control's centre returns that control.

The instrumented Playwright harness used for this audit implements all four and
can be contributed as `tests/mobile-audit/` on request.

---

## Appendix — what was checked and found healthy

- **Viewport meta.** All five pages use
  `width=device-width, initial-scale=1.0, viewport-fit=cover`. No
  `user-scalable=no`, no `maximum-scale` — pinch-zoom is correctly preserved.
- **Touch listener passivity.** The non-passive `touchstart`/`touchmove`/
  `wheel` listeners ([tracker-app.js:5199](../tracker-app.js#L5199),
  [5225–5227](../tracker-app.js#L5225-L5227)) are on the chart canvas, where
  `preventDefault` is genuinely required. Scroll listeners elsewhere are
  correctly `{passive:true}` ([tracker-app.js:668](../tracker-app.js#L668),
  [creator/SplitPane.js:130](../creator/SplitPane.js#L130)).
- **`overscroll-behavior: none`** is set on `body`
  ([styles.css:151](../styles.css#L151)), correctly suppressing
  pull-to-refresh over the chart.
- **`100vh`.** Only 7 uses remain against 15 uses of `dvh`/`svh`/`lvh`, and the
  remaining ones are inside `@media (min-width: 900px)` or the desktop preview
  modal — the mobile URL-bar resize problem is largely already handled.
- **Reduced motion.** 21 `prefers-reduced-motion` blocks, including one
  covering the mobile drawers and immersive-toolbar transitions
  ([styles.css:6370](../styles.css#L6370)).
- **No horizontal overflow** on `home.html` (measured `scrollWidth == clientWidth
  == 393`). The home screen is the healthiest surface in the app.
- **Babel Standalone is not shipped to the browser** — JSX is pre-compiled into
  `compiled/`. (A common cause of exactly these symptoms; ruled out.)

---

## F. Implementation record — first pass (items 1–5)

Branch `fix/mobile-perf-quick-wins`. Items 1–5 of §E are implemented and
verified; items 6–15 are untouched.

### What changed

| Item | Change | Files |
| --- | --- | --- |
| 1 | Device-aware canvas ceiling exposed as a zoom ceiling | [useCanvasOverlays.js](../useCanvasOverlays.js), [tracker-app.js](../tracker-app.js) |
| 2 | `.mgr-filter-bar` scrolls inside its own box instead of pushing the document wide | [styles.css](../styles.css) |
| 3 | `.mgr-rpanel` base rule moved above the mobile drawer media block | [styles.css](../styles.css) |
| 4 | Recommendation-pulse rAF loop guarded; marching-ants timer gated on visibility + reduced motion | [tracker-app.js](../tracker-app.js) |
| 5 | `transition: all` → explicit lists (`--transition-ui`); `button:hover` behind `@media (hover: hover)` | [styles.css](../styles.css) |

**On item 1.** The limit is *probed*, not hardcoded, so desktop keeps its
current zoom range. Three 1-px-tall canvases (<64 KB) establish the side limit;
the area budget is chosen from `navigator.deviceMemory`, with a coarse-pointer
arm for iOS (which reports no `deviceMemory`). Budgets are 16.7 Mpx (iOS /
≤1 GB), 33.5 Mpx (≤4 GB), 134 Mpx (desktop). The desktop figure is half
Chrome's 268 Mpx hard limit because the tracker mounts the chart *plus* at
least one full-size overlay.

The clamp is applied to the **zoom**, not to `scs` alone, so `scs`, the zoom
read-out and the pinch/wheel scroll maths stay consistent; `scs` is also
clamped as a backstop. `handleStitchWheel` and the pinch branch of
`handleTouchMove` now clamp against `maxZoom` rather than a bare `4`, so the
scroll-preserving `scale`/`zRatio` they compute matches the zoom actually
applied.

**A latent desktop bug this also fixes.** A 200 × 250 chart at the old zoom
ceiling of 4 would be 16 030 × 20 030 = **321 Mpx** — past Chrome's own
268 Mpx limit, so the chart was already rendering blank at high zoom on
desktop. The cap turns that silent failure into a 2.55 × ceiling.

### Verified

Full Jest suite: **203 suites / 2 641 tests green** (2 624 before; +17 from the
new [tests/chartCanvasSizeCap.test.js](../tests/chartCanvasSizeCap.test.js)).
Two consecutive clean runs — one intermediate `crossTabLock` failure did not
reproduce in isolation or on re-run and is an unrelated timing flake.

End-to-end, via [tests/mobile-audit/](../tests/mobile-audit/) (24 checks green):

| Check | Result |
| --- | --- |
| 200 × 250 chart under emulated iOS limits | 4030 × 5030 → **3230 × 4030 (13.0 Mpx)** — inside 4096/side and 16.7 Mpx |
| Zooming in on a capped pattern | saturates at the cap, never exceeds it |
| Zooming out on a capped pattern | 3230 → 1230 — zoom is not frozen |
| Desktop, 60 × 60 | reaches `scs` 80 = **400 % zoom, unchanged** |
| Desktop, 200 × 250 at zoom 1 | 4030 × 5030 — **unchanged** |
| Desktop, 200 × 250 zoomed in | saturates at 130.7 Mpx instead of overflowing to 321 Mpx |
| Horizontal overflow, all 4 pages @ 393 px | `scrollWidth == clientWidth == 393` (manager was 1052) |
| `.mgr-rpanel` on phone | `fixed`, **393 px wide, docked at the viewport bottom** (was 280 px at y 1903) |
| `.mgr-rpanel` on desktop | `relative`, 280 px, border-left intact — **unchanged** |
| Manager filter bar on desktop | no page overflow; search box still 300 px (did not collapse) |
| `button` hover rules | inert on touch, live on desktop |
| Animation frames held while idle, recommendations off | **0 in 3 s** (was ~180) |

Pre-existing failures confirmed unchanged: the four `touch-tablet-chromium`
e2e specs fail identically on `main` — they target `.tb-progress` and
`.tb-zoom-pct`, selectors the current tracker chrome no longer renders.

### Measured effect (Pixel 5, 4× CPU throttle)

| Scenario | Total blocking before | after |
| --- | ---: | ---: |
| `home.html` | 148 ms | **39 ms** |
| `manager.html` | 1 192 ms | **677 ms** |
| `stitch.html` | 369 ms | **181 ms** |
| `create.html` | 315 ms | **142 ms** |
| tracker + 100 × 100 | 2 021 ms | **342 ms** |
| tracker + 200 × 250 | 6 530 ms | **2 272 ms** |

`manager.html` fluctuates between ~370 ms and ~680 ms across runs; the lower
figure is the median of repeated runs, the higher one is quoted above to be
conservative.

### Known-unfixed, and newly measured

- **A4 (main-thread panning) is now the dominant cost on large patterns.**
  Instrumenting a 12-gesture pan on the 200 × 250 fixture records **203 long
  tasks / 6 663 ms blocking**, versus 0 on the 100 × 100 fixture. This is
  item 12 in §E and is untouched by this pass.
- The `.mgr-filter-bar` chips are still 27 px tall and the search box is still
  12 px — items 9 (D1/D2) remain open. The bar now scrolls rather than
  overflowing, which is the layout fix, not the ergonomics one.
- Items 6–15 otherwise unchanged.

### Reproducing

```
npx playwright test --config=mobile-audit.config.js              # both projects
npx playwright test --config=mobile-audit.config.js --project=pixel5
npx playwright test --config=mobile-audit.config.js --project=desktop
```

`tests/mobile-audit/` is excluded from Jest via `testPathIgnorePatterns` in
`package.json`, alongside the existing `tests/e2e` and `tests/perf` entries.
