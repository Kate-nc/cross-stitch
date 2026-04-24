# Keyboard Shortcuts — Phase 1.1: Current State Audit

> Snapshot taken on the `mobile` working branch, April 2026. All file/line
> citations refer to source files (not `creator/bundle.js`).

## 1. Registration mechanism — what's in the codebase today

There is **no central shortcut system**. Shortcuts are registered by at
least four different mechanisms that overlap in scope:

| Mechanism | Used by | Notes |
|---|---|---|
| Per-page `useEffect` + `window.addEventListener('keydown', ...)` | [creator/useKeyboardShortcuts.js](../creator/useKeyboardShortcuts.js), [tracker-app.js](../tracker-app.js#L4147) main handler, [manager-app.js](../manager-app.js#L120) "B" handler, [home-screen.js](../home-screen.js#L684) "B" handler, [creator-main.js](../creator-main.js#L1100) "B" handler | Each file repeats the input-element guard inline; rules differ subtly |
| Global `document.addEventListener('keydown', ...)` (capture) for ESC | [keyboard-utils.js](../keyboard-utils.js#L62) `useEscape` stack | Single instance. Clean, well-designed. **Keep as-is.** |
| Global `document.addEventListener('keydown', ...)` for `?` and `Ctrl/Cmd+K` | [keyboard-utils.js](../keyboard-utils.js#L93), [command-palette.js](../command-palette.js#L526) | Two different listeners both watch `?` (with a "skip if tracker/creator already listens" hack at command-palette.js#L541) |
| Modal-local `onKeyDown` JSX props | [modals.js](../modals.js#L278), [components.js](../components.js#L186), [header.js](../header.js#L47), several others | Used for Enter-to-submit / Esc-to-revert inside text inputs. Out of scope for the shortcut redesign. |

There is **no library** (Mousetrap, hotkeys-js, react-hotkeys, etc.) — every
binding is hand-rolled.

## 2. Complete shortcut inventory

> Status legend: ✅ working as documented · ⚠️ working but with a behavioural quirk · ❌ broken

### Global (any page)

| Key | Action | Where registered | Status | Discoverable? |
|---|---|---|---|---|
| `Esc` | Close topmost modal / cancel inline edit | [keyboard-utils.js#L40-L57](../keyboard-utils.js#L40-L57) (`useEscape` stack) | ✅ | Listed in Shortcuts modal |
| `?` | Open Help (global) or toggle Shortcuts modal (in Creator/Tracker) | [keyboard-utils.js#L93](../keyboard-utils.js#L93), [creator/useKeyboardShortcuts.js#L37](../creator/useKeyboardShortcuts.js#L37), [tracker-app.js#L4156](../tracker-app.js#L4156) | ⚠️ Three listeners; tracker/creator each install their own `?` handler that opens **shortcuts** while the global one opens **help**. Same key, different targets. | Hint banner in [keyboard-utils.js#L100+](../keyboard-utils.js#L100) + Shortcuts modal |
| `Ctrl/Cmd+K` | Toggle Command Palette | [command-palette.js#L526](../command-palette.js#L526) | ✅ | Palette UI |
| `B` | Open Bulk Add Threads | [creator-main.js#L1100](../creator-main.js#L1100), [manager-app.js#L120](../manager-app.js#L120), [home-screen.js#L684](../home-screen.js#L684) | ✅ but **registered three times** with three near-identical guard predicates | Tooltip on Bulk Add buttons |

### Creator (Pattern editor — `index.html`)

All registered in [creator/useKeyboardShortcuts.js](../creator/useKeyboardShortcuts.js).

| Key | Action | Status | Discoverable? |
|---|---|---|---|
| `Ctrl/Cmd+Z` | Undo edit | ✅ | Shortcuts modal |
| `Ctrl/Cmd+Y`, `Ctrl/Cmd+Shift+Z` | Redo edit | ✅ | Shortcuts modal |
| `Ctrl/Cmd+S` | Save project | ✅ | Shortcuts modal |
| `Ctrl/Cmd+A` | Select all | ✅ | Tooltip only |
| `Ctrl/Cmd+Shift+I` | Invert selection | ✅ | Tooltip only |
| `?` | Toggle Shortcuts modal | ✅ | self-evident |
| `Esc` | Cascading: name prompt → modal → overflow → lasso → selection → backstitch start → tool → highlight → palette colour | ✅ | implicit |
| `1` | Cross stitch tool *or* (if `hiId`) highlight mode = isolate | ⚠️ Mode flips silently based on `hiId` | Shortcuts modal lists only "cross stitch" |
| `2` | Half-fwd *or* highlight mode = outline | ⚠️ Same | Shortcuts modal lists only "half stitch /" |
| `3` | Half-bck *or* highlight mode = tint | ⚠️ Same | Shortcuts modal lists only "half stitch \\" |
| `4` | Backstitch *or* highlight mode = spotlight | ⚠️ Same | Shortcuts modal lists only "backstitch" |
| `5` | Erase | ✅ | Shortcuts modal |
| `W` | Toggle magic wand | ✅ | Tooltip only |
| `P` | Paint brush (unless backstitch active) | ✅ | Shortcuts modal |
| `F` | Fill bucket (unless backstitch active) | ✅ | Shortcuts modal |
| `I` | Eyedropper | ✅ | Tooltip only |
| `V` | Cycle view: colour → symbol → both | ✅ | Shortcuts modal |
| `\` | Toggle split-pane preview | ✅ | Not documented |
| `=` / `+` | Zoom in | ✅ | Shortcuts modal |
| `-` | Zoom out | ✅ | Shortcuts modal |
| `0` | Zoom-to-fit | ✅ | Shortcuts modal |
| `Alt` (held) | Show zoom-on-hover preview marker | ✅ (tracked separately at [creator-main.js#L85](../creator-main.js#L85)) | Not documented |
| `B` | Open Bulk Add (global) | ✅ | Tooltip |

### Tracker (Stitch tracker — `stitch.html`)

All registered in [tracker-app.js#L4145-L4225](../tracker-app.js#L4145-L4225).

| Key | Action | Scope | Status | Discoverable? |
|---|---|---|---|---|
| `Ctrl/Cmd+Z` | Undo (edit-mode aware) | always | ✅ | Shortcuts modal |
| `Ctrl/Cmd+Y`, `Ctrl/Cmd+Shift+Z` | Redo track | not edit mode | ✅ | Shortcuts modal |
| `Ctrl/Cmd+S` | Save project | always | ✅ | Shortcuts modal |
| `Space` (hold) | Pan canvas | always (interacts with touch) | ✅ | Shortcuts modal |
| `Esc` | Range mode → half disambig → name prompt → modal → exit-edit modal → cell popover → import dialog → toolbar overflow → focusColour → drawer | always | ✅ | implicit |
| `?` | Open Help modal (note: opens help, **not** shortcuts as in Creator — inconsistency) | always | ⚠️ Inconsistent with Creator | self-evident |
| `T` | Stitch mode → track | not edit mode | ✅ | Shortcuts modal |
| `N` | Stitch mode → navigate | not edit mode | ✅ | Shortcuts modal |
| `V` | Cycle view: symbol → colour → highlight | not edit mode | ✅ | Shortcuts modal |
| `F` | Toggle full-stitch layer | not edit mode | ✅ | Not in Shortcuts modal |
| `H` | Toggle half-stitch layer | not edit mode | ✅ | Not in Shortcuts modal |
| `B` | Toggle backstitch layer | not edit mode | ✅ | Not in Shortcuts modal |
| `K` | Toggle French-knot layer | not edit mode | ✅ | Not in Shortcuts modal |
| `A` | Toggle all layers on/off | not edit mode | ✅ | Not in Shortcuts modal |
| `D` | Toggle colour drawer | always | ✅ | Shortcuts modal |
| `P` | Pause / resume current auto session | not edit mode + session active | ✅ | Shortcuts modal |
| `=`, `+` | Zoom in | always | ✅ | Shortcuts modal |
| `-` | Zoom out | always | ✅ | Shortcuts modal |
| `0` | Zoom to fit | always | ✅ | Shortcuts modal |
| **`1`** | Highlight mode = isolate | **highlight view + focusColour set** | ❌ See report 2 | Shortcuts modal does not show |
| **`2`** | Highlight mode = outline | **highlight view + focusColour set** | ❌ See report 2 | not shown |
| **`3`** | Highlight mode = tint | **highlight view + focusColour set** | ❌ See report 2 | not shown |
| **`4`** | Highlight mode = spotlight | **highlight view + focusColour set** | ❌ See report 2 | not shown |
| **`C`** | Toggle counting aids | **highlight view + focusColour set** | ❌ See report 2 | Shortcuts modal lists |
| **`[`**, `ArrowLeft` | Previous focus colour | **highlight view** | ❌ See report 2 | Shortcuts modal lists |
| **`]`**, `ArrowRight` | Next focus colour | **highlight view** | ❌ See report 2 | Shortcuts modal lists |
| `B` | Open Bulk Add (global override) | always | ⚠️ **Conflicts** with the layer-toggle `B` above. The layer toggle wins because it's registered later in the same file. Tracker users cannot open Bulk Add with B. | Tooltip + palette |

### Manager (Stash manager — `manager.html`)

| Key | Action | Where | Status |
|---|---|---|---|
| `B` | Open Bulk Add Threads | [manager-app.js#L120](../manager-app.js#L120) | ✅ |
| `?` | Open Help (manager fallback) | [command-palette.js#L541](../command-palette.js#L541) | ✅ |
| `Esc` | via `useEscape` stack inside modals | various | ✅ |

### Embroidery legacy page (`embroidery.html`)

| Key | Action | Status |
|---|---|---|
| `Space` | Pan canvas (in `phase==='edit'`) | [embroidery.js#L1058](../embroidery.js#L1058) | ✅ but legacy code |
| `Ctrl/Cmd+Z` | Lasso: remove last anchor | [embroidery.js#L1093](../embroidery.js#L1093) | ✅ but legacy code |

> **Out of scope for the redesign:** the embroidery legacy page is being
> phased out (replaced by Creator). Don't migrate.

### Inline / modal handlers (out of scope)

Only mentioned for completeness; these are local to a focused element and
should remain as `onKeyDown` JSX props:

- `Enter` to submit / `Esc` to revert in [modals.js#L278](../modals.js#L278), [components.js#L186](../components.js#L186), [components.js#L919](../components.js#L919), [header.js#L47](../header.js#L47), [header.js#L278](../header.js#L278), [home-screen.js#L1415](../home-screen.js#L1415).
- Command palette internals (Tab/Arrow/Enter) inside the palette input: [command-palette.js#L322](../command-palette.js#L322).
- Sidebar accessibility: Enter/Space activates buttons in [creator/Sidebar.js#L54](../creator/Sidebar.js#L54), [creator/Sidebar.js#L140](../creator/Sidebar.js#L140).
- Onboarding wizard focus trap: [onboarding-wizard.js#L208](../onboarding-wizard.js#L208).

## 3. Event flow

```
KeyDown event (browser)
   │
   ├─ document, capture phase ────────── keyboard-utils.js ESC stack
   │     └─ if Escape → topmost handler, stopPropagation(), return
   │
   ├─ document, capture phase ────────── command-palette.js Ctrl/Cmd+K
   │     └─ stopPropagation(), preventDefault()
   │
   ├─ document, bubble phase ─────────── keyboard-utils.js global "?"
   │     └─ dispatch cs:openHelp
   │
   ├─ document, bubble phase ─────────── command-palette.js manager "?"
   │     └─ checks pageKind() === 'manager' before dispatching
   │
   ├─ window, bubble phase ───────────── creator/useKeyboardShortcuts.js
   │     └─ all Creator design-mode shortcuts; returns early on first match
   │
   ├─ window, bubble phase ───────────── tracker-app.js handleKeyDown
   │     └─ all Tracker shortcuts; returns early on first match
   │
   ├─ window, bubble phase ───────────── creator-main.js "B" listener
   │     └─ open Bulk Add
   │
   ├─ window, bubble phase ───────────── manager-app.js "B" listener
   │     └─ open Bulk Add
   │
   └─ window, bubble phase ───────────── home-screen.js "B" listener
         └─ onBulkAddThreads()
```

**Findings:**

- There is no centralised dispatcher. Each listener decides on its own
  whether to act, whether to `preventDefault`, and whether to
  `stopPropagation`.
- `?` is handled by the global listener in `keyboard-utils.js`, **and**
  by Creator's hook, **and** by Tracker's hook. The Creator/Tracker hooks
  do NOT call `preventDefault`/`stopPropagation` reliably for `?`, so on
  those pages the global handler fires too. The current behaviour is
  "the page-level handler runs first because `window` listener bubbles
  before `document` bubble — but only on Tracker", and that ordering is
  fragile.
- The "B for Bulk Add" key conflicts with the layer-toggle "B" in
  Tracker. Both listeners run; the Tracker one returns early on its
  first match (toggle-backstitch-layer), and `e.preventDefault()` is
  not called, but the global listener also calls `preventDefault()`
  anyway, opening Bulk Add. Net result: pressing **B in tracker toggles
  the backstitch layer AND opens Bulk Add at the same time.** Verified
  by code trace.
- ESC handling is the only well-designed part. The stack in
  `useEscape` correctly suppresses outer handlers when an inner modal
  is open, and it handles text-input focus politely.

## 4. Mode and focus context

Each handler decides its own scope:

- **Creator**: gated by `state.isActive` (in design phase) — but the
  page-level `B` handler in [creator-main.js#L1100](../creator-main.js#L1100) fires in **all** modes including the home screen and tracker phases inside the Creator app shell.
- **Tracker**: gated by `stitchMode` (`track` / `navigate` / `note`),
  `isEditMode`, `stitchView` (`symbol` / `colour` / `highlight`), and
  `focusColour`. The `1 2 3 4 c [ ]` shortcuts require **multiple
  conditions** to all be true; this is not visible to the user and is
  the root of the perceived "broken" state (see report 2).
- **Manager**: only the `B` shortcut, no mode logic.
- **Modals**: rely on the `useEscape` stack — handled correctly.
- **Focus**: every page-level handler has its own input-element guard,
  and they all differ:

  | File | Tags blocked |
  |---|---|
  | `creator/useKeyboardShortcuts.js:11` | `INPUT`, `SELECT`, `TEXTAREA` |
  | `tracker-app.js:4148` | `INPUT`, `SELECT`, `TEXTAREA`, **`BUTTON`**, **`A`** + `isContentEditable` |
  | `manager-app.js:122`, `home-screen.js:692`, `creator-main.js:1108` | `INPUT`, `TEXTAREA`, `SELECT`, `isContentEditable` |
  | `keyboard-utils.js:31` (`isTextInputFocused`) | `TEXTAREA`, `INPUT` (only text-style types), `isContentEditable` |

  The Tracker's inclusion of `BUTTON` and `A` is the reason single-key
  shortcuts feel broken after the user clicks any toolbar button — see
  report 2.

## 5. Existing discoverability surfaces

- **`SharedModals.Shortcuts`** in [modals.js#L168](../modals.js#L168): a hand-maintained list of shortcuts, opened from the header `⌨` button ([header.js#L335](../header.js#L335)) and triggered via `cs:openShortcuts`. The list is **out of date** (missing layer toggles `F`/`H`/`B`/`K`/`A` for tracker, missing `\` for split-pane in creator, missing `1-4` highlight modes).
- **Command palette** ([command-palette.js](../command-palette.js)): has a "Keyboard Shortcuts" entry that dispatches `cs:openShortcuts`.
- **HelpHintBanner** ([keyboard-utils.js#L101+](../keyboard-utils.js#L101)): floating "Press ? for help" pill shown after 30s of idleness.
- **Tooltips** on toolbar buttons in [creator/ToolStrip.js](../creator/ToolStrip.js) and [creator/Sidebar.js](../creator/Sidebar.js) — some include the shortcut letter in the `title` attribute, others don't.
- **No shortcut indicators** in Tracker's view-mode tabs, layer-toggle buttons, drawer toggle, or zoom controls.
