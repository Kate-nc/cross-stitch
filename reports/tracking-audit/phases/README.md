# Remediation phases for the tracking audit

Each phase is a self-contained prompt for an AI agent. Review them in order; nothing starts until you approve and merge the previous phase.

| Doc | Phase | Findings |
|---|---|---|
| [phase-00-working-agreement.md](phase-00-working-agreement.md) | Rules shared by all phases (performance, data homogeneity, conventions, PR batching, bug hunt) | n/a |
| [phase-01-save-safety.md](phase-01-save-safety.md) | Trust in saved progress | TRACK-01, 02, 03, 12, BUG-06, 07 |
| [phase-02-one-truth-for-numbers.md](phase-02-one-truth-for-numbers.md) | One truth for the numbers, plus quick bug fixes | STATS-01, 02, 04, 05, 07, BUG-01 to 05 |
| [phase-03-time-and-history.md](phase-03-time-and-history.md) | Honest time and correctable history | STATS-03, 06, 08, 09 |
| [phase-04-small-screens-and-touch.md](phase-04-small-screens-and-touch.md) | Small screens and touch | TRACK-05, 06, 07, 08, 11, COMMON-01 |
| [phase-05-legibility-orientation-accessibility.md](phase-05-legibility-orientation-accessibility.md) | Legibility, orientation, accessibility | TRACK-09, 10, COMMON-02 |
| [phase-06-stitch-types-and-extras.md](phase-06-stitch-types-and-extras.md) | More stitch types and project extras | TRACK-04, 13, 14 |

Phase 1 is complete: see [phase-1-report.md](phase-1-report.md).

Agents write `phase-N-progress.md` and `phase-N-bughunt.md` beside these files as they work.
The audit's investigation scripts are in [../harness/](../harness/README.md).
