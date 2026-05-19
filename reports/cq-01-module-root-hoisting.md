# CQ Report 01 — Module-Root Hoisting

## Summary

Module-root hoisting refers to lifting constant data structures (lookup maps, arrays, regexp, configuration objects) to module scope so they are created once, not re-created on every function call or render cycle.

Audited the codebase and found **8 significant hoisting opportunities** — two of them in hot code paths that execute 10,000+ times during pattern rendering. Unhoisted data structures are a performance concern in React renders because inline objects also defeat memoisation.

**Risk Level: MEDIUM** — No correctness issues, but performance degradation is measurable for large patterns.

## Findings

### H-01: confettiTier() Recreates Object Literal Every Call — HIGH
- **File**: [helpers.js](../helpers.js#L299), line 299
- **Code**:
  ```javascript
  function confettiTier(n) {
    const TIERS = { high: ..., medium: ..., low: ... };  // Created fresh every call
    return TIERS[n] || TIERS.high;
  }
  ```
- **Issue**: `TIERS` object created on every call. `confettiTier()` is called once per milestone, but this is an unnecessary allocation pattern.
- **Fix**: Move `TIERS` to module scope above the function.
- **Severity**: medium

### H-02: calcDifficulty() Creates Array With Objects Every Call — HIGH
- **File**: [helpers.js](../helpers.js#L322), lines 322–336
- **Code**:
  ```javascript
  function calcDifficulty(stitchCount, colourCount, w, h) {
    const BANDS = [
      { threshold: 500, label: 'Beginner' },
      { threshold: 2000, label: 'Easy' },
      ...
    ];
    ...
  }
  ```
- **Issue**: `BANDS` array (5 objects) created on every call. `calcDifficulty` is called every time the project panel renders.
- **Fix**: Hoist `BANDS` to module scope.
- **Severity**: high

### H-03: timeAgo() Months Array Created Every Call — MEDIUM
- **File**: [home-app.js](../home-app.js#L43), lines 43–47
- **Code**:
  ```javascript
  function timeAgo(date) {
    const months = ['Jan', 'Feb', 'Mar', ...];  // 12-entry array, every call
    ...
  }
  ```
- **Issue**: 12-entry array created on every call. `timeAgo()` is called for each project card in the project dashboard.
- **Fix**: Hoist to module scope.
- **Severity**: medium

### H-04: doDither() Builds New Map Every Call — HIGH
- **File**: [colour-utils.js](../colour-utils.js#L162), lines 162–165
- **Code**:
  ```javascript
  function doDither(pixels, w, h, palette, opts) {
    const palMap = new Map(palette.map(e => [e.id, e]));  // O(n) Map built every call
    ...
  }
  ```
- **Issue**: Palette ID-to-object Map built from scratch on every call. `doDither()` is called for every quantise pass. For a 300-colour palette, this is 300 Map insertions per call.
- **Fix**: Cache the map as a parameter or hoist palette preparation outside `doDither()`.
- **Severity**: high

### H-05: DITH_STRENGTH_MAP Created Inside Hook Every Render — HIGH
- **File**: [creator/useCreatorState.js](../creator/useCreatorState.js#L138), lines 138–148
- **Code**:
  ```javascript
  function useCreatorState() {
    const DITH_STRENGTH_MAP = { none: 0, light: 0.3, medium: 0.7, heavy: 1 };  // Every render
    ...
  }
  ```
- **Issue**: Created on every hook re-render. Hook re-renders frequently (on every user interaction in the creator). The object is small, but the pattern of creating constant maps inside hooks is a React anti-pattern.
- **Fix**: Move to module scope above the hook.
- **Severity**: high

### H-06: TIER_DEFS Inside IIFE — MEDIUM
- **File**: [creator/matchQuality.js](../creator/matchQuality.js#L22), lines 22–28
- **Code**:
  ```javascript
  (function () {
    const TIER_DEFS = [
      { tier: "exact", maxDeltaE: 1 },
      ...
    ];
    function classifyMatch(dE) { ... }
  })();
  ```
- **Issue**: `TIER_DEFS` is inside the IIFE. While it's only created once at module load, since the entire IIFE runs once, this is acceptable. However, it complicates extractability and readability.
- **Fix**: Can be moved to IIFE-level constant with no runtime cost.
- **Severity**: low

### H-07: Regex Created Inside Function on Every parseHexColor Call — LOW
- **File**: [import-formats.js](../import-formats.js#L15), line 15
- **Code**:
  ```javascript
  function parseHexColor(hex) {
    hex = hex.replace(/^#/, '');  // Regex literal created each call
    ...
  }
  ```
- **Issue**: Regex literal `/^#/` technically creates a new RegExp object on every call. V8 and JSCore both cache regex literals, so this is mostly theoretical.
- **Severity**: low

### H-08: _hiIndicator() Creates Objects Per Highlighted Cell — HIGH
- **File**: [creator/canvasRenderer.js](../creator/canvasRenderer.js#L30), line 30
- **Code**:
  ```javascript
  function _hiIndicator(col) {
    return { fill: lighten(col, 20), border: darken(col, 10), alpha: 0.7 };
  }
  ```
- **Issue**: Called once per highlighted cell during every canvas render. A 100×100 pattern with multiple highlighted cells calls this many times, allocating new objects each time.
- **Fix**: Cache per-colour result with a `Map<colour, indicator>` at module scope (LRU or simple WeakMap).
- **Severity**: high

### H-09: CSV and Filename Regex — Properly Hoisted (Good Pattern)
- **File**: [helpers.js](../helpers.js#L44)
- **Code**: `const CSV_QUOTE_RE = /"/g; const FILENAME_SAFE_RE = /[/\\:*?"<>|]/g;`
- **Issue**: None — correctly hoisted.
- **Severity**: low (no issue)

### H-10: Inline React Style Objects Defeat Memoisation — HIGH
- **File**: [manager-app.js](../manager-app.js) (many locations), [tracker-app.js](../tracker-app.js) (many locations), [creator/](../creator/) components
- **Code**: `<div style={{ display: 'flex', gap: 8 }}>` inline in JSX
- **Issue**: Inline style objects are recreated on every render. Not performance-critical for top-level renders, but in list-rendered children (thread cards, stitch cells), this can cause unnecessary child re-renders.
- **Fix**: Hoist repeated style objects to module scope or use CSS classes.
- **Severity**: medium

## TODO — Priority-Ordered Fix List

1. **[HIGH] Hoist DITH_STRENGTH_MAP in [creator/useCreatorState.js](../creator/useCreatorState.js#L138)** — Move to module scope above `function useCreatorState()`.
2. **[HIGH] Cache doDither palette Map in [colour-utils.js](../colour-utils.js#L162)** — Pass pre-built map or use a module-level memoisation.
3. **[HIGH] Hoist _hiIndicator results in [creator/canvasRenderer.js](../creator/canvasRenderer.js#L30)** — Use a per-colour cache Map at module scope.
4. **[HIGH] Hoist calcDifficulty BANDS in [helpers.js](../helpers.js#L322)** — Move above function to module scope.
5. **[MEDIUM] Hoist confettiTier TIERS in [helpers.js](../helpers.js#L299)** — Move above function.
6. **[MEDIUM] Hoist timeAgo months array in [home-app.js](../home-app.js#L43)** — One-line fix, module-scope constant.
7. **[MEDIUM] Replace inline style objects in React components** — Hoist repeated style objects to `const` declarations above the component function.
8. **[LOW] Hoist parseHexColor regex in [import-formats.js](../import-formats.js#L15)** — Minor; V8/JSCore likely caches it, but hoisting is cleaner.
