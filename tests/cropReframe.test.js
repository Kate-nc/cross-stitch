/* tests/cropReframe.test.js — framing a picture in Convert
   (reports/create-from-image-workflow, Phase A):
   - Frame the picture's crop shapes keep the dragged rectangle to Square,
     4:3 or 3:4 inside the picture, and choosing one starts from the largest
     that fits;
   - a crop looks at the cropped picture again (type, background, pixel-art
     size), without undoing what the user chose themselves;
   - a new picture opens on Frame the picture unless Preferences turn it off
     or a draft is being continued. */

const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function loadCanvasInteraction() {
  global.window = global;
  global.React = { useRef: (v) => ({ current: v }) };
  // eslint-disable-next-line no-eval
  eval(read('creator/useCanvasInteraction.js'));
  return global.window;
}

describe('moving and resizing the crop box', () => {
  const w = loadCanvasInteraction();
  const bounds = { w: 400, h: 300 };
  const rect = { x: 100, y: 50, w: 120, h: 90 };

  test('a drag inside moves the box, never past the picture\'s edge', () => {
    expect(w.moveCropRect(rect, 30, -20, bounds)).toEqual({ x: 130, y: 30, w: 120, h: 90 });
    expect(w.moveCropRect(rect, 1000, 1000, bounds)).toEqual({ x: 280, y: 210, w: 120, h: 90 });
    expect(w.moveCropRect(rect, -1000, -1000, bounds)).toEqual({ x: 0, y: 0, w: 120, h: 90 });
  });

  test('a corner resizes from the opposite corner; an edge moves only its side', () => {
    // South-east to (300, 200): north-west corner stays at (100, 50).
    expect(w.resizeCropRect(rect, 'se', 300, 200, null, bounds)).toEqual({ x: 100, y: 50, w: 200, h: 150 });
    // North-west to (60, 20): south-east corner stays at (220, 140).
    expect(w.resizeCropRect(rect, 'nw', 60, 20, null, bounds)).toEqual({ x: 60, y: 20, w: 160, h: 120 });
    expect(w.resizeCropRect(rect, 'e', 380, 999, null, bounds)).toEqual({ x: 100, y: 50, w: 280, h: 90 });
    expect(w.resizeCropRect(rect, 'n', 0, 10, null, bounds)).toEqual({ x: 100, y: 10, w: 120, h: 130 });
    // Dragged past the opposite side, the box turns over rather than vanishing.
    expect(w.resizeCropRect(rect, 'e', 60, 0, null, bounds)).toEqual({ x: 60, y: 50, w: 40, h: 90 });
  });

  test('with a shape, resizing keeps it and stays inside the picture', () => {
    const sq = { x: 100, y: 50, w: 100, h: 100 };
    const r = w.resizeCropRect(sq, 'se', 260, 180, 1, bounds);
    expect(r.w).toBeCloseTo(r.h, 6);
    expect(r).toEqual({ x: 100, y: 50, w: 160, h: 160 });
    // An edge acts as a corner, so the shape is kept.
    const e = w.resizeCropRect(sq, 'e', 250, 0, 1, bounds);
    expect(e.w).toBeCloseTo(e.h, 6);
    // Too big for the picture: the largest square that fits.
    const big = w.resizeCropRect(sq, 'se', 999, 999, 1, bounds);
    expect(big).toEqual({ x: 100, y: 50, w: 250, h: 250 });
  });

  test('arrow keys move the box; with resize they grow or shrink it, keeping a shape', () => {
    expect(w.nudgeCropRect(rect, 'ArrowRight', 2, false, null, bounds)).toEqual({ x: 102, y: 50, w: 120, h: 90 });
    expect(w.nudgeCropRect(rect, 'ArrowUp', 10, false, null, bounds)).toEqual({ x: 100, y: 40, w: 120, h: 90 });
    expect(w.nudgeCropRect(rect, 'ArrowRight', 10, true, null, bounds)).toEqual({ x: 100, y: 50, w: 130, h: 90 });
    expect(w.nudgeCropRect(rect, 'ArrowUp', 10, true, null, bounds)).toEqual({ x: 100, y: 50, w: 120, h: 80 });
    // Never smaller than 10 px.
    expect(w.nudgeCropRect({ x: 0, y: 0, w: 12, h: 12 }, 'ArrowLeft', 10, true, null, bounds, 10)).toEqual({ x: 0, y: 0, w: 10, h: 12 });
    const sq = w.nudgeCropRect({ x: 0, y: 0, w: 100, h: 75 }, 'ArrowDown', 10, true, 4 / 3, bounds, 10);
    expect(sq.w / sq.h).toBeCloseTo(4 / 3, 6);
    expect(sq.w).toBe(110);
    // Other keys change nothing.
    expect(w.nudgeCropRect(rect, 'Enter', 10, false, null, bounds)).toBe(rect);
  });

  test('handles: four corners, plus four edges for a free shape (FrameView)', () => {
    expect(w.CROP_HANDLES.corners.sort()).toEqual(['ne', 'nw', 'se', 'sw']);
    expect(w.CROP_HANDLES.edges.sort()).toEqual(['e', 'n', 's', 'w']);
    const src = read('creator/FrameView.js');
    expect(src).toMatch(/CROP_HANDLES\.corners\.concat\(shape === "free" \? window\.CROP_HANDLES\.edges : \[\]\)/);
  });

  test('a drag on the box moves it, on a handle resizes it, elsewhere draws a new one', () => {
    const src = read('creator/useCanvasInteraction.js');
    expect(src).toMatch(/closest\("\[data-crop-handle\]"\)/);
    expect(src).toMatch(/mode: "resize"/);
    expect(src).toMatch(/mode: "move"/);
    expect(src).toMatch(/mode: "draw"/);
    // A second finger or a cancelled pointer puts a moved box back.
    expect(src).toMatch(/function abandonCropDrag\(\)[\s\S]{0,200}s && s\.rect \? s\.rect : null/);
  });
});

