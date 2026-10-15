# Stats container sizing and responsive layout audit

Branch: `fix/stats-container-sizing`. Scope: project Overview/Visuals and global Stitching, Stash, Showcase, Activity and Insights.

## Changes

- Bento tiles explicitly stretch their content across the available width while keeping their natural height. Short panels no longer acquire empty stretched bodies.
- Colours wraps names, history and controls, uses flexible progress bars and keeps counts readable. Narrow tiles use two-line rows; wider tiles use a single row. Completed labels retain their contrast. Long lists scroll locally and can receive keyboard focus. Whole/half-stitch percentage arithmetic is unchanged; tests verify the rendered fill is exactly 25% for 30 completed out of 120 whole/half entries.
- Sections retain square, readable cells with a minimum width and bounded local scrolling. Size controls wrap. Section selection, thread details and renaming still work.
- Comparison previews use a responsive grid and the pattern's aspect ratio, with a bounded display height. Patterns larger than 300 stitches no longer have zero-sized display canvases. Native canvas resolution retains at least one pixel per stitch.
- Project chart plots and their date labels scroll together on narrow screens, preserving SVG aspect ratios and pointer coordinates. Scrubbers and data tables remain available outside the plot scroller.
- Stash/Insights/Activity grids use minima that fit narrow containers. Global charts adapt to tile width; Showcase uses the shared available width. Dense heatmaps scroll locally, and Activity tooltips stay inside the viewport.
- Help, APP_CHANGELOG, README and the wiki are updated. Creator and Tracker runtime bundles were regenerated from their sources.

## Focused bug hunt

| Finding | Fix and regression coverage |
| --- | --- |
| Large ComparisonView patterns collapsed to zero CSS width/height | Removed the fixed integer display-size calculation. Browser checks verify positive canvas dimensions, painted pixels and proportional bounding boxes. Mounted tests cover wide, tall and rectangular patterns. |
| Deselecting a snapshot left its previous picture visible | Clear the old preview. Browser and mounted tests verify the cleared pixels/state. |
| Unreadable snapshots could display a misleading stitch difference | Show a status message and omit the difference/diff image. Mounted coverage also checks snapshots from a different pattern size. |
| Ordinary saved completion arrays failed pako compression | Convert flags to a Uint8Array before compression. Tests save a snapshot, decompress its exact bytes, select it and render its diff. Other projects keep snapshot saving disabled. |
| Empty Stash removed its own tab bar | Retain navigation through the empty state. All five global tabs are exercised without any projects. |
| Hidden Creator redirected empty Stats to Home | Only redirect while Creator is active. The empty global Stats browser matrix verifies the real entry page remains open. |
| Project-comparison insights overflowed with long names | Allow text to wrap and shrink within its grid/flex items. Phone tests sort and scroll the comparison table and check root geometry. |
| Tracker recap banner covered Stats controls after resizing/reopening | Hide the recap while Stats is open; give controls scroll spacing beneath the sticky header. The Tracker integration test edits a section, closes/reopens Stats and uses project comparison. |
| Legacy mounted Stats tests leaked their live React tree/timers | Unmount the tree and close jsdom after collecting results. |

## Visual and interaction verification

The native Chrome zoom case selects 200% in Chrome Settings in fresh desktop profiles, then checks all five global tabs plus project Overview/Visuals for empty, sparse and populated data. It verifies a 1440px viewport reflows to 720 CSS pixels, devicePixelRatio becomes 2, and body CSS zoom stays 1.

The Playwright suite uses real rendered geometry and canvas pixels rather than source assertions. It tests 1440px desktop, 768px tablet, 390px phone, 320px narrow phone and 200% CSS layout zoom, with live resizing in each page. Data states include no projects/pattern, one session, forty sessions, a 400 x 200 pattern, very long project/thread/section/snapshot names, and a separate forty-colour palette with large counts.

All project and global tabs are checked. Interactions cover filters/sort, snapshot save/select/diff/deselect, chart switches, keyboard scrubbers, plot clicks after scrolling, data tables, session editing/cancel, Settings collapse/reopen, Customise hide/reopen, section selection/rename, Tracker Stats close/reopen, comparison-table sorting/scrolling, Showcase share rendering, Activity period/day selection and Insights dismissal/restoration.

