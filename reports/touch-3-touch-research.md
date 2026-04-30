# touch-3 — Touch Patterns in Established Creative Tablet Apps

This is a synthesis of well-documented conventions from creative tablet
apps (Procreate, Figma, Affinity Designer, Aseprite, Pattern Keeper,
Pixelorama, Pixaki). Where I cite a behaviour I am confident from
public documentation and widespread user-facing reports; specific
forum threads are not linked because they shift over time and
fabricating URLs would be misleading. Treat conclusions, not citations,
as the load-bearing part of this report.

──────────────────────────────────────────────────────────────────────
## 1. Canvas navigation conventions across creative apps
──────────────────────────────────────────────────────────────────────

The convention is overwhelmingly consistent and worth restating because
it represents what every tablet user already has muscle memory for:

| App | 1-finger | 2-finger drag | 2-finger pinch | 2-finger tap | 3-finger tap | Long-press |
|---|---|---|---|---|---|---|
| **Procreate** | Draw | Pan | Zoom (and rotate) | Undo | Redo | Eyedropper (configurable) |
| **Affinity Designer (iPad)** | Tool action | Pan | Zoom | Undo | Redo | Tool secondary |
| **Figma (mobile / iPad)** | Select / move (depends on mode) | Pan | Zoom | — | — | Context menu |
| **Aseprite (no native iPad; reference convention)** | Tool action | Pan (configurable) | Zoom | — | — | Right-click eq. |
| **Pixelorama (web)** | Tool action | Pan | Zoom | — | — | Right-click eq. |
| **Pattern Keeper (cross-stitch)** | Tap → mark stitch; drag → mark a run | Pan | Zoom | — | — | (no documented action) |
| **Pixaki (pixel art iPad)** | Draw | Pan | Zoom | Undo | Redo | Eyedropper |

### Conclusions
1. **Two-finger drag = pan, pinch = zoom is universal.** Any app that
   does otherwise is a nasty surprise.
2. **One-finger does the active tool's primary action**, and there is
   no expectation that one-finger pans except in a dedicated "view
   mode" or with a held modifier (Procreate has a hardware-modifier
   "QuickShape pause to pan", Pixaki uses a pan tool).
3. **Two-finger tap = undo, three-finger tap = redo** is a Procreate-
   originated convention now copied by most pixel-art apps. It is
   highly discoverable through gesture guides and is loved by users.
4. **Long-press is reserved for context-menu / eyedropper / "secondary"
   actions** — never for a destructive primary action. Putting "set
   range anchor" on long-press (current tracker behaviour) doesn't
   match any other creative app.

──────────────────────────────────────────────────────────────────────
## 2. Tool switching on tablet
──────────────────────────────────────────────────────────────────────

| Pattern | Apps that use it | Pros | Cons |
|---|---|---|---|
| Floating, repositionable toolbar | Procreate (sidebar can be left/right), Affinity Designer (Studio panels) | User puts it in their thumb zone; doesn't eat layout | Discoverability of "you can move this" |
| Bottom-anchored tool strip | Pixaki, Procreate Pocket (phone), most pixel-art tools | Always thumb-reachable | Eats vertical space; conflicts with iOS home indicator |
| Side-anchored tool rail | Procreate (default), Affinity, Figma | Doesn't conflict with vertical scrolling | Far from thumb on the opposite side |
| Radial menu on long-press | Some Wacom-style apps; Procreate "QuickMenu" via gesture | Compact, fast | Hard to discover; needs onboarding |
| Bottom sheet / drawer of tools | Figma mobile, design tools | Hides until needed | Adds a tap to access tools |

### Pattern Keeper (the closest peer for cross-stitch)
- Bottom toolbar on phone (mark / unmark / undo / palette).
- Side panel for legend on tablet, collapsible to a single rail of
  colour swatches.
- Single-finger tap = mark; pinch = zoom; **two-finger drag = pan**.
- Long-press on a chart cell shows "go to" / cell info.
- Strong reliance on a colour-isolation toggle to make stitching one
  colour at a time the default workflow.

### Conclusion
For this app's primary audience (iPad users in lap or on a stand),
**bottom-anchored toolbar with a small "more" overflow** is the safest
pattern. The user already implements this pattern on tracker mobile
(`.tracker-action-bar`) — it should extend to the creator on touch
viewports.

──────────────────────────────────────────────────────────────────────
## 3. Side-panel and full-screen patterns
──────────────────────────────────────────────────────────────────────

### Collapsible-panel patterns

| Pattern | Examples | Notes |
|---|---|---|
| Collapse to icon rail | Procreate sidebar (collapses to ~40 px rail of brush + colour), Photoshop Express | Keeps the "active state" visible (current tool / current colour); user taps the rail to expand |
| Collapse fully behind a button | Figma mobile, most consumer apps | Cleanest visually but loses always-visible state |
| Bottom-sheet drawer with peek | Maps apps, Apple Music, Files.app on iPad | Drag handle peeks at bottom; drag up to expand; great on tablet portrait |
| Side-drawer slide-out (overlay) | Slack, Gmail | Full-width overlay; fine for "navigation" but not for "settings used during work" |
| Push (resize main content) | Desktop IDEs | Common on desktop; jarring on tablet because content reflows |

