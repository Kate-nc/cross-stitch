# Branch Audit · Report 9 — Quick Wins

Low-effort, low-risk fixes the agent will implement before stopping
for review. Each item is a small focused patch with no design
decisions outstanding.

| # | Issue | Fix | Effort | Risk |
|---|---|---|---|---|
| Q1 | **I2** — Tracker rail does `window.location.reload()` | Replace with `setActiveProject(id)` + `cs:projectsChanged` dispatch (mirrors `TrackerProjectPicker.onPick`). | ~10 LOC | Low — same code path as the modal already uses. |
| Q2 | **I5** — ActionBar wraps below 360 px | Hide `Share ▾` and `Export ▾` into one `…` overflow button below 360 px via CSS media query. Print PDF + Track stay primary. | ~15 LOC CSS + 5 LOC JSX | Low. |
| Q3 | **I7** — Preferences modal hardcodes `COLOURS` palette | Replace `COLOURS.teal` → `var(--accent)`, `.line/.line2` → `var(--border)`, `.tealBg` → `var(--accent-light)` etc. throughout the file. | ~25 LOC, mechanical | Low — token names are stable. |
| Q4 | **I9** — No touch entry-point for ⌘K | Add a header search-icon button that calls `window.CommandPalette.open()`. Use `Icons.search` (already exists). | ~12 LOC in header.js | Low. |
| Q5 | **I8** — Onboarding popover may overflow at 320 px | Clamp computed `left` to `viewportWidth - popoverWidth - 8`. | ~5 LOC | Low. |
| Q6 | **I11** — Sprint helper scripts at repo root | Move `_sprint3_tokens.js` + `_sprint4_css_tokens.js` to `scripts/`. | mv command | Zero. |
| Q7 | **I12** — Commented-out App-appearance section | Delete the dead JSX comment block in `ProfilePanel`. | ~12 LOC | Zero. |

## Deferred (need design approval)

These were on the candidate quick-win list but require decisions
the audit explicitly defers to the user:

- **I3 / P-I3** (restore desktop lpanel side-pane). Touches a
  previously-buggy CSS area. Need approval — listed in report 8.
- **I4 / P-I4** (Manager card Edit/Track buttons). Pattern cards in
  the Manager are visually dense; need a quick eye on placement.
  Implementation is small but visual.
- **I6** (mode pill prominence) — design-judgment.
- **I10** (limit-to-stash warning) — out of scope per Hybrid 4.
- **I13** (stylelint hex/px enforcement) — adds tooling.
- **I14** (PWA install icons) — needs the actual icon files.

## Test coverage after quick wins

- Q1 should add a test in `tests/trackerLeftSidebar.test.js` (or new `tests/trackerProjectRail.test.js`) verifying `setActiveProject` is called and no reload occurs.
- Q2 needs a Playwright assertion at 320 px that the row stays single-line.
- Q3 needs a dark-mode visual snapshot of the Preferences modal.
- Q4 should add a test that clicking the header search icon opens the palette.
- Q5 needs Playwright at 320 px.
- Q6 + Q7 are no-test housekeeping.
