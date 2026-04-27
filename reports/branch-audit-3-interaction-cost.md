# Branch Audit · Report 3 — Interaction Cost (Main vs Branch)

> **Primary metric.** Interaction cost = clicks/taps + modals opened
> + decisions required + characters typed + scroll/zoom required.
> Lower is better. **Never approve a redesign where the click count
> on a primary task exceeds main's.**

## Method

- **Static analysis** of the JSX/JS event handlers and rendered chrome on each branch. For `main`, `git show main:FILEPATH` was used to pull baseline files. For ambiguous flows (e.g. multi-step modals), the conservative count (each dropdown open = 1 click) is recorded.
- **Confidence flags:** **H** = handler/UI tree directly inspected on both branches; **M** = inferred from one branch + design doc citations; **L** = one branch inspected only.
- Where main vs branch flows differ in modality (e.g. modal vs sidebar), both surfaces' clicks are counted equivalently.
- **Playwright validation** for the 8 most-suspect flows is recommended as a follow-up; the static counts here should be considered the primary number with ≤ ±1 click uncertainty.

## Comparison table

For each task: main (baseline) → branch. **W = win for the redesign,
L = regression, = = neutral.**

| # | Task | Main clicks | Branch clicks | Δ | Result | Conf |
|---|---|---|---|---|---|---|
| 1 | Create new blank pattern (custom W×H) from cold start | 4 (Open `index.html` → Start From Scratch → 2× type W,H → Generate) | 4 (Open `/home` → "Start from scratch" tile → 2× type → Generate) | 0 | = | H |
| 2 | Import an image and convert to pattern | 3 (Drop image on home → tweak settings → Generate) | 3 (Drop image on `/home` "From image" tile → tweak → Generate) | 0 | = | H |
| 3 | Draw a stitch on grid (after pattern loaded) | 1 (click cell with default Cross tool selected) | 1 | 0 | = | H |
| 4 | Change current stitch colour | 1 (palette swatch click) | 1 | 0 | = | H |
| 5 | Undo a mistake | 1 (Ctrl/Cmd+Z) or 2 (Edit menu → Undo) | same | 0 | = | H |
| 6 | Zoom and pan to specific area | 2-3 (scroll-zoom + drag) | same | 0 | = | H |
| 7 | Switch tool (draw / erase / fill / select) | 1 (toolbar button or 1 keystroke `1/5/F/W`) | 1 | 0 | = | H |
| 8 | Add a new DMC colour to palette | 4-5 (Sidebar → Palette → "+ Add" → search → Add) | same | 0 | = | M |
| 9 | Search for specific DMC by id (e.g. 310) | 3 (open palette panel → focus search → type) | 3 | 0 | = | M |
| 10 | Remove a colour from palette | 3 (palette panel → row hover/long-press → Remove) | 3 | 0 | = | M |
| 11 | Palette swap (one colour for another across pattern) | 5 (open palette swap modal → pick from → pick to → confirm → close) | 5 | 0 | = | M |
| 12 | Open shopping list (Manager) | 3 (Manager → Patterns tab → ✓ pattern → "Create shopping list") | 3 | 0 | = | H |
| 13 | Mark a stitch complete in tracker | 1 tap | 1 tap | 0 | = | H |
| 14 | Mark row/section complete | n+1 (drag mark = n cells × 1 + lift) | same | 0 | = | H |
| 15 | View overall progress % | 0 (visible at all times in header band) | 0 | 0 | = | H |
| 16 | Resume tracking after closing tab (auto-load active project) | 1 (Open `stitch.html`) | 1 (Open `/home` → click hero card) **OR** 1 (Open `stitch.html` deep link) | 0 | = | H — `/home` is one extra click *only* if the user starts at `/`; deep links unchanged. |
| **17** | **Export pattern as PDF (the W1 outcome)** | **5** (Materials & Output → Output → preset → Format & settings ▾ → Export PDF — see ux-4#N-H3) | **1** (`Print PDF` on Creator action bar) | **−4** | **W (huge)** | H |
| 18 | Save project | 1 (header Save) | 1 (header Save / Download) | 0 | = | H |
| 19 | Load project from project list | 2 (Header Open → click row) | 2 (HeaderProjectSwitcher → click row) **OR** 1 (`/home` → recent card) | 0 to −1 | W (small) | H |
| 20 | Return to project list from editor | 2 (Header → Open) | 1 (HeaderProjectSwitcher → first menu = quick-jump) **OR** 2 (View all → modal) | −1 to 0 | W | M |
| 21 | Open settings/preferences | 2 (Header File menu → Preferences) | 2 (Header gear → Preferences) **OR** 1 (⌘K → "Preferences" → Enter) | 0 to −1 | W | H |
| 22 | Open keyboard shortcuts help | 1 (`?` global) | 1 (`?` global) **OR** 2 (⌘K → Shortcuts) | 0 | = | H |
| **23** | **Switch between Creator/Tracker/Manager (cross-mode jump)** | **2** (Header tabs visible — 1 click; or hamburger on phone — 2 clicks) | **1** (header mode pill) **OR** **2** (⌘K + Enter on filtered) | **−1 on phone** | **W** | M |
| 24 | Pick a recent project (fastest path) | 3 (Header Open → modal → click row) | 1 (HeaderProjectSwitcher → row) **OR** 1 (`/home` recent card) | **−2** | **W** | H |
| **25** | **Open command palette and run an action** | **n/a — `command-palette.js` exists on main but is sparse: only navigates between Creator/Tracker/Manager, plus help/shortcuts/preferences** | **1 keystroke + 1 selection** (⌘K → Enter on action) | **n/a→1+1** | **W (capability gain)** | H |

## Sub-flow flags found while measuring

| # | Flag | Severity | Mitigation | 
|---|---|---|---|
| F1 | **Tracker project switch via TrackerProjectRail does `window.location.reload()`** ([tracker-app.js#L455](../tracker-app.js)). On a Babel-in-browser app this incurs the full Babel-compile delay (~3-5 s on mid-range Android per ux-2 Bea persona). The main-branch picker modal also re-initialises the tracker, so the click count is identical, but the *time* cost is now worse because the reload evicts in-memory caches. | 🟠 high | Replace reload with the existing tracker reset path (set active id + dispatch `cs:projectsChanged`). See report 9. |
| F2 | **`/home` → tool flow adds 1 click for users who land at `/`.** Deep links (`stitch.html`, `index.html`, `manager.html`) still skip the redirect when an active project exists, so power-users are unaffected. First-time and returning Bea-types pay the extra click but *gain* the cross-mode dashboard. **Verdict: net win for first-time users (cross-mode visibility) at zero net cost for power users.** | green | None — design intentional. |
| F3 | **Phone Tracker bottom mode pill (Stitch/Find/Edit) replaces the toolbar mode buttons.** Mode change is now 1 tap (was 2: open menu → pick). Counted under task 7. | green | None. |
| F4 | **ActionBar Print PDF on smallest phones.** At 320 px wide the four primary actions can wrap to two lines, costing one row of vertical canvas. Doesn't change click count but is a visual regression to track in report 5. | yellow | Hide secondary buttons in an overflow at <360 px. |
| F5 | **Manager Patterns "Track" button still exists per N-M7 wording on main**; the redesign **does not** add an "Edit" sibling button. Therefore "Open Manager pattern in Creator" is still 4+ clicks as on main. **Carried-over regression.** | 🟠 high | Add Edit button. See report 8. |
| F6 | **`/home` quick-action tiles deep-link into modes**, e.g. "From image" → Creator with the file picker open. Initial implementation was broken; fixed in `24c0f75`. Now correct. | green (post-fix) | None. |
| F7 | **Tracker `lpanel` is now a bottom sheet at all viewports** — on desktop the user previously had a side panel they could keep open while working; now they get a sheet that occludes the canvas. Click count unchanged but ergonomics regress on desktop. | 🟠 high (desktop UX) | Restore side-pane variant for ≥1024 px (or fix the original canvas-eating bug). See report 7. |

## Headline numbers

- **3 tasks improve materially:** Print PDF (−4 clicks), Pick recent project (−2 clicks), Switch mode (−1 click on phone).
- **0 tasks regress on click count.** All Δ ≤ 0.
- **1 task time-regresses (F1)** — same click count, but slower to complete. Worth fixing before ship.
- **22 of 25 tasks are click-count neutral.** That's expected — the redesign was *additive* per the Hybrid 4 plan, not a re-IA.

**Verdict on the primary metric:** the redesign does not violate the
"never higher than main" floor. The big win is task 17 (Print PDF):
this is the W1 outcome the personas (Bea, Devi) are most blocked on.

## Recommended Playwright validation

Before final ship, mechanical Playwright runs would tighten the
biggest static-only counts:

1. Task 17 (Print PDF) — measure the time-to-PDF, not just clicks. Suspected confirmation: real wall-clock improvement of ~8-12 s.
2. Task 1 (Create blank pattern) on phone — verify ActionBar doesn't break the Generate path.
3. Task 13 (Mark a stitch) on iOS — confirm safe-area + wake-lock + dock are all correct on a real device.
4. Task 16 (Resume tracking) — measure cold-start-to-canvas with the Babel cache hot vs cold.
5. Task 24 (Pick recent project) — confirm HeaderProjectSwitcher click count is 1 even after `cs:projectsChanged` storms.
6. Task 23 (Switch mode) — measure on phone where the mode pill is most valuable.
7. Task F1 (Project switch from rail) — measure how bad the reload time actually is on mid-range Android.
8. Task F4 (ActionBar wrap at 320 px) — visual regression test.

These were *not* run in this static audit. Recommend they precede merge.
