# Canonical progress contract

ProgressUnits is the source of progress arithmetic. Full stitches and French knots weigh 1 unit, half-stitch sides weigh 0.5, and quarters (including each part of a three-quarter stitch) and petites weigh 0.25. Equivalent legacy halves and quarter encodings count only once. Backstitch remains separate, measured in lines; it does not gate project percentage or the stash completion prompt. Tracker legend colour completion additionally requires its backstitch lines; Stats > Visuals reports counted-unit colour completion. These existing distinct semantics are preserved.

Keep fractional done, total and remaining units through storage summaries, statistics, estimates and all calculations. Done + remaining = total; invalid or excess marks cannot compensate for unfinished work of another type. Empty counted work has 0%, and is not complete. Only presentation percentages round to one decimal, capped at 99.9 while counted work remains. Unit text retains quarter-unit precision.

Project completion and its side effects use exact unfiltered project counts. The visible-layer strip may use its own included types. Work-area counts and colour rows retain their existing area scope (full stitches and halves); selecting an area never changes project completion. Project statistics always use the whole project. Aggregated colour counts must equal overall counts under the same scope. Saved-project statistics must include fractional-only and knot-only colours, including when that project is not open in Track.

Examples: 2,499 / 2,500 displays 99.9%, incomplete. One done full and one pending half is 1 / 1.5 units, 66.7%. One pending quarter is 0 / 0.25, not an empty project. A completed full with unfinished backstitch has 100% counted units and separate pending lines.

Full-stitch marks use existing incremental counters. Half-mark invalidation updates half counts without rescanning the full pattern. Structural changes, loads and undo may rebuild counters.

Totals across projects (Stats "Total stitches" and "Lifetime") are the marked units summed from each project's progress row with `ProgressUnits.sumRows`, so they agree with that project's Tracker, Home and Library figures and count marks straight away. They are not summed from finished session records: a session is recorded only when it ends, so a project with marks but no finished session would read 0. Speed and time stay session-based, because they need the stitches added in recorded time. Each Library card shows progress once (a bar with its percentage; the counts are its hover text).

Time estimates use one wording, from `estimateText` in helpers.js: stitching hours, then, when there is a recent pace, calendar time ("about 424 hours, about 4 weeks at your pace"). With no history, hours use `DEFAULT_STITCH_SPEED` (40 stitches an hour), the same default as the Creator and Tracker sliders.

Petite crosses and long stitches are independent `specialtyStitches` objects, marked by stable ID in `specialtyDone`. Petite = 0.25 units; long stitch = 0.5 units per whole segment, independent of length. They count in project and colour completion, including over an occupied full-cross cell, and use the same synchronous session accounting and causal unmark semantics. See [lifecycle and compatibility](petite-long-lifecycle.md).
