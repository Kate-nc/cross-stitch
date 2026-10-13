// Phase 5 batch 2 (TRACK-09): the pattern overview. The pure core (block size, block colour) and how it is wired in.
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const CU = require('../colour-utils.js');
global.window = global.window || global;
window.doneStitchLook = CU.doneStitchLook; window.pendingStitchLook = CU.pendingStitchLook;
const core = require('../tracker-minimap.js');

describe('block size and block colour', () => {
  test('the map is never more than 200 pixels on its longer side', () => {
    for (const [w, h] of [[10, 10], [200, 80], [201, 10], [300, 300], [500, 500], [1000, 400], [4096, 3000]]) {
      const bs = core.blockSize(w, h);
      expect(Math.ceil(Math.max(w, h) / bs)).toBeLessThanOrEqual(200);
    }
    expect(core.blockSize(120, 90)).toBe(1);
    expect(core.blockSize(300, 300)).toBe(2);
    expect(core.blockSize(500, 500)).toBe(3);
  });
  const cmap = { a: { rgb: [200, 20, 20] }, b: { rgb: [20, 20, 200] } };
  const pat = [];
  for (let i = 0; i < 16; i++) pat.push({ id: i % 2 ? 'a' : 'b' });
  const px = (done, bx, by, bs = 2) => { const o = new Uint8ClampedArray(4); core.blockColour(pat, cmap, done, 4, 4, bs, bx, by, o, 0); return Array.from(o); };
  const L = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  test('a done block is darker than the same block not done, by at least 40 (clear in greyscale)', () => {
    const none = new Array(16).fill(0), all = new Array(16).fill(1);
    expect(L(px(none, 0, 0)) - L(px(all, 0, 0))).toBeGreaterThanOrEqual(40);
  });
  test('half the cells done lands between the two', () => {
    const none = new Array(16).fill(0), all = new Array(16).fill(1), half = new Array(16).fill(0); half[0] = 1; half[1] = 1;
    const l = L(px(half, 0, 0)); expect(l).toBeLessThan(L(px(none, 0, 0))); expect(l).toBeGreaterThan(L(px(all, 0, 0)));
  });
  test('only the block holding a changed cell changes', () => {
    const d0 = new Array(16).fill(0), d1 = d0.slice(); d1[5] = 1;           // cell (1,1) is in block (0,0)
    expect(px(d1, 0, 0)).not.toEqual(px(d0, 0, 0));
    expect(px(d1, 1, 0)).toEqual(px(d0, 1, 0)); expect(px(d1, 0, 1)).toEqual(px(d0, 0, 1)); expect(px(d1, 1, 1)).toEqual(px(d0, 1, 1));
  });
  test('cells that are not stitches show the fabric, and an edge block averages only the cells it has', () => {
    const skip = [{ id: '__skip__' }, { id: '__skip__' }, { id: '__skip__' }, { id: '__skip__' }];
    const o = new Uint8ClampedArray(4); core.blockColour(skip, cmap, null, 2, 2, 2, 0, 0, o, 0);
    expect(Array.from(o)).toEqual([core.FABRIC[0], core.FABRIC[1], core.FABRIC[2], 255]);
    const o2 = new Uint8ClampedArray(4); core.blockColour(pat, cmap, null, 4, 4, 3, 1, 1, o2, 0);   // a 1x1 corner block
    expect(o2[3]).toBe(255);
  });
  test('the same RGB under two brands gives the same colour (no id in the key)', () => {
    const c2 = { x: { rgb: [200, 20, 20] }, y: { rgb: [200, 20, 20] } };
    const p2 = [{ id: 'x' }, { id: 'y' }, { id: 'x' }, { id: 'y' }];
    const a = new Uint8ClampedArray(4), b = new Uint8ClampedArray(4);
    core.blockColour(p2, c2, null, 2, 2, 1, 0, 0, a, 0); core.blockColour(p2, c2, null, 2, 2, 1, 1, 0, b, 0);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('review fixes', () => {
  test('two brands that share an id keep their own colours: the cell\'s RGB wins over the palette lookup', () => {
    const cm = { '310': { rgb: [0, 0, 0] } };
    const p = [{ id: '310', rgb: [0, 0, 0] }, { id: '310', rgb: [188, 151, 106] }];
    const a = new Uint8ClampedArray(4), b = new Uint8ClampedArray(4);
    core.blockColour(p, cm, null, 2, 1, 1, 0, 0, a, 0); core.blockColour(p, cm, null, 2, 1, 1, 1, 0, b, 0);
    expect(Array.from(a)).not.toEqual(Array.from(b));
    const tan = CU.pendingStitchLook([188, 151, 106], 0.5).fill.match(/\d+/g).map(Number);
    expect(Array.from(b).slice(0, 3)).toEqual(tan);
  });
  test('a local render keeps the newer done array that cellsChanged recorded', () => {
    const src = read('tracker-minimap.js');
    expect(src).toMatch(/if \(s\.propDone !== done\) \{ s\.propDone = done; s\.latestDone = done; \}/);
    expect(src).not.toMatch(/\n    s\.latestDone = done;\n/);
    expect(src).toMatch(/if \(!s\.built \|\| s\.seenDone === s\.latestDone\) return;/);
  });
  test('every zoom-out control can reach the lowest zoom Fit can set (no 0.3 floor left)', () => {
    const t = read('tracker-app.js');
    expect(t).toMatch(/const MIN_STITCH_ZOOM=0\.05;/);
    expect(t).not.toMatch(/Math\.max\(0\.3,\+\(z-/);
    expect(t).not.toMatch(/Math\.min\(maxZoom,Math\.max\(0\.3,/);
    expect((t.match(/Math\.max\(MIN_STITCH_ZOOM,/g) || []).length).toBeGreaterThanOrEqual(5);
  });
});

describe('wiring', () => {
  const tracker = read('tracker-app.js');
  test('the Tracker mounts the overview with the pattern, the scroll box and the two chart calls', () => {
    expect(tracker).toMatch(/React\.createElement\(window\.TrackerMinimap,\{pat,cmap,sW,sH,done,scrollRef:stitchScrollRef,getView:minimapGetView,onJump:minimapJump,apiRef:minimapApiRef/);
  });
  test('marks reach the overview through paintDoneChanges, before anything else can return', () => {
    expect(tracker).toMatch(/function paintDoneChanges\(changes,nd\)\{\n  if\(nd&&minimapApiRef\.current\)minimapApiRef\.current\.cellsChanged\(changes,nd\);/);
  });
  test('the visible range and the jump are inverses (the sticky ruler covers the first G pixels)', () => {
    expect(tracker).toMatch(/const x0=\(el\.scrollLeft\+off\.x\)\/scs/);
    expect(tracker).toMatch(/el\.scrollLeft=Math\.max\(0,cx\*scs-\(el\.clientWidth-G\)\/2-off\.x\)/);
  });
  test('it is a preference, on by default, with a View tab control and a Preferences row', () => {
    expect(read('user-prefs.js')).toMatch(/trackerMinimap:\s+true/);
    expect(tracker).toMatch(/useTrackerPref\('trackerMinimap',true\)/);
    expect(tracker).toMatch(/Pattern overview<\/div>/);
    expect(read('preferences-modal.js')).toMatch(/usePref\("trackerMinimap", true\)/);
  });
  test('the file is loaded by stitch.html and index.html and precached by the service worker', () => {
    expect(read('stitch.html')).toMatch(/<script src="tracker-minimap\.js"><\/script>/);
    expect(read('index.html')).toMatch(/<script src="tracker-minimap\.js"><\/script>/);
    expect(read('sw.js')).toMatch(/'\.\/tracker-minimap\.js'/);
  });
  test('the component frees its canvas on a new pattern and never draws on the chart canvas', () => {
    const src = read('tracker-minimap.js');
    expect(src).toMatch(/c\.width = 0; c\.height = 0;/);
    expect(src).not.toMatch(/stitchRef|drawStitch/);
  });
  test('help and the changelog describe it', () => {
    expect(read('help-drawer.js')).toMatch(/\["Pattern overview"/);
    expect(read('version.js')).toMatch(/A pattern overview in the corner of the Tracker chart/);
  });
  test('Fit can reach a one-pixel cell, so a 300-stitch side fits a 600 px box', () => {
    expect(read('useCanvasOverlays.js')).toMatch(/var SCS_MIN\s+= 1;/);
  });
});
