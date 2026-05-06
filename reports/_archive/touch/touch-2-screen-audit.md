# touch-2 — Per-Screen Audit at Tablet & Phone Viewports

Tested viewports: **375 × 812 (iPhone SE/13)**, **768 × 1024 (iPad
portrait)**, **1024 × 768 (iPad landscape)**. Findings derived from CSS
media queries in [styles.css](../styles.css), component layouts in
[creator/](../creator/) and the three top-level HTMLs, and observed
breakpoints (`399 / 599 / 600 / 899 / 900 / 1024`).

The app uses these breakpoints inconsistently — `600` and `599` are both
used; `900` and `1024` both appear; some queries use `pointer:coarse`
instead of width. Phase 4 should consolidate.

──────────────────────────────────────────────────────────────────────
## /home (`home.html` + `home-app.js`)
──────────────────────────────────────────────────────────────────────

### 1024 × 768 — tablet landscape
- Multi-column card grid renders fine; cards are large enough to tap.
- Header reflows but stays readable.
- No overflow.

### 768 × 1024 — tablet portrait
- Cards stack to 2-up. Spacing acceptable.
- "Recent patterns" thumbnails ~ 200 px; tap targets > 44 px.
- Header nav collapses to hamburger? — `header.js` does not implement
  a mobile menu. Nav links wrap to a second line, which works at 768
  but feels cramped.

### 375 × 812 — phone
- `.home-screen { padding:16px }` (line 776). Cards stack 1-up.
- "Open backup", "Quickstart", and minor links are 11–12 px font; some
  ~ 32 px tall. **Below 44 px floor.**
- Header nav wraps to 2–3 lines; no hamburger collapse. Navigation
  chrome eats ~ 25 % of viewport before content.

### Issues to fix
- **Header has no mobile collapse** — nav items take 2–3 rows on phone.
- Several secondary action links are below 44 px tall on phone.

──────────────────────────────────────────────────────────────────────
## Pattern Creator (`index.html` / `create.html`)
──────────────────────────────────────────────────────────────────────

Layout: top-bar → top-toolbar (`ToolStrip`) → split-pane (sidebar +
canvas + right-panel) → status bar.

### 1024 × 768 — tablet landscape
- All three columns visible; canvas is the smallest because the
  Sidebar (200–280 px) and `.rpanel` (320 px) both compete.
- Canvas usable area ≈ 400 × 540 px after subtracting headers.
- Top toolbar `.tb-btn`s: ~ 22 px tall — **below floor**.
- Wrap of toolbar happens at this width: zoom controls drop into the
  overflow `.tb-overflow-menu`.
- Right-panel tabs (`.rp-tab`): 8 px vertical padding × 11 px font →
  ~ 28 px tall. **Below floor.**

### 768 × 1024 — tablet portrait
- Sidebar collapses or becomes very narrow; the SplitPane divider is
  4 px wide (**far below floor**).
- Canvas usable area ≈ 720 × 600 px — workable but the right-panel
  still overlays.
- Top toolbar wraps to 2 rows; overflow menu activated.
- Palette chips on the canvas surface drop to ~ 28 × 28 px in a
  scrolling row — **adjacent chips share borders** (no gap), guaranteeing
  mistaps.

### 375 × 812 — phone
- SplitPane collapses to single-column; the right-panel becomes a
  bottom-sheet.
- The canvas occupies most of the screen.
- Top toolbar wraps to 3+ rows; many tools end up in the overflow.
  Overflow `.tb-overflow-menu` items are ~ 28 px tall — **below floor**.
- Status bar at bottom: 11 px text, ~ 22 px tall.
- Action bar (export, save, project name) — buttons ~ 32 px tall.

### Horizontal-scroll / overflow risks
- Top toolbar can horizontally scroll on very narrow phones (< 360 px)
  before wrapping. Per repo memory, mobile viewports < 480 px have known
  spinner overflow issues.
- The `.materials-cols` grid (Materials Hub) collapses to 1 column at
  599 px (line 523) — fine.
- Number inputs in Prepare tab (`creator/PrepareTab.js`) lacked
  `inputMode="numeric"` historically (per repo memory) — verify.

