# P0 Verification: Service Worker & Home

| ID | Result | File:line | Notes |
|---|---|---|---|
| VER-AUTH-002 | PASS | sw-register.js:1-23 | All 5 HTML entry points load sw-register.js; controllerchange listener (line 17–22) reloads on new SW activation; 10-min poll (line 6) calls reg.update() |
| VER-EL-SCR-001-01-01 | PASS | help-drawer.js:577-581; header.js:354-355 | HelpDrawer dispatches cs:helpStateChange on open (577) and close (581); Header listens (354) and updates setHelpOpen state which drives aria-expanded |
| VER-EL-SCR-001-05-01 | PASS | home-app.js:219-226 | ActiveProjectCard checks `if (!p)` and renders empty state card; no undefined render |
| VER-EL-SCR-052-05-01 | PASS | home-screen.js:635-646 | Escape keydown handler exits selection mode (640) and clears set (641); listener mounts/unmounts with selectionMode |
| VER-EL-SCR-053-19-01 | PASS | manager-app.js:1278-1282 | onOpenProject handler calls `ProjectStorage.setActiveProject(proj.id)` (line 1281) BEFORE `window.location.href` navigation (line 1282) |

## Detailed findings

### VER-AUTH-002
- Service Worker loads on all 5 HTML entry points: home.html:72, create.html:287, stitch.html:116, manager.html:88, index.html:279 each include `<script src="./sw-register.js"></script>`.
- sw-register.js:6 has 10-minute update poll: `setInterval(() => { reg.update().catch(() => {}); }, 10 * 60 * 1000);`
- sw-register.js:17-22 has controllerchange listener with guarded reload: `if (!refreshing) { refreshing = true; window.location.reload(); }`

### VER-EL-SCR-001-01-01
- help-drawer.js:577 dispatches `cs:helpStateChange` in `open()`; line 581 dispatches in `close()`.
- header.js:354-355 mounts `addEventListener('cs:helpStateChange', onHelpState)` with cleanup; aria-expanded driven from helpOpen state at line 350.

### VER-EL-SCR-001-05-01
- home-app.js:220 checks activeProject falsy: `var p = props.activeProject; if (!p) { return h('div', ...)`. Empty state renders inline without undefined.

### VER-EL-SCR-052-05-01
- home-screen.js:635 comment "Escape exits selection mode (mounts/unmounts with the mode)".
- Line 639: `if (e.key === 'Escape')`. Lines 640-641: `setSelectionMode(false); setSelected(new Set());`. Listener scoped by useEffect dependency `[selectionMode]` (line 646).

### VER-EL-SCR-053-19-01
- manager-app.js:1281: `try { ProjectStorage.setActiveProject(proj.id); } catch (e) {}` (called first).
- manager-app.js:1282: `window.location.href = (target === "creator" ? "create.html" : "stitch.html") + "?source=manager";` (after).
- Guard prevents silent failure: `if (!proj || !proj.id || proj.managerOnly) return;`.

## Defects to file
None — all items pass static code inspection.

## Final result
- **5 items: 5 PASS / 0 FAIL / 0 PARTIAL / 0 UNVERIFIABLE**
