# Keyboard Shortcuts — Phase 1.2: Broken Shortcut Diagnosis

User report: in **track mode**, the following keys do nothing:
`[`, `]`, `1`, `2`, `3`, `4`, `c`.

## Root causes

There are **two compounding bugs**, both in
[tracker-app.js#L4145-L4225](../tracker-app.js#L4145-L4225). Either one
alone would explain the symptoms; together they make the shortcuts
appear completely dead.

### Bug A — The handler bails out when focus is on a `BUTTON` or `A`

[tracker-app.js#L4148](../tracker-app.js#L4148):

```js
function handleKeyDown(e){
  if(["INPUT","SELECT","TEXTAREA","BUTTON","A"].includes(
       document.activeElement?.tagName)
     || document.activeElement?.isContentEditable) return;
  …
}
```

The intent of an input-element guard is to suppress single-key shortcuts
**only when the user is typing**. Including `BUTTON` and `A` in this
list is wrong because:

- After a user clicks any button (e.g. the highlight-mode chip, a tab,
  the drawer toggle), the browser leaves keyboard focus on that
  button. Standard behaviour.
- From that moment until the user clicks somewhere non-focusable (or
  presses `Tab`), `document.activeElement.tagName === 'BUTTON'`, so
  every page-level shortcut is silently swallowed.
- This is exactly the path users follow to *enter* highlight view: tap
  the View tab → tap a colour swatch → tap "Spotlight". By the time
  they want to press `1` to switch highlight mode, focus is on a
  button. **Nothing happens.**

This single bug makes it look like `1 2 3 4 c [ ]` are non-functional in
track mode even though the registration code is correct.

The other page handlers ([creator/useKeyboardShortcuts.js#L11](../creator/useKeyboardShortcuts.js#L11),
[manager-app.js#L122](../manager-app.js#L122), [home-screen.js#L692](../home-screen.js#L692),
[creator-main.js#L1108](../creator-main.js#L1108)) **do not** include
`BUTTON`/`A` in the guard, which is why their single-key shortcuts work
fine.

**Diagnosis: a paste of the input-element guard from another file got an
overzealous extension at some point.** Removing `BUTTON` and `A` from
the list restores the shortcuts. The guard should match the well-tested
predicate in [keyboard-utils.js#L31](../keyboard-utils.js#L31)
(`isTextInputFocused`).

### Bug B — Scope is "highlight view + focusColour set", not "track mode"

[tracker-app.js#L4205-L4225](../tracker-app.js#L4205-L4225):

```js
if(stitchView==="highlight"&&!isEditMode){
  if(focusColour){
    if(e.key==="1"){setHighlightMode("isolate");return;}
    if(e.key==="2"){setHighlightMode("outline");return;}
    if(e.key==="3"){setHighlightMode("tint");return;}
    if(e.key==="4"){setHighlightMode("spotlight");return;}
    if(e.key==="c"||e.key==="C"){setCountingAidsEnabled(v=>!v);return;}
  }
  if(e.key==="ArrowRight"||e.key==="]"){…}
  if(e.key==="ArrowLeft"||e.key==="["){…}
}
```

The user describes their workflow as "in track mode" but the actual
scope these shortcuts are wired to is `stitchView === 'highlight'`,
which is a **view mode** orthogonal to `stitchMode`. From the user's
mental model, "track mode" and "highlight view" are different facets of
the same activity (working on the project), and they expect the
shortcuts to work whenever they're tracking — but the code only fires
them when:

- `stitchView === 'highlight'` (View tab → Highlight) **and**
- `!isEditMode` (not in pattern-editing mode) **and**
- (for `1 2 3 4 c` specifically) `focusColour` is set

Of these, the one that surprises users is the `focusColour` requirement.
A user who opens highlight view but hasn't yet picked a colour to focus
on sees `[` `]` work (cycle colours) but `1 2 3 4 c` do nothing. They
press `1` expecting it to set highlight-mode-isolate; instead nothing
happens because `focusColour` is null. There's no error or hint.

**Diagnosis:** `1 2 3 4 c` should work whenever the highlight view is
active. If `focusColour` is null when the user presses `1`, the handler
should auto-pick the first focusable colour (same logic that runs when
the user toggles to highlight view via `V`) and *then* set the
highlight mode. Or: the registration should fire only `[`/`]` until a
focus colour exists, and the on-screen UI should make this discoverable
(see report 3).

## Per-shortcut breakdown

| Key | What user expects | What actually happens (after Bug A is fixed) |
|---|---|---|
| `[` | Previous focus colour | Works **only** in highlight view. In symbol/colour view: nothing. |
| `]` | Next focus colour | Same as `[`. |
| `1` | Highlight mode = isolate | Works in highlight view **only if** a focus colour is already set. Otherwise nothing. |
| `2` | Highlight mode = outline | Same as `1`. |
| `3` | Highlight mode = tint | Same as `1`. |
| `4` | Highlight mode = spotlight | Same as `1`. |
| `c` | Toggle counting aids | Same as `1` — gated on `focusColour`. Counting aids are arguably useful in *every* tracker view, not just highlight. |

## Is this systemic?

**Yes — Bug A is the bigger issue.** Including `BUTTON`/`A` in the
input-element guard kills *every* page-level shortcut in the tracker
(not just `1 2 3 4 c [ ]`) the moment the user clicks any button. That
includes:

- `T`/`N` (mode tabs become unusable from the keyboard once the user
  has clicked any tab — which is the default state on first visit)
- `V` (cycle view)
- `F`/`H`/`B`/`K`/`A` (layer toggles)
- `D` (drawer)
- `P` (pause session)
- `+`/`-`/`0` (zoom)
- `?` (the only escape valve is that the global `?` listener in
  [keyboard-utils.js#L93](../keyboard-utils.js#L93) catches it on
  bubble — but the tracker handler returns first, so on tracker the
  global handler may not fire at all if focus is on a button)

So the symptom the user reports is real and severe. The reason they
specifically called out `[ ] 1 2 3 4 c` is probably that those are the
shortcuts they were trying to use most recently in highlight view —
but in fact **all** tracker single-key shortcuts are broken once focus
lands on a button.

## Other broken / surprising things noticed during the trace

- **`B` double-fires in tracker.** `B` toggles the backstitch layer
  (handled in `tracker-app.js`), and `B` also opens Bulk Add (handled
  in `creator-main.js#L1100`). Both listeners run on bubble; the
  tracker layer-toggle handler does not call `preventDefault`. Net
  result in tracker: pressing `B` toggles the backstitch layer **and**
  opens the Bulk Add modal. Verified by code trace.
- **`A` double-fires in tracker.** `A` toggles all layers (tracker)
  AND `Ctrl/Cmd+A` selects all (creator). Tracker has no `mod` guard
  on its layer-toggle `A`, so `Ctrl+A` in tracker fires
  toggle-all-layers as well as the browser's default select-all
  (creator's select-all isn't registered on tracker). The default
  select-all selects the page text since there's no editable focus.
  Confirmed by inspecting [tracker-app.js#L4198](../tracker-app.js#L4198).
- **`?` opens different things on different pages.** Creator's `?`
  opens the Shortcuts modal; tracker's `?` opens the Help modal;
  manager's `?` (via the global fallback in command-palette.js) opens
  Help. Inconsistent.

These additional bugs aren't in the user's reported list but should be
addressed in the redesign for consistency and to avoid regressions.
