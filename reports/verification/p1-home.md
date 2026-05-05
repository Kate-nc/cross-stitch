# P1 Verification: Home (16)

| ID | Result | File:line | Notes |
|---|---|---|---|
| VER-EL-SCR-001-02-01 | PASS | home-app.js:826-831 | Tab parameter read from URLSearchParams; validated against allowed values |
| VER-EL-SCR-001-05-02 | PASS | home-app.js:82-89 | activateAndGo() calls setActiveProject() then navigates with from=home param |
| VER-EL-SCR-001-10-01 | PASS | home-app.js:1042-1046 | Filters exclude active project AND respect homeShowCompleted preference |
| VER-EL-SCR-001-15-01 | PASS | home-app.js:335-370 | Metadata popover computed from full project: dimensions, fabric, colours (distinct count), progress |
| VER-EL-SCR-002-04-01 | PASS | home-app.js:504-507 + creator-main.js:1386-1391 | Serializes to sessionStorage; creator-main reconstructs without second picker |
| VER-EL-SCR-003-10-01 | PASS | home-app.js:925-935 | StashBridge.getShoppingList() called when Stash tab opens; refreshes on tab change |
| VER-EL-SCR-003-14-01 | PASS | home-app.js:961 | Ready patterns filtered: pct >= 100 |
| VER-EL-SCR-004-03-01 | PASS | home-app.js:733 + 970 | Lifetime stitches from PS.getLifetimeStitches(); rendered in hero |
| VER-EL-SCR-004-05-01 | PASS | home-app.js:94-120 | Sparkline handles edge case (pts.length > 1 ? step : 0); polyline valid SVG |
| VER-EL-SCR-004-08-01 | PARTIAL | project-storage.js:712-727 | OldestWIP uses lastTouchedAt OR updatedAt OR LEGACY_EPOCH; spec also asks for createdAt fallback |
| VER-EL-SCR-052-02-01 | PASS | home-screen.js:818-820 | Bulk action bar hidden initial render; appears only when first project selected |
| VER-EL-SCR-052-04-01 | PASS | home-screen.js:881 | Select All filter `.filter(p => !p.managerOnly)` |
| VER-EL-SCR-052-08-02 | UNVERIFIABLE | home-screen.js:505 | Single-project delete path through EditProjectDetailsModal — needs separate verification |
| VER-EL-SCR-052-13-01 | PASS | home-screen.js:150-187 | Suggestion scores by recency + completion % + stash readiness |
| VER-EL-SCR-053-03-02 | PASS | home-screen.js:618-619, 238-243 | Shared payloadCacheRef Map; cache.has() prevents re-fetching |
| VER-EL-SCR-053-11-01 | PASS | home-screen.js:373 | aria-valuenow set to pct; width synced via Math.min(100, pct) + '%' |

## Defects to file

1. **VER-EL-SCR-004-08-01 (PARTIAL)** — `getOldestWIP()` should also consider `createdAt` as a fallback when `lastTouchedAt` and `updatedAt` are both absent. Recently-created but never-touched projects are sorted to LEGACY_EPOCH which is correct only if `createdAt` is treated as the ordering key.

## Final result
- 16 items: 14 PASS / 0 FAIL / 1 PARTIAL / 1 UNVERIFIABLE
