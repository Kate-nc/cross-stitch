# Stats Consistency and Completeness Audit

---

## 1. Number Formatting

### Consistency check across screens

| Stat | Format used | Consistent? |
|---|---|---|
| Lifetime stitches (stats-page hero) | `fmtNum(n)` — locale-formatted with commas (e.g. "1,234,567") | ✅ |
| Lifetime stitches (home-app stats tab) | `fmtNum(n)` | ✅ |
| Stitch count in progress popover (tracker) | `.toLocaleString()` | ✅ |
| Skeins needed (LegendTab) | `toFixed(1)` | ✅ |
| Percentages (progress bars, tracker) | `(pct).toFixed(1) + '%'` for detail, rounded integer for quick view | ✅ |
| Thread cost (ProjectTab) | `(n).toFixed(2)` | ✅ |
| DMC coverage "N/M" | Raw integers, no locale-formatting | ✅ (small numbers) |

**Assessment:** Number formatting is consistent where `fmtNum` is used. The `.toLocaleString()` calls in tracker use the browser locale. **No inconsistencies found for the same stat type across screens.**

### Percentage precision

| Location | Precision | Appropriate? |
|---|---|---|
| Tracker progress bar | 1 decimal place "47.3%" | ✅ |
| Ready-to-start list | Integer "100%" | ✅ (binary: ready or not) |
| Coverage ratio | Integer "83%" | ✅ (gauge display) |
| Kitting coverage | Integer "78%" | ✅ |
| Pattern completion in Manager | Integer "82%" | ✅ |

**Assessment:** Percentages are consistently one decimal place for progress (tracker) and integers for summaries. Correct.

### Large number handling

- Pattern with 400×600 = 240,000 stitches: `fmtNum(240000)` → "240,000" ✅
- Lifetime stitches over 1M: `fmtNum` handles → "1,234,567" ✅
- Remaining stitches display: uses `fmtNum()` ✅

---

## 2. Zero and Empty States

| Location | What shows when zero/empty | Appropriate? |
|---|---|---|
| Lifetime stitches = 0 | "0" with "≈ 0 km of thread" subline | ⚠️ No guidance toward action |
| No tracking data / no sessions | Activity heatmap shows all grey cells; metrics show "—" or "0" | ✅ |
| Empty stash → Stash KPIs | "0" for skeins, "0" for colours | ⚠️ No guidance |
| Empty stash → Colour Families | Hidden (conditional on `stash` having entries) | ✅ |
| Empty stash → DMC Coverage | "0 / 454" shown via gauge | ✅ |
| Empty stash → Ready to Start | "Nothing fully kitted yet. Check individual patterns…" | ✅ |
| Empty stash → Threads Never Used | Hidden (count = 0 skips the card) | ✅ |
| Empty stash → Buying Impact | Hidden (array is empty) | ✅ |
| Empty stash → Colour Fingerprint | Returns `null` → hidden | ✅ |
| No projects | Active/Finished = 0 text | ⚠️ "0 active projects" with no guidance |
| No patterns in Manager | "0 patterns" with clipboard icon | ✅ (add button visible) |
| Manager empty stash | Grid shows empty; chip shows "0 skeins" | ⚠️ No "add threads" CTA |
| Tracker, no tracking started | Progress bar at 0%; popover shows "—" for pace/remaining | ✅ |

### Issues
- **Home stats tab with 0 lifetime stitches:** Shows "0" and "≈ 0 km of thread" but no CTA like "Start tracking to build your history."
- **Home stash tab with 0 skeins/colours:** Shows bare "0" KPIs without a "Visit the Stash Manager to add threads" note.

---

## 3. Loading States

| Location | Loading state | Type | Appropriate? |
|---|---|---|---|
| Stats page initial load | Spinner + "Loading your stats…" text | Full-screen spinner | ✅ |
| StatsShowcase initial load | Spinner + "Loading your showcase…" | Full-screen spinner | ✅ |
| Home stats tab | Brief skeleton / blank until data | No explicit skeleton | ⚠️ Flash of "0" |
| Home stash tab | Data appears after `refreshStash` | No explicit skeleton | ⚠️ Flash of "0" |
| Tracker rail initial load | Threads appear once stash resolves | No loading indicator | ⚠️ Thread list may appear empty briefly |
| Manager initial load | Thread grid appears after IDB read | Brief blank | ✅ (fast enough) |

