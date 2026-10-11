# Tracking Audit Remediation: Working Agreement (applies to every phase)

Read this first. Every phase prompt (`phase-01` to `phase-06`) assumes it. The findings
being fixed are defined in [reports/tracking-audit.md](../../tracking-audit.md); read the
cited finding entries there in full before you start a phase. Evidence (observed vs
inferred) is stated in each entry. **Re-verify before you fix.** The audit was done at
commit `cd4e987` (v1.0.105); if `main` has moved, check each claim is still true and
note any that are not.

## The six phases

| Phase | Theme | Findings |
|---|---|---|
| 1 | Trust in saved progress | TRACK-01, TRACK-02, TRACK-03, TRACK-12, BUG-06, BUG-07 |
| 2 | One truth for the numbers, plus quick bug fixes | STATS-01, STATS-04, STATS-05, STATS-02, STATS-07, BUG-01, BUG-02, BUG-03, BUG-04, BUG-05 |
| 3 | Honest time and correctable history | STATS-03, STATS-06, STATS-08, STATS-09 |
| 4 | Small screens and touch | TRACK-06, TRACK-07, TRACK-08, TRACK-05, TRACK-11, COMMON-01 |
| 5 | Legibility, orientation, accessibility | TRACK-09, TRACK-10, COMMON-02 |
| 6 | More stitch types and project extras | TRACK-04, TRACK-13, TRACK-14 |

Phases run strictly in order. Phase 6 depends on the progress definition from Phase 2;
Phase 3 depends on Phase 2; Phase 1 comes first because nothing else matters if progress
is lost.

## Non-negotiable rules

### 1. Never slow the app down

Marking, panning, zooming, project load and the Stats pages must be no slower than before,
and the work done per mark must stay O(cells changed), never O(pattern). Concretely:

- **Baseline first.** Before changing code, record numbers on the current `main`:
  `npm run perf:baseline` (writes `reports/perf-results/`), plus the audit harness
  (`harness/p1.js`: load-to-canvas time and drag-mark latency on the 300x300 fixture,
  idle frame gap). Re-measure after each batch. A regression greater than 5% in any of
  load time, drag-mark latency, p95 frame time while marking or Stats-page open time is a
  failed batch: fix it or drop the change.
- **No new full-pattern scans on the mark path.** `useStitchCounts.js` already maintains
  incremental counters (the "T-5 invariant"). Extend them; do not recompute from `pat`
  or `done` on every tap. `useAutoSession.js` carries a PERF note about an O(n) scan that
  once slowed marking; do not reintroduce that pattern.
- **Keep saves small and off the interaction path.** Any new write on the mark path must
  write only what changed, be throttled, and never block a frame. Never serialise the
  whole pattern per mark. Large work (snapshots, minimap tiles, merges) goes in idle
  callbacks, `requestIdleCallback`, or the existing workers.
- **Keep new scripts lazy where possible.** New files that are not needed to draw the
  chart should load lazily (see `lazy-modules.js`, `runtime-loaders.js`). Mind the CSP in
  the page headers (`script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs...`).
- **Add a regression guard**: where practical a Jest test with a counting stub proving
  the mark path performs no full scans (see `tests/chartPartialRepaint.test.js`,
  `tests/largeChartCanvas.test.js`, `tests/perf/` for the existing style).

### 2. Keep user progress homogeneous with the rest of the app

Progress and history must keep flowing through the same single path as everything else, so
every part of the site agrees and nothing is stranded:

