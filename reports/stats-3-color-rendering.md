# Color Rendering Audit

Every place in the app where a colour value (DMC code, Anchor code, hex, RGB) is displayed.

---

## Full Color Display Inventory

| # | Location | File | What's shown | How it renders | Should render as | Correct? |
|---|---|---|---|---|---|---|
| CR1 | Stats > Colour Fingerprint — "Used a lot but not stocked" | stats-page.js L2095 | List of DMC IDs e.g. "310", "3801" | **Plain text div, no swatch** | Swatch + "DMC 310 — Black" | ❌ |
| CR2 | Stats > Colour Fingerprint — "Stocked but rarely used" | stats-page.js L2101 | List of DMC IDs e.g. "712", "822" | **Plain text div, no swatch** | Swatch + "DMC 712 — Cream" | ❌ |
| CR3 | Stats > Showcase — Oldest stash item | stats-page.js ~L996 | Thread name as text e.g. "Black" | **Plain text, no swatch** | Swatch + "DMC 310 — Black" | ❌ |
| CR4 | Stats > Most-Used Colours list | stats-page.js ~L2000 | `Swatch` + "310 Black" text + stitch count | ✅ Coloured 12×12 swatch + code + name | Swatch + code + name | ✅ |
| CR5 | Stats > Duplicate Alerts list | stats-page.js L1931 | `Swatch` + "DMC N" + "owns N" | ✅ Coloured swatch + code | Swatch + code + name | ⚠️ Name missing |
| CR6 | Stats > Buying Impact list | stats-page.js L2079 | `Swatch` + "DMC N · name" + "unlocks N" | ✅ Swatch + code + name | Swatch + code + name + brand | ✅ |
| CR7 | Stats > Threads Never Used — sample swatches | stats-page.js L2020 | 24×24 div with `background: rgb(...)` | ✅ Swatch only (no label); tooltip on hover shows brand + id + name | Swatch + code | ⚠️ Code not visible without hover |
| CR8 | Stats > Stash Age — oldest tracked thread | stats-page.js L1989 | "Oldest tracked: [name] · [date]" text | **Text only, no swatch** | Swatch + "DMC 310 — Black · [date]" | ❌ |
| CR9 | Tracker > Side panel thread list | tracker-app.js L535 | 10×10 `tsp-sw` div + "DMC id name Nsk" | ✅ Small swatch + code + name | Swatch + code + name | ✅ (adequate) |
| CR10 | Creator > Legend tab — per-thread row | creator/LegendTab.js ~L180 | 20×20 swatch div + DMC code (bold) + name | ✅ Swatch + code + name | Swatch + code + name + brand | ✅ |
| CR11 | Creator > Pattern tab — status bar hover | creator/PatternTab.js ~L150 | 8×8px inline swatch + "DMC N name (N st)" | ✅ (very small swatch) | Swatch + code + name | ⚠️ Swatch 8×8px — marginal visibility |
| CR12 | Creator > Project tab — Thread Organiser | creator/ProjectTab.js ~L140 | 16×16 swatch + "DMC N" + name + stash badge | ✅ Swatch + code + name | Swatch + code + name | ✅ |
| CR13 | Creator > Project tab — Kitting check "Missing" list | creator/ProjectTab.js ~L160 | "DMC N (need N sk)" text only | **No colour swatch** | Swatch + "DMC N (need N sk)" | ❌ |
| CR14 | Manager > Thread grid — each thread row | manager-app.js grid | `sw` div with `background: rgb(...)` + id + name | ✅ Swatch + code + name | Swatch + code + name | ✅ |
| CR15 | Manager > Thread detail — large swatch | manager-app.js detail | `td-swatch` div + "DMC N" + name | ✅ Full swatch + code + name | Swatch + code + name | ✅ |
| CR16 | Manager > Thread detail — "Used in" patterns | manager-app.js ~L detailPanel | Pattern title + "need N sk" — **no thread swatch** | **Text only, no swatch** | Swatch + "DMC N" + "need N sk" | ❌ |
| CR17 | Manager > Patterns — missing threads list | manager-app.js patterns panel | 12×12 swatch + "id name need Nsk" | ✅ Small swatch + code + name | Swatch + code + name | ✅ |
| CR18 | Manager > Smart Hub conflicts | manager-app.js conflicts | 14×14 swatch + "Brand N — name" | ✅ Swatch + code + name | Swatch + code + name | ✅ |
| CR19 | Manager > Shopping list | home-app.js StashPanel | Colour swatch div + "DMC N — name" + "×N qty" | ✅ Swatch + code + name | Swatch + code + name | ✅ |
| CR20 | Stats Insights > ColourHeatmap | stats-insights.js ~L300 | 24×24 swatch grid; tooltip "DMC N — name — N stitches (N%)" | ✅ Swatch + hover tooltip | Swatch + visible label | ⚠️ Code only visible on hover |
| CR21 | Home > Stash tab — Ready-to-start chips | home-app.js StashPanel ~L960 | Pattern title text only | **No thread swatches** | — (title chip, not thread list) | ✅ (title chip — swatches not expected here) |

