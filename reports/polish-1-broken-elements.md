# Polish Pass 1 — Broken & Non-Functional Interactive Elements

**Audit date:** 2026-04-27  
**Scope:** All entry points (home.html, index.html, stitch.html, manager.html) + every shared modal/panel/drawer.

## Headline result

**Zero clearly-broken handlers found.** All `onClick` / `onChange` / `onContextMenu` attributes have valid implementations, every keyboard shortcut shown in [help-drawer.js](help-drawer.js) and [command-palette.js](command-palette.js) is registered against a runtime handler in [keyboard-utils.js](keyboard-utils.js) / [creator/useKeyboardShortcuts.js](creator/useKeyboardShortcuts.js), and form inputs persist state.

The codebase shows defensive patterns throughout (typeof guards, fallback no-ops, CustomEvent dispatching). This category yielded the smallest fix list of any in the polish pass.

## Findings

### 🟡 Permanently-disabled "Coming soon" preferences

| File | Lines | What |
|---|---|---|
| [preferences-modal.js](preferences-modal.js#L9) | 9, 167, 256, 1165 | Four preferences render with `<SoonBadge />` and persist to `UserPrefs` but have no runtime effect. |

These are honest (the badge is the user-facing disclosure), but they currently compete for visual weight with live settings. **Recommended fix:** group "Coming soon" rows into a collapsed sub-section or move them out of the active categories until wired up. Tracked by [preferences-modal.js](preferences-modal.js#L9).

### 🟢 Verified-working but worth confirming on touch

The right-click + long-press context menu is **registered for `pointerdown` only** in [creator/ContextMenu.js](creator/ContextMenu.js#L1) — see Polish 7 findings for the touch-equivalent gap. The handler itself is wired and triggers correctly.

## What was checked

- 20+ grep patterns across `onClick=\{`, `onChange=\{`, `disabled=\{`, `cursor:\s*pointer`, `confirm\(`, `alert\(`, TODO/FIXME markers near interactive code.
- Shortcut registry comparison between [help-drawer.js](help-drawer.js), [command-palette.js](command-palette.js), [keyboard-utils.js](keyboard-utils.js), [shortcuts.js](shortcuts.js), [creator/useKeyboardShortcuts.js](creator/useKeyboardShortcuts.js).
- Toast call sites verified to use the `{message, type, ...}` options shape (no raw-string footguns remain).
