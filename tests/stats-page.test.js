/**
 * Tests for stats-page.js structural correctness.
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
