/* tests/cropReframe.test.js — framing a picture in Convert
   (reports/create-from-image-workflow, Phase A):
   - the crop dialog's shapes keep the dragged rectangle to Square, 4:3 or
     3:4 inside the picture, and choosing one starts from the largest that fits;
   - a crop looks at the cropped picture again (type, background, pixel-art
     size), without undoing what the user chose themselves. */

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

  test('the dialog offers Free, Square, 4:3 and 3:4, turns the picture, and closes on Escape', () => {
    const src = read('creator/CropModal.js');
    expect(src).toMatch(/id: "free"[\s\S]*id: "square"[\s\S]*id: "4:3"[\s\S]*id: "3:4"/);
    expect(src).toMatch(/"aria-label": "Turn left"/);
    expect(src).toMatch(/"aria-label": "Turn right"/);
    expect(src).toMatch(/e\.key === "Escape"/);
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
    expect(calls).toContainEqual(['applyPicturePreset', 'graphic', expect.objectContaining({ kind: 'graphic' })]);
    expect(calls).toContainEqual(['setSkipBg', true]);
    expect(calls.filter((c) => c[0] === 'addToast').map((c) => c[1]).join(' ')).toMatch(/looks like a graphic or logo/);
  });

  test('settings the user changed (Custom) and a background they chose are kept', () => {
    const { examine, calls } = loadExaminer(
      { pictureType: 'custom', skipBg: true, bgCol: [10, 20, 30], bgAutoSkippedRef: { current: false } },
      { w: 120, h: 120, kind: 'graphic', border: { rgb: [250, 250, 250] } });
    examine({ width: 120, height: 120 }, { reframed: true });
    expect(calls.some((c) => c[0] === 'applyPicturePreset')).toBe(false);
    expect(calls.some((c) => c[0] === 'setSkipBg' || c[0] === 'setBgCol')).toBe(false);
    expect(calls).toContainEqual(['setPictureInfo', expect.objectContaining({ kind: 'graphic' })]);
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
