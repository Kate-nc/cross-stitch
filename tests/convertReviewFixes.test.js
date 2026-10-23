/* tests/convertReviewFixes.test.js ───────────────────────────────────────
   Regression tests for the review of the Convert redesign:
   - Crop to the stitches (Edit > Tools) crops the chart itself, keeping
     everything on it (creator/canvasResize.js cropToStitchesSpec), through
     the undoable resize; it no longer crops the picture and drops the chart.
   - Convert says how the chart relates to its settings from every setting
     that changes the chart, and the picture (conversionSignature,
     convertChartState); a reopened project is "unknown", not "same".
   - Generate asks before replacing an edited or unknown chart
     (chartChangedSinceGenerated), whichever button started it.
   - The stitched preview keeps within the device's canvas budget
     (stitchedPreviewSizes).
   - The change line compares cells only between previews of the same shape.
   ─────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');

function load(file, extraArgs) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const win = {};
  const React = { createElement: () => null, useRef: () => ({}), useEffect: () => {}, useCallback: (f) => f };
  // eslint-disable-next-line no-new-func
  new Function('window', 'React', 'stitchOverFor', 'document', src)(win, React, () => 1, {});
  return win;
}

const resize = load('creator/canvasResize.js');
const state = load('creator/useCreatorState.js');
const stitched = load('creator/StitchedPreview.js');
const preview = load('creator/usePreview.js');

function grid(w, h, stitchedCells) {
  const pat = [];
  for (let i = 0; i < w * h; i++) pat.push({ id: '__skip__' });
  stitchedCells.forEach(([x, y, id]) => { pat[y * w + x] = { id: id || '310', type: 'solid', rgb: [0, 0, 0] }; });
  return pat;
}

describe('Crop to the stitches', () => {
  test('crops the chart to its stitches and keeps every stitch and its progress', () => {
    const pat = grid(10, 8, [[3, 2], [6, 5, '550']]);
    const spec = resize.cropToStitchesSpec(pat, 10, 8, {});
    expect(spec).toEqual({ newW: 4, newH: 4, offsetX: -3, offsetY: -2 });
    const done = new Uint8Array(80); done[2 * 10 + 3] = 1;
    const out = resize.applyCanvasResize(pat, [], done, new Map(), [], 10, 8, spec);
    expect(out.deletedStitchCount).toBe(0);
    expect(out.newPat[0].id).toBe('310');
    expect(out.newPat[3 * 4 + 3].id).toBe('550');
    expect(out.newDone[0]).toBe(1);
  });

  test('keeps backstitches, specialty lines, knots, beads, part stitches and markers inside', () => {
    const pat = grid(20, 20, [[10, 10]]);
    const extras = {
      bsLines: [{ x1: 4, y1: 10, x2: 10, y2: 10 }],                 // lattice points, left of the stitch
      specialty: [{ type: 'petite', x: 12.5, y: 15 }],
      knots: [{ x: 30, y: 6 }],                                     // half-cell point (15, 3)
      beads: [{ x: 2 * 10, y: 2 * 17 }],
      partialStitches: new Map([[18 * 20 + 9, { tl: {} }]]),
      parkMarkers: [{ x: 11, y: 4 }]
    };
    const spec = resize.cropToStitchesSpec(pat, 20, 20, extras);
    const out = resize.applyCanvasResize(pat, extras.bsLines, null, extras.partialStitches, extras.parkMarkers, 20, 20, spec);
    expect(out.deletedStitchCount).toBe(0);
    expect(out.deletedBsCount).toBe(0);
    expect(out.newPartialStitches.size).toBe(1);
    expect(out.newParkMarkers).toHaveLength(1);
    // Knots and beads stay on the new pattern (Knots.offset keeps 0..2w).
    [...extras.knots, ...extras.beads].forEach((k) => {
      const x = k.x + 2 * spec.offsetX, y = k.y + 2 * spec.offsetY;
      expect(x >= 0 && y >= 0 && x <= 2 * spec.newW && y <= 2 * spec.newH).toBe(true);
    });
    const p = extras.specialty[0];
    expect(p.x + spec.offsetX).toBeGreaterThanOrEqual(0);
    expect(p.x + 0.5 + spec.offsetX).toBeLessThanOrEqual(spec.newW);
  });

  test('nothing to crop: an empty chart, or stitches at every edge', () => {
    expect(resize.cropToStitchesSpec(grid(5, 5, []), 5, 5, {})).toBeNull();
    expect(resize.cropToStitchesSpec(grid(5, 5, [[0, 0], [4, 4]]), 5, 5, {})).toBeNull();
  });

  test('works on a chart with no picture, and Edit calls the undoable resize, not the picture crop', () => {
    const sidebar = fs.readFileSync(path.join(__dirname, '..', 'creator', 'Sidebar.js'), 'utf8');
    expect(sidebar).toMatch(/app\.cropToStitches && h\("button"/);
    expect(sidebar).not.toMatch(/gen\.autoCrop/);
    const main = fs.readFileSync(path.join(__dirname, '..', 'creator-main.js'), 'utf8');
    expect(main).toMatch(/var spec=window\.cropToStitchesSpec\(state\.pat,state\.sW,state\.sH,/);
    expect(main).toMatch(/if\(applyResizeSpec\(spec\)&&state\.addToast\)/);
    // The resize records one undo step.
    expect(main).toMatch(/var n=prev\.concat\(\[\{type:"canvasResize",prev:prevSnap,next:nextSnap\}\]\);/);
    expect(fs.readFileSync(path.join(__dirname, '..', 'creator', 'useCanvasInteraction.js'), 'utf8')).not.toMatch(/function autoCrop/);
  });

  test('cropping the picture keeps an existing chart until Regenerate', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useCanvasInteraction.js'), 'utf8');
    const crop = src.slice(src.indexOf('function applyCrop()'), src.indexOf('function srcClick('));
    expect(crop).not.toMatch(/setPat\(null\)/);
    expect(crop).not.toMatch(/setBsLines\(\[\]\)/);
  });
});

describe('how the chart relates to Convert\'s settings', () => {
  const settings = {
    sW: 100, sH: 80, bri: 0, con: 0, sat: 0, smooth: 0, smoothType: 'median', preSharpen: false, preSharpenAmount: 0.5,
    maxC: 24, dith: true, dithMode: 'weak', allowBlends: true, allowedPalette: null, convertBrand: 'dmc',
    skipBg: true, bgCol: [255, 255, 255], bgTh: 10, minSt: 0, stitchCleanup: { enabled: true, protectDetails: true }, orphans: 2,
    disambig: true, disambigLevel: 'standard', seed: 1, subset: null, fabricCt: 14, stashConstrained: false, stashCount: 0, exactPixelArt: false
  };
  const img = {};
  const pat = [{ id: '310' }];
  const snap = { signature: state.conversionSignature(settings), img };
  const with_ = (o) => Object.assign({}, settings, o);

  test('no chart, a chart from these settings, and a reopened project', () => {
    expect(state.convertChartState(null, snap, settings, img)).toBeNull();
    expect(state.convertChartState(pat, snap, settings, img)).toBe('same');
    expect(state.convertChartState(pat, null, settings, img)).toBe('unknown');
  });

  test.each([
    ['thread brand', { convertBrand: 'anchor', allowedPalette: [{ id: '403', brand: 'anchor' }] }],
    ['background colour', { bgCol: [250, 250, 250] }], ['background tolerance', { bgTh: 20 }],
    ['softening', { smooth: 1 }], ['sharpening', { preSharpen: true }], ['min stitches', { minSt: 10 }],
    ['cleanup', { stitchCleanup: { enabled: true, protectDetails: false } }], ['confetti level', { orphans: 3 }],
    ['look-alike colours', { disambig: false }], ['stash', { stashConstrained: true, stashCount: 12 }],
    ['variation', { seed: 99 }], ['size', { sW: 120 }], ['shading', { dithMode: 'off', dith: false }]
  ])('a change of %s reads as changed', (_name, change) => {
    expect(state.convertChartState(pat, snap, with_(change), img)).toBe('changed');
  });

  test('another picture (cropped or replaced) reads as changed; the fabric count alone does not', () => {
    expect(state.convertChartState(pat, snap, settings, {})).toBe('changed');
    expect(state.convertChartState(pat, snap, with_({ fabricCt: 18 }), img)).toBe('same');
  });

  test('Generate records the signature and the picture', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useCreatorState.js'), 'utf8');
    expect(src).toMatch(/setLastGenSnapshot\(\{ signature: conversionSignature\(conversionSettings\), img: img \}\);/);
  });
});

describe('Regenerate asks before replacing an edited or unknown chart', () => {
  const pat = [{ id: '310' }, { id: '550' }];
  test('a chart as generated, with no edits, is replaced without asking', () => {
    expect(state.chartChangedSinceGenerated(pat, { pat: [{ id: '310' }, { id: '550' }] }, 0)).toBe(false);
    expect(state.chartChangedSinceGenerated(null, null, 0)).toBe(false);
  });
  test('edits, a changed cell, or no snapshot (a reopened project) ask first', () => {
    expect(state.chartChangedSinceGenerated(pat, { pat: pat.slice() }, 1)).toBe(true);
    expect(state.chartChangedSinceGenerated(pat, { pat: [{ id: '310' }, { id: '666' }] }, 0)).toBe(true);
    expect(state.chartChangedSinceGenerated(pat, null, 0)).toBe(true);
  });
  test('the check is in generate itself, so every button and the variations go through it', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useCreatorState.js'), 'utf8');
    const gen = src.slice(src.indexOf('var generate = useCallback(function(overrides) {'), src.indexOf('var randomise = useCallback('));
    expect(gen).toMatch(/chartChangedSinceGenerated\(pat, genPatSnapshot, editHistory \? editHistory\.length : 0\)/);
    expect(gen).toMatch(/title: "Replace your chart\?"/);
    expect(src.slice(src.indexOf('var randomise = useCallback('))).toMatch(/generate\(\{seed: newSeed, subset: newSubset\}\)/);
    const panel = fs.readFileSync(path.join(__dirname, '..', 'creator', 'ConvertPanel.js'), 'utf8');
    expect(panel).not.toMatch(/window\.confirm/);
  });
});

describe('stitched preview canvas budget', () => {
  const ios = { side: 4096, area: 16777216 };
  test.each([[500, 500, 32], [500, 333, 32], [100, 67, 32], [500, 500, 3.5]])('%i × %i at %f device px per stitch stays within the iOS budget', (w, h, want) => {
    const s = stitched.stitchedPreviewSizes(w, h, want, ios);
    const dispW = Math.round(w * s.devCell), dispH = Math.round(h * s.devCell);
    expect(Math.max(dispW, dispH)).toBeLessThanOrEqual(ios.side);
    expect(Math.max(w * s.tile, h * s.tile)).toBeLessThanOrEqual(ios.side);
    // Both canvases exist at once.
    expect(dispW * dispH + w * s.tile * h * s.tile).toBeLessThanOrEqual(ios.area + 1);
  });
  test('a small chart on a desktop keeps its full close-up', () => {
    const s = stitched.stitchedPreviewSizes(100, 67, 16, { side: 16384, area: 134217728 });
    expect(s.devCell).toBe(16);
    expect(s.tile).toBe(16);
  });
  test('a missing drawing context does not throw', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'creator', 'StitchedPreview.js'), 'utf8');
    expect(src).toMatch(/if \(!oc\) \{ off\.width = off\.height = 0; return; \}/);
    expect(src).toMatch(/if \(tc\) drawStitchTile/);
    expect(src).toMatch(/if \(dc\) \{/);
  });
});

describe('the change line compares like with like', () => {
  const base = { sW: 10, sH: 20, maxC: 24 };
  const summary = { threads: 5, symbols: 5, stitchable: 200, confettiPct: 1, skeins: 5 };
  test('a reshaped chart with as many cells reports its new size, not "no stitches changed"', () => {
    const ids = new Array(200).fill('310|0,0,0');
    const out = preview.describePreviewChange(
      { settings: base, summary, ids, w: 10, h: 20 },
      { settings: Object.assign({}, base, { sW: 20, sH: 10 }), summary, ids: ids.slice(), w: 20, h: 10 });
    expect(out.changedStitches).toBeNull();
    expect(out.stats[0]).toEqual({ label: 'size', from: '10 × 20', to: '20 × 10' });
  });
  test('a smaller preview (no worker) scales its count and says it is an estimate', () => {
    const a = ['1', '2', '3', '4'], b = ['1', '9', '3', '4'];
    const out = preview.describePreviewChange(
      { settings: base, summary, ids: a, w: 2, h: 2 },
      { settings: Object.assign({}, base, { maxC: 12 }), summary, ids: b, w: 2, h: 2, scale: 25, estimated: true });
    expect([out.changedStitches, out.total, out.estimated]).toEqual([25, 100, true]);
  });
  test('cells are compared by thread number and colour, so DMC 310 and Anchor 310 differ', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'creator', 'usePreview.js'), 'utf8');
    expect(src).toContain("sm.id + '|' + (sm.id !== '__skip__' && sm.id !== '__empty__' && sm.rgb ? sm.rgb.join(',') : '')");
  });
});