describe('the background stripes in Frame', () => {
  function loadFrameView(stubs) {
    global.window = global;
    global.React = { useRef: (v) => ({ current: v }), createElement: () => null };
    Object.assign(global, stubs);
    // eslint-disable-next-line no-eval
    eval(read('creator/FrameView.js'));
    return global.window;
  }

  test('are worked out on Generate\'s grid, with Sharpen details, and say which picture and size they are for', () => {
    const calls = [];
    const w = loadFrameView({
      gridPixels: (img, sw, sh, opts) => { calls.push(opts); return { data: new Uint8ClampedArray(sw * sh * 4) }; },
      // The first two stitches are background.
      prepareConversionPixels: (data, sw, sh) => { const m = new Uint8Array(sw * sh).fill(1); m[0] = 0; m[1] = 0; return m; }
    });
    const img = { naturalWidth: 40, naturalHeight: 30 };
    const info = w.frameBackgroundMask(img, 4, 3, { bri: 5, con: 0, sat: 0, preSharpen: true, preSharpenAmount: 1.5, skipBg: true, bgCol: [255, 255, 255], bgTh: 15 });
    expect(calls[0]).toEqual({ bri: 5, con: 0, sat: 0, preSharpenOpts: { amount: 1.5 } });
    expect(info.count).toBe(2);
    expect(Array.from(info.mask)).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect([info.w, info.h, info.img]).toEqual([4, 3, img]);
    w.frameBackgroundMask(img, 4, 3, { preSharpen: false, skipBg: true, bgCol: [0, 0, 0], bgTh: 15 });
    expect(calls[1].preSharpenOpts).toBeNull();
  });

  test('stripes for another picture or size are not drawn, and none while picking the colour', () => {
    const src = read('creator/FrameView.js');
    expect(src).toMatch(/bgFresh = !!\(bgInfo && bgInfo\.img === gen\.img && bgInfo\.w === sW && bgInfo\.h === sH\)/);
    expect(src).toMatch(/bgActive && bgFresh && showBg && !gen\.pickBg && h\(FrameBackgroundOverlay/);
    // Redrawn when the picture's box or the theme changes, not only on a window resize.
    expect(src).toMatch(/new ResizeObserver\(bump\)/);
    expect(src).toMatch(/attributeFilter: \["data-theme", "class"\]/);
  });
});

describe('crop shapes', () => {
  const w = loadCanvasInteraction();
  const bounds = { w: 400, h: 300 };

  test('free: the rectangle between the two corners, kept inside the picture', () => {
    expect(w.constrainCropRect({ x: 50, y: 40 }, 150, 100, null, bounds)).toEqual({ x: 50, y: 40, w: 100, h: 60 });
    expect(w.constrainCropRect({ x: 50, y: 40 }, -20, 500, null, bounds)).toEqual({ x: 0, y: 40, w: 50, h: 260 });
  });

  test('square: the longer drag sets the size, in either direction', () => {
    expect(w.constrainCropRect({ x: 50, y: 40 }, 150, 70, 1, bounds)).toEqual({ x: 50, y: 40, w: 100, h: 100 });
    expect(w.constrainCropRect({ x: 200, y: 200 }, 170, 100, 1, bounds)).toEqual({ x: 100, y: 100, w: 100, h: 100 });
  });

  test('a shape stops at the edge of the picture and keeps its shape', () => {
    const r = w.constrainCropRect({ x: 300, y: 100 }, 400, 300, 4 / 3, bounds);
    expect(r.x + r.w).toBeLessThanOrEqual(400);
    expect(r.y + r.h).toBeLessThanOrEqual(300);
    expect(r.w / r.h).toBeCloseTo(4 / 3, 6);
    const p = w.constrainCropRect({ x: 10, y: 10 }, 390, 290, 3 / 4, bounds);
    expect(p.h).toBeCloseTo(290, 6);
    expect(p.w / p.h).toBeCloseTo(3 / 4, 6);
  });

  test('choosing a shape starts from the largest one that fits, centred', () => {
    expect(w.centredCropRect(bounds, 1)).toEqual({ x: 50, y: 0, w: 300, h: 300 });
    const land = w.centredCropRect({ w: 300, h: 400 }, 4 / 3);
    expect(land).toEqual({ x: 0, y: 87.5, w: 300, h: 225 });
    expect(w.centredCropRect(bounds, null)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });

  test('Frame offers Free, Square, 4:3 and 3:4, turning, Undo, and Escape to clear', () => {
    const src = read('creator/FrameView.js');
    expect(src).toMatch(/id: "free"[\s\S]*id: "square"[\s\S]*id: "4:3"[\s\S]*id: "3:4"/);
    expect(src).toMatch(/"aria-label": "Turn left"/);
    expect(src).toMatch(/"aria-label": "Turn right"/);
    expect(src).toMatch(/"aria-label": "Undo crop or turn"/);
    expect(src).toMatch(/e\.key === "Escape"/);
    // The crop dialog it replaced is gone.
    expect(fs.existsSync(path.join(__dirname, '..', 'creator/CropModal.js'))).toBe(false);
  });

  test('Frame shows brightness, contrast and saturation on the picture as Generate applies them', () => {
    global.document = global.document || undefined;
    // eslint-disable-next-line no-eval
    eval(read('creator/FrameView.js').replace(/^/, 'var React = {};\n'));
    expect(window.framePictureFilter(0, 0, 0)).toBe('none');
    expect(window.framePictureFilter(10, -20, 5)).toBe('brightness(110%) contrast(80%) saturate(105%)');
    expect(read('creator/useCreatorState.js')).toMatch(/brightness\(\(100\+bri\)%\) contrast\(\(100\+con\)%\) saturate\(\(100\+sat\)%\)/);
  });
});

describe('a crop looks at the cropped picture again', () => {
  afterAll(() => { delete global.document; });
  // useProjectIO with a stub React, to reach its picture check.
  function loadExaminer(stateOverrides, analysis) {
    global.window = global;
    global.React = {
      useRef: (v) => ({ current: v }), useEffect: () => {}, useCallback: (f) => f,
      useMemo: (f) => f(), useState: (v) => [typeof v === 'function' ? v() : v, () => {}]
    };
    global.UserPrefs = { get: () => undefined };
    const calls = [];
    const record = (name) => (...args) => { calls.push([name].concat(args)); };
    const state = Object.assign({
      pictureExaminerRef: { current: null }, bgAutoSkippedRef: { current: false },
      skipBg: false, bgCol: [255, 255, 255], pictureType: 'photo',
      presetApplied: { id: 'photo', values: {}, guessed: true }, presetUntouched: true,
      setSkipBg: record('setSkipBg'), setBgCol: record('setBgCol'), setPictureInfo: record('setPictureInfo'),
      applyPicturePreset: record('applyPicturePreset'), addToast: record('addToast')
    }, stateOverrides);
    const st = new Proxy(state, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && /^set[A-Z]/.test(k) ? () => {} : undefined)) });
    // eslint-disable-next-line no-eval
    eval(read('creator/useProjectIO.js'));
    // The check draws the picture small and passes its pixels to analysePicture.
    global.document = { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: [], width: 1, height: 1 }) }) }) };
    window.analysePicture = () => analysis;
    window.guessPictureType = (info) => info.kind;
    window.PICTURE_PRESETS = { photo: {}, graphic: {}, pixel: {} };
    try { window.useProjectIO(st, { editHistory: [] }, {}); } catch (_) { /* effects are stubs */ }
    return { examine: state.pictureExaminerRef.current, calls };
  }

  test('the hook hands its picture check to applyCrop', () => {
    const io = read('creator/useProjectIO.js');
    expect(io).toMatch(/state\.pictureExaminerRef\.current = examinePicture;/);
    const ci = read('creator/useCanvasInteraction.js');
    expect(ci).toMatch(/examine\(newImg, \{ reframed: true \}\)/);
  });

  test('untouched settings follow the cropped picture, and say so when its type changes', () => {
    const { examine, calls } = loadExaminer({ pictureType: 'photo' }, { w: 120, h: 120, kind: 'graphic', border: { rgb: [250, 250, 250] } });
    expect(typeof examine).toBe('function');
    examine({ width: 120, height: 120 }, { reframed: true });
    expect(calls).toContainEqual(['applyPicturePreset', 'graphic', expect.objectContaining({ kind: 'graphic' }), { guessed: true }]);
    expect(calls).toContainEqual(['setSkipBg', true]);
    expect(calls.filter((c) => c[0] === 'addToast').map((c) => c[1]).join(' ')).toMatch(/looks like a graphic or logo/);
  });

  test('settings the user changed and a background they chose are kept', () => {
    const { examine, calls } = loadExaminer(
      { pictureType: 'photo', presetUntouched: false, skipBg: true, bgCol: [10, 20, 30], bgAutoSkippedRef: { current: false } },
      { w: 120, h: 120, kind: 'graphic', border: { rgb: [250, 250, 250] } });
    examine({ width: 120, height: 120 }, { reframed: true });
    expect(calls.some((c) => c[0] === 'applyPicturePreset')).toBe(false);
    expect(calls.some((c) => c[0] === 'setSkipBg' || c[0] === 'setBgCol')).toBe(false);
    expect(calls).toContainEqual(['setPictureInfo', expect.objectContaining({ kind: 'graphic' })]);
  });

  test('a type the user chose is kept after a crop', () => {
    const { examine, calls } = loadExaminer(
      { pictureType: 'photo', presetApplied: { id: 'photo', values: {} }, presetUntouched: true },
      { w: 120, h: 120, kind: 'graphic', border: null });
    examine({ width: 120, height: 120 }, { reframed: true });
    expect(calls.some((c) => c[0] === 'applyPicturePreset')).toBe(false);
  });

  test('a new picture is guessed, and the guess is marked as the Creator\'s', () => {
    const { examine, calls } = loadExaminer({ pictureType: null, presetApplied: null, presetUntouched: false },
      { w: 120, h: 120, kind: 'photo', border: null });
    examine({ width: 120, height: 120 });
    expect(calls).toContainEqual(['applyPicturePreset', 'photo', expect.objectContaining({ kind: 'photo' }), { guessed: true }]);
  });

  test('a background skipped automatically is stitched again when the crop has no plain border', () => {
    const auto = { current: true };
    const { examine, calls } = loadExaminer(
      { pictureType: 'photo', skipBg: true, bgCol: [250, 250, 250], bgAutoSkippedRef: auto },
      { w: 120, h: 90, kind: 'photo', border: null });
    examine({ width: 120, height: 90 }, { reframed: true });
    expect(calls).toContainEqual(['setSkipBg', false]);
    expect(auto.current).toBe(false);
    expect(calls.filter((c) => c[0] === 'addToast').map((c) => c[1]).join(' ')).toMatch(/no plain border/);
  });

  test('the same plain background after a crop does not announce itself again', () => {
    const { examine, calls } = loadExaminer(
      { pictureType: 'photo', skipBg: true, bgCol: [250, 250, 250], bgAutoSkippedRef: { current: true } },
      { w: 120, h: 90, kind: 'photo', border: { rgb: [250, 250, 250] } });
    examine({ width: 120, height: 90 }, { reframed: true });
    expect(calls.filter((c) => c[0] === 'addToast')).toEqual([]);
  });
});

describe('which part of Convert a picture opens on', () => {
  const io = read('creator/useProjectIO.js');
  test('Frame the picture, unless Preferences turn it off or a draft is continued', () => {
    const fn = io.match(/function openingStage\(resuming\) \{[\s\S]*?\n {2}\}/)[0];
    const run = (resuming, pref) => new Function('UserPrefs', fn + ' return openingStage(' + resuming + ');')({ get: () => pref }); // eslint-disable-line no-new-func
    expect(run(false, undefined)).toBe('frame');
    expect(run(false, true)).toBe('frame');
    expect(run(false, false)).toBe('make');
    expect(run(true, true)).toBe('make');
    expect(io).toMatch(/examinePicture\(i\); if \(state\.setConvertStage\) state\.setConvertStage\(openingStage\(resumingDraft\)\);/);
    // A saved project never opens on Frame.
    expect(io).toMatch(/function processLoadedProject\(project\) \{[\s\S]{0,300}state\.setConvertStage\("make"\)/);
    expect(read('user-prefs.js')).toMatch(/creatorShowFrameStep:\s*true,/);
  });

  test('a crop is kept in the Convert draft', () => {
    expect(io).toMatch(/if \(reframed\) reframeDraft\(imgEl\);/);
  });
});