- **Storage:** all project data goes through `ProjectStorage` (`project-storage.js`,
  IndexedDB). Do not introduce a second store for per-project progress except where a
  phase prompt explicitly designs one (Phase 1's small "done" record), and then it is
  owned by `ProjectStorage`, written by the same API, included in backup, and cleaned up
  on project delete.
- **Schema:** the project format stays at `version: 11`. New data is **optional fields**
  that older builds ignore, exactly as `knotsDone` was added. Use `knotsDone` as the
  template and touch every place it appears: `knots.js`, `project-storage.js`,
  `sync-engine.js` (merge and conflict classification), `tracker-app.js` (load, snapshot,
  flush, `__updateCreatorTrackerFields`), `creator/useProjectIO.js`,
  `creator/useEditHistory.js`, `creator-main.js`, plus tests modelled on
  `tests/projectStorageKnots.test.js` and `tests/syncKnots.test.js`.
- **Every consumer agrees:** Home cards (`home-app.js`), the project library and
  dashboard (`project-library.js`, `home-screen.js` `MultiProjectDashboard`), the Stash
  Manager pattern library (`stash-bridge.js`), project and global Stats
  (`components-stats.js`, `stats-page.js`, `stats-insights.js`, `insights-engine.js`),
  backup/restore (`backup-restore.js`) and `.csync` sync (`sync-engine.js`). Any figure
  that appears in more than one place must come from **one shared helper** (for example
  `helpers.js` or a new tiny global module), not copies. Adding a new global script means
  adding it to every page that needs it **and** to `sw.js`'s precache list
  (`tests/swPrecacheSync.test.js` enforces this).
- **Preferences:** settings go through `UserPrefs` (`user-prefs.js`) with defaults
  declared there and UI in `preferences-modal.js`, the same as `trackerIdleMinutes`.
  Per-project overrides follow the existing per-project patterns.
- **UI components:** reuse existing ones: `Toast` (`toast.js`), the modal helpers in
  `modals.js`, `Icons` (`icons.js`), `SaveStatusBadge` (`header.js`), existing
  tokens in `styles.css`. No new bespoke dialog or colour scheme.
- **The Creator must not clobber tracker data:** whenever the tracker gains a persisted
  field, add it to the `__updateCreatorTrackerFields` container and the Creator's
  save/preserve path (see how `knotsDone` is handled), and add a test that a Creator
  save preserves it.

### 3. Existing users' progress and history must survive

- Every change that touches stored data states in the PR description: what changes,
  whether a migration is needed, whether past statistics can be recomputed or are
  approximate. Prefer **no migration** (optional fields; absent means old behaviour).
- Write a test that loads a **pre-change** project (use fixtures from before your
  change, including `statsSessions` from earlier versions, legacy `totalTime`-only
  projects, projects with `halfStitches`/`knots`, and compact-array patterns) and asserts
  progress, sessions, milestones and snapshots are intact after the new code loads and
  saves it.
- Never delete or rewrite a user's `done`, `statsSessions`, `doneSnapshots` or
  `achievedMilestones` as a side effect of a UI change. If recomputation is needed, keep
  the old value until the new one is confirmed (write new fields beside old ones).
- Round-trip through backup/restore and `.csync` export/import in a test.

### 4. Repository conventions (from `AGENTS.md` and `.github/copilot-instructions.md`)

- **Run `npm test` before every commit.** The pre-commit hook fails on stale builds. Run
  `npm run lint:terminology` and `npm run lint:css-tokens`.
- After editing `tracker-app.js`, `creator-main.js`, `manager-app.js` or `embroidery.js`:
  `node build-runtime-js.js` and commit `compiled/`. After editing anything in
  `creator/`: `node build-creator-bundle.js`. After editing `import-engine/`:
  `node build-import-bundle.js`. Never hand-edit generated files.
- **No emojis or symbol marks in user-facing strings** (including toasts, help text,
  tooltips). Use `window.Icons.*`; add an icon to `icons.js` (24x24, 1.6 stroke,
  `currentColor`) if needed. Write menu paths as "File > Preferences".
- **No raw hex in component CSS**; use the Workshop tokens. `rgba()` only inside
  `box-shadow`.
- **UTF-8 only** for every file you touch (the audit found mojibake in `home.html`).
- **User-visible changes** also need the in-app help (`help-drawer.js`) and the
  hand-written `APP_CHANGELOG` (`version.js`) updated. If you add or change a keyboard
  shortcut, update both the shortcut registry and the help list
  (`tests/helpDrawerShortcutsSync.test.js` fails otherwise).
- **Do not modify** `pdf-export-worker.js`, `creator/pdfChartLayout.js` or
  `creator/pdfExport.js` (Pattern Keeper-compatible export is bit-stable).
- Keep code style consistent with the surrounding file (comment density, naming, ES5
  style in the plain-script files). No new dependencies or bundlers.
- Phone and tablet are first-class: every UI change is checked at 393x727, 851x393,
  768x1024 and 1440x900, with mouse, keyboard and touch.

### 5. How to work through a phase

1. **Reproduce.** Use the audit harness (`reports/tracking-audit/harness/`, see its
   README) or write a failing Jest test that captures the finding. Do not start a fix
   without a failing check.
2. **Plan the batches.** Split the phase into 2 to 5 batches, each small enough to
   review in one sitting, each independently shippable and test-green. Write the plan at
   the top of the phase's progress log (below) before coding.
3. **Implement one batch at a time**, following the recommendation and acceptance
   criteria of each finding. Each finding's acceptance criteria are the definition of
   done; add automated tests for each (Jest for logic, Playwright specs under
   `tests/e2e/` for interactions; the `*.compiled.js` and workers are covered by the
   existing patterns).
4. **Stage review ("bug hunt") after every batch**, see section 6.
5. **Open one pull request per batch** (the user has explicitly asked for PRs here).
   Use the repository's PR template if one exists. The PR description must contain:
   findings addressed, what changed for the user, performance numbers before/after,
   data/migration statement, tests added, bug-hunt results, screenshots at phone and
   desktop widths for UI changes, and anything deliberately left out.
6. **Subscribe to the PR and then STOP.** Do not start the next batch, the next
   phase, or stack branches on unmerged work. Wait for the user to review and merge
   the PR into `main`. While waiting, only fix CI failures and answer review comments on
   that PR. When the merge is confirmed, update from `main`, then start the next batch.
7. **At the end of the phase** (all batches merged): run the full phase bug hunt
   (section 6), write the phase report (below), open a final small PR containing only
   the report and any bug-hunt fixes, and wait for the merge. **Do not start the next
   phase until the user says to.**

### 6. Bug hunt (after every batch, and a full pass at the end of each phase)

A bug hunt is an adversarial pass whose job is to find what you broke or missed. It is
not a re-run of your own tests. Do all of the following and record results in
`reports/tracking-audit/phases/phase-N-bughunt.md` (append a section per batch):

1. **Full automated run:** `npm test`, `npm run lint:terminology`,
   `npm run lint:css-tokens`, `node build-runtime-js.js --check`, and the Playwright
   projects relevant to the area (`npm run test:e2e`, `npm run test:mobile-audit`,
   `npm run perf:baseline`). Report failures honestly. Do not skip, disable or
   quarantine a test to get green.
2. **Re-run the audit harness** scenarios for the finding and for its neighbours (marking,
   undo, reload, two tabs, backup/restore, midnight, special stitches, large pattern,
   phone touch). Confirm the original failure is gone and nothing else moved.
3. **Data-safety checks:** load every fixture from before your change; round-trip through
   backup/restore and `.csync`; open the project in the Creator, edit, return; verify
   `done`, `statsSessions`, `doneSnapshots`, `achievedMilestones` and park markers are
   byte-for-byte equal where you did not intend to change them.
4. **Statistics cross-check:** for any figure you touched, compute it by hand for the
   history fixture and check it in every place it appears (tracker strip, header, popover,
   project Stats, global Stats, Home card, share text, CSV, progress image).
5. **Adversarial scenarios:** refresh mid-drag, close the tab mid-save, two tabs, storage
   quota error, a private window, an empty project, a finished project, 100% then undo,
   a 300x300 pattern, a pattern with no halves/knots, a pattern with only halves, clock
   across midnight and a DST change (fake clock), extremely fast taps, undo/redo during a
   save, rapid project switching.
6. **Performance re-measure** against the baseline (rule 1).
7. **Accessibility and input parity** for any UI you changed: keyboard-only, visible focus,
   contrast, 200% zoom, touch targets at least 44 px, screen-reader labels.
8. **Self-review the diff adversarially:** what would make CI reject this, what would a
   reviewer ask, what did I leave dead or duplicated, did I add a second source of truth.
9. **Disposition:** fix bugs inside the phase's scope in the same batch. Out-of-scope
   bugs are listed in the log with reproduction steps and not silently fixed. Findings of
   "no bugs found" must still list what was exercised.

### 7. Reporting and honesty

- Keep a progress log at `reports/tracking-audit/phases/phase-N-progress.md`: plan,
  batches with PR links, decisions and trade-offs, deviations from the audit's
  recommendation (with reasons), measured performance numbers, open questions.
- Where the audit offered options, the prompt names the chosen one; if you find a reason
  to choose another, stop and ask the user rather than proceeding.
- If something cannot be verified in this environment (Safari, Firefox, a real phone),
  say so and mark it unverified; do not claim it works.
- If an instruction in this document conflicts with the code you find, stop and ask.
- Use they/them for anyone whose pronouns are not stated.

## Shared fixtures and tools

- `reports/tracking-audit/harness/`: fixture generator (small 40x40, large 300x300 with
  64 colours, special stitches, hand-checkable 10-session history, resized-after-tracking
  project), Playwright helpers and the reproduction scripts. See its README.
- Hand-computed expected values for the history fixture are in section 2.4 of the audit.
- Existing tests worth knowing: `tests/e2e/tracker-touch.spec.js`,
  `tests/e2e/french-knots.spec.js`, `tests/computeActiveMs.test.js`,
  `tests/lastSessionSummary.test.js`, `tests/insights-engine.test.js`,
  `tests/crossTab*.test.js`, `tests/activeProjectPointerRace.test.js`,
  `tests/syncKnots.test.js`, `tests/projectStorageKnots.test.js`,
  `tests/paletteSwapPreservesDone.test.js`, `tests/helpDrawerShortcutsSync.test.js`,
  `tests/swPrecacheSync.test.js`.
