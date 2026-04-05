# Stats Phase D — Manual Test Checklist

> **Pre-requisite:** Hard-refresh the app (Ctrl+Shift+R) and clear the cached script:
> open DevTools Console → `localStorage.removeItem('babel_tracker_v4')` → reload.
> This ensures you pick up the latest helpers.js, components.js, and tracker-app.js changes.

---

## 1. Copy Progress Summary

| # | Test | Expected Result |
|---|------|-----------------|
| 1.1 | Open Stats (📊 button), click **📋 Copy progress summary** | Button text changes to **✅ Copied!** for ~2.5 s, then reverts |
| 1.2 | Paste into a text editor | Formatted text block with project name, stitch count, percentage, time, speed, streaks, best day, est. completion, and footer "Tracked with Cross Stitch Studio" |
| 1.3 | Verify emoji rendering | Line-start emojis (🧵 ✅ ⏱️ 📈 🔥 🏆 📅) display correctly in pasted text |
| 1.4 | Verify numbers match overview cards | Stitch count, percentage, total time, speed, avg/day in pasted text match the cards above |
| 1.5 | Copy with **zero sessions** (new project or cleared data) | Still copies cleanly — shows 0/total, 0 h, streaks 0, no "NaN" or "undefined" |
| 1.6 | Copy with **only 1 session** | Best day is that session's date; streak = 1 (if today) or 0 |
| 1.7 | Click copy, then click again before the 2.5 s timer expires | Button stays "✅ Copied!" — no glitch or double-timer |
| 1.8 | Test in a browser where `navigator.clipboard` is unavailable (e.g. HTTP non-localhost) | Falls back to textarea + `execCommand('copy')` — still copies and shows "Copied!" |

---

## 2. CSV Export

| # | Test | Expected Result |
|---|------|-----------------|
| 2.1 | Click **📄 Export sessions (CSV)** | Browser downloads a `.csv` file |
| 2.2 | Check filename | Pattern: `{dimensions}_pattern_sessions.csv` (e.g. `100×120_pattern_sessions.csv`) — no illegal filename characters |
| 2.3 | Open CSV in Excel / Google Sheets | 10 columns: Date, Start Time, End Time, Duration (min), Stitches Completed, Stitches Undone, Net Stitches, Cumulative Total, Percent Complete, Note |
| 2.4 | Verify row count | One header row + one data row per session |
| 2.5 | Verify chronological order | Rows sorted oldest-first |
| 2.6 | Verify a session with a **note containing commas or quotes** | Note is properly CSV-escaped (wrapped in double-quotes, internal quotes doubled) |
| 2.7 | Verify times are in local timezone | Start/End times match what you see in the Session Timeline |
| 2.8 | Export with **zero sessions** | Downloads a CSV with only the header row (no crash) |
| 2.9 | Export with **many sessions** (20+) | All sessions present, file isn't truncated |

---

## 3. Button Layout & Styling

| # | Test | Expected Result |
|---|------|-----------------|
| 3.1 | Export bar placement | Share and CSV buttons appear between the Overview Cards and the Charts section |
| 3.2 | Hover states | Both buttons show a visible hover effect (background darken) |
| 3.3 | Share button accent colour | "Copy progress summary" button has a teal accent, matching the app's theme |
| 3.4 | Responsive wrap | On narrow screens, buttons stack vertically (flex-wrap) rather than overflowing |

---

## 4. Integration with Existing Stats Features

| # | Test | Expected Result |
|---|------|-----------------|
| 4.1 | Start a timed session, complete some stitches, stop | New session appears in Session Timeline AND is reflected when you copy summary or export CSV |
| 4.2 | Undo stitches during a session | `stitchesUndone` and `netStitches` columns in CSV are accurate |
| 4.3 | Change **Day-end hour** setting, then copy summary | Streak calculation and "best day" shift correctly to the new boundary |
| 4.4 | Set a **daily goal**, reach it, then copy summary | Share text shows the correct current streak (should increment to 1) |
| 4.5 | Set a **target date**, copy summary | "Est. completion" line in share text reflects the target date estimation |
| 4.6 | Check milestone celebration still fires | Complete enough stitches to cross a milestone (1%, 5%, 10%, 25%, …) — toast still appears |
| 4.7 | Mini stats bar still updates | The mini bar below the toolbar still shows today's stitch count and time |

---

## 5. Edge Cases

| # | Test | Expected Result |
|---|------|-----------------|
| 5.1 | Project with 100% completion | Share text shows "100.0%" and est. completion says "Done!" or similar |
| 5.2 | Project with exactly 0 total stitches (empty grid) | No division-by-zero errors — share text and CSV handle gracefully |
| 5.3 | Session with 0 net stitches (all undone) | Row appears in CSV with `netStitches = 0`; share text doesn't break |
| 5.4 | Rapidly toggle between Stats and pattern view | No state leak or crash |

---

## 6. Skipped / Deferred

| Feature | Reason |
|---------|--------|
| **Stats in PDF Export** | `generatePDF` / `SharedModals.PdfExport` are stubs — no base PDF export exists yet. When PDF generation is implemented, a stats summary page can be added. |

---

### Quick Smoke-Test Sequence

1. Open a project with at least 3 sessions
2. Click 📊 Stats → verify dashboard loads
3. Click "📋 Copy progress summary" → paste somewhere → verify content
4. Click "📄 Export sessions (CSV)" → open in spreadsheet → verify columns & data
5. Close stats → do a short session → reopen stats → verify new session shows in both copy and CSV