### Reachability map (tablet portrait, held in lap, right-handed)
- Easy: bottom 40 % of screen (canvas + bottom modal triggers).
- Medium: middle 40 %.
- Hard: top 20 % — top-bar nav, ToolStrip, project-info dropdown, all
  tool selection buttons. **All most-used tools are in the hard zone.**

### Issues to fix
- Toolbar buttons everywhere below the 44 px floor.
- Palette chips have 0 px gap between adjacent targets.
- ToolStrip is at the top — most-used controls in the hardest reach
  zone.
- Right-panel tabs below floor at all viewports.
- SplitPane divider 4 px wide is unusable on touch (already a known
  issue but worth flagging at every viewport).
- No collapsed/expanded indicator for which panel is showing.

──────────────────────────────────────────────────────────────────────
## Stitch Tracker (`stitch.html`)
──────────────────────────────────────────────────────────────────────

Layout: top-bar → top-toolbar → progress bar → canvas (with optional
left lpanel + right rpanel) → status bar → mobile action bar (mobile
only).

### 1024 × 768 — tablet landscape
- `.lpanel` docks left at 320 px wide (≥ 1024 px branch, line 634).
- `.rpanel` is the palette legend, ~ 280 px wide on the right.
- Canvas: ~ 420 × 540 px after both panels — **canvas is tiny**.
- Top toolbar: roughly 28–32 px tall; tracker-action-bar not shown
  because matchMedia targets `(pointer:coarse)`-only.
- Most stitchers stitch in landscape with a tablet propped at table
  height; **the canvas is the smallest part of the screen**.

### 768 × 1024 — tablet portrait
- `.lpanel` becomes a bottom-sheet (the desktop dock branch only fires
  ≥ 1024 px). It is **closed by default** on this viewport — only opens
  via the hamburger.
- `.rpanel` (palette legend) is **hidden** at < 900 px (line 645).
  Legend moves into the lpanel's mobile-only Legend tab.
- Canvas: full width 768 px × roughly 720 px — very usable.
- Top toolbar wraps; overflow menu used.
- Action bar appears (`(pointer:coarse)` triggers `body.tracker-mobile`
  if iPad reports coarse pointer — **on iPad with Apple Pencil it
  reports `fine` and skips the mobile bar**, leading to a desktop-style
  layout on a tablet-portrait viewport).

### 375 × 812 — phone
- All side panels hidden; canvas full-width.
- Top toolbar wraps to 2–3 rows.
- Tracker-action-bar (56 px) at bottom, FAB undo above it, optional
  colour quick-drawer slides up.
- Canvas usable area ≈ 375 × 580 px.
- Stats and progress bar take ~ 60 px between toolbar and canvas.

### Horizontal-scroll / overflow risks
- None observed at standard breakpoints — `.canvas-area` is overflow-
  hidden with the canvas wrapper providing its own scroll.
- Top-bar at 320 px can squeeze the project-name truncation; long
  pattern names truncate with ellipsis.

### Reachability map (tablet landscape, propped on table, two-handed)
- Easy: bottom-center of screen.
- Medium: bottom edges and middle.
- Hard: top edges, far corners.
- **Hamburger (which opens lpanel) is top-left → hard reach.**
- **All zoom buttons are in the top toolbar → hard reach.**

### Reachability map (phone, held in one hand)
- Tracker-action-bar (Mark / Undo / colour) is at bottom — **easy**.
- FAB undo is bottom-left — **easy**.
- Top-bar back/menu — hard reach.

### Issues to fix
- Tablet landscape: canvas is the smallest screen region because the
  lpanel and rpanel both dock at full height with no collapse-to-rail
  state. **This is the user's stated problem.**
- Tablet portrait: the lpanel is closed by default and there is no
  hint that it exists; users who haven't found the hamburger never
  see legend / highlight controls.
- Top-bar zoom controls in the hard-reach zone.
- iPad with Pencil reports `pointer:fine` and so misses the mobile
  layout; users get the desktop right-panel + no mobile action bar
  on a 1024 × 768 viewport.

