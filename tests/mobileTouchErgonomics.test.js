/**
 * Mobile touch-ergonomics pass — reports/mobile-experience-audit.md
 * items 7, 8, 9, 14 plus completing the C4 hover sweep.
 *
 * These are source-text assertions in the style of trackerLeftSidebar.test.js.
 * They cover the facts that cannot be verified in a headless Chromium at all:
 * Safari-only properties that Chromium drops at parse time, and the structural
 * ordering rules that only matter on a real device. The behavioural half is in
 * tests/mobile-audit/touch-reachability.spec.js.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const styles = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const header = fs.readFileSync(path.join(ROOT, 'header.js'), 'utf8');
const manager = fs.readFileSync(path.join(ROOT, 'manager-app.js'), 'utf8');

/* Strip comments so prose describing a property is never mistaken for the
   declaration itself. */
const css = styles.replace(/\/\*[\s\S]*?\*\//g, '');

describe('D3 — iOS long-press callout on the chart', () => {
  test('-webkit-touch-callout:none is declared for the canvas area', () => {
    // Chromium drops this unknown property from both computed style and
    // rule.cssText, so the browser harness genuinely cannot see it. Source
    // text is the only place it can be asserted.
    const rule = css.match(/\.canvas-area,\s*\.canvas-area canvas\{[^}]*\}/);
    expect(rule).not.toBeNull();
    expect(rule[0]).toMatch(/-webkit-touch-callout:\s*none/);
  });

  test('text selection is suppressed on the chart and its canvas', () => {
    const block = css.match(/\.canvas-area,\s*\.canvas-area canvas\{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/user-select:\s*none/);
  });
});

describe('B4/B5 — header height and the top safe-area inset', () => {
  test('the header reserves the top inset behind a @supports guard', () => {
    expect(css).toMatch(/@supports \(padding: max\(0px\)\)\{\s*\.tb-topbar\{/);
    expect(css).toMatch(/padding-top: env\(safe-area-inset-top, 0px\)/);
    expect(css).toMatch(/height: calc\(48px \+ env\(safe-area-inset-top, 0px\)\)/);
  });

  test('sticky offsets read the token alone, not token + inset', () => {
    // The old form double-counted: `calc(var(--app-header-height) +
    // env(safe-area-inset-top, 52px))` added an inset the header did not
    // reserve, and its 52px fallback only applied where env() was unsupported.
    expect(css).not.toMatch(/env\(safe-area-inset-top,\s*52px\)/);
    expect(css).toMatch(/\.tb-strip\{[^}]*top:var\(--app-header-height, 48px\)/);
    expect(css).toMatch(/\.toolbar-row\{[^}]*top:var\(--app-header-height, 48px\)/);
    expect(css).toMatch(/\.info-strip-wrap\{position:sticky;top:var\(--app-header-height/);
    expect(css).toMatch(/\.info-strip\{position:sticky;top:var\(--app-header-height/);
  });

  test('header.js publishes the measured height to the token', () => {
    expect(header).toMatch(/new ResizeObserver\(publish\)/);
    expect(header).toMatch(/setProperty\('--app-header-height'/);
    // A zero height must never be published — it would collapse every
    // sticky offset on the page.
    expect(header).toMatch(/if \(h > 0\)/);
    expect(header).toMatch(/className: 'tb-topbar', ref: topbarRef/);
  });
});

describe('B3 — topbar controls must not be clipped out of reach', () => {
  test('the narrow-screen topbar scrolls rather than hiding its tail', () => {
    const block = css.match(/\.tb-topbar-inner\{padding:0 8px;[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/overflow-x:auto/);
    expect(css).toMatch(/\.tb-topbar-inner > \*\{flex-shrink:0;\}/);
  });

  test('the keyboard-shortcuts button is marked desktop-only', () => {
    // No keyboard to use them with on a phone, and the row is already
    // ~640px of content. The panel stays reachable via Help.
    expect(header).toMatch(/className: 'tb-nav-link tb-desktop-only'[\s\S]{0,200}tab: 'shortcuts'/);
    expect(css).toMatch(/@media\(pointer:coarse\)\{\.tb-desktop-only\{display:none!important;\}\}/);
  });
});

describe('B6 — tablet dead space under the chart', () => {
  test('the 132px reservation is reclaimed where the dock is hidden', () => {
    // The reservation is made in a `(max-width: 599px), (pointer: coarse)`
    // union, which a tablet matches through the coarse arm; the elements it
    // reserves for are then hidden at >=600px, so the padding must go too.
    const block = css.match(/@media \(min-width: 600px\)\{[\s\S]*?\n\}/);
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/body\.tracker-mobile \.canvas-area\{padding-bottom:env\(safe-area-inset-bottom,0\)!important;\}/);
  });
});

describe('D1 — iOS zoom-on-focus', () => {
  test('the sort control carries no inline font-size', () => {
    // An inline style outranks the coarse-pointer 16px rule, so this field
    // kept zooming the page until it moved to a class.
    expect(manager).toMatch(/className="mgr-sort-select"/);
    expect(manager).not.toMatch(/aria-label="Sort threads"[\s\S]{0,200}style=\{\{fontSize/);
  });

  test('named class-level offenders are repeated at matching specificity', () => {
    // Bare `select{font-size:16px}` loses to `.mgr-sort-select{font-size:12px}`.
    expect(css).toMatch(/\.mgr-sort-select,\s*\.mgr-filter-bar input,\s*\.mgr-filter-bar select\{ font-size:16px; \}/);
  });
});

describe('C4 — hover rules cannot latch after a tap', () => {
  test('hover-only rules are wrapped in @media (hover: hover)', () => {
    expect((css.match(/@media \(hover: hover\)/g) || []).length).toBeGreaterThan(100);
  });

  test('goal preset active and hover states are declared separately', () => {
    expect(css).toMatch(/\.goal-preset-btn\.active\s*\{[^}]*border-color:\s*var\(--accent\)/);
    expect(css).toMatch(/@media \(hover: hover\)\s*\{\s*\.goal-preset-btn:hover\s*\{/);
  });

  test('mixed :hover/:focus-within rules are left alone', () => {
    // Wrapping these would break keyboard and touch focus, which is the
    // half that carries the interaction on a device with no hover.
    const mixed = css.match(/\.tb-drop-wrap:hover \.tb-dropdown,[^}]*\{display:block;\}/);
    expect(mixed).not.toBeNull();
    const idx = css.indexOf(mixed[0]);
    expect(css.slice(Math.max(0, idx - 40), idx)).not.toMatch(/@media \(hover: hover\)\{$/);
  });

  test('the coarse-pointer hover suppressors are still live', () => {
    // This rule exists to *disable* a hover behaviour on touch. Wrapping it
    // in (hover: hover) would have silently nullified it.
    expect(css).toMatch(/@media \(pointer:coarse\)\{\.tb-drop-wrap:hover \.tb-dropdown\{display:none;\}/);
  });
});
