# Keyboard Shortcuts — Phase 1.3: UX Issues

## 1. Discoverability

### What's good

- The header has a `⌨` button ([header.js#L335](../header.js#L335)) that
  opens the Shortcuts modal — visible from every page.
- Pressing `?` from anywhere opens either the Shortcuts modal (Creator)
  or the Help modal (Tracker, Manager). Hint banner promotes this.
- The command palette (`Ctrl/Cmd+K`) has a "Keyboard Shortcuts" entry.

### What's broken

- **The Shortcuts modal is hand-maintained and out of date.** Several
  shortcuts are completely missing from it:
  - Tracker: `F`, `H`, `B`, `K`, `A` (layer toggles), `1`, `2`, `3`,
    `4` (highlight modes), `Ctrl/Cmd+S`, `B` (Bulk Add).
  - Creator: `\` (split-pane), `W` (magic wand), `I` (eyedropper),
    `Ctrl/Cmd+A` (select all), `Ctrl/Cmd+Shift+I` (invert selection),
    `Alt` (zoom-on-hover preview).
- **`?` is inconsistent.** It opens "Shortcuts" in Creator but "Help"
  in Tracker/Manager. A new user can't tell which to expect, and the
  hint banner just says "Press ? for help" so the Creator case feels
  wrong.
- **Tooltips don't reliably surface shortcuts.** The Creator toolbar
  (paint/fill/eyedropper/wand) shows tooltip text but only some include
  the key letter. The tracker view-mode tabs, layer toggles, drawer
  toggle, and zoom controls don't show shortcuts at all.
- **Mode-dependent shortcuts have no UI hint.** A user in highlight
  view has no idea that `1 2 3 4 c` are available. Even if the bugs
  in report 2 are fixed, users won't find these without trial-and-error
  or reading the modal.

## 2. Consistency

| Concern | Issue |
|---|---|
| Same key, different actions across pages | `1`–`4`: tool selection in Creator vs. highlight mode in Tracker. Not necessarily wrong (different page = different scope), but the Shortcuts modal makes this hard to see at a glance because it shows only the active page's section. |
| Same key, different actions on the **same** page | `B` in Tracker = toggle backstitch layer; `B` in Tracker (also) = Bulk Add. Two listeners both fire. |
| Same action, different keys | Undo is `Ctrl/Cmd+Z` in both Creator and Tracker (good). Redo is `Ctrl/Cmd+Y` *and* `Ctrl/Cmd+Shift+Z` in both (good). Save is `Ctrl/Cmd+S` in both (good). View cycle is `V` in both (good). Zoom keys are consistent (good). |
| Mode toggle shortcuts | Tracker uses `T`/`N` for stitch-mode and `V` for view cycle. Creator uses `V` for view cycle but no shortcut for entering tools (each tool has its own key). Different conventions but acceptable since the affordances differ. |
| `?` action | Inconsistent — see above. |

## 3. Conventions

| Convention | Honoured? | Notes |
|---|---|---|
| `Ctrl/Cmd+Z` undo | ✅ | Both pages |
| `Ctrl/Cmd+Y`, `Ctrl/Cmd+Shift+Z` redo | ✅ | Both pages |
| `Ctrl/Cmd+S` save | ✅ | Both pages |
| `Ctrl/Cmd+A` select all | ⚠️ | Creator only. In Tracker, `A` (no modifier) toggles layers and `Ctrl+A` is **not** intercepted, so the browser's select-all-text fires — selecting the entire page DOM. Surprising and not useful. Should either intercept `Ctrl+A` to mean "select all stitches in current view" or actively `preventDefault` it. |
| `Esc` to cancel/close | ✅ | The `useEscape` stack handles this well. |
| `?` for help | ⚠️ | Inconsistent target (see above). |
| `Tab` for focus traversal | ⚠️ | Mostly works, but the modal focus-trap is only correctly implemented for the onboarding wizard ([onboarding-wizard.js#L208](../onboarding-wizard.js#L208)). Other modals (Shortcuts, Help, ThreadSelector, etc.) don't trap focus, so `Tab` walks behind the overlay. |
| `Cmd` on Mac vs `Ctrl` on Windows | ✅ | All modifier checks use `(e.ctrlKey \|\| e.metaKey)`. |
| Standard PWA shortcuts | ⚠️ | `Ctrl/Cmd+K` for command palette is correct. `Ctrl/Cmd+P` print is not intercepted (good — browser default works). `Ctrl/Cmd+F` find is not intercepted (good). |

### Browser-default overrides — anything surprising?

| Key | Overridden? | OK? |
|---|---|---|
| `Ctrl/Cmd+S` | Yes — saves project | ✅ Expected for a doc-style PWA |
| `Ctrl/Cmd+K` | Yes — palette | ✅ Standard for command-palette UIs |
| `Space` | Yes in Tracker (pan-canvas) and embroidery (pan) | ⚠️ The "hold space to pan" interferes with default page scroll — but Tracker disables page scroll inside the canvas anyway. Acceptable. |
| `?` | Yes — opens Help/Shortcuts | ✅ Becoming a standard convention |
| `B` (no modifier) | Yes — Bulk Add | ✅ But should fall back if `B` is bound elsewhere on the page (Tracker bug — see report 2) |

## 4. Modifier usage / input-element safety

- **Single-key shortcuts (`1`, `2`, `t`, `b`, etc.) inside text inputs:** the
  guard predicate is duplicated in five places with three different
  variants. The strictest one (`tracker-app.js`) is also wrong (it
  blocks button focus — see report 2). The most lenient one
  (`creator/useKeyboardShortcuts.js`) skips `isContentEditable` entirely.
  A single canonical predicate is needed.
- **Modified shortcuts inside text inputs:** `Ctrl/Cmd+S`, `Ctrl/Cmd+Z`,
  `Ctrl/Cmd+K` should fire even when typing in an input. The current
  implementation:
  - `Ctrl/Cmd+K` (palette): fires from inputs ✅
  - `Ctrl/Cmd+Z`/`Y`/`S` in Creator: **does not fire** because the
    input-element guard runs *before* the modifier check
    ([creator/useKeyboardShortcuts.js#L11-L14](../creator/useKeyboardShortcuts.js#L11-L14)).
    User cannot save while typing the project name in the rename input.
  - Same in Tracker — input guard at line 4148 returns before the
    modifier check at line 4149. **Bug.**
- **`?` in inputs:** correctly suppressed (the global handler checks
  `isTextInputFocused` first).

## 5. Accessibility

- **`useEscape` stack** correctly handles nested modals — accessibility
  win.
- **Focus trapping in modals:** mostly missing. The onboarding wizard
  has a correct `Tab`-trap loop ([onboarding-wizard.js#L208](../onboarding-wizard.js#L208))
  but other modals (Shortcuts, Help, About, ThreadSelector, Sync
  Summary, Customise, ShareCard) don't. A keyboard-only user can `Tab`
  past the overlay and land on hidden controls.
- **`role="dialog"` and `aria-modal`:** not consistently applied. The
  modal-overlay divs are plain divs with click-outside-to-close.
- **Shortcut hints in tooltips:** `aria-keyshortcuts` attribute is not
  used anywhere. Screen readers can't announce that a button has a
  keyboard equivalent.
- **`kbd` markup:** used only inside the Shortcuts modal. Not used in
  tooltips or help-overlay labels.
- **`<button>` focus-then-shortcut-dies bug:** the Tracker bug
  documented in report 2 is also an accessibility regression — keyboard
  users navigating with Tab will land on a button and discover that no
  shortcuts work until they navigate away. They have no way to
  recover without using the mouse.

## Summary

The shortcut system has accumulated organically. The individual handlers
are reasonably written, but:

- There's no single registry, so:
  - The Shortcuts modal drifts out of sync with the actual handlers.
  - Conflicts (like `B` doing two things) aren't detected.
  - Per-handler input-element guards diverge.
- One copy-paste error (the `BUTTON`/`A` guard in tracker) silently
  kills *all* tracker shortcuts after the user clicks anything.
- `?` does different things on different pages.
- Mode-conditioned shortcuts have no UI affordance.

A central registry with auto-generated discoverability is the natural
fix. Spec follows in `shortcuts-4-redesign-spec.md`.
