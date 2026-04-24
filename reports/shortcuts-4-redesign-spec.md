# Keyboard Shortcuts — Phase 2: Redesign Spec

> Source reports: [shortcuts-1-current-state.md](shortcuts-1-current-state.md),
> [shortcuts-2-broken.md](shortcuts-2-broken.md), [shortcuts-3-ux-issues.md](shortcuts-3-ux-issues.md).

## Goals

1. **One registry.** Every page-level shortcut is defined in a single
   array of declarative entries.
2. **Mode-aware dispatch.** A shortcut declares which scope(s) it lives
   in; the dispatcher decides at runtime whether to fire.
3. **Safe by default.** Single-key (no-modifier) shortcuts never fire
   while the user is typing. The rule is enforced by the dispatcher,
   not per-handler.
4. **Self-describing.** The Shortcuts modal is generated from the
   registry. Tooltips can pull their key labels from the registry.
5. **Conflict-detected.** Two registrations with the same key+scope
   produce a `console.error` at startup so we never ship two handlers
   fighting over the same chord.
6. **Backwards-compatible.** The new system co-exists with `useEscape`
   (which is already well designed and stays untouched) and the
   command-palette's `Ctrl/Cmd+K` listener (also fine).

## Non-goals

- Replacing `useEscape`. It works.
- Replacing the command-palette listener for `Ctrl/Cmd+K`. It works.
- Replacing modal-local `onKeyDown` JSX props for Enter-to-submit /
  Esc-to-revert behaviour inside text inputs. Those are local concerns.
- Refactoring the embroidery legacy page (being phased out).
- Adding a focus-trap to every modal (separate accessibility task).

## Architecture

### Module: `shortcuts.js` (new, root level, loaded before `command-palette.js`)

Exposes `window.Shortcuts` with three methods plus a React hook.

```js
window.Shortcuts = {
  // Register an array of shortcuts. Returns an unregister fn.
  // Use the React hook in components instead, unless you really need imperative.
  register(entries),

  // Read-only snapshot of all currently registered shortcuts.
  // Used by the auto-generated help modal.
  list(),

  // Programmatically set / read the current scope stack.
  // Pages call this to enter / leave a mode.
  pushScope(scope), popScope(scope), getActiveScopes(),

  // Internal — exported only for tests.
  _dispatch(event), _reset(),
};

window.useShortcuts = function(entries, deps) { /* React hook */ };
window.useScope     = function(scope, when)   { /* React hook */ };
```

### Shortcut entry shape

```js
{
  // Required
  id: 'tracker.highlight.isolate',     // unique stable id, used for conflict detection
  keys: '1',                            // see "Key syntax" below
  scope: 'tracker.highlight',           // see "Scope syntax" below
  description: 'Highlight mode: isolate',
  run: (e) => state.setHighlightMode('isolate'),

  // Optional
  when: () => focusColour !== null,    // additional runtime guard; if false, shortcut won't fire AND won't claim the key
  group: 'Highlight',                  // help-modal grouping (defaults to scope)
  hidden: false,                       // hide from help modal
  allowInInput: false,                 // override the input-element guard. Default false for unmodified keys, true for modified.
  preventDefault: true,                // default true
}
```

### Key syntax

A small DSL — no library needed:

| Syntax | Meaning |
|---|---|
| `'a'`, `'1'`, `'?'`, `'['`, `'\\'` | Single key (matches `e.key`, case-insensitive for letters) |
| `'mod+s'` | `Ctrl` on Windows/Linux, `Cmd` on Mac |
| `'mod+shift+z'` | Modifier + shift |
| `'shift+a'` | Shift only |
| `'space'`, `'esc'`, `'enter'`, `'arrowleft'`, `'arrowright'` | Named keys |
| `'='`, `'+'` | Both `=` and `+` (one entry, two listed) — declared as `keys: ['=', '+']` |

Multiple aliases: pass an array. `keys: ['mod+y', 'mod+shift+z']`.

### Scope syntax

Hierarchical, dot-separated:

