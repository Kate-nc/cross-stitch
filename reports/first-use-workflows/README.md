# First-use workflow changes

18 October 2026. Targeted changes to Home, conversion setup and import review; Workshop styling and the existing creator/tracker remain in use. Rebased onto `284e8d52` to preserve the newly added PCStitch 7 import support.

## Before and after

| Workflow | Before | After |
| --- | --- | --- |
| First visit | Empty Projects showed no active project and required New project to find the entry paths. | Empty Home exposes Stitch an existing chart, Convert a picture and Draw a pattern immediately. Returning users retain their active project and direct resume actions. |
| Photograph or printed chart | The picture prompt asked only whether to turn it into a pattern. | Conversion explicitly chooses thread colours from a photograph/artwork. A photograph of a printed chart is not read as symbols or a thread key; the prompt explains using the original PDF or supported chart file. Cancel leaves Home ready for another choice. |
| Conversion setup | Clean-up opened alongside size and colour controls. | Size and Colours remain prominent. Clean-up starts folded; Show all conversion controls expands the existing sections, including advanced palette controls. Section buttons announce expanded state. |
| First tracking experience | No practice chart on Home. | Try a sample project opens a 21-stitch, three-thread flower. Choose a thread, mark/unmark, Undo, or Mark next stitch; progress updates immediately. It is a deliberately limited, memory-only practice surface. The real Tracker retains its zoom, sessions, tools and saved progress. |
| Import warnings | Repair directions were prose in an always-expanded report. | Warning actions open Palette, available Pages, or Compare, and move keyboard focus to the selected tab. Full verification expands on demand; invalid data keeps the report open and explains why saving is unavailable. High-severity mobile notes stay open. |
| Unfinished work | Draft setting writes waited one second. A stale draft could intercept an explicit Edit link for another project. | Draft writes start when settings commit. An explicit project ID takes precedence; the abandoned conversion remains available through Projects > Continue. |
| Back and recovery | Home tabs changed without URL/history state. | Home tab URLs support Back/Forward, keeping practice state while the page remains loaded. Existing File > Export Backup / Restore from Backup controls are explained. Drafts are local and remain excluded from backups. |
| Experienced controls | Custom density and symbol controls were easy to overlook. | Home names the existing Materials & Output > Export > Format & settings > Stitches per page > Custom path. PDF density fields now have labels; Palette explains Change symbol. No PDF rendering/export algorithms changed. |

## Screenshots

The before images were captured from the clean initial checkout, version 1.0.173. The after Home images include the preserved upstream PCStitch support in version 1.0.174. All are Chromium screenshots; mobile images use Pixel 5 emulation.

| Evidence | Before | After |
| --- | --- | --- |
| Desktop Home | [Empty Projects](before-home-desktop.png) | [Immediate entry paths](after-home-desktop.png) |
| Desktop Create | [Original paths](before-create-desktop.png) | [Named workflows and practice entry](after-create-desktop.png) |
| Mobile Create | [Original paths](before-create-mobile.png) | [Named workflows](after-create-mobile.png) |

Additional evidence: [mobile first visit](after-home-mobile.png), [practice chart after marking](after-sample-mobile.png), [conversion controls expanded](after-convert-desktop.png), [mobile warning opens Palette](after-import-repair-mobile.png).

## Behavioural verification

Browser checks use the existing local CDN test adapter (React, ReactDOM, pako and PDF libraries from installed dependencies), service workers blocked, and one worker for repeatable cancellation timing. They exercise actual page controls, navigation, file input, chart marks and IndexedDB reads; they do not mock project writes.

- First visit on desktop and Pixel 5: three paths visible, chart-photo distinction explicit, no project required.
- Returning user: direct Edit resumes the chosen project despite an abandoned conversion; continuing that draft restores its settings.
- Failed imports: damaged PDF, non-project JSON and XML Schema show actionable errors and keep entry paths usable.
- Cancelled conversion: a 500 × 500, 60-thread job can be cancelled by button or Escape, retains settings and permits subsequent generation.
- Browser Back/Forward: Home tab URL/selection restored; rapid Back after a conversion size edit retains the new draft value.
- Unsaved work: leaving the Tracker immediately after marking retains the mark when resumed; switching into drawing leaves the unfinished conversion available.
- Sample isolation: compare complete real project records, active-project pointer and manager records before/after practice. Also run beside a marked real project with seeded inventory: records and inventory are unchanged. Reload starts practice at zero.
- Mobile review: every tab fits, warnings reach repair controls, footer actions remain available; Start stitching opens a real chart at zero progress, Edit first opens the Creator.
- Existing controls: changing a symbol updates the Materials > Threads legend and Undo restores it on desktop and phone. Custom PDF density fields remain reachable and retain values across Export/Threads switches.

## Separate bug-hunting pass

The independent pass is `tests/e2e/first-use-bug-hunt.spec.js`, plus manual source and screenshot review. It checks keyboard marking, collapse/reopen, Back/Forward, dialogs, 320 px layout, backup discovery, custom density and retained state. Fixed findings:

1. Stale conversion-draft prompt intercepted explicit saved-project links.
2. Home tabs overflowed at 320 px; smaller inline spacing and a bounded scroll row keep them reachable.
3. Collapsible conversion sections did not expose expanded state; existing buttons now announce it.
4. Custom PDF density inputs lacked accessible names.
5. Practice now explains choosing another thread when all stitches for the current thread are marked, and explains corrections when complete.

Manual review also checked warning routing against the available tabs, invalid-import saving restrictions, one prompt for a mismatched file, and no automatic discard/reset when switching workflows. Existing browser tests were updated where they assumed an old entry label, an older picker filter, an always-closed warning report, a hidden mobile percentage or the old default Materials sub-tab. Assertions now follow visible behaviour and actual warning severity.

## Checks and limits

Final verification: **34 browser checks passed** (1.4 minutes); **355 unit suites and 4,856 tests passed**, with one suite and four tests skipped (77 seconds). Runtime bundle freshness, service-worker fingerprints, terminology lint and whitespace checks passed. The existing CSS token linter reports 13 pre-existing advisory findings; the added CSS uses Workshop tokens. No deployment or merge was performed. Physical iOS/WebKit and live external CDN delivery were not tested in this pass.


Reproduce the browser pass:

```sh
E2E_LOCAL_CDN=1 PLAYWRIGHT_BROWSERS_PATH=/workspace/.playwright-browsers npx playwright test \
  tests/e2e/first-use-workflows.spec.js tests/e2e/first-use-bug-hunt.spec.js \
  tests/e2e/home-create-three-paths.spec.js tests/e2e/image-handoff-and-drafts.spec.js \
  tests/e2e/import-friendly-errors.spec.js tests/e2e/import-review-phone.spec.js \
  tests/e2e/import-verification.spec.js tests/e2e/generate-progress-cancel.spec.js \
  tests/e2e/creator-palette.spec.js tests/e2e/import-pat.spec.js \
  --project=touch-tablet-chromium --workers=1
npm test
node build-runtime-js.js --check
node build-sw.js --check
npm run lint:terminology
npm run lint:css-tokens
git diff --check
```
