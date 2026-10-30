// The Tracker chart's grid lines: strength, colour and spacing (More > View > Grid lines).
const fs = require('fs');
const path = require('path');
const CU = require('../colour-utils.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const rgbaOf = s => s.match(/[\d.]+/g).map(Number);   // [r, g, b, a]
const L709 = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
// What a line of this rgba looks like drawn over a background.
const over = (stroke, bg) => { const [r, g, b, a] = rgbaOf(stroke); return [r, g, b].map((c, i) => c * a + bg[i] * (1 - a)); };

describe('trackerGridLook', () => {
  test('defaults: Standard, Auto colour, a heavy line every 10 with a light one every 5', () => {
    const gl = CU.trackerGridLook({ tier: 3 });
    expect(gl.style).toBe('standard');
    expect(gl.colour).toBe('auto');
    expect(gl.every).toBe(10);
    expect(gl.minorEvery).toBe(5);
    expect(gl.halo).not.toBeNull();
  });

  test('unknown values fall back to the defaults', () => {
    const gl = CU.trackerGridLook({ style: 'loud', colour: 'pink', every: 7, tier: 9, fabric: 'nope' });
    expect([gl.style, gl.colour, gl.every]).toEqual(['standard', 'auto', 10]);
  });

  test('Auto draws dark lines on a light fabric and light lines on a dark one', () => {
    for (const tier of [1, 2, 3, 4]) {
      const onWhite = rgbaOf(CU.trackerGridLook({ fabric: '#FFFFFF', tier }).major.stroke);
      const onBlack = rgbaOf(CU.trackerGridLook({ fabric: '#000000', tier }).major.stroke);
      const onNavy = rgbaOf(CU.trackerGridLook({ fabric: '#1F2A44', tier }).major.stroke);
      expect(L709(onWhite)).toBeLessThan(60);
      expect(L709(onBlack)).toBeGreaterThan(200);
      expect(L709(onNavy)).toBeGreaterThan(200);
    }
  });

  test('every style\'s heavy line stands out from white, cream, black and navy fabric with Auto colour', () => {
    const fabrics = { '#FFFFFF': [255, 255, 255], '#F5F0E6': [245, 240, 230], '#000000': [0, 0, 0], '#1F2A44': [31, 42, 68] };
    for (const style of CU.GRID_STYLES) for (const tier of [1, 2, 3, 4]) for (const [hex, rgb] of Object.entries(fabrics)) {
      const gl = CU.trackerGridLook({ style, fabric: hex, tier });
      // Subtle zoomed far out is meant to be faint; the rest clear a visible gap.
      const need = style === 'subtle' && tier === 1 ? 40 : 80;
      expect(Math.abs(L709(over(gl.major.stroke, rgb)) - L709(rgb))).toBeGreaterThanOrEqual(need);
    }
  });

  test('zoomed far out, Standard is much stronger than the old faint light-grey line', () => {
    const old = L709(over('rgba(204,204,204,0.4)', [255, 255, 255]));
    const now = L709(over(CU.trackerGridLook({ fabric: '#FFFFFF', tier: 1 }).major.stroke, [255, 255, 255]));
    expect(old - now).toBeGreaterThan(100);
  });

  test('Standard and Bold halo the heavy line in the opposite tone, so it shows over a dark stitch', () => {
    for (const style of ['standard', 'bold']) for (const tier of [2, 3, 4]) {
      const gl = CU.trackerGridLook({ style, fabric: '#FFFFFF', tier });
      expect(gl.halo.width).toBeGreaterThan(gl.major.width);
      expect(L709(rgbaOf(gl.halo.stroke))).toBeGreaterThan(200);   // light halo under a dark line
      // Over a black stitch the halo still reads well away from black.
      expect(L709(over(gl.halo.stroke, [0, 0, 0]))).toBeGreaterThan(120);
    }
    expect(CU.trackerGridLook({ style: 'subtle', tier: 3 }).halo).toBeNull();
    // No halo zoomed far out: it would cover most of a 3 px cell.
    expect(CU.trackerGridLook({ style: 'bold', tier: 1 }).halo).toBeNull();
  });

  test('Bold is at least as strong and as wide as Standard, and Standard as Subtle, at every zoom', () => {
    for (const tier of [1, 2, 3, 4]) {
      const [s, m, b] = CU.GRID_STYLES.map(style => CU.trackerGridLook({ style, fabric: '#FFFFFF', tier }).major);
      expect(m.width).toBeGreaterThanOrEqual(s.width);
      expect(b.width).toBeGreaterThanOrEqual(m.width);
      expect(rgbaOf(m.stroke)[3]).toBeGreaterThanOrEqual(rgbaOf(s.stroke)[3]);
      expect(rgbaOf(b.stroke)[3]).toBeGreaterThanOrEqual(rgbaOf(m.stroke)[3]);
    }
  });

  test('Dark, Light and Terracotta are used as chosen, whatever the fabric', () => {
    expect(rgbaOf(CU.trackerGridLook({ colour: 'dark', fabric: '#000000' }).major.stroke).slice(0, 3)).toEqual([27, 24, 20]);
    expect(rgbaOf(CU.trackerGridLook({ colour: 'light', fabric: '#FFFFFF' }).major.stroke).slice(0, 3)).toEqual([255, 252, 245]);
    const acc = CU.trackerGridLook({ colour: 'accent', fabric: '#FFFFFF', tier: 3 });
    expect(rgbaOf(acc.major.stroke).slice(0, 3)).toEqual([184, 92, 56]);
    // The light lines between stay neutral.
    expect(rgbaOf(acc.minor.stroke).slice(0, 3)).toEqual([27, 24, 20]);
  });

  test('the light line sits half-way between heavy ones only when that is a whole stitch, and not zoomed far out', () => {
    expect(CU.trackerGridLook({ every: 20, tier: 3 }).minorEvery).toBe(10);
    expect(CU.trackerGridLook({ every: 5, tier: 3 }).minorEvery).toBe(0);
    expect(CU.trackerGridLook({ every: 10, tier: 1 }).minor).toBeNull();
    expect(CU.trackerGridLook({ every: 10, tier: 1 }).minorEvery).toBe(0);
  });

  test('looks are cached: the same object comes back, so a paint builds no strings', () => {
    const a = CU.trackerGridLook({ style: 'bold', colour: 'auto', every: 10, fabric: '#F5F0E6', tier: 3 });
    expect(CU.trackerGridLook({ style: 'bold', colour: 'auto', every: 10, fabric: '#f5f0e6', tier: 3 })).toBe(a);
  });
});

describe('wiring', () => {
  const tracker = read('tracker-app.js');
  const prefs = read('user-prefs.js');

  test('the Tracker draws its grid through trackerGridLook, with the chosen settings', () => {
    expect(tracker).toMatch(/trackerGridLook\(\{style:gridStyleEff,colour:gridColour,every:gridEvery,fabric:gridBg,tier\}\)/);
    // Auto follows the fabric only where the fabric is what shows behind the cells.
    expect(tracker).toMatch(/const gridBg=stitchView==="symbol"&&tier>=3\?chartFabricColour:null;/);
    // The old fixed grey lines are gone.
    expect(tracker).not.toMatch(/rgba\(68,68,68,\$\{grid10Op\}\)/);
  });

  test('a change of setting repaints the chart', () => {
    const deps = tracker.match(/\},\[pat,cmap,scs,sW,sH,showCtr,[^\]]*\]\);/)[0];
    for (const k of ['gridStyleEff', 'gridColour', 'gridEvery']) expect(deps).toContain(k);
  });

  test('High contrast draws Standard as Bold and leaves Subtle alone', () => {
    expect(tracker).toMatch(/gridStyleEff=highContrastPref&&gridStyle==='standard'\?'bold':gridStyle/);
  });

  test('the settings have defaults and backup rules', () => {
    expect(prefs).toMatch(/trackerGridStyle:\s*"standard"/);
    expect(prefs).toMatch(/trackerGridColour:\s*"auto"/);
    expect(prefs).toMatch(/trackerGridEvery:\s*10,/);
    expect(prefs).toMatch(/portableEnum\("trackerGridEvery", \[5, 10, 20\]\)/);
  });
});
