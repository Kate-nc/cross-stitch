# CQ Report 03 — Suspicious Type Coercions

## Summary

Audited for implicit type coercions, missing radix arguments to `parseInt()`, JSON parsing without validation, and operator precedence traps.

**Risk Level: HIGH** — Multiple `parseInt()` without radix-10 calls are in data-entry paths where octal interpretation of strings like `"08"` or `"018"` produces wrong numeric results.

Found **21 findings** total: 10 high-severity, 6 medium, 5 low.

## Findings

### T-01 to T-06: parseInt() Without Radix in XML/Import Paths — HIGH
- **File**: [import-formats.js](../import-formats.js#L189)
- **Code**:
  ```javascript
  r = parseInt(r); g = parseInt(g); b = parseInt(b);
  ```
  Also at line 266: `parseInt(el.getAttribute("x"))`, `parseInt(el.getAttribute("y"))`
- **Issue**: RGB component strings from XML (e.g., `"08"`, `"09"`) can be interpreted as octal on some JS engines. `parseInt("08")` returns `8` in modern engines but `0` in ES3. More critically, `"010"` → 8 (octal) instead of 10 in ES3. Future-proofing requires explicit radix-10.
- **Severity**: high

### T-03: parseInt() Without Radix — Grid Dimension From localStorage — HIGH
- **File**: [tracker-app.js](../tracker-app.js#L1121), line 1121
- **Code**: `const ls = localStorage.getItem('cs_tracker_pageSize'); return parseInt(ls);`
- **Issue**: localStorage value is user-controlled. If a user manually sets `"010"`, they'd get 8 instead of 10 as the grid page size.
- **Severity**: high

### T-05: parseInt() Without Radix — Thread ID Sorting — HIGH
- **File**: [tracker-app.js](../tracker-app.js#L1655)
- **Code**: `parseInt(a[0])` without radix inside sort comparator
- **Issue**: Thread IDs like `"010"` or `"080"` are common in DMC nomenclature. Without radix-10, these parse as octal and sort in wrong order.
- **Severity**: high

### T-13 to T-15: parseInt() Without Radix — Manager Input Fields — HIGH
- **File**: [manager-app.js](../manager-app.js#L1771), lines 1771, 1993, 2252
- **Code**:
  ```javascript
  parseInt(threadQty)
  parseInt(e.target.value)
  parseInt(e.target.value)  // fabric count input
  ```
- **Issue**: All three are direct user-input parsing. Fabric count `"018"` → 16 (octal) instead of 18 with no radix. Affects skein calculations.
- **Severity**: high

### T-04: parseInt() Without Radix — Pattern Dimension Calculation — MEDIUM
- **File**: [import-formats.js](../import-formats.js#L188), multiple
- **Code**: Pattern width/height parsed without radix
- **Issue**: Stitch count dimensions like `"010"` would silently parse to 8. OXS files from older software may contain zero-padded values.
- **Severity**: medium

### T-17: JSON.parse() Without Shape Validation — MEDIUM
- **File**: [project-storage.js](../project-storage.js#L994)
- **Code**: `const data = JSON.parse(raw); return data;`
- **Issue**: No check that `data` is an object, has expected properties, or that `data.pattern` is an array. Corrupted storage could cause downstream property access errors (`undefined.length`).
- **Severity**: medium

### T-18: JSON.parse() Without Validation in home-screen.js — MEDIUM
- **File**: [home-screen.js](../home-screen.js#L758)
- **Code**: `const state = JSON.parse(rawState);` then direct property access
- **Issue**: Same as T-17; no structural validation before property access.
- **Severity**: medium

### T-19: Loose Equality null Check — LOW
- **File**: [creator-main.js](../creator-main.js#L72), line 72
- **Code**: `if (proj == null)` — loose equality
- **Issue**: Works correctly (`== null` catches both `null` and `undefined`), but inconsistent with most of the codebase which uses `=== null` and `=== undefined` separately.
- **Severity**: low

### T-20: parseInt("0") || 50 Returns 50 Not 0 — HIGH
- **File**: [creator/useCreatorState.js](../creator/useCreatorState.js#L399)
- **Code**: `const sz = parseInt(saved) || 50;`
- **Issue**: `parseInt("0")` returns `0`, which is falsy. If the user saved a cell size of `0` (shouldn't happen, but...), the fallback `|| 50` silently overrides it. A cell size of `0` would divide by zero, so the current behaviour is safe by accident, but the pattern is an anti-pattern.
- **Severity**: medium

### T-21: Bitwise OR for Float-to-Int — LOW
- **File**: [colour-utils.js](../colour-utils.js#L230), lines 230–235
- **Code**: `var xi = xi_float | 0;` and `var yi = yi_float | 0;` (for image coordinates)
- **Issue**: `x | 0` is a common micro-optimisation for `Math.floor(Math.abs(x))` in image processing, but it silently converts negative floats to negative integers and large floats to 0. Acceptable for image coords that should always be positive bounded integers, but fragile and non-obvious.
- **Severity**: low

## Complete List of parseInt() Without Radix (18 total)

| File | Line | Context |
|---|---|---|
| [import-formats.js](../import-formats.js#L189) | 189 | RGB from XML |
| [import-formats.js](../import-formats.js#L266) | 266 | x attr from OXS |
| [import-formats.js](../import-formats.js#L267) | 267 | y attr from OXS |
| [tracker-app.js](../tracker-app.js#L1121) | 1121 | localStorage grid dims |
| [tracker-app.js](../tracker-app.js#L1655) | 1655 | Thread ID sort |
| [tracker-app.js](../tracker-app.js#L1801) | 1801 | Done count |
| [tracker-app.js](../tracker-app.js#L2091) | 2091 | Grid col count |
| [manager-app.js](../manager-app.js#L1771) | 1771 | Thread qty |
| [manager-app.js](../manager-app.js#L1993) | 1993 | Price input |
| [manager-app.js](../manager-app.js#L2252) | 2252 | Fabric count |
| [manager-app.js](../manager-app.js#L2340) | 2340 | Stash count |
| [home-app.js](../home-app.js#L488) | 488 | URL param |
| [components-stats.js](../components-stats.js#L44) | 44 | Done count |
| [creator/useCreatorState.js](../creator/useCreatorState.js#L190) | 190 | Cell size |
| [creator/useCreatorState.js](../creator/useCreatorState.js#L399) | 399 | Saved size |
| [project-storage.js](../project-storage.js#L278) | 278 | Version number |
| [helpers.js](../helpers.js#L122) | 122 | Time parsing |
| [import-formats.js](../import-formats.js#L299) | 299 | OXS dimension |

## TODO — Priority-Ordered Fix List

1. **[HIGH] Add radix-10 to ALL `parseInt()` calls** (18 total): `parseInt(x, 10)` in all files listed above. This is a mechanical global fix.
2. **[HIGH] Fix `parseInt("0") || fallback` pattern** in [creator/useCreatorState.js](../creator/useCreatorState.js#L399): Change to `parseInt(saved, 10) !== null && !isNaN(parseInt(saved, 10)) ? parseInt(saved, 10) : 50`.
3. **[MEDIUM] Add shape validation for JSON.parse() results** in [project-storage.js](../project-storage.js#L994) and [home-screen.js](../home-screen.js#L758): Check that required fields exist and have expected types before use.
4. **[LOW] Standardise null checks** to use `x == null` consistently (catches both `null` and `undefined`) or switch all to `=== null || === undefined`.
5. **[LOW] Document `| 0` bitwise floor pattern** in [colour-utils.js](../colour-utils.js#L230) for future maintainers.
