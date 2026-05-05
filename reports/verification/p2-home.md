# P2 Verification: Home (14)

| ID | Result | File:line | Notes |
|---|---|---|---|
| VER-EL-SCR-001-02-02 | PASS | home-app.js:994-995 | Stash and Stats lazy-loaded only when tab opens |
| VER-EL-SCR-001-14-01 | PASS | components.js:2175-2193 | AppInfoPopover handles Escape + click-outside |
| VER-EL-SCR-001-31-01 | PASS | home-app.js:1038-1042 | cs:prefsChanged listener re-filters projects without reload |
| VER-EL-SCR-002-06-01 | PASS | home-app.js:506-525 | Embroidery tile gated on experimental.embroideryTool |
| VER-EL-SCR-003-01-01 | PASS | home-app.js:994-995 | StashPanel lazy via useEffect [tab] |
| VER-EL-SCR-004-04-01 | PASS | home-app.js:995,1005 | StatsPanel lazy via useEffect [tab] |
| VER-EL-SCR-052-07-01 | PASS | home-screen.js:756-757 | handleBulkArchive uses ProjectStorage.setStateMany() |
| VER-EL-SCR-052-09-01 | PASS | home-screen.js:560-567 | BulkDeleteModal SHOW_MAX = 5 + "+N more" |
| VER-EL-SCR-052-11-01 | PASS | home-screen.js:849-865 | continueProj filters !managerOnly |
| VER-EL-SCR-052-13-02 | PASS | home-screen.js:972 | Suggestion suppressed when proj.id === continueProj.id |
| VER-EL-SCR-053-01-01 | PASS | home-screen.js:256-270 | Long-press 500ms enters selection mode |
| VER-EL-SCR-053-01-02 | PASS | home-screen.js:272-281 | Cmd/Ctrl+click toggles select without entering selection mode |
| VER-EL-SCR-053-03-01 | PASS | home-screen.js:222-239 | PartialStitchThumb payload lazy-loaded on mount |
| VER-EL-SCR-053-12-01 | PASS | home-screen.js:213-214 | calcDifficulty(threadCount, 0, totalStitches, {fabricCt}) |

## Defects to file
_None._

## Final result
- 14 items: 14 PASS / 0 FAIL / 0 PARTIAL / 0 UNVERIFIABLE
