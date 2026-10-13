// Phase 5 batch 1 (TRACK-09): a done stitch must not depend on a pale tint to be told from a not-done one.
const fs = require('fs');
const path = require('path');
const CU = require('../colour-utils.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const tracker = read('tracker-app.js');

describe('doneStitchLook / pendingStitchLook', () => {
  const samples = [];
  for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) samples.push([r, g, b]);

  test('a done stitch is never lighter than DONE_MAX_LUM, so white and cream threads still show', () => {
    for (const rgb of samples) expect(CU.doneStitchLook(rgb).lum).toBeLessThanOrEqual(CU.DONE_MAX_LUM + 1);
  });
  test('done keeps the thread colour when it is not too light', () => {
    expect(CU.doneStitchLook([200, 0, 0]).fill).toBe('rgb(200,0,0)');
    expect(CU.doneStitchLook([0, 0, 0]).fill).toBe('rgb(0,0,0)');
  });
  test('a very light thread keeps its hue, only darker', () => {
    const d = CU.doneStitchLook([255, 250, 240]).fill.match(/\d+/g).map(Number);
    expect(d[0]).toBeGreaterThanOrEqual(d[1]); expect(d[1]).toBeGreaterThanOrEqual(d[2]);
  });
  // The same weights the canvas acceptance test measures with.
  const L709 = f => { const c = f.match(/\d+/g).map(Number); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const { DMC } = require('../dmc-data.js');
  const fine = []; for (let r = 0; r <= 255; r += 15) for (let g = 0; g <= 255; g += 15) for (let b = 0; b <= 255; b += 15) fine.push([r, g, b]);
  test.each([0.3, 0.5, 0.65, 0.9])('every DMC colour and a fine colour grid: not-done is at least 40 lighter than done in the canvas luminance, at fade %s', fade => {
    let worst = 1e9;
    for (const rgb of DMC.map(c => c.rgb).concat(fine)) worst = Math.min(worst, L709(CU.pendingStitchLook(rgb, fade).fill) - L709(CU.doneStitchLook(rgb).fill));
    expect(worst).toBeGreaterThanOrEqual(40);
  });
  test('saturated light greens (DMC 704, 703, 907) clear the gap at the symbol-tier fade of 0.5', () => {
    for (const rgb of [[158, 207, 52], [123, 181, 71], [199, 230, 102], [90, 255, 30]])
      expect(L709(CU.pendingStitchLook(rgb, 0.5).fill) - L709(CU.doneStitchLook(rgb).fill)).toBeGreaterThanOrEqual(40);
  });
  test('not-done is desaturated: its channels sit closer together than the thread\'s', () => {
    const spread = a => Math.max(...a) - Math.min(...a);
    const p = CU.pendingStitchLook([200, 0, 0]).fill.match(/\d+/g).map(Number);
    expect(spread(p)).toBeLessThan(spread([200, 0, 0]));
  });
  test('a larger fade is lighter', () => {
    expect(CU.pendingStitchLook([40, 80, 160], 0.8).lum).toBeGreaterThan(CU.pendingStitchLook([40, 80, 160], 0.4).lum);
  });
  test('a fade of 0, or none, falls back to the default', () => {
    expect(CU.pendingStitchLook([40, 80, 160], 0).fill).toBe(CU.pendingStitchLook([40, 80, 160], CU.PENDING_FADE).fill);
    expect(CU.pendingStitchLook([40, 80, 160]).fill).toBe(CU.pendingStitchLook([40, 80, 160], CU.PENDING_FADE).fill);
  });
  test('looks are cached per colour: the same object comes back, so drawing builds no string per cell', () => {
    expect(CU.doneStitchLook([12, 34, 56])).toBe(CU.doneStitchLook([12, 34, 56]));
    expect(CU.pendingStitchLook([12, 34, 56], 0.5)).toBe(CU.pendingStitchLook([12, 34, 56], 0.5));
    expect(CU.pendingStitchLook([12, 34, 56], 0.5)).not.toBe(CU.pendingStitchLook([12, 34, 56], 0.7));
  });
  test('the symbol on a done cell is dimmed, and readable on a dark thread as well as a light one', () => {
    expect(CU.doneStitchLook([0, 0, 0]).ink).toMatch(/255,255,255/);
    expect(CU.doneStitchLook([230, 200, 60]).ink).toMatch(/rgba\(0,0,0/);
  });
});

describe('how the Tracker draws it', () => {
  test('looks are cached by packed RGB, not by palette id (DMC 310 and Anchor 310 share an id)', () => {
    expect(tracker).toMatch(/function doneLookOf\(m\)\{const k=\(m\.rgb\[0\]<<16\)\|\(m\.rgb\[1\]<<8\)\|m\.rgb\[2\]/);
    expect(tracker).toMatch(/function pendLookOf\(m\)\{const k=\(m\.rgb\[0\]<<16\)/);
    expect(tracker).not.toMatch(/doneLooks\[m\.id\]|pendLooks\[m\.id\]/);
  });
  const draw = tracker.slice(tracker.indexOf('function drawStitch(ctx,cSz,viewportRect,isDoneAt){'));
  test('the old pale green wash is gone from Symbol view', () => {
    expect(draw.slice(0, 12000)).not.toMatch(/#D5E5C8/);
  });
  test('the low-zoom tier paints done in the thread colour and not-done faded, from the cached looks', () => {
    expect(tracker).toMatch(/isDn\?doneLookOf\(m\)\.fill:pendLookOf\(m\)\.fill/);
  });
  test('Symbol and Colour views use the same two looks and honour the done style', () => {
    expect(tracker).toMatch(/if\(stitchView==="symbol"\|\|stitchView==="colour"\)\{/);
    expect(tracker).toMatch(/isDn&&\(solid\|\|doneStyle!=="tick"\)/);
    expect(tracker).toMatch(/if\(isDn\)drawDoneTick\(px,py\)/);
  });
  test('the looks are fetched once per colour per paint, and a symbol costs no canvas save/restore per cell', () => {
    expect(tracker).toMatch(/const stitchLookRef=useRef\(\{cmap:null,fade:-1,done:null,pend:null\}\)/);
    expect(tracker).toMatch(/if\(lc\.cmap!==cmap\|\|lc\.fade!==pendFade\)\{lc=stitchLookRef\.current=/);
    expect(tracker).toMatch(/const doneLooks=lc\.done,pendLooks=lc\.pend/);
    expect(tracker).toMatch(/l=doneLooks\[k\]=doneStitchLook\(m\.rgb\)/);
    const branch = tracker.slice(tracker.indexOf('const isSymV=stitchView==="symbol",solid=tier<=2;'), tracker.indexOf('}else if(highlightMode==="outline"||highlightMode==="tint"){'));
    expect(branch).not.toMatch(/ctx\.save\(\)|ctx\.restore\(\)/);
    expect(branch).not.toMatch(/rgb\(\$\{|`/);                 // no colour string built per cell
  });
  test('the colour cache is keyed by a number, not a string built per lookup', () => {
    expect(read('colour-utils.js')).toMatch(/ck = \(Math\.round\(f \* 100\) \+ 1\) \* 16777216 \+ key/);
  });
  test('the done style reaches the repaint: it is in the chart effect\'s dependencies', () => {
    expect(tracker).toMatch(/lockDetailLevel,lowZoomFade,doneStyle,rowModeActive/);
  });
  test('the tick is drawn with a pale edge so it shows on a pale or a dark cell', () => {
    expect(tracker).toMatch(/function drawDoneTick\(px,py\)[\s\S]{0,400}rgba\(255,255,255,0\.9\)/);
  });
  test('the choice is a preference with a default, a Preferences row and a View-tab control', () => {
    expect(read('user-prefs.js')).toMatch(/trackerDoneStyle:\s+"fill"/);
    expect(read('preferences-modal.js')).toMatch(/usePref\("trackerDoneStyle", "fill"\)/);
    expect(read('preferences-modal.js')).toMatch(/label: "Finished stitches"/);
    expect(tracker).toMatch(/\[\["fill","Thread colour"\],\["tick","Corner tick"\]\]/);
  });
  test('help and the changelog mention it', () => {
    expect(read('help-drawer.js')).toMatch(/\["Finished stitches"/);
    expect(read('version.js')).toMatch(/version: '1\.0\.132'/);
  });
});
