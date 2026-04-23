# UX Round 2 Test Plan — Phases A → D

Manual QA checklist for the second consolidation pass. Test each phase in order. **Important:** before testing, hard-refresh each page (Ctrl + Shift + R) once to pick up the bumped `babel_creator_v16` cache key and the new `preferences-modal.js` script.

---

## Phase A — Tracker project switcher

**Setup:** Have at least 2 saved projects (use Creator → Save twice with different names).

1. Open `stitch.html` and load any existing project.
2. Click **File** in the header.
3. Verify a new menu item **"Switch Project…"** appears below "New Project".
4. Click **Switch Project…**.
   - A modal opens titled **"Switch project"**.
   - All saved projects are listed, sorted by most-recently-updated first.
   - The currently-loaded project shows a teal **"ACTIVE"** badge and is non-clickable.
   - Each card shows: name, progress bar + percent, dimensions, "X / Y stitches", "updated <date>".
5. Click a different project card.
   - Modal closes.
   - Tracker reloads with the chosen project's pattern, palette and progress.
   - Header name, autosave badge, progress percentage all reflect the new project.
6. Re-open Switch Project — the previously-clicked project now shows the ACTIVE badge.
7. Edge case: click the modal backdrop → it closes without switching.
8. Edge case: with no saved projects, the modal shows "No saved projects yet."

**Expected outcomes:**
- No console errors.
- Stitching progress on the previous project remains intact when you switch back to it.
- The Tracker auto-save flushes the previous project before swapping (verify by switching back: progress is preserved).

---

## Phase B — Global Preferences modal

**Test from each page:**

### B1 — From Creator (`index.html`)
1. Click **File → Preferences…** (new menu item).
2. Verify the overlay opens with three tabs: **Your profile**, **PDF defaults**, **Preview defaults**.
3. **Your profile tab:**
   - Type a name in *Designer name*. Refresh the page → reopen Preferences → name persists.
   - Upload a small PNG/JPEG as logo → preview thumbnail appears. **Replace** swaps it; **Remove** clears it.
   - Change *Logo position* to *Top-left*. Persists across refresh.
   - Type a copyright line and contact line.
4. **PDF defaults tab:** change preset, page size, margins, stitches-per-page, and toggle each include checkbox. Refresh → values persist.
5. **Preview defaults tab:** change default preview level, fabric colour (color picker + hex input), grid overlay, split-pane checkboxes. Refresh → values persist.
6. Click the **×** or press **Esc** or click backdrop → modal closes.
7. Open the **Export** tab in Creator — verify the "Designer branding" expandable card is **gone**, replaced with a one-line note: *"Designer branding (name, logo, copyright) is now in **File → Preferences**…"*.
8. Generate any pattern and export PDF → cover page shows the designer name/logo/copyright/contact you set in Preferences.

### B2 — From Tracker (`stitch.html`)
1. Click **File → Preferences…** — same modal opens.
2. Change a value, close, reopen — value persists.

### B3 — From Manager (`manager.html`)
1. Click **File → Preferences…** — same modal opens.
2. Repeat persistence check.

**Expected outcomes:**
- Identical Preferences modal visible from all three pages.
- All values stored in `localStorage` under `cs_pref_*` keys; survive page refresh and tab switch.
- No console errors on any page.

---

## Phase C — Pattern library badges & backup reconciliation

### C1 — "Stash Manager only" badge
1. Open `manager.html` → **Patterns** tab.
2. Click **+ Add Pattern**, fill in title and a few threads, save.
3. The new card shows a yellow/amber **"Stash Manager only"** badge (manual entry, no linked project).
4. From `index.html`, generate a new pattern → save it.
5. Switch back to Manager → reload via tab visibility (or refresh).
6. The auto-synced pattern shows the existing teal **"Auto-synced"** badge **and not** the "Stash Manager only" badge.

### C2 — Backup restore reconciliation
1. In Manager, click **Backup**, download `crossstitch-backup-*.json`.
2. Click **Restore**, choose the file, confirm.
3. Verify a green status bar shows success.
4. Without refreshing, observe:
   - Threads tab shows the restored inventory.
   - Patterns tab shows restored library (auto-synced and manual entries with correct badges).
   - Active project, if present in the backup, is reflected.
