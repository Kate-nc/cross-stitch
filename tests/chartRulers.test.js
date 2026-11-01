// Chart rulers and counting aids (UX-010, UX-016).
//
// The Creator numbers its rulers the way the Tracker and a paper chart do (1, then 10, 20, 30), in an
// ink that clears 4.5:1 on the fabric. In the Tracker's Highlight view the counting aids are neutral
// badges, hidden on small cells, off for new users; and the Highlight hint banner has a class that
// clears the docked panel.
const { loadSource } = require('./_helpers/loadSource');

const renderer = loadSource('creator/canvasRenderer.js');
const tracker = loadSource('tracker-app.js');
const overlays = loadSource('useCanvasOverlays.js');
const css = loadSource('styles.css');

// The ruler helpers sit above the first window.draw* function, so evaluate that head on its own.
function loadRulers() {
  const head = renderer.slice(0, renderer.indexOf('window.drawKnotsOnCanvas = function'));
  const win = {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'luminance', head)(win, () => 0);
  return win;
}
const W = loadRulers();

function lum(hex) {
  const f = hex.length === 4 ? '#' + hex.slice(1).replace(/./g, '$&$&') : hex;
  const c = [1, 3, 5].map(i => parseInt(f.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function tokenIn(block, name) {
  const start = css.indexOf(block);
  const m = new RegExp('--' + name + ':\\s*(#[0-9A-Fa-f]{6})').exec(css.slice(start));
  return m && m[1];
}

describe('Creator ruler label positions', () => {
  test('the first column is 1, then every tenth, like the Tracker', () => {
    expect(W.chartRulerLabelCells(0, 60)).toEqual([0, 9, 19, 29, 39, 49, 59]);
  });
  test('a chart too short for a ten still labels 1', () => {
    expect(W.chartRulerLabelCells(0, 5)).toEqual([0]);
    expect(W.chartRulerLabelCells(0, 1)).toEqual([0]);
    expect(W.chartRulerLabelCells(0, 0)).toEqual([]);
  });
  test('a crop labels the pattern\'s own numbers, not its own first cell', () => {
    // Cells 41..65: only 50 and 60 sit on a ten (and none is 1).
    expect(W.chartRulerLabelCells(40, 25)).toEqual([9, 19]);
    expect(W.chartRulerLabelCells(9, 3)).toEqual([0]);
  });
  test('it never labels the old 11, 21, 31', () => {
    const labels = W.chartRulerLabelCells(0, 100).map(i => i + 1);
    for (const n of [11, 21, 31, 91]) expect(labels).not.toContain(n);
  });

  function recordingCtx() {
    const calls = [];
    return {
      calls,
      set fillStyle(v) { this._fill = v; }, get fillStyle() { return this._fill; },
      set font(v) { this._font = v; }, get font() { return this._font; },
      textAlign: '', textBaseline: '',
      fillText(t, x, y) { calls.push({ t, x, y, fill: this._fill, align: this.textAlign, font: this._font }); },
    };
  }
  // _drawChartRulers is file-scope, not on window; run it through the same head.
  function drawRulers(offX, offY, dW, dH, cSz, gut, fabric) {
    const head = renderer.slice(0, renderer.indexOf('window.drawKnotsOnCanvas = function'));
    const ctx = recordingCtx();
    // eslint-disable-next-line no-new-func
    new Function('window', 'luminance', 'ctx', 'args', head + '\n_drawChartRulers.apply(null, [ctx].concat(args));')({}, () => 0, ctx, [offX, offY, dW, dH, cSz, gut, fabric]);
    return ctx.calls;
  }

  test('column labels are centred on the cell, row labels sit in the left margin', () => {
    const calls = drawRulers(0, 0, 25, 12, 10, 28, '#fff');
    const cols = calls.filter(c => c.align === 'center');
    const rows = calls.filter(c => c.align === 'right');
    expect(cols.map(c => c.t)).toEqual(['1', '10', '20']);
    expect(cols.map(c => c.x)).toEqual([28 + 5, 28 + 9 * 10 + 5, 28 + 19 * 10 + 5]);
    expect(rows.map(c => c.t)).toEqual(['1', '10']);
    expect(rows.map(c => c.y)).toEqual([28 + 5, 28 + 9 * 10 + 5]);
    expect(rows.every(c => c.x === 25)).toBe(true);
  });

  test('labels are never smaller than 9 px', () => {
    for (const cSz of [2, 6, 12, 40]) {
      const sizes = drawRulers(0, 0, 30, 30, cSz, 28, '#fff').map(c => parseFloat(/(\d+(?:\.\d+)?)px/.exec(c.font)[1]));
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(9);
    }
  });

  test('both chart draws go through the shared ruler and the old colour is gone', () => {
    expect((renderer.match(/(?<!function )_drawChartRulers\(ctx2d,/g) || []).length).toBe(2);
    expect(renderer).not.toMatch(/#A89E89/i);
    expect(renderer).not.toMatch(/x \+= 10\) \{\s*ctx2d\.fillText/);
  });
});

describe('Creator ruler ink', () => {
  test('mirrors --text-tertiary in the light and dark themes', () => {
    expect(renderer).toContain('RULER_INK_LIGHT = "' + tokenIn(':root', 'text-tertiary') + '"');
    expect(renderer).toContain('RULER_INK_DARK = "' + tokenIn('[data-theme="dark"]', 'text-tertiary') + '"');
  });
  test.each(['#fff', '#ffffff', '#FBF8F3', '#F5F0E6', '#e8e0d0', '#000000', '#1B1814', '#222222', '#0a1a3a'])(
    'is at least 4.5:1 on a %s fabric', fabric => {
      const ink = W.chartRulerInk(fabric);
      expect(contrast(ink, fabric)).toBeGreaterThanOrEqual(4.5);
    });
  test('uses the light token on the default white fabric and the dark token on a dark one', () => {
    expect(W.chartRulerInk('#fff')).toBe(tokenIn(':root', 'text-tertiary'));
    expect(W.chartRulerInk('#1B1814')).toBe(tokenIn('[data-theme="dark"]', 'text-tertiary'));
  });
  test('falls back to the best available colour on a mid-tone fabric', () => {
    const fabric = '#808080';
    const ink = W.chartRulerInk(fabric);
    for (const other of ['#6F6757', '#9D9383', '#000000', '#ffffff']) {
      expect(contrast(ink, fabric)).toBeGreaterThanOrEqual(contrast(other, fabric) - 1e-9);
    }
  });
  test('a missing or malformed fabric colour gets the light token', () => {
    expect(W.chartRulerInk(undefined)).toBe(tokenIn(':root', 'text-tertiary'));
    expect(W.chartRulerInk('white')).toBe(tokenIn(':root', 'text-tertiary'));
  });
  test('the old #A89E89 was under 4.5:1 on white (regression guard)', () => {
    expect(contrast('#A89E89', '#ffffff')).toBeLessThan(3);
  });
});

describe('Tracker counting aids', () => {
  const start = tracker.indexOf('// ═══ Counting aids overlay ═══');
  const effect = tracker.slice(start, tracker.indexOf('// Marching-ants outline', start));

  test('are off for a new user and keep a saved choice', () => {
    const m = /const\[countingAidsEnabled,setCountingAidsEnabled\]=useState\((\(\)=>\{[^\n]*\})\);/.exec(overlays);
    expect(m).not.toBeNull();
    const init = (stored, throws) => {
      const localStorage = { getItem: k => { if (throws) throw new Error('blocked'); return k === 'cs_countAids' ? stored : null; } };
      // eslint-disable-next-line no-new-func
      return new Function('localStorage', 'return (' + m[1] + ')();')(localStorage);
    };
    expect(init(null)).toBe(false);   // new user: nothing saved yet
    expect(init('1')).toBe(true);     // saved on
    expect(init('0')).toBe(false);    // saved off
    expect(init(null, true)).toBe(false);   // storage blocked
  });

  test('the saved value is written on first use, so existing users keep theirs', () => {
    expect(overlays).toMatch(/localStorage\.setItem\("cs_countAids",countingAidsEnabled\?"1":"0"\)/);
  });

  test('are hidden below the minimum cell size', () => {
    expect(tracker).toMatch(/const COUNTING_AIDS_MIN_CELL=12;/);
    expect(effect).toMatch(/if\(scs<COUNTING_AIDS_MIN_CELL\)\{[^}]*clearOverlayTile/);
    // the gate comes before anything is drawn
    expect(effect.indexOf('scs<COUNTING_AIDS_MIN_CELL')).toBeLessThan(effect.indexOf('const draw=(region)=>'));
    // a badge is 11 px tall; the minimum must leave room for one per row
    const min = Number(/const COUNTING_AIDS_MIN_CELL=(\d+);/.exec(tracker)[1]);
    const badgeH = Number(/drawBadge\(label,bpx-tw,bpy,tw,(\d+)\)/.exec(effect)[1]);
    expect(min).toBeGreaterThanOrEqual(badgeH);
  });

  test('badges, counts and stars use the neutral dark-outline, light-fill style', () => {
    expect(tracker).toMatch(/const COUNTING_AIDS_INK="#1B1814",COUNTING_AIDS_FILL="rgba\(255,255,255,0\.94\)";/);
    expect(effect).not.toMatch(/#B85C38|#7c3aed|rgba\(234,88,12|rgba\(184, ?92, ?56/i);
    expect(effect).not.toMatch(/ctx\.fillStyle="#fff"/);
    expect((effect.match(/(?<!function )drawBadge\(label,/g) || []).length).toBe(2);   // horizontal and vertical runs
    expect(effect).toMatch(/ctx\.strokeStyle=COUNTING_AIDS_INK/);
    expect(effect).toMatch(/ctx\.fillStyle=COUNTING_AIDS_FILL/);
  });

  test('the ink is dark and the fill light enough for 4.5:1 or better', () => {
    expect(contrast('#1B1814', '#ffffff')).toBeGreaterThanOrEqual(12);
  });

  test('says why nothing shows when the cells are too small', () => {
    expect(tracker).toMatch(/countingAidsEnabled&&scs<COUNTING_AIDS_MIN_CELL&&<div role="status"[^>]*>Zoom in to see counting aids/);
  });
});

describe('Highlight hint banner', () => {
  test('is a class that clears the docked panel instead of inline styles', () => {
    expect(tracker).toMatch(/className=\{"tracker-hint-banner"\+\(leftSidebarMode==="open"\?" tracker-hint-banner--palette-open":""\)\}/);
    const i = tracker.indexOf('tracker-hint-banner"');
    const block = tracker.slice(i, tracker.indexOf('</div>}', i));
    expect(block).not.toMatch(/style=\{\{display:"flex"/);
    expect(block).toContain('to cycle colours');
  });
  test('is offset by the 320 px panel plus the 16 px gutter from 1024 px, where the panel docks', () => {
    expect(css).toMatch(/@media\(min-width:1024px\)\{\s*\.tracker-hint-banner\{[^}]*\}\s*\.tracker-hint-banner--palette-open\{margin-left:336px;\}/);
    expect(css).toMatch(/\.cs-main\.cs-main--palette-open\{margin-left:320px;\}/);
  });
  test('its text can shrink and wrap, so no word is clipped at phone width', () => {
    expect(css).toMatch(/\.tracker-hint-banner__text\{[^}]*min-width:0/);
    expect(css).toMatch(/\.tracker-hint-banner__text\{[^}]*overflow-wrap:anywhere/);
  });
  test('uses tokens, no raw colours', () => {
    const rules = css.match(/\.tracker-hint-banner[^{]*\{[^}]*\}/g).join('\n');
    expect(rules).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(rules).not.toMatch(/rgba?\(/);
  });
});

describe('Tracker ruler digits', () => {
  test('the small numbers use --text-tertiary, which clears 4.5:1, not --text-muted', () => {
    const i = tracker.indexOf('const colRuler=useMemo');
    const block = tracker.slice(i, tracker.indexOf('const skeinData=useMemo', i));
    expect(block).not.toMatch(/text-muted/);
    expect((block.match(/'var\(--text-tertiary\)'/g) || []).length).toBe(2);
  });
});

describe('copy', () => {
  test('no emoji or arrow glyphs in the new help and changelog text', () => {
    const help = loadSource('help-drawer.js');
    const added = ['Row and column numbers', 'Highlight view", "With a colour', 'Zoom in to see them']
      .map(k => help.slice(help.indexOf(k), help.indexOf(k) + 700)).join('\n');
    expect(added).not.toMatch(/[✓✗⚠ℹ→←▸✕]/u);
    expect(added).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
