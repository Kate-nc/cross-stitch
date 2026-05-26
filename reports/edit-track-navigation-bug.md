# Navigation Bug Report — Edit / Track Opens Wrong Project

## 1. Bug Description

Clicking an **Edit** or **Track** button on any per-row or per-card entry (Home
page project list, Stash Manager "Your Projects" panel, Stash Manager
"Saved Projects" section, or pattern-library modal) always opened the
*most-recently-edited* project instead of the project in the clicked row.

### Reproduction Steps

1. Create at least two projects (e.g. "Alpha" and "Beta").
2. Open **Beta** in the Creator so it becomes the most-recently-edited project
   and the `crossstitch_active_project` localStorage pointer is left pointing
   at Beta's ID.
3. Navigate to the Home page (or Stash Manager).
4. Click **Track** on **Alpha**'s row.
5. **Expected:** the Stitch Tracker opens showing Alpha's grid.  
   **Actual:** the Stitch Tracker opens showing Beta's grid (or a blank canvas
   if Beta had been auto-saved without a full pattern array).

---

## 2. Root Cause Analysis

Three independent bugs combined to produce the symptom.

### Bug A — Race between `cs:projectsChanged` and page unload (home-app.js)

`home-app.js` runs a continuous `refreshAll()` loop that listens to the
`cs:projectsChanged` custom event (fired by `ProjectStorage.setActiveProject`).
When the user clicked Track, `activateAndGo` called:

```js
// OLD (broken)
ProjectStorage.setActiveProject(id);      // fires cs:projectsChanged immediately
window.location.href = href;              // starts page unload
```

If an in-flight IDB query from a previous `refreshAll()` call returned `null`
(common for projects without a `.pattern` field), the self-heal guard:

```js
if (!cancelled && !p && !window.__navigatingAway) clearActiveProject();
```

fired *after* `setActiveProject` but *before* the new page loaded, silently
clearing the pointer that was just set.

### Bug B — No URL-param fallback (`home-app.js`, `manager-app.js`)

All navigation URLs were bare — e.g. `stitch.html?from=home` — with no project
ID embedded. If Bug A cleared the localStorage pointer during the ~50–200 ms
between navigation and the destination page's startup, there was no fallback
mechanism.  The Tracker would silently fall back to "most recent IDB entry
(sort by updatedAt)", which is always whichever project was last edited.

### Bug C — Missing `window.__navigatingAway` guard (manager-app.js)

The inline Track/Edit buttons in `manager-app.js` never set
`window.__navigatingAway = true`, leaving a window for any `cs:projectsChanged`
listener (auto-save, project-list refresh) in any loaded page to clear the
pointer after the navigation had started.

---

## 3. Fixes Applied

The fix is a belt-and-suspenders pattern: **three independent mechanisms** each
capable of delivering the correct project ID to the destination page even if the
others fail.

### Layer 1 — `setActiveProject(id)` (synchronous localStorage write)
Already in place for all navigation paths; retained as the primary mechanism.

### Layer 2 — `?id=<projectId>` URL parameter
Appended by every navigation site. Destination pages read it synchronously at
the earliest possible moment (before any Babel-compiled script runs) and write
it to `crossstitch_active_project`, healing any race-cleared pointer.

### Layer 3 — Destination-side `URLSearchParams` fallback (tracker-app.js)
`TrackerApp`'s loading `useEffect` reads `URLSearchParams` as a second fallback
inside the React component, guarding against the case where the inline startup
script was somehow skipped.

### Source Changes