---

## Issues Requiring Fixes

### CR1 & CR2 — Colour Fingerprint lists (CRITICAL)

**File:** `stats-page.js` lines 2095, 2101  
**Problem:** `usedNotOwned` and `ownedNotUsed` are arrays of bare DMC ID strings (e.g. `["310", "3801"]`). They are rendered directly as:
```js
colourFingerprint.usedNotOwned.map(id => h('div', {...}, id))
```
A user sees "310 / 3801 / 826 / 712 / 822" — just numbers — with no visual hint of what colour they represent.

**Fix:** For each id, call `findThreadInCatalog('dmc', id)` to get `rgb` and `name`, then render a `Swatch` + `"DMC {id} — {name}"` row. Also enrich the `colourFingerprint` computation to include `{id, rgb, name}` objects instead of bare strings.

---

### CR3 — Showcase oldest stash thread text (HIGH)

**File:** `stats-page.js` ~L996  
**Problem:** The "Oldest tracked: {name}" line shows only the thread name as text. No colour swatch.

**Fix:** The `ageData.oldest` object has a stash key (e.g. `"dmc:310"` or `"310"`). Parse the brand + id, call `findThreadInCatalog`, and prepend a `Swatch`.

---

### CR8 — Stash Age card oldest thread text (HIGH)

**File:** `stats-page.js` ~L1989  
**Problem:** Same issue as CR3 — "Oldest tracked: {name} · {date}" is text only.  
**Fix:** Same approach as CR3.

---

### CR13 — Kitting check missing threads list (MEDIUM)

**File:** `creator/ProjectTab.js` ~kitting result section  
**Problem:** The "Missing (N):" list shows "DMC N (need N sk)" as plain text. No colour swatch.  
**Fix:** Wrap each entry with a small swatch using the thread's `rgb` from `ctx.cmap` or `findThreadInCatalog`.

---

### CR16 — Manager thread detail "Used in" pattern list (MEDIUM)

**File:** `manager-app.js` thread detail panel  
**Problem:** The "Used in" list shows pattern title + "need N sk" with no colour swatch for the thread being detailed (redundant in this context, but the thread row context is lost).  
**Fix:** Minor — since the thread is the subject of the detail panel, the large swatch at the top already identifies the colour. This is acceptable; the context makes the colour clear. **Low priority.**

---

### CR5 — Duplicate Alerts missing thread name (LOW)

**File:** `stats-page.js` L1931  
**Problem:** "DMC N" is shown without the thread name alongside.  
**Fix:** Include thread name: "DMC N — {name}".

---

### CR7 & CR20 — Code/label only visible on hover (LOW)

**Files:** `stats-page.js` L2020, `stats-insights.js` ColourHeatmap  
**Problem:** The label (brand + id + name) is only in a `title` tooltip attribute. Users on touch devices cannot hover.  
**Fix:** Add an `aria-label` to each swatch with the full "DMC N name" text. For the Threads Never Used samples, add a visible count below the swatch row. For the ColourHeatmap, the on-hover tooltip is acceptable given dense grid layout.

---

## Swatch Accuracy Assessment

All swatches that render use `background: rgb(r, g, b)` from the thread's `.rgb` field which comes directly from `dmc-data.js` or `anchor-data.js`. These are curated colour values matching the actual thread colours. No inaccurate generic fallbacks were found for valid thread IDs.

**Fallback behaviour:**
- `findThreadInCatalog` returns `null` for unknown IDs → callers must guard
- Known guards exist in: LegendTab, ProjectTab, Manager thread grid
- Missing guard: Colour Fingerprint (renders without lookup — just the bare ID)

## Brand Identifier Assessment

- DMC threads: consistently labelled "DMC N" or just "N" (context-dependent)
- Anchor threads: labelled "Anchor N" or "ANCHOR N" in Manager and ProjectTab
- Colour Fingerprint: bare IDs — no brand identifier at all (since it uses bare string IDs with no brand prefix from `mostUsed` which returns DMC IDs)
- Stash Age oldest: thread name only — no brand or code
