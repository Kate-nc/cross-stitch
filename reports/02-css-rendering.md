# Report 02 — CSS and Rendering Compatibility

## Summary

Audited [styles.css](../styles.css) and inline styles in JSX files for Safari/WebKit CSS compatibility issues. Identified 10 findings: 2 critical (blocking or incorrect layout on older Safari), 3 significant (visual glitches), and 5 minor. Overall risk level: **MEDIUM** — most issues are polyfillable or have acceptable degradation, but two require code changes.

## Findings

### F-01: overscroll-behavior: none — Not Supported in Safari
- **File**: [styles.css](../styles.css#L135), line 135
- **Code**: `overscroll-behavior: none;` on `body`
- **Issue**: `overscroll-behavior` is completely unsupported in Safari/WebKit. Users on Safari experience unexpected overscroll (rubber-band) effects that the UI is intended to suppress. No `-webkit-` alternative exists; workaround requires JavaScript or `touch-action` constraints.
- **Severity**: high

### F-02: aspect-ratio — Limited Support in Older Safari
- **File**: [styles.css](../styles.css#L3295) and lines 4790, 4812; inline usage in [creator-main.js](../creator-main.js#L147), [palette-swap.js](../palette-swap.js#L1699)
- **Code**: `aspect-ratio: 1;`
- **Issue**: Safari added `aspect-ratio` in Safari 15. Older versions require explicit width/height fallbacks. Pattern preview cards and canvas areas may render with incorrect dimensions on Safari <15.
- **Severity**: high

### F-03: :focus-visible — Inconsistent Support in Safari
- **File**: [styles.css](../styles.css#L151) and 20+ occurrences throughout
- **Code**: `outline-offset: 2px; /* inside :focus-visible rules */`
- **Issue**: `:focus-visible` has inconsistent implementation across Safari versions. Outline behaviour differs from Chromium-based browsers. Keyboard navigation focus indicators may render differently or be missing on Safari <15.
- **Severity**: medium

### F-04: gap Property on Flex Containers — Limited Support in Older Safari
- **File**: [styles.css](../styles.css) — 20+ instances; JSX inline styles throughout
- **Code**: `gap: 8px;` on flex containers
- **Issue**: `gap` for flex containers was added in Safari 14.1. Earlier versions ignore it, causing buttons and flex-based layouts to have incorrect spacing on older Safari. Grid `gap` has broader support; flex `gap` does not.
- **Severity**: medium

### F-05: -webkit-line-clamp Without Verified Display Context
- **File**: [styles.css](../styles.css#L4068), lines 4068–4070
- **Code**: `-webkit-line-clamp: 2; -webkit-box-orient: vertical;`
- **Issue**: `-webkit-line-clamp` requires `display: -webkit-box` to work. The current code uses `-webkit-box-orient: vertical` but must verify the display context is also set. Without `display: -webkit-box`, text truncation does not function on any browser.
- **Severity**: medium

### F-06: backdrop-filter — Properly Prefixed; Performance Consideration
- **File**: [styles.css](../styles.css#L611), line 611
- **Code**: `backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);`
- **Issue**: Correctly prefixed with both `-webkit-` and standard. However, Safari rendering of `backdrop-filter` with transparency can be performance-intensive on low-end devices or during rapid animations on iOS Safari.
- **Severity**: low

### F-07: mask-image — Prefixed but Fallback Missing
- **File**: [styles.css](../styles.css#L4630), lines 4630–4631
- **Code**: Both `-webkit-mask-image` and standard `mask-image` present
- **Issue**: Both prefixes are present (good practice). Compound gradient masks may need additional vendor prefixes. Firefox support differs, though this is a Firefox issue rather than Safari.
- **Severity**: low

### F-08: calc() with env() Fallback — Safari Variable Scoping Edge Cases
- **File**: [styles.css](../styles.css#L2734) and [command-palette.js](../command-palette.js#L288)
- **Code**: `calc(var(--app-header-height, 48px) + env(safe-area-inset-top, 52px))`
- **Issue**: Safari handles `calc()` with `env()` fallback syntax correctly in most cases, but versions 13–14 may miscalculate top offset on notched iPhones. Test needed on iOS Safari 13–14.
- **Severity**: low

### F-09: color-scheme: dark — Partial Safari Support
- **File**: [styles.css](../styles.css#L131), line 131
- **Code**: `color-scheme: dark;`
- **Issue**: `color-scheme: dark` tells the browser to use dark UI for form controls. Safari support was added in 14.1. Form inputs/scrollbars may not theme correctly on Safari <14.1.
- **Severity**: low

### F-10: content-visibility: auto — Not Supported in Safari
- **File**: [styles.css](../styles.css) — used on `.tcard`, `.pcard`
- **Code**: `content-visibility: auto;`
- **Issue**: `content-visibility: auto` for off-screen rendering optimisation is only supported in Chrome 85+. Safari ignores it entirely (safe degradation), but thread card grids may have slower rendering without the optimisation.
- **Severity**: low

## TODO — Priority-Ordered Fix List

1. **[HIGH]** Remove or feature-detect `overscroll-behavior: none` in [styles.css](../styles.css#L135). Use JavaScript-based scroll prevention on iOS (`touchmove` with `preventDefault()`) as fallback, or accept rubber-band behaviour on Safari as intended platform UX.
2. **[HIGH]** Add explicit `width`/`height` fallbacks for all `aspect-ratio` usages in [styles.css](../styles.css#L3295) and JSX inline styles. Example: `width: 100%; padding-bottom: 100%; position: relative;` as the legacy fallback pattern.
3. **[MEDIUM]** Add margin-based spacing fallback for all flex `gap` properties in [styles.css](../styles.css), or document that Safari 14.0 and earlier is not officially supported.
4. **[MEDIUM]** Verify `-webkit-line-clamp` parent element has `display: -webkit-box` set; add `display: block` as non-webkit fallback in [styles.css](../styles.css#L4068).
5. **[MEDIUM]** Test `:focus-visible` behaviour on Safari 13–14; refine outline styles if needed; consider adding explicit `outline` fallback inside plain `:focus` for older Safari.
6. **[LOW]** Monitor `backdrop-filter` performance on iOS Safari; consider reducing blur intensity or disabling on low-end devices via `@media (prefers-reduced-motion)`.
7. **[LOW]** Test `calc() + env()` layout on iOS Safari 13–14 for notch-aware layouts.
8. **[LOW]** Document minimum supported Safari version (currently implied: Safari 14.1+ for full feature support).
