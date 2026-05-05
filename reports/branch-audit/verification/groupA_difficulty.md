# Phase 1 Verification — Group A: Difficulty Metrics

**Commits**: `dde642f` (Difficulty metrics), `f36436a` (Fixes for difficulty)

**Sources**: subagent trace + spot-check of `helpers.js`, `creator/ActionBar.js`, `tests/creatorActionBar.test.js`.

## 1.1 Intended behaviour

Replace ad-hoc complexity guessing with a multi-factor difficulty score that grades patterns on five dimensions (colour complexity, confetti density, colour-changes-per-area, size/duration, technique load) and surfaces a single label/star tier across four UI consumers. `calcDifficulty(palLen, blendCount, totalSt, opts?)` returns `{label, color, stars, score, factors}`. UI surfaces: `home-screen.js` project card, `stats-page.js` project rows, `creator/ActionBar.js` chip, `creator/PatternInfoPopover.js` breakdown. Commit `f36436a` additionally changes the ActionBar to render a minimal "Setting up" + Stats-link bar before a pattern is loaded (previously returned `null`).

## 1.2 Code-path trace

| Step | File:line | What happens |
|---|---|---|
| 1 | helpers.js#L139–182 | `calcDifficulty()` defined; defaults `opts={}`, `fabricCt=14`, derives confetti/change scores from palette if not supplied |
| 2 | creator/useCreatorState.js#L628–633 | Creator computes `state.difficulty` with full `opts: {fabricCt, bsCount, confettiScore, changeScore}` |
| 3 | creator-main.js#L873 | `colourCount={state.pal ? state.pal.length : 0}` (after f36436a, no longer crashes when pal is null) |
| 4 | creator/ActionBar.js#L101–122 | If `!props.ready`, renders minimal bar (Setting-up label + Stats link); otherwise full bar with difficulty chip |
| 5 | creator/PatternInfoPopover.js#L107–134 | Renders breakdown of `props.difficulty.factors` |
| 6 | home-screen.js#L213 | `calcDifficulty(threadCount, 0, proj.totalStitches, {fabricCt: proj.fabricCt \|\| 14})` — note **always passes `0` for blendCount** (no blend awareness on home cards) |
| 7 | stats-page.js#L1309 | `calcDifficulty(palLen, blendCount, total)` — no opts |
| 8 | tracker-app.js | difficulty surfaced in tracker chip |

## 1.3 Implementation check

| Aspect | Verdict | Note |
|---|---|---|
| `calcDifficulty` signature stable across 4 consumers | ✅ IMPLEMENTED | All four pass `(palLen, blendCount, totalSt, opts?)`. |
| Pre-pattern ActionBar renders Stats link | ✅ IMPLEMENTED | Confirmed in source and test was updated. |
| Difficulty chip safe when state.pal is null | ✅ IMPLEMENTED | `state.pal ? state.pal.length : 0` (f36436a). |
| Icons.barChart fallback when icon missing | ✅ IMPLEMENTED | `Icons.barChart ? Icons.barChart() : null`. |
| home-screen always passes blendCount=0 | ⚠️ PARTIAL | Home difficulty score will *underestimate* difficulty for blend-heavy patterns vs the same project viewed in stats-page. Cosmetic inconsistency, not a crash. |

## 1.4 Failure modes

| Mode | Verdict | Note |
|---|---|---|
| `totalSt = 0` (empty pattern) | ✅ HANDLED | helpers.js guards log/divide; stats-page guards `total > 0` for percentage. |
| `palLen = 0` | ✅ HANDLED | Stats-page early-out; useCreatorState skips the calc when `!pal`. |
| Difficulty calc throws on malformed pattern | ⚠️ IMPLICITLY HANDLED | No try/catch around the call; an exception would bubble into React render and crash the surface. No tests for malformed input. |
| Pre-pattern ActionBar crash if Icons missing | ✅ HANDLED | Conditional render. |

## 1.5 Regression check

| Risk | Verdict |
|---|---|
| Test gate that asserted ActionBar didn't render before pattern load | ✅ SAFE — `tests/creatorActionBar.test.js` updated in same commit. |
| Difficulty signature broken existing PatternInfoPopover/home-screen | ✅ SAFE — return shape adds `factors` field; old consumers reading `{label, color, stars, score}` are unaffected. |
| Home-card vs stats-page disagreement on difficulty for same project | ⚠️ RISKY — see 1.3 (blendCount=0 hardcoded on home). Not user-blocking. |

**Group verdict**: No critical issues. One LOW cosmetic inconsistency (home-screen blendCount=0).
