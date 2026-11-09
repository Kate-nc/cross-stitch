/**
 * Detail-tier transitions while zooming — reports/track-zoom-tier-transition.md.
 *
 * A zoom that crossed a tier threshold used to fade symbols (Tier 3) or half
 * stitches and backstitch (Tier 2) in or out: a requestAnimationFrame loop
 * set opacities in tierFadeRef and called renderStitch, a full repaint of the
 * chart tile, on every frame for 150-200 ms. That was 4-13 full paints per
 * crossing on top of the zoom's own, and in between, paints at a tier with
 * another tier's detail half drawn.
 *
 * Now the detail drawn is a function of the tier alone, worked out in
 * drawStitch for the cell size it draws at, so the zoom's one paint is the
 * final picture. These tests lift that block out of drawStitch and run it,
 * and check no animation loop repaints the chart. The browser specs
 * (tests/mobile-audit/desktop-zoom-tier.spec.js, zoom-tier.spec.js) count
 * the paints themselves for keyboard, button, wheel and pinch zooms.
 */
const fs = require('fs');
const path = require('path');

const tracker = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');

function sliceBalanced(src, sig) {
  const start = src.indexOf(sig);
  if (start < 0) throw new Error(sig + ' not found');
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced ' + sig);
}

const drawStitch = sliceBalanced(tracker, 'function drawStitch(ctx,cSz,viewportRect,isDoneAt){');
// eslint-disable-next-line no-new-func
const computeDetailTier = new Function(sliceBalanced(tracker, 'function computeDetailTier(cSz,cur){') + '\nreturn computeDetailTier;')();

/* drawStitch's tier block, from the tier update to the two opacities, run as
   a function of (cell size, lock, tierRef). */
const tierBlock = (() => {
  const a = drawStitch.indexOf('if(!lockDetailLevel)tierRef.current=');
  const b = drawStitch.indexOf('\n', drawStitch.indexOf('const bsHsAlpha='));
  if (a < 0 || b < 0) throw new Error('tier block not found in drawStitch');
  // eslint-disable-next-line no-new-func
  return new Function('cSz', 'lockDetailLevel', 'tierRef', 'computeDetailTier',
    drawStitch.slice(a, b) + '\nreturn {tier,symAlpha,bsHsAlpha};');
})();

/* One paint per committed cell size, as a zoom does. */
function paintAll(sizes, lock = false) {
  const tierRef = { current: 3 };   // the tracker starts in Tier 3
  return sizes.map((c) => ({ cSz: c, ...tierBlock(c, lock, tierRef, computeDetailTier) }));
}

describe('the detail drawn depends on the tier alone', () => {
  test('symbols at full strength from Tier 3, none below; half stitches and backstitch from Tier 2', () => {
    // Every key step from 10% to 140% and back, then the buttons' 25% steps.
    const up = [], down = [];
    for (let z = 10; z <= 140; z += 10) up.push(z / 5);
    for (let z = 140; z >= 10; z -= 10) down.push(z / 5);
    const paints = paintAll([...up, ...down, 8, 13, 8, 3, 8, 13]);
    for (const p of paints) {
      expect([p.cSz, p.symAlpha]).toEqual([p.cSz, p.tier >= 3 ? 1 : 0]);
      expect([p.cSz, p.bsHsAlpha]).toEqual([p.cSz, p.tier >= 2 ? 1 : 0]);
    }
    // Every tier boundary was crossed both ways.
    const seq = paints.map((p) => p.tier).join('');
    for (const pair of ['12', '23', '34', '43', '32', '21']) expect(seq).toContain(pair);
  });

  test('the first paint at a new size is already the final picture: painting it again changes nothing', () => {
    // A fade repainted the same size several times, each with more or less
    // detail. Here a repeat paint at the same size must be identical.
    const tierRef = { current: 3 };
    for (const c of [8, 14, 8, 2, 6, 14, 26, 21, 9]) {
      const first = tierBlock(c, false, tierRef, computeDetailTier);
      const again = tierBlock(c, false, tierRef, computeDetailTier);
      expect(again).toEqual(first);
    }
  });

  test('rapid direction changes across a threshold land on the tier of where the zoom stops', () => {
    // 40% and 65% (8 and 13 px) alternately, then out to 15% and back.
    const sizes = [13, 8, 13, 8, 13, 8, 13, 8, 3, 8, 13];
    const paints = paintAll(sizes);
    expect(paints.map((p) => p.tier).join('')).toBe('32323232223');
    const last = paints[paints.length - 1];
    expect([last.symAlpha, last.bsHsAlpha]).toEqual([1, 1]);
  });

  test('hysteresis still applies: a size between the thresholds keeps the tier it came from', () => {
    // 10-12 px is Tier 3 coming down and Tier 2 going up.
    expect(paintAll([14, 11]).map((p) => p.tier)).toEqual([3, 3]);
    expect(paintAll([8, 11]).map((p) => p.tier)).toEqual([2, 2]);
  });

  test('locking the detail level shows everything at every size', () => {
    for (const p of paintAll([2, 6, 11, 30], true)) {
      expect(p).toMatchObject({ tier: 3, symAlpha: 1, bsHsAlpha: 1 });
    }
  });
});

describe('nothing animates the chart after a zoom', () => {
  test('there is no fade state and no animation loop that repaints the chart', () => {
    expect(tracker).not.toMatch(/tierFadeRef/);
    expect(tracker).not.toMatch(/symbolOpacity|bsHsOpacity/);
    // renderStitchRef is called from one place: the return from a hidden tab.
    const calls = tracker.match(/renderStitchRef\.current\(\)/g) || [];
    expect(calls).toHaveLength(1);
    const at = tracker.indexOf('renderStitchRef.current()');
    expect(tracker.slice(at - 1500, at)).toMatch(/visibilityState==="hidden"/);
  });

  test('no requestAnimationFrame callback in the tracker calls renderStitch', () => {
    // Each rAF call site, with the callback's body (or the named function it
    // schedules), must not reach a full repaint.
    const re = /requestAnimationFrame\(/g;
    let m;
    while ((m = re.exec(tracker))) {
      const arg = tracker.slice(m.index + 22, m.index + 22 + 400);
      expect(arg).not.toMatch(/renderStitch\(|renderStitchRef/);
    }
  });
});
