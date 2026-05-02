# WF-02: Stitchability Score + Confetti Overlay

**Addresses:** FI-02, R09
**Phase:** 1 (medium effort — can ship before full live panel)
**Location:** Below the generated pattern preview, in both the Import Wizard
(step 4 Preview) and the proposed 2-panel UI (WF-01)

---

## Quality Block (embedded below preview)

```
  ┌──────────────────────────────────────────────────────────────┐
  │  Pattern quality                                             │
  │                                                              │
  │  Stitch Score                                                │
  │  ╔════════════════════════════════════════╗                  │
  │  ║ ██████████████████████████████░░░░░░░ ║  87 / 100  [?]   │
  │  ╚════════════════════════════════════════╝                  │
  │                                                              │
  │  Confetti (isolated stitches)                                │
  │    4.2%  —  52 stitches                          [Show]      │
  │                                                              │
  │  Estimated thread changes                                    │
  │    ~34 colour transitions                                    │
  │                                                              │
  │  Colours used                                                │
  │    18 unique DMC colours                                     │
  └──────────────────────────────────────────────────────────────┘
```

---

## Tooltip for "?" on Stitch Score

```
  ┌─────────────────────────────────────────────┐
  │  Stitch Score: 87 / 100                     │
  │                                             │
  │  Higher is easier to stitch.               │
  │                                             │
  │  This score measures how many stitches are │
  │  isolated from others of the same colour.  │
  │  Isolated stitches mean more thread changes │
  │  and more counting effort.                  │
  │                                             │
  │  Enable "Confetti cleanup" to raise your   │
  │  score automatically.                       │
  └─────────────────────────────────────────────┘
```

---

## Score Colour Coding

| Range | Colour | Label |
|---|---|---|
| 90–100 | Green | Excellent |
| 75–89 | Yellow-green | Good |
| 60–74 | Amber | Fair |
| 40–59 | Orange | Poor |
| 0–39 | Red | Difficult |

```
  100        Good          Fair         Poor        0
   ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
  ▓ = filled (score range); ░ = remaining
  Colour gradient: green → amber → red
```

---

## "Show" Confetti Overlay (canvas layer)

```
  Pattern canvas with confetti overlay active:

  ┌──────────────────────────────────────────────────────────┐
  │  . . . . . . . . [A] . . . . . . . . . . . . . . . . .  │
  │  . . [A] . . . . . . . . . [A] . . . . . . [A] . . . .  │
  │  . . . . . . . . . . . . . . . . [A] . . . . . . . . .  │
  │  . . . . . . . [A] . . . . . . . . . . . . . . . . . .  │
  │  [A] = amber highlight on isolated stitch                │
  │   .  = normal pattern stitch                             │
  └──────────────────────────────────────────────────────────┘

  [Hide overlay]  52 confetti stitches highlighted

  Tip: Enable "Confetti cleanup" in settings to remove these.
```

---

## Before / After Comparison (when cleanup is toggled)

```
  Confetti cleanup: OFF             Confetti cleanup: ON (Balanced)
  ──────────────────────            ──────────────────────
  Score:    72 / 100                Score:    91 / 100
  Confetti: 11.3% (140 stitches)    Confetti:  1.8% (22 stitches)
  Changes:  ~89                     Changes:  ~41

  [Enable confetti cleanup ▶]       [Turn off ▶]
```

The "before/after" comparison only shows when the cleanup setting is changed
during the session — it's not always present.

---

## Score Calculation (for implementation reference)

```
Total non-empty cells: N
Isolated cell: a non-empty cell where all 4 orthogonal neighbours
               are either empty OR a different colour

confetti_ratio = isolated_cells / N
stitch_score   = Math.round((1 - confetti_ratio) * 100)
thread_changes = estimated by counting colour-transition edges
                 (adjacent different-colour pairs, horizontal + vertical)
```

This calculation runs entirely on the generated pattern grid (flat array of
`{id, type, rgb}` objects). No image data required.
