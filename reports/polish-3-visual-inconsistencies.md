# Polish Pass 3 — Visual Inconsistencies

**Audit date:** 2026-04-27  
**Headline:** **13 distinct border-radius values** in use (canonical: 4–5), **15+ distinct spacing values** (canonical: 7), **8+ hardcoded hex colours** violating the Phase 8 Workshop-token migration, and **3 emoji violations** in [embroidery.js](embroidery.js).

Note: the design baseline in [styles.css](styles.css) (`:root` + `[data-theme="dark"]`) is largely compliant — the deviations are concentrated in inline `style={{ }}` blocks inside per-component JS files. This is good news for harmonization: most fixes are search-and-replace within JS components.

---

## Buttons

**Canonical:** `--accent` background, `--radius-sm` (6px), padding `var(--s-2) var(--s-3)`.

**Deviations:**
- [modals.js](modals.js#L80) — primary button hardcodes `background: "#A06F2D"`, `borderRadius: 6`. Should use `var(--accent)` + `var(--radius-sm)`.
- [modals.js](modals.js#L87) — secondary button hardcodes `#fff` / `#5C5448` / `#E5DCCB`. Should use `var(--surface)` / `var(--text-secondary)` / `var(--line)`.
- [modals.js](modals.js#L97), [modals.js](modals.js#L103) — additional button instances using `#fff` and `#B85C38` literals.
- [command-palette.js](command-palette.js#L293) — `padding: 10px 16px` should be `var(--s-2) var(--s-4)`.

## Inputs

**Canonical:** `--line` border, `--radius-sm`, padding `var(--s-2)`.

- [modals.js](modals.js#L111) — `borderRadius: 8` + `border: "1px solid #E5DCCB"`. Should be `--radius-sm` + `--line`.
- [components.js](components.js#L188) — already correct (uses tokens). Use as reference.

## Modals

- [modals.js](modals.js#L36-L39) — text colours hardcoded `#1B1814` / `#5C5448`. Replace with `--text-primary` / `--text-secondary`.
- [command-palette.js](command-palette.js#L285) — `border-radius: var(--radius-lg, 14px)` fallback is **wrong**: canonical `--radius-lg` is 10px, not 14. Drop the fallback or set it to 10.

## Cards / panels

- [components.js](components.js#L224) — DMC chip uses `borderRadius: 2` — non-canonical.
- [components.js](components.js#L435) — heatmap swatch hardcodes `#CFC4AC`. Should be a token (closest is `--line`).
- [components.js](components.js#L303) — session journal stroke `#CFC4AC` — same fix.
- [modals.js](modals.js#L49) — thread-warning panel hardcodes `#FAF5E1` / `#E5C97D`. Needs `--warning-surface` / `--warning` tokens.

## Icons / emoji violations (HOUSE RULE)

- [embroidery.js](embroidery.js#L1298) — 🧵 emoji in a UI string. Replace with `Icons.thread()` (verify icon exists).
- [embroidery.js](embroidery.js#L1324) — 🤖 emoji. Replace with `Icons.sparkles()` or `Icons.wand()`.
- [embroidery.js](embroidery.js#L1344) — ✏️ emoji. Replace with `Icons.edit()` / `Icons.pencil()`.
- [embroidery.js](embroidery.js#L1445) — `"✕"` symbol used as delete glyph. Replace with `Icons.x()`.
- [creator-main.js](creator-main.js#L184) — `"⟺"` mathematical symbol. Replace with an icon or text label.

## Tooltips

- [components.js](components.js#L25) — `borderRadius: 7` (non-canonical). Use `var(--radius-sm)`.
- [command-palette.js](command-palette.js#L298) — `border-radius: 4px` for kbd hints. Either standardise to `--radius-sm` or introduce `--radius-xs: 4px`.

## Tags / badges / chips

- [modals.js](modals.js#L76-L88) — three badges (`Current`, `In Use`, `Swap?`) all hardcode warning/accent colour pairs. Need shared `.badge--accent`, `.badge--warning` classes that consume tokens.
- [command-palette.js](command-palette.js#L292) — `.cs-cmdp-section` uses `font-size: 11px` literal; should be `var(--text-xs)`.

## Empty states

- [modals.js](modals.js#L104) — empty-thread message uses `color: "#5C5448"`. Should be `--text-tertiary`.
- [command-palette.js](command-palette.js#L299) — padding `24px 16px` should be `var(--s-5) var(--s-4)`.

## Border-radius inventory

13 distinct values found: **2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 20, 50%, 999px**.

| Canonical | Token | Used by |
|---|---|---|
| 6px | `--radius-sm` | most buttons, inputs |
| 8px | `--radius-md` | cards, mid surfaces |
| 10px | `--radius-lg` | modals |
| 12px | `--radius-xl` | sheets |
| 999px | `--radius-pill` | chips |

**Fixes:** introduce `--radius-xs: 4px` if 4px is genuinely needed (kbd hints). Remove all 2/3/5/7/14/20px occurrences.

## Spacing inventory

15+ distinct values. Tokens are `--s-1` (4) through `--s-7` (48).

Outliers to consolidate: `2`, `3`, `5`, `7`, `10`, `14`, `20` → snap to nearest token. If `2` and `6` appear repeatedly they may justify `--s-half: 2px` and `--s-1-5: 6px` micro-tokens.

## Typography inventory

11 distinct font-size values. Outliers: `10`, `15`, `16`, `20`. Recommend snapping all to existing canonical tokens (`--text-xs` 11, `--text-sm` 12, `--text-md` 13, `--text-lg` 14, `--text-xl` 17, `--text-h` 22, `--text-hero` 28). Add `--text-xxs: 10px` only if used in 3+ places.

## Colour deviations (Phase 8 token migration debt)

| Hex | Count | Files | Replace with |
|---|---|---|---|
| `#1B1814` | 4 | modals.js | `var(--text-primary)` |
| `#5C5448` | 5 | modals.js, components.js | `var(--text-secondary)` |
| `#E5DCCB` | 3 | modals.js | `var(--line)` |
| `#CFC4AC` | 4 | components.js | `var(--line)` (or new `--line-strong`) |
| `#A06F2D` | 2 | modals.js | derived `--accent-dark` (needs token) |
| `#B85C38` | 1 | modals.js | `var(--accent)` |
| `#E5C97D` | 2 | modals.js | new `--warning` token |
| `#FAF5E1` | 2 | modals.js | new `--warning-surface` |
| `#F2E2BE` | 1 | modals.js | new `--warning-surface` |
| `#6B461F` | 1 | modals.js | derive from `--accent` dark variant |
| `#534AB7` | 1 | components.js | `var(--accent-2)` |

## CRITICAL: UI accent vs DMC palette

`--accent` resolves to `#B85C38` (light) — a warm red-brown. The DMC palette includes near-matches at DMC 919 / 920 / 922 (red copper / rust). Users glancing at a pattern with these threads next to a primary "Save" button could in principle conflate them, but the saturation and surrounding chrome (rounded buttons, white text) make confusion unlikely in practice.

**Recommendation:** keep `--accent` but ensure UI elements that appear *over* the canvas (toolbar, badges) use the `--surface` background so the accent only appears as text/border there, never as a thread-sized fill swatch.
