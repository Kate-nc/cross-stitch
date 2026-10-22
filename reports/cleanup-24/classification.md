# Cleanup 24 — CSS token findings (F-018)

Base: `main` @ `ebb934a`. `npm run lint:css-tokens` still reported 13 advisory
`no-raw-hex` findings, at the same lines the audit named.

## Outcome

* No colour in `styles.css` changed. Every token substitution that was
  considered changes the computed colour in at least one theme, so none was made.
* Three findings are functional values and now carry an explicit, reasoned
  `css-tokens-lint-allow` marker (the exemption mechanism the linter already had).
* The linter's header and the README no longer claim checks it never made.
  The linter's code, output and exit codes are untouched.
* **10 advisory findings remain on purpose** (below). Fixing them needs a design decision.

## Classification of all 13

| Line (base) | Selector | Value | Class | Action |
|---|---|---|---|---|
| 3688 | `.sync-popover-btn--primary` | `color:#fff` on `--accent` | design decision | left |
| 3833 | `.srg-counter-chip--complete` | `color:#fff` on `--success` | design decision | left |
| 4228 | `html.pref-high-contrast` | `--line:#1B1814` | contrast requirement, open dark issue | left |
| 4240 | `html.pref-high-contrast body` | `color:#000 !important` | contrast requirement, open dark issue | left |
| 4764, 4765 | `.mh-subtabs` (`mask-image`, `-webkit-`) | `#000` stop | functional mask | **marker** |
| 5167, 5174 | `.creator-actionbar__mode-btn--forward` (+hover) | `color:#FFFDF8` | design decision | left |
| 6340 | `.home-create-tile--primary .home-create-tile__icon` | `color:#fff` | design decision | left |
| 6345 | `.home-create-tile--primary .home-create-tile__copy strong` | `color:#fff` | design decision | left |
| 6357 | `.home-create-tile__badge` | `color:#fff` on `--warning` | design decision | left |
| 6717 | `.creator-sidebar-tab[aria-selected="true"]` | `color:#FFFDF8` | design decision | left |
| 7008 | `.import-preview-canvas` | `background:#fff` | functional | **marker** |

### Why no substitution is safe

The only candidate token for text on an accent/success/warning fill is
`--text-on-accent`: `#FFFFFF` in light but `#1B1410` in dark. None of these
selectors has a dark override, so they currently render white in dark mode.
Swapping in the token is identical in light and different in dark.

* `#fff` -> `var(--text-on-accent)`: light identical, dark white -> near-black.
* `#FFFDF8`: not equal to any token even in light (`#FFFFFF`, 4.54:1 vs 4.47:1).
* There is no token for "white on success/warning/tile".

Pre-existing contrast (WCAG ratios, computed, not changed here):

| Pair | Ratio |
|---|---|
| `#fff` on light `--accent` | 4.54 |
| `#fff` on dark `--accent` `#E2865B` | 2.69 |
| `--text-on-accent` (dark) on dark `--accent` | 6.75 |
| `#fff` on dark `--success` | 2.46 |
| `#fff` on light `--warning` (badge) | 3.08 |
| `#fff` on dark `--warning` (badge) | 1.95 |

The tokenised version would improve dark-mode contrast, but that is a visible
change, so it is left as a decision for the design owner. Note the user-set
`appAccentColour` also feeds `--accent`, which a single on-accent token cannot
cover for every choice.

### Functional values (marked)

* `.mh-subtabs` mask: `mask-image` uses only the alpha of the gradient, so
  `#000` is an opaque stop, never painted.
* `.import-preview-canvas`: `ImportPreviewPane` paints the whole canvas `#fff`
  (blank fabric) in every theme; the CSS background mirrors it. `--surface`
  would turn it near-black in dark mode, behind a canvas that is white.

### Open issue found while verifying (not changed)

`html.pref-high-contrast` is reachable together with `data-theme="dark"`
(`apply-prefs.js` toggles both independently). In that combination, measured in
Chromium:

* body text is `rgb(0,0,0)` on `rgb(20,18,15)`: 1.12:1;
* `--line` stays `#1B1814` on `#1C1A18` surfaces: 1.02:1.

That looks like a real accessibility defect in dark + high contrast. Fixing it
changes appearance (it needs dark-aware values), so lines 4228 and 4240 stay
flagged as a reminder instead of being exempted. Worth its own task.

## Linter documentation corrections

* Header claimed "bare px values": never checked. Removed; header now lists what
  is and is not scanned (px, `rgb()/rgba()`, named colours, `--ws-*`).
* Header said `rgba()/rgb()` in `box-shadow` were exempt: the rule is hex-only;
  the exemption is the whole `box-shadow:` line. Reworded.
* Header said SVG `fill=`/`stroke=` attributes were exempt: the exemption is any
  line with a `url(data:image/svg...)`. Reworded. `var(--x, #hex)` fallback
  stripping and comment skipping were undocumented; now listed.
* `README.md` said the linter also checks "removed `--ws-*` aliases": no such
  check exists. Reworded.
* Deliberately **not** added: a px check, an rgba check, or any change to
  `--strict` behaviour. Those would be policy changes.

## Validation

* `tests/lintCssTokens.test.js` (new, 17 tests): real violations (position, selector,
  3/6/8-digit hex, marker scoped to one line), allowed cases (token blocks,
  box-shadow, SVG data URI, var fallback, comment, marker), documented
  non-checks, CLI contract (default exit 0, `--strict` exit, `--json` shape), and
  that every marker in `styles.css` states a reason and the mask lines are
  exempt. 2 of them fail against the base `styles.css`.
* `computed-style-probe.js`: computed colour/background/border/mask for all
  touched selectors in light, dark, high-contrast, dark + high-contrast, 400px
  and print contexts, plus hover. Base and head JSON are byte-identical.
* `styles.css` is identical to base once comments and whitespace are removed.
