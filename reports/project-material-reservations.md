# Project material reservations and shopping lists

## Prerequisite and storage

Durable consumption accounting was already merged as PR #337 (`5fec84fe`), and remains an ancestor of this branch. No prerequisite PR was merged by this work. The branch incorporates current main's catalogue identities (#352) and preserves its Creator progress protections (#351).

Reservation intent is a versioned `manager_state.thread_reservations_v1` record in the existing versionless database. Per project it stores enabled state, optional fractional skein limits, explicitly confirmed substitutions and an optimistic revision. There is no inventory-schema change and no migration debit. Existing stash migration converts bare DMC keys using the established bridge migration; owned quantities, opened-skein status and legacy shopping flags survive. No unrelated work was present initially.

## Rules

- Owned is usable stock, including opened-skein allowances. Reserved is the effective claim for unfinished work. Available is owned minus the sum of effective claims. Estimated needed is calculated separately from unfinished chart units.
- Claims allocate in ascending saved project-ID order, capped by need, the user's limit and live stock. Later requests can be partially fulfilled. This deterministic priority is documented in the UI; it is not chronological reservation priority.
- Planning never changes owned stock or creates consumption events. All claim calculations and request edits read current stock and intent in one manager readwrite transaction. Stale edits to the same project fail with a refresh message. Concurrent projects cannot receive the same stock twice.
- Consumption reads fresh reservation intent in its stock/event transaction and protects other projects' claims. A newly enabled claim appearing after project hydration aborts the consumption write for retry. Ordinary accounting retries and corrections retain their existing identities and actual debit/credit semantics. With no enabled claims, consumption does not hydrate the project library.
- Chart edits, changed assumptions and progress change effective claims on recalculation. Completed, abandoned/UFO, archived/paused, dashboard-complete and deleted projects have no effective claim. Planning retires inactive request intent. Backup export also retires local-only dashboard state before exporting, preventing archive claims from resurrecting on restore.
- Shopping calculations allocate remaining unreserved stock once across all projects in the same order. Each project shows its remaining shortage. The combined list deduplicates exact brand-qualified identities, sums shortages and only then rounds to whole skeins (with a 1e-12 floating-point tolerance). Reserving and shopping are separate calculations: an unreserved project can be covered by free stock without holding a claim.
- Explicit substitutions map a project's original identities to confirmed replacement identities for planning and subsequent consumption; they never rewrite its chart. Many original colours may share one replacement. Corrections credit the recorded replacement debit even after the substitution is removed. Remove a confirmed substitution before choosing a different replacement.

## Units and assumptions

Internal quantities are unrounded standard skein equivalents. The calculation reuses durable-consumption geometry: 1,890 single-strand inches (six strands of 315 inches, approximately eight metres of six-strand cotton), fabric count and over-two scaling, working strands, blend weights, tails per run and waste. Full crosses, independent half/quarter units, petites, knots and physical line lengths are supported. Current persisted progress is overlaid before calculating remaining need. Legacy compact charts are accepted. Beads and fabric are excluded.

Saved project waste assumptions take precedence over current global defaults. Each exported project includes the numeric model assumptions; UI copy explains the model and its difference from the older rounded Creator shopping estimate. Custom catalogue threads use the same standard skein capacity; pack sizes without a model must be converted to standard equivalents. Non-finite estimates fail instead of generating invalid shopping quantities.

Identity remains `brand:code`: custom brand slugs may contain digits/hyphens, and codes retain case, leading zeros, spaces and Unicode. A solid custom code containing `+` stays one identity. Replacement selection checks the built-in or imported custom catalogue; catalogue substitution metadata is never applied automatically.

## Representative examples

1. Two projects each need 0.6 skeins of dmc:310, with 0.75 owned. The first receives 0.6 and the second 0.15, available is zero, combined shortage is 0.45 and the combined recommendation is one skein. Adding one skein clears the shortage; exporting again produces a fresh snapshot.
2. Three projects needing 1,000 full crosses each at 14 count, two strands, zero tails and waste multiplier 1 need approximately 0.362812 skeins each. With 0.5 owned, the first reserves approximately 0.362812, the second 0.137188 and the third zero. Combined shortage is approximately 0.588435; buy one skein, not one per project.
3. One full cross under those assumptions is `4.8 * 2 / 14 / 1890` skeins; 28 count over two has the same geometry. A 1:3 blend splits it 25%/75%. A 3-4-5 line uses `2 * 5 * 2 / 14 / 1890` skeins. Presentation rounding never changes internal stock.
4. dmc:310 and anchor:310 remain separate. Confirming a replacement for one project changes only that project's planned and future consumed identity. Removing it does not change existing accounting events or their corrections.

## Portable data

The Manager offers JSON shopping-list snapshots with per-project groups, assumptions, requests, usable quantities, combined shortages and whole-skein recommendations. They do not record orders; users add purchases to stash and refresh. Full .csb/JSON backups preserve reservation intent with inventory and consumption, validate it before staging, and retain the existing collision/repeated-restore contract. Project-only exports do not claim receiving-device stock.

Sync includes reservations in the inventory snapshot and refuses incompatible legacy plans instead of silently merging competing claims. Current clients are required on all devices. Independent offline copies are not a distributed inventory transaction. No purchasing service is connected.

## Separate bug-hunting pass

After initial implementation, a separate pass checked double allocation, negative availability, accidental consumption, stale lists, duplicate whole-skein purchases, legacy stash migration, catalogue identity loss and restore behavior. It found and addressed:

- Archive is actually the local dashboard `paused` state; both paused and dashboard-complete states now release effective claims.
- Local-only archive state could disappear during backup/restore; backup export now retires the corresponding reservation intent first.
- Lowercasing a whole replacement key could damage codes such as B5200 or case-sensitive custom codes; replacement selection preserves the catalogue's exact code.
- Solid custom codes containing `+` could be misread as blends; explicit solid type and custom identities remain intact.
- Hydrating every project on every consumption write would regress existing tracking performance; only enabled claims require project hydration.
- A claim created between hydration and the inventory transaction could be overlooked; that transaction now aborts for retry.
- Replacing a previously substituted row could create an ignored chain; the UI requires removal of the confirmed substitution first.
- Suppressed project-read errors could look like deleted projects; material reads use a strict storage API.
- Malformed stored intent could leave a request unresolved; it now rejects promptly. Non-finite estimates are rejected.

Executable coverage includes independent bridge instances and concurrent writes, stock insufficiency, partial skeins, changed estimates and progress, lifecycle states/deletion, confirmed replacements and correction after removal, many-to-one replacements, compact charts, custom identities, legacy stash migration, compressed staged backup/restore, repeated restore and archived backup claims. The browser regression covers the real Manager controls, fractional limit editing, explicit replacement confirmation, JSON download and reload; the existing Tracker regression covers mark/correction/Redo, physical unpick/Undo/Redo, history and reload.

## Validation results

- Full Jest run on integrated main: 364 suites passed, one skipped; 5,075 tests passed, four skipped; one snapshot passed.
- Final affected rerun after the backup/validation fixes and added race/sync probes: six suites, 83 tests passed. This includes generated-runtime and offline-fingerprint checks.
- Chromium tablet regressions: both the new Manager material-planning journey and the existing durable Tracker accounting journey passed.
- Runtime compilation, service-worker fingerprints, terminology lint and diff whitespace checks passed. CSS-token lint retains pre-existing advisory findings; this PR changes no CSS.
- Initial sandbox runs denied loopback binding and Node subprocesses; verification passed with the local test permissions enabled. No CI was monitored, and nothing was merged or deployed.