5. Open browser dev tools console → no errors. A `cs:backupRestored` CustomEvent should be observable if you add a listener (`window.addEventListener('cs:backupRestored', console.log)` before clicking Restore).

**Expected outcomes:**
- Manual entries always show the "Stash Manager only" badge.
- Auto-synced entries always show the "Auto-synced" badge.
- Restore no longer requires a manual page refresh to see the new data.

---

## Phase D1 — Removed duplicate Save/Load card

1. Open Creator, generate a pattern, switch to **Export** tab.
2. The bottom of the Export panel **must not** contain a "Save / load project file" card with Download (.json) and Load buttons.
3. The **File → Save / Open** menu items still work and replace the removed functionality.
4. The **Download** label in the File menu (renamed in round 1) is unchanged.

---

## Phase D2 — Renamed palette modals

In Creator, generate a pattern, open the **Project** tab.

1. Find the button previously labelled **"Substitute from Stash"** → it now reads **"Replace with Stash Threads"**.
2. Click it → modal title is **"Replace with Stash Threads"**.
3. Find the button previously labelled **"Convert Palette"** → it now reads **"Change Thread Brand"**.
4. Click it → modal title is **"Change Thread Brand"**.
5. Functionality of both modals is otherwise unchanged.

---

## Phase D3 — Multi-format file picker

1. In Creator, click **File → Open**.
2. The OS file picker should accept (depending on OS, may show "All supported"):
   - `.json` (saved projects)
   - `.oxs` / `.xml` (KG-Chart patterns)
   - `.pdf` (Pattern Keeper-compatible PDFs)
   - Image files: `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.webp`
3. Loading each supported file type still routes to the correct importer (json → project, oxs → pattern parse, image → pattern generation, pdf → pdf importer).
4. In Tracker (`stitch.html`), the same multi-format accept filter is in effect from **File → Open**.
5. **Restore from Backup** in the File menu still only accepts `.json` (unchanged).

---

## Phase D4 — Basic PNG export

1. Open Creator, generate a small pattern (e.g. 50×50).
2. Switch to **Export** tab → expand **Format & settings**.
3. Verify the Format radios: **PDF** (selected) and **PNG** (now enabled, no longer "coming soon"); OXS still disabled with "(coming soon)".
4. Select **PNG** → bottom CTA changes to **Export PNG**.
5. Click **Export PNG** → a `.png` file downloads named after the project (e.g. `My_Pattern.png`).
6. Open the downloaded PNG. Verify:
   - Width = pattern columns × 10 px (e.g. 500 px for 50 cols).
   - Height = pattern rows × 10 px.
   - Each cell is the matching DMC RGB colour (or white for empty / skip cells).
   - White background where there is no stitch.
7. Switch back to **PDF** → CTA returns to **Export PDF** and behaves as before.

**Edge cases:**
- An empty project: the disabled-state guard for PDF (no chart modes) does **not** affect PNG. PNG will export an all-white image.
- Very large pattern: PNG dimensions scale linearly (10 px/cell). 200×200 → 2000×2000 PNG.

---

## Smoke test (cross-cutting)

1. Hard-refresh each of the three pages once. Watch the console.
   - Expect: `Cached compiled creator code under key babel_creator_v16` (Creator only).
   - No "PreferencesModal is not defined" or "TrackerProjectPicker is not defined" errors.
2. Toggle browser offline mode → all three pages still operate (no network calls for Preferences).
3. Open Manager in one tab and Tracker in another. Trigger a backup-restore in Manager → after the dialog confirms success, the Tracker tab still functions (no crash). Reload the Tracker if you want to see the restored projects.

---

## Regression checks

- ✅ `npm test -- --runInBand` → **498 / 498 tests pass** (verified during implementation).
- ✅ Creator bundle rebuilt: `creator/bundle.js` (664 541 bytes, 32 files).
- ✅ Cache key bumped: `babel_creator_v15` → `babel_creator_v16`.
- The pre-generation metadata form (designer + description), autosaved badge, and beforeunload flush from Round 1 should all still behave as before.
