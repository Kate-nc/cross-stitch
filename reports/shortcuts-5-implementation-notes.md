# Keyboard shortcuts — implementation notes

End-of-project notes for the keyboard shortcut redesign. See the four
companion reports for the discovery and spec phases:

- [shortcuts-1-current-state.md](shortcuts-1-current-state.md)
- [shortcuts-2-broken.md](shortcuts-2-broken.md)
- [shortcuts-3-ux-issues.md](shortcuts-3-ux-issues.md)
- [shortcuts-4-redesign-spec.md](shortcuts-4-redesign-spec.md)

## What was delivered

| Phase | Commit | Outcome |
|---|---|---|
| 3.1 | `a349170` | New central registry `shortcuts.js` + 24 unit tests. |
| 3.2 | `a9fb150` | Migrated Creator, Tracker, Manager, Home shortcuts to the registry; consolidated three duplicate `B`-for-Bulk-Add handlers into one. |
| 3.3 | `d7456d9` | Restored `[`, `]`, `1`, `2`, `3`, `4`, `c` in track mode; 17 regression tests added. |
| 3.4 | `911b3b2` | Help modal now auto-generated from `Shortcuts.list()`; replaced the `⌨` emoji in the header with a new `Icons.keyboard` SVG. |

## Behavioural changes you (or QA) should know about

These are intentional and documented per the spec:

- **`[`, `]`, `1`–`4`, `c` in tracker** — fixed. Previously dead after any
  toolbar button click, and `1`–`4` `c` were silently no-ops without a
  pre-set focus colour. Now they fire from a focused `<button>` / `<a>`
  and `1`–`4` auto-pick the first focusable colour when none is set.
- **`B` (backstitch layer toggle) renamed to `L` in tracker** — was
  conflicting with the global `B` for Bulk Add Threads. Both keys now do
  exactly one thing each.
- **`A` (toggle all layers) renamed to `Shift+A` in tracker** — bare `A`
  was triggering browser select-all on the entire page when focus left an
  input. `Shift+A` is unique and never collides with the browser.
- **`?` opens the same Shortcuts panel everywhere** — was Help in tracker
  and manager, Shortcuts in creator. Now consistent across all three pages.
- **`C` (counting aids)** now works in any tracker view, not only
  `highlight + focusColour set`. Hidden a useful affordance behind two
  prerequisites was a UX regression.
- **`Ctrl/Cmd+Z`, `+Y`, `+S`, `Shift+Z`** — modified shortcuts now fire
  even from inside text inputs by default (the standard expectation of
  every desktop OS). Single-key shortcuts still respect the input guard.

## How to add a new shortcut

```js
window.useShortcuts([
  {
    id: 'creator.weave',
    keys: 'w',                       // string or array; modifiers via "mod+", "shift+"
    scope: 'creator.design',         // most-specific active scope wins
    description: 'Toggle weave mode',
    when: () => state.canWeave,      // optional dynamic guard
    run: () => setWeave(v => !v)
  }
], [/* dependencies */]);
```

Activate the scope from the same component:

```js
window.useScope('creator.design', !!state.isActive);
```

Things the registry handles for you:

- Bubble-phase listener installed once, lazily.
- Canonical input-element guard (`INPUT`, `TEXTAREA`, `SELECT`,
  `contenteditable`) — never `BUTTON`/`A`.
- Modifier shortcuts (`mod+...`, `shift+...`) default to firing inside
  text inputs (set `allowInInput: false` to opt out).
- Conflict detection: registering two entries with the same `(scope, key)`
  logs `console.error` so we catch regressions immediately.
- Cross-platform key formatting via `Shortcuts.formatKey('mod+shift+z')`
  → `"Ctrl+Shift+Z"` on Windows, `"⌘⇧Z"` on macOS.

## Things deliberately left out of scope

- **`Space`-to-pan** (held-modifier in tracker) — kept in its own
  `useEffect` because the registry is keydown-only by design. The keyup
  release lives in a sibling effect.
- **`useEscape` cascade in `keyboard-utils.js`** — preserved untouched.
  The registry runs at the bubble phase; `useEscape` runs at capture for
  modal-local Esc dismissals. The two systems compose cleanly.
- **`Ctrl/Cmd+K` command palette** — preserved as-is.
- **Tooltip annotations on every toolbar button** — out of scope for this
  PR. The Shortcuts modal now lists every active binding, so all
  shortcuts are at least *discoverable*. Per-button hint text can be a
  follow-up.

## Known limitations / follow-ups

- The Shortcuts panel currently shows only entries whose scope is
  *currently active*. That means e.g. the highlight-view bindings only
  appear when the user is in highlight view. This is correct for
  context-sensitive discovery but means a global "what does every key
  do?" reference is not yet available — could be a tab in the modal.
- Conflict detection is registration-time only; if two pages register the
  same key-scope combo at different mount times, only the second triggers
  the warning. Adequate in practice because each page's hooks register
  together.
- The `tracker.shortcuts` entry for `?` calls `setModal('shortcuts')` —
  if a page ever introduces another modal called `shortcuts` it would
  collide. Unlikely but worth keeping in mind.

## Test coverage

41 dedicated tests across two files:

- [tests/shortcuts.test.js](../tests/shortcuts.test.js) (24 tests):
  registry mechanics, scope hierarchy, key DSL, conflict detection,
  cross-platform formatting, hooks.
- [tests/trackerShortcutFixes.test.js](../tests/trackerShortcutFixes.test.js)
  (17 tests): regression coverage for the four originally-broken
  bindings, including the focused-button case (Bug A) and the
  null-focusColour case (Bug B).

Run with `npm test -- --runInBand`. Total suite: 722 tests passing.
