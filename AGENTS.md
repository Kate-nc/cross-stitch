# Agent Instructions — Cross Stitch Pattern Generator

This file is read by AI coding agents (Copilot, Claude, Cursor, Aider, etc.).
The full project guidance lives in [.github/copilot-instructions.md](.github/copilot-instructions.md);
this file is a shorter pointer plus the most-broken house rule.

## Read this first

- The complete project conventions are in [.github/copilot-instructions.md](.github/copilot-instructions.md).
- Run unit tests with `npm test -- --runInBand` (Jest).
- After editing any file in `creator/`, regenerate the bundle with
  `node build-creator-bundle.js` before committing.

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

## Why

Emojis render inconsistently across operating systems and browsers, cannot be
recoloured to match the theme, accumulate visual debt as the design evolves,
and clash with the inline SVG icon set the rest of the app uses. Picking an
icon also forces a small accessibility check (label, contrast, sizing) that
emojis silently skip.