| File | Change |
|---|---|
| `home-app.js` | `activateAndGo` sets `window.__navigatingAway = true` **before** `window.location.href`; appends `?from=home&id=<id>` |
| `manager-app.js` (inline buttons) | Added `window.__navigatingAway = true` and `&id=<id>` to both Track and Edit navigation |
| `manager-app.js` (PatternModal.handleTrack) | Added `window.__navigatingAway = true` and `&id=<linkedProjectId>` |
| `manager-app.js` (ProjectLibrary onOpenProject) | Added `window.__navigatingAway = true` and `&id=<proj.id>` to the "Your Projects" card navigation path |
| `header.js` (pickProject) | Added `?id=<id>` to the project-switcher stitch.html URL (already had `__navigatingAway`) |
| `help-drawer.js` (sample project) | Added `window.__navigatingAway = true` and `?id=<p.id>` to sample-project navigation |
| `home-screen.js` (sample project) | Added `window.__navigatingAway = true` and `?id=<id>` to sample-project navigation |
| `stitch.html` | Inline startup guard reads `?id=` from the URL and writes `crossstitch_active_project` **before** the redirect check |
| `create.html` | Same inline guard as `stitch.html` — heals the pointer before any Babel script runs |
| `index.html` | Same inline guard merged into the existing redirect-to-home check |
| `tracker-app.js` | Loading `useEffect` reads `URLSearchParams('id')` as a second fallback, validates `^proj_`, calls `setActiveProject` if the current pointer differs |

### Commit History

| Commit | Summary |
|---|---|
| `696e589` | Fixed `PatternModal.handleTrack` storing a metadata-only manager entry in `crossstitch_handoff`; tracker now checks `p.pattern` before calling `processLoadedProject` and shows a toast for patternless entries |
| `05dc6e8` | Main navigation fix — `activateAndGo`, manager inline buttons, `PatternModal.handleTrack`, `stitch.html` guard, `tracker-app.js` URLSearchParams fallback, regression tests |
| `9d66295` | Minor: added `p.p` as an alias for `p.pattern` in the tracker's IDB-load path |
| *(this session)* | Fixed `ProjectLibrary onOpenProject` in `manager-app.js` (missing `?id=` and `__navigatingAway`); added `?id=` guards to `create.html` and `index.html` |

---

## 4. Navigation-Target Audit

All per-entity navigation links in the application, with the two required
properties: `?id=` in the URL and `window.__navigatingAway = true` set before
assignment to `window.location.href`.

| Source | Button/Action | Target | `?id=` | `__navigatingAway` | Status |
|---|---|---|---|---|---|
| `home-app.js` `activateAndGo` | Track | `stitch.html` | ✓ | ✓ | Fixed |
| `home-app.js` `activateAndGo` | Edit | `create.html` | ✓ | ✓ | Fixed |
| `manager-app.js` inline buttons | Track (Saved Projects) | `stitch.html` | ✓ | ✓ | Fixed |
| `manager-app.js` inline buttons | Edit (Saved Projects) | `create.html` | ✓ | ✓ | Fixed |
| `manager-app.js` PatternModal | handleTrack | `stitch.html` | ✓ | ✓ | Fixed |
| `manager-app.js` ProjectLibrary | onOpenProject (tracker) | `stitch.html` | ✓ | ✓ | Fixed (this session) |
| `manager-app.js` ProjectLibrary | onOpenProject (creator) | `create.html` | ✓ | ✓ | Fixed (this session) |
| `header.js` | pickProject (project switcher) | `stitch.html` | ✓ | ✓ | Fixed (this session) |
| `help-drawer.js` | Sample project CTA | `stitch.html` | ✓ | ✓ | Fixed (this session) |
| `home-screen.js` | Sample project CTA | `stitch.html` | ✓ | ✓ | Fixed (this session) |
| `creator/useProjectIO.js` | "Open in Tracker" (inline handoff) | `stitch.html#p=` / `?source=creator` | N/A — passes project directly in URL hash or `crossstitch_handoff` | N/A | Different mechanism; not affected |
| `tracker-app.js` | "Edit in Creator" | `create.html?source=tracker` | N/A — current project already active | N/A | In-session nav; not affected |
| `stats-page.js` | Empty-state "Open a project" CTA | `stitch.html` | N/A — generic "open whatever is active" | N/A | No specific project targeted; not affected |
| `tracker-app.js` (stats switcher) | switchToTrack `{id}` | In-page | N/A — in-page nav via `ProjectStorage.get(id)` directly | N/A | No URL hop; not affected |

