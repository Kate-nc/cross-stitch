// Touch magnifier, precision cursor and tap-on-lift (P1-3, audit DRAW-03).
const { loadSource } = require('./_helpers/loadSource');

function load() {
  const win = {};
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('window', 'module', loadSource('creator/Loupe.js'))(win, mod);
  return { win, api: mod.exports };
}

describe('loupeRect', () => {
  const { api } = load();

  test('covers the 7 x 7 cells centred on the target', () => {
    expect(api.loupeRect({ gx: 10, gy: 4 }, 9, 3, 28)).toEqual({ sx: 28 + 7 * 9, sy: 28 + 1 * 9, sw: 63, sh: 63 });
  });

  test('defaults to a radius of 3 cells and no gutter', () => {
    expect(api.loupeRect({ gx: 0, gy: 0 }, 20)).toEqual({ sx: -60, sy: -60, sw: 140, sh: 140 });
  });

  test('scales with the cell size', () => {
    const a = api.loupeRect({ gx: 5, gy: 5 }, 10, 2, 0);
    const b = api.loupeRect({ gx: 5, gy: 5 }, 20, 2, 0);
    expect(b.sw).toBe(a.sw * 2);
    expect(b.sx).toBe(a.sx * 2);
  });
});

describe('loupePlacement', () => {
  const { api } = load();

  test('sits 90px above the target and never covers it', () => {
    const p = api.loupePlacement(200, 400, 393, 851);
    expect(p.flipped).toBe(false);
    expect(p.top + p.size / 2).toBe(310);
    // Bottom edge of the circle is above the target.
    expect(p.top + p.size).toBeLessThan(400);
  });

  test('flips below the target near the top of the screen', () => {
    const p = api.loupePlacement(200, 80, 393, 851);
    expect(p.flipped).toBe(true);
    expect(p.top).toBeGreaterThan(80);
  });

  test('stays on screen at the left and right edges', () => {
    expect(api.loupePlacement(5, 400, 393, 851).left).toBe(8);
    const r = api.loupePlacement(390, 400, 393, 851);
    expect(r.left + r.size).toBe(393 - 8);
  });

  test('the target is outside the circle wherever it is placed', () => {
    for (const [x, y] of [[0, 0], [5, 60], [196, 120], [390, 845], [100, 300]]) {
      const p = api.loupePlacement(x, y, 393, 851);
      const cx = p.left + p.size / 2, cy = p.top + p.size / 2;
      expect(Math.hypot(x - cx, y - cy)).toBeGreaterThan(p.size / 2);
    }
  });
});

describe('precision cursor and tap-on-lift', () => {
  const { api } = load();

  test('the precision cursor aims 40px above the finger', () => {
    expect(api.precisionTarget(100, 300, true)).toEqual({ x: 100, y: 260 });
    expect(api.precisionTarget(100, 300, false)).toEqual({ x: 100, y: 300 });
  });

  test('movement within the slop is a tap, beyond it a stroke for stroke tools', () => {
    const start = { x: 100, y: 100 };
    expect(api.touchDrawOutcome(start, { x: 106, y: 106 }, 10, true)).toBe('tap');
    expect(api.touchDrawOutcome(start, { x: 120, y: 100 }, 10, true)).toBe('stroke');
  });

  test('single-cell tools and the precision cursor never stroke', () => {
    expect(api.touchDrawOutcome({ x: 0, y: 0 }, { x: 80, y: 0 }, 10, false)).toBe('tap');
  });
});

describe('bus', () => {
  test('show and hide notify subscribers', () => {
    const { api } = load();
    const seen = [];
    const off = api.bus.subscribe((v) => seen.push(v && v.x));
    api.bus.show({ x: 3 });
    api.bus.hide();
    api.bus.hide();
    off();
    api.bus.show({ x: 4 });
    expect(seen).toEqual([3, null]);
  });
});

describe('wiring', () => {
  const canvas = loadSource('creator/useCanvasInteraction.js');
  const state = loadSource('creator/useCreatorState.js');

  test('touch drawing commits on lift at the last target cell', () => {
    expect(canvas).toMatch(/var tgt = window\.precisionTarget \? window\.precisionTarget\(wasTouchDraw\.x, wasTouchDraw\.y, wasTouchDraw\.precision\)/);
    expect(canvas).toMatch(/handlePatMouseDown\(tapEv\);\s*handlePatMouseUp\(tapEv\);/);
  });

  test('a second finger cancels a pending touch stitch', () => {
    expect(canvas).toMatch(/activePointersRef\.current\.size === 2\) \{[\s\S]{0,120}cancelTouchDraw\(\);/);
  });

  test('the loupe covers Paint, Erase, partial stitches and the eyedropper, not Navigate', () => {
    const kind = canvas.match(/function touchDrawKind\(\) \{[\s\S]*?\n {2}\}/)[0];
    expect(kind).toMatch(/"paint"/);
    expect(kind).toMatch(/"eraseAll"/);
    expect(kind).toMatch(/"eyedropper"/);
    // getActiveTool()/getPartialStitchTool() are null in Navigate.
    expect(canvas).toMatch(/function getActiveTool\(\)/);
  });

  test('magnifier defaults on for touch screens; precision cursor off', () => {
    expect(state).toMatch(/loadUserPref\("creator\.magnifier", null\);\s*return v === true \|\| v === false \? v : !isFinePointerNow\(\);/);
    expect(state).toMatch(/loadUserPref\("creator\.precisionCursor", false\) === true/);
  });
});

describe('creatorMaxZoom', () => {
  const src = loadSource('creator/useCreatorState.js');
  const fn = src.match(/function creatorMaxZoom[\s\S]*?\n\}/)[0];
  function make(limits) {
    const window = { canvasSizeLimits: limits ? () => limits : undefined };
    // eslint-disable-next-line no-new-func
    return new Function('window', fn + '; return creatorMaxZoom;')(window);
  }

  test('mouse and trackpad keep 3', () => {
    expect(make({ side: 16384, area: 268435456 })(80, 80, false)).toBe(3);
  });

  test('touch screens get 4 when the canvas fits', () => {
    expect(make({ side: 16384, area: 268435456 })(80, 80, true)).toBe(4);
    expect(make(null)(80, 80, true)).toBe(4);
  });

  test('a large pattern on a small canvas budget never drops below 3', () => {
    // iOS: 4096 side, 16.7M px area.
    expect(make({ side: 4096, area: 16777216 })(200, 250, true)).toBe(3);
  });

  test('an in-between budget lands between 3 and 4', () => {
    const z = make({ side: 16384, area: 16777216 * 2 })(80, 80, true);
    expect(z).toBeGreaterThanOrEqual(3);
    expect(z).toBeLessThanOrEqual(4);
  });
});