──────────────────────────────────────────────────────────────────────
## Stash Manager (`manager.html`)
──────────────────────────────────────────────────────────────────────

### 1024 × 768
- Tab strip across the top, then a list/grid of threads or patterns.
- Filter / sort controls in a row above the list — buttons ~ 30 px tall.
- Search input is reasonable height.

### 768 × 1024
- Layout reflows to single column. List items remain ~ 56 px tall →
  passes floor.
- Add-thread modal: form rows have explicit 44 px heights (per repo
  memory — manager-app.js:1573-1655).

### 375 × 812
- Tab strip wraps; tabs are 36 px tall — below floor.
- Filter chips inline above the list are 24 × 24 px each — **below
  floor and clustered**.
- Quantity steppers in inventory rows are tiny native browser
  spinners.

### Issues to fix
- Filter chips below floor in tight cluster.
- Tab strip below floor on phone.

──────────────────────────────────────────────────────────────────────
## Modals (Preferences, Project Info, Adapt, Substitute, Shopping List, Convert Palette)
──────────────────────────────────────────────────────────────────────

### Common
- Modals open at `min(560px, 92vw)`; on phone they fill ~ 92 % of
  width. Acceptable.
- On 375 px phone, vertical content can exceed viewport height —
  preferences modal at 12 categories scrolls but the close-button is
  fixed at top, requiring scroll-back to dismiss.
- Form rows mostly use 44 px-height inputs (Phase 8 fix per repo
  memory).
- Native checkboxes still render at OS-default ~ 16 px — wrapping in
  a labelled 44 px row is partial.

### Issues to fix
- Some modal close buttons (`×`) are 32 × 32 px — below floor.
- Native checkbox hit areas inside large rows still tiny.
- Modal does not lock body scroll on iOS Safari (causes background
  scroll bleed).

──────────────────────────────────────────────────────────────────────
## Help drawer / Onboarding wizard / Command palette
──────────────────────────────────────────────────────────────────────

- Help drawer ([help-drawer.js](../help-drawer.js)): keyboard-shortcut
  list with `<kbd>` legends. On phone it overflows horizontally
  if shortcut combos exceed ~ 30 chars.
- Onboarding wizard ([onboarding-wizard.js](../onboarding-wizard.js)):
  fits viewport on tablet; on phone the "Next" button at bottom-right
  is reachable but progress dots are ~ 8 px each — visual only.
- Command palette ([command-palette.js](../command-palette.js)): fixed
  centre overlay; works on touch via the search field, but `<kbd>`
  hint footer is decorative on touch devices.

──────────────────────────────────────────────────────────────────────
## Cross-cutting findings (apply to all screens)
──────────────────────────────────────────────────────────────────────

1. **Breakpoint inconsistency** — `599`, `600`, `899`, `900`, `1024`,
   plus `(pointer:coarse)` queries, lead to gaps and overlaps. A
   tablet at exactly 900 px width gets neither the mobile nor the
   desktop branch in some rules.
2. **`(pointer:coarse)` ≠ "small viewport"** — iPad Pro 11" with
   Apple Pencil reports `fine`, so it skips every mobile-only rule
   gated on `(pointer:coarse)` while clearly being a tablet.
3. **Top toolbars dominate the hard-reach zone** on every screen
   except tracker mobile.
4. **Tap target floor (44 × 44 px) is missed across:** creator
   ToolStrip, creator overflow menu, all `.rp-tab`, all `.lp-tab` at
   tablet landscape, manager filter chips, manager tab strip on
   phone, palette swatches throughout, modal close buttons, SplitPane
   divider.
5. **Adjacent target spacing < 8 px** on: palette chips (0 gap),
   manager filter chips, manager number-spinners, ToolStrip overflow
   buttons.
6. **Text contrast and size are acceptable** — body text ≥ 14 px in
   almost all surfaces, contrast satisfies WCAG AA (verified in
   Workshop theme audit, repo memory). Status / hint text at 11 px
   is readable on tablet-at-arms-length but borderline on phone.
7. **Horizontal scroll** is rare but possible on toolbars at < 360 px.
   The number-spinner overflow noted in repo memory still affects
   creator Prepare tab on phone.
