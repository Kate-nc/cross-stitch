# Canonical progress contract

ProgressUnits is the source of progress arithmetic. Full stitches and French knots weigh 1 unit, half-stitch sides weigh 0.5, and quarters (including each part of a three-quarter stitch) and petites weigh 0.25. Equivalent legacy halves and quarter encodings count only once. Backstitch remains separate, measured in lines; it does not gate project percentage or the stash completion prompt. Tracker legend colour completion additionally requires its backstitch lines; Stats > Visuals reports counted-unit colour completion. These existing distinct semantics are preserved.

Keep fractional done, total and remaining units through storage summaries, statistics, estimates and all calculations. Done + remaining = total; invalid or excess marks cannot compensate for unfinished work of another type. Empty counted work has 0%, and is not complete. Only presentation percentages round to one decimal, capped at 99.9 while counted work remains. Unit text retains quarter-unit precision.

Project completion and its side effects use exact unfiltered project counts. The visible-layer strip may use its own included types. Work-area counts and colour rows retain their existing area scope (full stitches and halves); selecting an area never changes project completion. Project statistics always use the whole project. Aggregated colour counts must equal overall counts under the same scope. Saved-project statistics must include fractional-only and knot-only colours, including when that project is not open in Track.

Examples: 2,499 / 2,500 displays 99.9%, incomplete. One done full and one pending half is 1 / 1.5 units, 66.7%. One pending quarter is 0 / 0.25, not an empty project. A completed full with unfinished backstitch has 100% counted units and separate pending lines.

Full-stitch marks use existing incremental counters. Half-mark invalidation updates half counts without rescanning the full pattern. Structural changes, loads and undo may rebuild counters.