Global Stats uses an internal fixed scroller. The tests capture successive scroll positions as well as the top, so lower panels are visually reviewed. Representative evidence follows; baseline images use a stored 400 x 200 project, while the later adversarial fixtures also exercise long labels and whole/half counts.

| Evidence | Image |
| --- | --- |
| Original desktop: stretched Colours and invisible large comparison | [Before desktop](stats-container-sizing/before-desktop.png) |
| Original phone | [Before phone](stats-container-sizing/before-phone.png) |
| Project Visuals with long labels, desktop | [Desktop](stats-container-sizing/project-desktop.png) |
| Project Visuals, phone | [Phone](stats-container-sizing/project-phone.png) |
| Project Visuals at 200% layout zoom | [Zoom](stats-container-sizing/project-zoom-200.png) |
| Dense colour list at full width | [Colours](stats-container-sizing/dense-colours-desktop.png) |
| Phone chart, scrubber, table and journal | [Chart](stats-container-sizing/chart-phone.png) |
| Project comparison, phone | [Comparison](stats-container-sizing/comparison-phone.png) |
| Lower Stash panels, phone | [Stash](stats-container-sizing/stash-phone-lower.png) |
| Insights, tablet | [Insights](stats-container-sizing/insights-tablet.png) |
| Native Chrome 200% zoom, project Visuals | [Native project zoom](stats-container-sizing/native-zoom-project.png) |
| Native Chrome 200% zoom, loaded Insights | [Native Insights zoom](stats-container-sizing/native-zoom-insights.png) |

## Checks

- `npm run build`: passed; Creator bundles remain unchanged.
- `node build-runtime-js.js --check`: passed; Creator/Tracker compiled files match their sources.
- `npm run lint:terminology`: passed.
- `npm run lint:css-tokens`: passed in advisory mode; thirteen existing raw-hex findings remain outside this change.
- `git diff --check`: passed.
- Focused Stats/help Jest checks: 11 suites, 159 tests passed.
- `E2E_LOCAL_CDN=1 npx playwright test stats-sizing --project=touch-tablet-chromium --workers=1`: 9 tests passed.
- `npm test -- --maxWorkers=2 --testTimeout=30000`: **325 suites, 4,424 tests and one snapshot passed**. The branch was rebased onto main at `6ad5c235`, retaining all newer work and changelog entries, then the full suite and browser cases were rerun. An earlier concurrent run hit timing limits in two PDF tests and the backstitch performance test; the final full run passed without browser contention.

## Conflict resolution against snapshot controls (15 October 2026)

Rebased onto `e8202d16` (main 1.0.153). Resolved `components-stats.js` by preserving the new opt-in snapshot guidance, deletion controls, manual snapshot tagging, selection cleanup and setter-aware read-only checks alongside responsive canvases, invalid-preview handling and array compression. Kept main's app version and released changelog, with Stats notes under the upcoming 1.0.154 entry.

The combined `stats-sizing` and `snapshot-controls` browser suites passed all 11 tests, including both deletion flows, reload persistence, read-only projects, every Stats tab, responsive sizing and native Chrome 200% zoom. Inspected the newly rendered phone Visuals and native zoom screenshots. Runtime regeneration produced no differences; freshness and terminology checks passed. The first full Jest run passed 4,437 tests with one backstitch timing failure; all 27 backstitch tests passed in isolation. A final full `npm test -- --maxWorkers=2 --testTimeout=30000` run then passed **326 suites, 4,438 tests and one snapshot** with no failures.

## Limits

Verification used Chromium with emulated screen sizes, 200% CSS layout zoom and native Chrome 200% zoom. Real phone/tablet hardware, Safari/WebKit and Firefox were not exercised. The final acquisition-chart scroller was also checked explicitly for its rendered minimum width and aspect ratio; populated project/global/dense-colour tests were rerun after the final visual adjustments. No merge or deployment was performed.
