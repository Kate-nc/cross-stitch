/**
 * Tests for stats-page.js structural correctness (StatsPage + StatsShowcase).
 *
 * React's Rules of Hooks require that hooks are always called in the same order
 * and never conditionally. In particular, no hook call may appear after an early
 * return statement in a component — doing so causes React error #310 ("Rendered
 * more hooks than during the previous render") when the component re-renders with
 * a different branch taken.
 */

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'stats-page.js'), 'utf8');

// ── stats-page.js tests ──────────────────────────────────────────

// Extract the StatsPage function body (from function declaration to the
// `window.StatsPage = StatsPage` assignment that immediately follows it).
const funcStart = source.indexOf('function StatsPage');
const funcEnd = source.indexOf('window.StatsPage = StatsPage');

if (funcStart === -1 || funcEnd === -1 || funcEnd <= funcStart) {
  throw new Error('Could not locate StatsPage function body in stats-page.js');
}

const funcBody = source.slice(funcStart, funcEnd);

// The showcase conditional comes first, then the stitching conditional.
const SHOWCASE_CONDITIONAL = "if (tab === 'showcase')";
const STITCHING_CONDITIONAL = "if (tab === 'stitching')";

// React hook names that must obey the Rules of Hooks.
const HOOK_PATTERN = /\b(useState|useEffect|useMemo|useCallback|useRef)\s*\(/g;

describe('StatsPage — Rules of Hooks', () => {
  const showcasePos = funcBody.indexOf(SHOWCASE_CONDITIONAL);
  const stitchingPos = funcBody.indexOf(STITCHING_CONDITIONAL);

  test('showcase-tab conditional exists in StatsPage body', () => {
    expect(showcasePos).toBeGreaterThan(-1);
  });

  test('stitching-tab conditional exists in StatsPage body', () => {
    expect(stitchingPos).toBeGreaterThan(-1);
  });

  test('showcase conditional comes before stitching conditional', () => {
    expect(showcasePos).toBeLessThan(stitchingPos);
  });

  test('hook calls exist before the showcase-tab conditional (sanity check)', () => {
    const beforeConditional = funcBody.slice(0, showcasePos);
    expect(HOOK_PATTERN.test(beforeConditional)).toBe(true);
    HOOK_PATTERN.lastIndex = 0;
  });

  test('no hook calls appear after the stitching-tab conditional (prevents error #310)', () => {
    // Any hook call after the stitching conditional would be skipped when tab=stitching,
    // causing a mismatch in hook count on subsequent renders.
    const afterConditional = funcBody.slice(stitchingPos + STITCHING_CONDITIONAL.length);
    const match = HOOK_PATTERN.exec(afterConditional);
    HOOK_PATTERN.lastIndex = 0;
    expect(match).toBeNull();
  });

  test('all useState calls in StatsPage appear before the showcase-tab conditional', () => {
    const useStateRe = /\buseState\s*\(/g;
    let m;
    while ((m = useStateRe.exec(funcBody)) !== null) {
      expect(m.index).toBeLessThan(showcasePos);
    }
  });

  test('all useEffect calls in StatsPage appear before the showcase-tab conditional', () => {
    const useEffectRe = /\buseEffect\s*\(/g;
    let m;
    while ((m = useEffectRe.exec(funcBody)) !== null) {
      expect(m.index).toBeLessThan(showcasePos);
    }
  });
});

// ── StatsShowcase (now embedded in stats-page.js) ──────────────────

describe('StatsShowcase — embedded in stats-page.js', () => {
  test('StatsShowcase function is defined in stats-page.js', () => {
    expect(source).toContain('function StatsShowcase(');
  });

  test('StatsShowcase accepts onNavigateToDashboard prop', () => {
    const fnStart = source.indexOf('function StatsShowcase(');
    const fnSig = source.slice(fnStart, fnStart + 120);
    expect(fnSig).toContain('onNavigateToDashboard');
  });

  test('showcase tab is rendered inline (no window.StatsShowcase assignment)', () => {
    // Showcase is now a local component, not a window global
    expect(source).not.toContain('window.StatsShowcase = StatsShowcase');
  });

  test('StatsShowcase hooks are all before the loading early return', () => {
    const fnStart = source.indexOf('function StatsShowcase(');
    // Find end of StatsShowcase: next top-level function or window.StatsPage
    const fnEnd = source.indexOf('\nfunction StatsPage');
    expect(fnStart).toBeGreaterThan(-1);
    expect(fnEnd).toBeGreaterThan(fnStart);
    const body = source.slice(fnStart, fnEnd);

    const firstReturn = body.indexOf('if (loading)');
    expect(firstReturn).toBeGreaterThan(-1);

    const hookRe = /\b(useState|useEffect|useMemo|useCallback|useRef)\s*\(/g;
    let m;
    while ((m = hookRe.exec(body)) !== null) {
      expect(m.index).toBeLessThan(firstReturn);
    }
  });

  test('SABLE empty-state uses sableData.length < 3', () => {
    expect(source).toContain('sableData.length < 3');
  });

  test('ShowcaseAgeBar is used (not the dashboard AgeBar)', () => {
    // The showcase-specific age bar is renamed to avoid conflict with the dashboard AgeBar
    expect(source).toContain('function ShowcaseAgeBar(');
    expect(source).toContain('h(ShowcaseAgeBar,');
  });

  test('showcase does not reference statsVisibility', () => {
    // Showcase is curated, not customisable
    const showcaseStart = source.indexOf('function StatsShowcase(');
    const showcaseEnd = source.indexOf('\nfunction StatsPage');
    const showcaseBody = source.slice(showcaseStart, showcaseEnd);
    expect(showcaseBody).not.toContain('statsVisibility');
    expect(showcaseBody).not.toContain('loadStatsVisibility');
  });
});

// ── index.html stats loader tests ─────────────────────────────────

describe('index.html — stats loaders', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

  test('loadStatsPage function is defined', () => {
    expect(html).toContain('window.loadStatsPage = function()');
  });

  test('stats loaders inject plain script (no Babel.transform)', () => {
    // stats-*.js are pure React.createElement, so the loaders should not
    // run Babel.transform on them. Guard against regressing back to the
    // fetch + transform + localStorage cache pattern.
    const loaderRegion = html.slice(
      html.indexOf('window.loadStatsActivity'),
      html.indexOf('</script>', html.indexOf('window.loadStatsPage'))
    );
    expect(loaderRegion).not.toMatch(/Babel\.transform/);
    expect(loaderRegion).toContain("s.src = 'stats-page.js'");
  });
});