---

## 5. Regression Tests

All tests live in `tests/trackNavigationGuardrail.test.js` (source-content
assertions; no browser or IndexedDB required).

| Test Suite | Tests |
|---|---|
| home-app activateAndGo | `?id=` appended; `__navigatingAway` set before href |
| manager-app inline buttons | Track has `?id=` and `__navigatingAway`; Edit has `?id=` and `__navigatingAway` |
| manager-app PatternModal | `handleTrack` sets `__navigatingAway`; appends `&id=<linkedProjectId>` |
| manager-app ProjectLibrary onOpenProject | Sets `__navigatingAway`; appends `&id=<proj.id>`; guard is before href |
| header.js pickProject | Appends `?id=<id>`; `__navigatingAway` set before href |
| help-drawer.js sample project | Sets `__navigatingAway`; appends `?id=<p.id>` |
| home-screen.js sample project | Sets `__navigatingAway`; appends `?id=<id>` |
| stitch.html redirect guard | Reads `?id=`; validates `^proj_`; writes localStorage |
| create.html startup guard | Reads `?id=`; validates `^proj_`; writes localStorage |
| index.html startup guard (legacy URL) | Reads `?id=` before redirect check; validates `^proj_` |
| TrackerApp URLSearchParams fallback | Reads params before `getActiveProject()`; validates `^proj_`; calls `setActiveProject` |
| TrackerApp incomingProject path | Checks `p.pattern` before `processLoadedProject`; shows toast for patternless |

Total: **26 tests**, all passing.

---

## 6. Safeguard — How Recurrence is Prevented

Any future navigation from a project list to the Creator or Tracker must follow
this three-layer contract. The regression tests in
`tests/trackNavigationGuardrail.test.js` encode the contract as source-content
assertions that run on every `npm test` pass:

1. **Call `ProjectStorage.setActiveProject(id)` first** (synchronous localStorage
   write — keeps existing behaviour for the fast-path case).
2. **Set `window.__navigatingAway = true`** before assigning
   `window.location.href` so in-flight `cs:projectsChanged` listeners don't
   clear the pointer while the page is unloading.
3. **Append `?id=<encodeURIComponent(id)>` to the URL** so destination pages can
   self-heal from the URL even if localStorage was cleared by a race.

The destination-side guards (`stitch.html`, `create.html`, `index.html` inline
scripts, and `tracker-app.js` URLSearchParams fallback) are independently tested
so they can't be silently dropped in a future refactor.

---

## 7. Flagged Items

- **Stats page in-page navigation** (`switchToTrack({id})` in `creator-main.js`
  / `UnifiedApp`): uses `ProjectStorage.get(id)` directly without any URL hop.
  There is no localStorage pointer involved, so the race doesn't apply. No
  changes needed.

- **Creator → Tracker "Open in Tracker"** (`creator/useProjectIO.js`): passes
  the project directly in the URL hash (`#p=<base64>`) or via
  `crossstitch_handoff` in localStorage. This is a different hand-off mechanism
  that doesn't use the `setActiveProject` pointer for delivery; the active-
  project pointer is only a fallback when both primary paths fail. No changes
  needed.

- **Tracker → Creator "Edit in Creator"** (`tracker-app.js`): navigates to
  `create.html?source=tracker`. The current project is already active; no
  specific-project-picking race is possible. No changes needed.

- **`stats-page.js` empty-state CTA**: navigates generically to `stitch.html`
  with no specific project targeted. If an active project is set it will open;
  otherwise `stitch.html`'s guard redirects to `home.html`. Correct behaviour.
  No changes needed.
