# Agent Instructions — stitchx

This file is read by AI coding agents (Copilot, Claude, Cursor, Aider, etc.).
The full project guidance lives in [.github/copilot-instructions.md](.github/copilot-instructions.md);
this file is a shorter pointer plus the most-broken house rule.

## Read this first

- The complete project conventions are in [.github/copilot-instructions.md](.github/copilot-instructions.md).
- Run unit tests with `npm test` (Jest, parallel by default — ~5 s).
  Use `npm test -- --runInBand` only when debugging cross-suite state leaks
  (parallel runs are safe for the current suite).
- After editing any file in `creator/`, regenerate the bundle with
  `node build-creator-bundle.js` before committing.

## Workshop is the sole theme

- The Workshop visual direction (UX-12) is the only theme. Light tokens
  live on `:root` in [styles.css](styles.css); dark tokens on
  `[data-theme="dark"]`. The mirror reference lives at
  `reports/showcase/_workshop.css`.
- The Phase 0 `--ws-*` aliases have been removed (Phase 8). Use the
  canonical token names directly (`--accent`, `--surface`,
  `--text-primary`, `--text-secondary`, `--radius-sm`, `--shadow-sm`,
  plus the non-conflicting Workshop tokens like `--line`, `--accent-2`,
  `--success`, `--motion`, etc.). No raw hex in component CSS \u2014
  `rgba(...)` is allowed only inside `box-shadow` declarations.
- `/home` ([home.html](home.html) + [home-app.js](home-app.js)) is the
  default landing. Direct URLs to `index.html`, `stitch.html`, and
  `manager.html` still work and drop users straight into the relevant
  tool. The legacy [home-screen.js](home-screen.js) is still actively
  used: `manager.html` loads it for `MultiProjectDashboard` (consumed by
  `project-library.js`), and `project-library.js` calls
  `window.MultiProjectDashboard`. Do not delete it without refactoring
  those consumers.
- Pattern Keeper-compatible PDF export is bit-stable. The Workshop
  print theme is opt-in via the `creator.pdfWorkshopTheme` user
  preference; do **not** modify [pdf-export-worker.js](pdf-export-worker.js),
  [creator/pdfChartLayout.js](creator/pdfChartLayout.js), or
  [creator/pdfExport.js](creator/pdfExport.js) without an explicit
  PK-compat regression check.

## House rule: no emojis in user-facing UI

This codebase ships an SVG icon library at [icons.js](icons.js) used via
`window.Icons.{name}()`. Always reach for that instead of an emoji.

If a suitable icon doesn't exist, **add a new one to `icons.js`** (24×24
viewBox, 1.6 stroke-width, `currentColor`). Match the style of the existing
icons (single-colour outline, no fills, rounded line caps).

Forbidden in any string the user can see — buttons, menu items, badges,
toasts, modal headers, help-overlay markdown, status indicators:

- Pictographic emojis: 👤 🌐 🔔 ♿ 🧵 🪡 📦 🖼 📄 ☁ 🎓 ⚙ 🎨 ⭐ 🔥 🎉 etc.
- Symbol marks that behave like emoji: ✓ ✗ ⚠ ℹ → ← ▸ ✕ etc. — use
  `Icons.check`, `Icons.x`, `Icons.warning`, `Icons.info`, `Icons.pointing`.

The only places emoji-like characters are allowed are:

- Box-drawing dividers in source-file headers (e.g. `════` section markers in JS).
- Test fixture / golden snapshot data that exists purely to verify legacy
  imports — never new UI strings.
- **Keyboard legends inside `<kbd>` tags**: arrow glyphs (`↑ ↓ ← →`) and modifier
  glyphs (`⌘ ⇧ ⌥ ⌃ ↵`) used to *represent the literal keyboard key the user
  presses*. This is the universal HTML convention — every OS docs site and
  command-palette UI uses it. Replacing these with SVG icons inside `<kbd>` would
  break the visual vocabulary. Examples that are intentionally allowed:
  [command-palette.js](command-palette.js) hint footer
  (`<kbd>↑</kbd> <kbd>↓</kbd> navigate`), [help-drawer.js](help-drawer.js)
  shortcut-key data (`keys: ["[", "←"]`), and
  [shortcuts.js](shortcuts.js) `formatKey()`.

## Why

Emojis render inconsistently across operating systems and browsers, cannot be
recoloured to match the theme, accumulate visual debt as the design evolves,
and clash with the inline SVG icon set the rest of the app uses. Picking an
icon also forces a small accessibility check (label, contrast, sizing) that
emojis silently skip.
