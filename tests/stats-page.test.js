/**
 * Tests for stats-page.js and stats-showcase.js structural correctness.
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
const showcaseSource = fs.readFileSync(path.resolve(__dirname, '..', 'stats-showcase.js'), 'utf8');

// ── stats-page.js tests ──────────────────────────────────────────

// Extract the StatsPage function body (from function declaration to the
// `window.StatsPage = StatsPage` assignment that immediately follows it).
const funcStart = source.indexOf('function StatsPage');
const funcEnd = source.indexOf('window.StatsPage = StatsPage');

if (funcStart === -1 || funcEnd === -1 || funcEnd <= funcStart) {
  throw new Error('Could not locate StatsPage function body in stats-page.js');
}

const funcBody = source.slice(funcStart, funcEnd);

// The tab-switching conditional that guards the stitching-tab early return.
const STITCHING_CONDITIONAL = "if (tab === 'stitching')";

// React hook names that must obey the Rules of Hooks.
const HOOK_PATTERN = /\b(useState|useEffect|useMemo|useCallback|useRef)\s*\(/g;

describe('StatsPage — Rules of Hooks', () => {
  const conditionalPos = funcBody.indexOf(STITCHING_CONDITIONAL);

  test('stitching-tab conditional exists in StatsPage body', () => {
    expect(conditionalPos).toBeGreaterThan(-1);
  });

  test('hook calls exist before the stitching-tab conditional (sanity check)', () => {
    const beforeConditional = funcBody.slice(0, conditionalPos);
    expect(HOOK_PATTERN.test(beforeConditional)).toBe(true);
    HOOK_PATTERN.lastIndex = 0; // reset stateful regex
  });

  test('no hook calls appear after the stitching-tab conditional (prevents error #310)', () => {
    // Any hook call after the conditional would be skipped whenever the stitching
    // tab is active, causing a mismatch in hook count on subsequent renders.
    const afterConditional = funcBody.slice(conditionalPos + STITCHING_CONDITIONAL.length);
    const match = HOOK_PATTERN.exec(afterConditional);
    HOOK_PATTERN.lastIndex = 0;
    expect(match).toBeNull();
  });

  test('all useState calls in StatsPage appear before the stitching-tab conditional', () => {
    const useStateRe = /\buseState\s*\(/g;
    let m;
    while ((m = useStateRe.exec(funcBody)) !== null) {
      expect(m.index).toBeLessThan(conditionalPos);
    }
  });

  test('all useEffect calls in StatsPage appear before the stitching-tab conditional', () => {
    const useEffectRe = /\buseEffect\s*\(/g;
    let m;
    while ((m = useEffectRe.exec(funcBody)) !== null) {
      expect(m.index).toBeLessThan(conditionalPos);
    }
  });
});

// ── stats-showcase.js structural tests ───────────────────────────

describe('StatsShowcase — exported and structured correctly', () => {
  test('window.StatsShowcase is assigned at end of file', () => {
    expect(showcaseSource).toContain('window.StatsShowcase = StatsShowcase');
  });

  test('StatsShowcase function is declared', () => {
    expect(showcaseSource).toContain('function StatsShowcase(');
  });

  test('StatsShowcase accepts onNavigateToDashboard prop', () => {
    const fnStart = showcaseSource.indexOf('function StatsShowcase(');
    const fnSig = showcaseSource.slice(fnStart, fnStart + 120);
    expect(fnSig).toContain('onNavigateToDashboard');
  });

  test('all hooks in StatsShowcase are declared before any early return', () => {
    const fnStart = showcaseSource.indexOf('function StatsShowcase(');
    const fnEnd = showcaseSource.indexOf('window.StatsShowcase = StatsShowcase');
    const body = showcaseSource.slice(fnStart, fnEnd);

    // First early return after the loading guard
    const firstReturn = body.indexOf('\n  if (loading)');
    expect(firstReturn).toBeGreaterThan(-1);

    // All hook calls must appear before the loading guard
    const hookRe = /\b(useState|useEffect|useMemo|useCallback|useRef)\s*\(/g;
    let m;
    while ((m = hookRe.exec(body)) !== null) {
      expect(m.index).toBeLessThan(firstReturn);
    }
  });

  test('SABLE empty-state hides chart when data < 3 months (logic check)', () => {
    // The sableSentence helper should return null for < 3 data points
    expect(showcaseSource).toContain('sableData.length < 3');
  });

  test('showcase does not reference statsVisibility (curation is hard-coded)', () => {
    // Per B.5 known pitfalls: Showcase must NOT apply statsVisibility
    expect(showcaseSource).not.toContain('statsVisibility');
    expect(showcaseSource).not.toContain('loadStatsVisibility');
  });
});

// ── index.html cache key tests ────────────────────────────────────

describe('index.html — Babel cache keys', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

  test('SHOWCASE_CACHE_KEY is defined', () => {
    expect(html).toContain("SHOWCASE_CACHE_KEY = 'babel_showcase_v1'");
  });

  test('loadStatsShowcase function is defined', () => {
    expect(html).toContain('window.loadStatsShowcase = function()');
  });

  test('STATS_CACHE_KEY and SHOWCASE_CACHE_KEY are distinct strings', () => {
    const statsMatch = html.match(/STATS_CACHE_KEY\s*=\s*'([^']+)'/);
    const showcaseMatch = html.match(/SHOWCASE_CACHE_KEY\s*=\s*'([^']+)'/);
    expect(statsMatch).not.toBeNull();
    expect(showcaseMatch).not.toBeNull();
    expect(statsMatch[1]).not.toBe(showcaseMatch[1]);
  });
});