### Flash of "0" on Home Stats Tab

`lifetimeStitches` is initialised to `0` in state (line ~1200 in home-app.js). If the data fetch is slow, "0" is shown before the real value arrives. This looks like "no data" to users.

**Mitigation:** Use `null` as the initial state and show a `—` placeholder until data arrives. **Low priority** given home-page stats tab loads fast in practice.

---

## 4. Staleness Indicators

None of the stale stats include a "last updated" indicator. This is acceptable for stats that update on `cs:stashChanged` (they appear live), but becomes misleading when the stats page has stale data and the user doesn't know they need to reload.

**Assessment:** After the stash staleness fixes (F1–F4), all stats will update reactively. No "last updated" indicators will be needed.

---

## 5. Missing Stats Users Might Expect

| Potentially expected stat | Currently present? | Location if present |
|---|---|---|
| "Stitches completed this week" (number) | ✅ "This week: N" in Tracker popover | Tracker info chip |
| "Sessions this week" | ✅ Implicitly in activity heatmap | Stats Activity tab |
| "Average daily stitches over last 30 days" | ✅ "Recent Pace" on stats dashboard | Stats Stitching tab |
| "How long until this project is finished?" | ✅ ETA label in home projects + Tracker remaining time | Home + Tracker |
| "Which colours do I need to buy for this project?" | ✅ Thread Organiser in Creator + Tracker side panel | Creator + Tracker |
| "How many of my stash threads have I never used?" | ✅ "Threads Never Used" stat | Stats Stash tab |
| "What's my most used colour ever?" | ✅ Most-Used Colours list | Stats Stash tab |
| "Am I buying more threads than I use?" (SABLE) | ✅ SABLE index | Stats Stitching tab |
| "Stitches completed per project" | ❌ Not surfaced directly; available internally in `done` array | — |
| "Time to finish at current pace per project" | ✅ Projection card (Insights tab) | Stats Insights |
| "Total value of my stash" | ❌ Not present | — |
| "Most expensive project" | ❌ Not present | — |
| "Stitches completed today vs. goal" | ❌ No daily goal system | — |

**Missing stats assessment:** Most key stats are present. The notable absence is "total stash value" and "stitches per project" breakdown — but these are enhancements, not bugs.

---

## 6. Internal vs. Surfaced Stats

Stats that are computed internally but not surfaced to the user:

| Computed internally | Surfaced? | Notes |
|---|---|---|
| Per-project completion % | ✅ Home projects list, Tracker, Insights projections | Fully surfaced |
| Per-colour done/total | ✅ LegendTab "Done" column (when tracking active) | Surfaced in Creator |
| All-time sessions list with timestamps | ✅ Activity heatmap | Surfaced in Activity tab |
| `calcDifficulty()` per project | ✅ Difficulty vs Completion chart | Surfaced in Stats |
| `skeinEst()` per colour | ✅ LegendTab, Thread Organiser | Surfaced in Creator |
| `threadKm()` | ✅ Lifetime stitches subline | Surfaced |
| Total time per project (totalTime) | ✅ Time Estimate in ProjectTab, Time Spent in Home popover | Surfaced |
| Per-project backstitch count | ❌ `bsLines.length` computed but not shown in stats | Could be surfaced |

---

## Summary of Consistency Issues

| # | Issue | Severity | File |
|---|---|---|---|
| CS1 | Flash of "0" in home stats/stash tabs before data arrives | Low | home-app.js |
| CS2 | Empty stash KPIs (Home): bare "0" with no CTA guidance | Low | home-app.js |
| CS3 | Lifetime stitches = 0: no guidance to start tracking | Low | home-app.js, stats-page.js |
| CS4 | Thread list briefly empty in Tracker rail (no skeleton) | Low | tracker-app.js |
