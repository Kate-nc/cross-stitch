# UX-7 — Mobile UX Audit

> Phase 2 audit. Targets: 360×780 Android Chrome, 768×1024 iPad Safari.
> See also [ux-3 §5 Platform considerations](ux-3-domain-reference.md#5-platform-considerations).

---

## Summary

Mobile is the **most strategically important and least mature surface**
in this app. The Tracker on a phone is the wedge against Pattern
Keeper (which is Android-only); the Creator on a phone is rarely the
primary use case but should be usable for quick edits.

Five high-severity issues actually block normal use:

- PWA can't install cleanly on Android (no icons).
- Babel in-browser compilation makes first paint sluggish on mid-range
  phones.
- No screen-wake-lock during stitching, so the phone sleeps every
  minute.
- iOS safe-area not respected on bottom-anchored UI.
- Touch targets in toolbars sit below the WCAG 44 px guideline.

---

## High-severity findings

### M-H1 · PWA manifest has no icons
**Where:** [manifest.json](../manifest.json)

The manifest lacks an `"icons"` array with 192 px and 512 px PNGs.
Android Chrome silently falls back to a generic icon and refuses to
add a proper home-screen tile. iOS Safari installs but with the
default screenshot.

**Fix:** Add icons array. Also add `"theme_color"`, `"background_color"`,
and a maskable variant.

### M-H2 · Babel in-browser compilation delays first paint
**Where:** [index.html:32](../index.html), [stitch.html](../stitch.html)

Babel Standalone 7.23 compiles `tracker-app.js` (and friends) on every
page load. On a mid-range Android phone (Snapdragon 6-series), the
Tracker takes 2–4 s before paint. Bea perceives this as "the app
broke".

**Fix (incremental):** Show a branded loading splash with a progress
indicator while Babel compiles. **Fix (longer-term):** Pre-compile to
a cached blob in localStorage; or move to a build-time JSX transform
for production while keeping in-browser for dev.

### M-H3 · No `WakeLock` during a stitching session
**Where:** [tracker-app.js:449-470](../tracker-app.js)

Tracker does not request a wake-lock when a session is active. On
Android the screen sleeps after the OS timeout; on iOS Safari similar.
The user must repeatedly unlock and re-find the app.

**Fix:** Request `navigator.wakeLock.request('screen')` on session
start; release on pause / page hide. Surface the state with a small
"screen awake" indicator and a preference toggle.

### M-H4 · Bottom-sheet modal ignores iOS safe-area-inset-bottom
**Where:** [tracker-app.js:322-325](../tracker-app.js)

Bottom-sheet uses `calc(100vh - 32px)` but no
`env(safe-area-inset-bottom)`. Primary CTA can sit under the home
indicator, unreachable.

**Fix:** Add `env(safe-area-inset-bottom, 0px)` to bottom-sheet height
and bottom padding.

### M-H5 · FAB undo collides with Android gesture pill
**Where:** [styles.css:370](../styles.css)

`.fab-undo { bottom: 60px; }` lands under the Android 3-button gesture
bar (48–72 px from bottom).

**Fix:** `bottom: calc(48px + env(safe-area-inset-bottom, 0px))` and
increase margin to 16 px.

---

## Medium-severity findings

### M-M1 · Touch targets below 44 px
**Where:** [styles.css:258](../styles.css), `.tb-btn` and similar pill
buttons

Pill button height ~32 px; padding ~5 px. Below WCAG 2.5.5 guideline
(44×44 minimum).

**Fix:** `@media (pointer: coarse) { .tb-btn { min-height: 44px; } }`.

### M-M2 · Number inputs lack `inputMode`
**Where:** [preferences-modal.js:326,445,454](../preferences-modal.js),
[creator/PrepareTab.js:326](../creator/PrepareTab.js),
[creator/BulkAddModal.js](../creator/BulkAddModal.js)

Number / decimal inputs default to a full QWERTY keyboard on Android.

**Fix:** `inputMode="numeric"` on integer fields,
`inputMode="decimal"` on price/percentage. (Per stored memory
mobile-5-forms.)

### M-M3 · PatternCanvas pinch-zoom also zooms the page
**Where:** [creator/useCanvasInteraction.js:22-45](../creator/useCanvasInteraction.js)

No `touch-action: none` (or `manipulation`) on the canvas element. A
two-finger pinch zooms both the canvas state *and* the browser
viewport.

**Fix:** `touch-action: none` on the canvas wrapper; let the JS handler
own all gestures.

### M-M4 · Materials Hub tablist wraps on 360 px viewport
**Where:** [creator/MaterialsHub.js:207-210](../creator/MaterialsHub.js)

Four tabs wrap to two rows on phone. The tablist becomes visually
broken.

**Fix:** Horizontal scroll container with `overflow-x: auto;
scroll-snap-type: x mandatory`, or switch to a vertical sidebar on
phone.

### M-M5 · Onboarding modal hardcoded 420 px max-width
**Where:** [onboarding-wizard.js:255](../onboarding-wizard.js)

Touches viewport edges on 360 px phones with no margin.

**Fix:** `max-width: min(90vw, 420px)`; add safe-area-inset padding.

### M-M6 · Manager search and tabs not phone-optimised
**Where:** [manager-app.js:42,719](../manager-app.js)

Search input small; tab button padding `8px 0` is short. No
`enterkeyhint="search"` on the search field.

**Fix:** `enterkeyhint="search"`; tab `min-height: 44px`,
`padding: 12px 8px`.

### M-M7 · BulkAddModal remove buttons too small
**Where:** [creator/BulkAddModal.js:69-84](../creator/BulkAddModal.js)

Inline ✕ remove buttons on chips ~24 px.

**Fix:** Wrap in 44×44 touch target.

---

## Low-severity findings

### M-L1 · Modal max-width on 360 px leaves only ~18 px margins
[modals.js:273](../modals.js) — `min(90vw, 400px)` is mostly fine but
edge-tight on the smallest phones.

### M-L2 · No memory warning for huge PDF exports
[creator/pdfExport.js:29-70](../creator/pdfExport.js) — large patterns
(>1000×1000) can OOM on 2 GB phones. Add a pre-flight size check and
warning.

### M-L3 · Pill toolbar padding inconsistent (5 px vs 12 px)
[styles.css:258,2219](../styles.css). Standardise to 8–10 px.

### M-L4 · `safe-area-inset-bottom` only on bottom sheets
Other `position: fixed; bottom: 0` UI doesn't respect it.

### M-L5 · iPad landscape shows horizontal scroll in some modals
[modals.js:273](../modals.js). Constrain `max-width` and add
`word-break: break-word`.

### M-L6 · Preferences switch labels are too small to tap easily
[preferences-modal.js:107-120](../preferences-modal.js). Wrap in
44 px container.

### M-L7 · Breakpoint inconsistency
480 / 599 / 899 / 1024 mixed; consolidate.

### M-L8 · Pill toolbar wrap not centred on phone
Buttons wrap but justify left, leaving asymmetric whitespace.

### M-L9 · Drag-mark 200ms multi-touch guard may abort intentional gestures
[useDragMark.js:50-80](../useDragMark.js). Filter on `pointerType`.

### M-L10 · No "compact mobile mode" toggle
Some users (Eli) want denser layout on phone; some (Bea) want roomier.
Could be a preference.

---

## Themes

1. **The Tracker has not had a phone-first design pass.** It's a
   shrunken desktop layout. The single biggest investment for mobile
   would be a deliberate phone-first re-layout of the Tracker (see
   ux-10 Plan A).
2. **PWA basics are missing.** Icons, wake-lock, safe-area, install
   prompt. These are foundational and should ship together.
3. **Form-input mobile hygiene** is partial. The pattern is known
   (see stored memory mobile-5-forms); the audit shows it's not yet
   applied consistently.
4. **Performance on mid-range Android** is the silent killer. Every
   second of first-paint costs adoption. The Babel compile is the main
   offender.