### Full-screen / "focus" mode patterns
- Procreate: pinch on canvas thumbnail = enter "QuickShape" mode but
  no formal full-screen; full-screen is implicit because Procreate
  already hides chrome aggressively.
- Affinity Designer: explicit "Hide UI" button in top-bar; tap canvas
  to reveal; explicit "Show UI" floating button in top-right while
  hidden.
- Figma: `Cmd/Ctrl + .` keyboard shortcut to hide UI; reveal-on-touch
  near edges.
- Pattern Keeper: no full-screen; relies on auto-hiding the top-bar
  on scroll (similar to current tracker `tracker-immersive`).

### Conclusions for our app
1. **The lpanel should collapse to a rail** showing the active highlight
   colour and a "expand" affordance, not disappear entirely. This
   preserves the most-used state (highlight colour) which a stitcher
   glances at constantly.
2. **Tablet landscape can keep the panel as a rail by default** (~ 56–
   72 px wide) and let users tap to expand.
3. **Tablet portrait should default to closed** with an obvious peek
   handle on the left edge (swipe-to-reveal).
4. **A formal full-screen mode is needed** because the immersive-on-
   scroll behaviour doesn't help users who pan rather than scroll
   (which is everyone on the canvas). Affinity Designer's explicit
   button + always-visible floating exit is the model to follow.

──────────────────────────────────────────────────────────────────────
## 4. Conventions stitchers already know (Pattern Keeper et al.)
──────────────────────────────────────────────────────────────────────

Pattern Keeper is the dominant cross-stitch tracking app. Stitchers
who try this app overwhelmingly come from PK and bring its
conventions:

- **Pinch zoom and two-finger pan are non-negotiable.** PK enforces
  this strictly; users complain instantly when an app doesn't.
- **Single tap = mark, single tap on a marked stitch = unmark.** Some
  apps use mode toggles (mark mode vs. unmark mode); stitchers find
  mode toggles annoying.
- **Drag-mark exists in PK** for marking runs of stitches in a single
  colour, especially for cross-stitch backgrounds with long colour
  runs.
- **Colour isolation is a primary feature.** Stitchers stitch one
  colour at a time and want everything else dimmed, so a "highlight
  this colour" toggle that's one tap away is essential. Our `lpanel
  → highlight` tab provides this but requires opening the panel.
- **Magnification on tablet stand at arm's length** means font sizes
  in legend and progress need to be ≥ 14 px ideally.
- **Wake-lock is universally requested** — a screen that goes to sleep
  every 30 seconds is the #1 frustration. We have this, good.

### Physical context (validated by repo's own README and PWA goals)
- Tablet propped on a stand or table, not held.
- Stitcher's dominant hand holds the needle, non-dominant hand operates
  the tablet — most users tap with their non-dominant index finger, so
  precision is reduced relative to dominant-hand use.
- Lighting varies wildly — direct sunlight, dim evening lighting,
  task lighting at angles. Contrast must be high; thin 1 px borders
  disappear in glare.
- Sessions are long (1–4 h) — palm rest fatigue is real. Floating
  controls in the bottom-center are the most reachable.

──────────────────────────────────────────────────────────────────────
## 5. Synthesised principles for our gesture model
──────────────────────────────────────────────────────────────────────

These principles drive the Phase 2 design:

1. **Two fingers always navigate.** Pan = two-finger drag. Zoom =
   pinch. This is non-negotiable and matches every comparable app.
2. **One finger does the mode's primary action.** Mode is visible at
   all times (active tool indicator + active colour swatch are persist-
   ently shown).
3. **One-finger pan is provided** via either: (a) a dedicated "pan
   tool" / "view mode" the user can switch into, or (b) a hold-and-
   pause gesture (after 250 ms of no-cell-crossing, the touch becomes
   a pan). Procreate uses the latter implicitly via QuickShape pauses.
   For our app, **option (a) — explicit Hand/Pan tool** is more
   discoverable and matches the existing tool model.
4. **Long-press = secondary action** (cell info / context menu / colour
   sample). Never a destructive primary action.
5. **Two-finger tap = undo. Three-finger tap = redo.** Optional but
   strongly suggested — these are Procreate gestures every tablet user
   knows.
6. **Tap fires on POINTER_UP with visual preview during touchdown.**
   The cell highlights when the finger is down so the user can lift
   to commit or slide off to cancel. This is how Procreate's brush
   stroke "preview" works at low pressure.
7. **Threshold values must be sane and tunable:** 10 px slop and
   200 ms tap window for tap-vs-drag; 100 ms multi-touch grace for
   "second finger arrived" to cancel single-finger actions cleanly.
8. **Prefer overlay-with-peek over push** for side panels. Stitchers
   want the chart to stay where it is while they reference the legend,
   not reflow.
9. **Full-screen needs a permanent exit affordance** in a corner (top-
   right is conventional on iOS).
10. **Bottom-anchored controls** for the most-used actions on every
    touch viewport.