```
global
global.creator
global.creator.design          (active when Creator is in design phase)
global.creator.design.lasso    (active when lasso tool is selected)
global.tracker
global.tracker.track           (stitchMode === 'track')
global.tracker.navigate        (stitchMode === 'navigate')
global.tracker.view.highlight  (stitchView === 'highlight')
global.tracker.view.highlight.focused (focusColour !== null)
global.manager
```

A shortcut registered to scope `global.tracker.view.highlight` fires
when the **current scope stack contains that path**. Scopes are entered
with `pushScope(...)`/`popScope(...)` or, more commonly, the
`useScope(scope, when)` React hook which manages the lifecycle.

**More-specific scope wins** when two shortcuts share the same key. If
both `global.tracker` and `global.tracker.view.highlight` register `1`,
the highlight one fires when the highlight scope is active.

### Dispatcher

A single `document.addEventListener('keydown', dispatch, false)`
installed lazily on first registration. Capture phase **not** used so
that:

- Modal-local `onKeyDown` JSX handlers (Enter to submit, Esc to revert)
  fire first and can `e.stopPropagation()`.
- The `useEscape` capture-phase listener for `Esc` still wins for ESC
  (it's already on capture in `keyboard-utils.js`).

```js
function dispatch(e) {
  if (e.defaultPrevented) return;
  const candidates = [];
  for (const entry of registry) {
    if (!matchesKey(entry, e)) continue;
    if (!matchesScope(entry, activeScopes)) continue;
    if (!allowInInput(entry, e) && isTextInputFocused()) continue;
    if (entry.when && !entry.when()) continue;
    candidates.push(entry);
  }
  if (!candidates.length) return;
  // Most-specific scope wins; ties resolved by registration order.
  candidates.sort((a, b) => scopeSpecificity(b) - scopeSpecificity(a));
  const winner = candidates[0];
  if (winner.preventDefault !== false) e.preventDefault();
  e.stopPropagation();
  try { winner.run(e); } catch (err) { console.error('Shortcut handler threw:', winner.id, err); }
}
```

### Input-element guard (canonical, single-source)

```js
function isTextInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    return ['text','search','email','url','tel','password','number'].includes(type);
  }
  if (el.isContentEditable) return true;
  return false;
}
```

This matches the predicate already proven in
[keyboard-utils.js#L31](../../keyboard-utils.js#L31). `BUTTON` and `A`
are intentionally **not** suppressed (fixes report 2 Bug A).

For unmodified shortcuts, `allowInInput` defaults to `false`. For
modified shortcuts (anything containing `mod`, `shift`, `alt`),
`allowInInput` defaults to `true` — so `Ctrl/Cmd+S` works while typing
in the project-name input (fixes report 3 §4 bug).

### Conflict detection

At the end of every `register()` call, group entries by
`scope + normalizedKey` and `console.error` each duplicate. We do not
throw, because the user can still use the app — but the message is
loud enough to catch in test logs.

In tests, `Shortcuts._reset()` clears the registry and resets the
console-error spy so suites don't bleed into each other.

### Mode/scope lifecycle

- `useScope('global.tracker.view.highlight', stitchView === 'highlight')`
  pushes the scope when the predicate becomes true and pops it when
  false (or on unmount). This is the same lifecycle pattern as
  `useEscape`.
- `useShortcuts(entries, deps)` registers the entries on mount and
  unregisters on unmount. Re-runs when `deps` change.
- Pages set up a one-time `useScope('global.creator')` /
  `useScope('global.tracker')` / `useScope('global.manager')` at the
  app root. Sub-scopes are pushed by the components that own them.

## Complete redesigned shortcut table

> Status column: `=` = unchanged from current, `+` = new, `~` = behaviour
> tweak, `-` = removed.

### Global (always active)

| Key | Action | Scope | Status | Shown in UI? |
|---|---|---|---|---|
| `Esc` | Close topmost overlay (handled by `useEscape`) | global | = | implicit |
| `?` | **Open Shortcuts modal** (consistent across all pages) | global | ~ (was Help in tracker/manager) | self-evident + hint |
| `Ctrl/Cmd+K` | Toggle Command Palette (handled by command-palette.js) | global | = | palette UI |
| `Shift+/` | Same as `?` | global | + | (synonym, not listed) |

> The "?" change is small: command-palette.js currently dispatches `cs:openHelp` on `?`; the new global handler dispatches `cs:openShortcuts` on `?` and a separate `Help` action remains accessible from the header `?`-icon and the palette. Help and Shortcuts are different surfaces.

### Creator (Pattern editor — `index.html`)

Scope: `global.creator.design` (active when `phase === 'design'` and
not in a sub-tool).

| Key | Action | Scope | Status | Shown |
|---|---|---|---|---|
| `Ctrl/Cmd+Z` | Undo edit | `creator.design` | = | yes |
| `Ctrl/Cmd+Y`, `Ctrl/Cmd+Shift+Z` | Redo edit | `creator.design` | = | yes |
| `Ctrl/Cmd+S` | Save project | `creator.design` | = (now also fires from inputs) | yes |
| `Ctrl/Cmd+A` | Select all | `creator.design` | = | yes |
| `Ctrl/Cmd+Shift+I` | Invert selection | `creator.design` | = | yes |
| `1` | Cross stitch | `creator.design` | = | yes |
| `2` | Half stitch / | `creator.design` | = | yes |
| `3` | Half stitch \\ | `creator.design` | = | yes |
| `4` | Backstitch | `creator.design` | = | yes |
| `5` | Erase | `creator.design` | = | yes |
| `1`–`4` | Highlight mode (isolate / outline / tint / spotlight) | `creator.design.highlight` | = | yes (separate row, scope-specific) |
| `W` | Toggle magic wand | `creator.design` | = | yes (was missing) |
| `P` | Paint brush | `creator.design` (when not backstitch) | = | yes |
| `F` | Fill bucket | `creator.design` (when not backstitch) | = | yes |
| `I` | Eyedropper | `creator.design` | = | yes (was missing) |
| `V` | Cycle view: colour → symbol → both | `creator.design` | = | yes |
| `\` | Toggle split-pane preview | `creator.design` | = | yes (was missing) |
| `=`, `+` | Zoom in | `creator.design` | = | yes |
| `-` | Zoom out | `creator.design` | = | yes |
| `0` | Zoom to fit | `creator.design` | = | yes |
| `B` | Open Bulk Add | `creator` | = | yes |

`Alt`-held (zoom-on-hover preview) is **not** a shortcut — it's a held
modifier observed by the canvas component. Out of scope, leave the
existing creator-main.js listener untouched.

### Tracker (Stitch tracker — `stitch.html`)

Scope hierarchy:
- `global.tracker` — active whenever the tracker app is mounted
- `global.tracker.view.highlight` — `stitchView === 'highlight'`
- `global.tracker.view.highlight.focused` — also `focusColour` set
- `global.tracker.notedit` — `!isEditMode`

| Key | Action | Scope | Status | Shown |
|---|---|---|---|---|
| `Ctrl/Cmd+Z` | Undo (edit-mode-aware) | `tracker` | = | yes |
| `Ctrl/Cmd+Y`, `Ctrl/Cmd+Shift+Z` | Redo | `tracker.notedit` | = | yes |
| `Ctrl/Cmd+S` | Save project | `tracker` | = | yes |
| `Space` | Hold to pan canvas | `tracker` | = | yes |
| `T` | Stitch mode → track | `tracker.notedit` | = | yes |
| `N` | Stitch mode → navigate | `tracker.notedit` | = | yes |
| `V` | Cycle view | `tracker.notedit` | = | yes |
| `F` | Toggle full-stitch layer | `tracker.notedit` | = | yes (was missing) |
| `H` | Toggle half-stitch layer | `tracker.notedit` | = | yes (was missing) |
| `K` | Toggle French-knot layer | `tracker.notedit` | = | yes (was missing) |
| `L` | Toggle backstitch layer | `tracker.notedit` | ~ **renamed from B → L** to free up `B` for global Bulk Add | yes |
| `Shift+A` | Toggle all layers | `tracker.notedit` | ~ **was bare `A`**, now Shift to free up `A` for future select-all | yes |
| `D` | Toggle colour drawer | `tracker` | = | yes |
| `P` | Pause / resume current auto session | `tracker.notedit` (with active session) | = | yes |
| `=`, `+` | Zoom in | `tracker` | = | yes |
| `-` | Zoom out | `tracker` | = | yes |
| `0` | Zoom to fit | `tracker` | = | yes |
| `[`, `ArrowLeft` | Previous focus colour | `tracker.view.highlight` | ~ **fix: now actually fires** | yes |
| `]`, `ArrowRight` | Next focus colour | `tracker.view.highlight` | ~ **fix: now actually fires** | yes |
| `1` | Highlight mode = isolate | `tracker.view.highlight` | ~ **fix: auto-picks first focusable colour if focusColour is null** | yes |
| `2` | Highlight mode = outline | `tracker.view.highlight` | ~ same | yes |
| `3` | Highlight mode = tint | `tracker.view.highlight` | ~ same | yes |
| `4` | Highlight mode = spotlight | `tracker.view.highlight` | ~ same | yes |
| `C` | Toggle counting aids | `tracker` (was: `tracker.view.highlight.focused`) | ~ **moved to a wider scope** — counting aids are useful in every view | yes |
| `B` | Open Bulk Add | `global` (uses existing creator-main.js handler, refactored to go through registry) | ~ **no longer conflicts** in tracker because layer-toggle moved to L | yes |

### Manager (`manager.html`)

| Key | Action | Scope | Status | Shown |
|---|---|---|---|---|
| `B` | Open Bulk Add | `global` | = (now via registry) | yes |
| `?` | Open Shortcuts modal | global | ~ (was Help) | yes |

## Migration plan

| Concern | Before | After |
|---|---|---|
| Where shortcuts live | 5 separate handlers across the codebase | One declarative array per page, registered via `useShortcuts` |
| Input guard | Repeated 5× with 3 variants | One canonical `isTextInputFocused()` in `shortcuts.js` |
| `Ctrl/Cmd+S` while typing | Doesn't fire | Fires (modified shortcuts default `allowInInput: true`) |
| `?` consistency | Help in tracker/manager, Shortcuts in creator | Shortcuts modal everywhere |
| `B` in tracker | Layer-toggle backstitch + Bulk Add both fire | Layer-toggle moved to `L`, Bulk Add owns `B` |
| `A` in tracker | Layer-toggle-all on bare `A`, intercepts `Ctrl+A` confusingly | Moved to `Shift+A` |
| Tracker BUTTON/A focus bug | All tracker shortcuts dead after clicking any button | Fixed (canonical guard does not include BUTTON/A) |
| Highlight `1 2 3 4 c` need focusColour | Silently does nothing | Auto-picks first focusable colour and continues |
| Counting aids `C` | Highlight view only | All tracker views |
| Shortcuts modal | Hand-maintained, out of date | Generated from registry |
| Conflict detection | None | console.error on duplicate `(scope, key)` at registration |

### Rollout order (matches Phase 3 commits)

1. Add `shortcuts.js` with registry, hook, dispatcher, tests.
2. Migrate Creator (replaces `creator/useKeyboardShortcuts.js` body).
3. Migrate Tracker (replaces tracker-app.js handleKeyDown body).
4. Migrate Manager + global `B` (consolidate the three `B` handlers).
5. Replace `SharedModals.Shortcuts` body with auto-generated content
   from `Shortcuts.list()`.
6. Update `?` global handler in `keyboard-utils.js` to dispatch
   `cs:openShortcuts` (not `cs:openHelp`). Existing `cs:openHelp`
   listeners stay; the header still has a separate Help icon.

### Things explicitly removed or changed (call out so reviewers see)

- Tracker `B` (layer toggle) → renamed to `L`. Reason: conflict with
  global Bulk Add `B`. Listed in spec table above; called out in the
  Shortcuts modal as "Backstitch layer (L)".
- Tracker `A` (layer toggle all) → renamed to `Shift+A`. Reason:
  `Ctrl+A` was being eaten by browser select-all on this page; making
  the layer-toggle require Shift frees the `A` for a possible future
  Tracker select-all and avoids the surprising plain-A toggle.
- `?` in Tracker/Manager now opens **Shortcuts**, not Help. Reason:
  consistency. Help is still one click away (header `?` icon and
  command palette).
- Counting aids `C` no longer requires highlight view + focusColour.
  Reason: it's broadly useful while tracking; the original gating was
  arbitrary.

Nothing else is removed.
