/**
 * Picture-type presets and "threads" vs "symbols" (P2-5, audits IMG-01, IMG-02).
 */
const { loadSource } = require('./_helpers/loadSource');
const { detectUniformBorder } = require('../colour-utils.js');

const src = loadSource('creator/useCreatorState.js');
const block = src.slice(src.indexOf('var PICTURE_PRESETS = {'), src.indexOf('function threadCountsShort(c) {'));
const shortFn = src.match(/function threadCountsShort\(c\) \{[\s\S]*?\n\}/)[0];
// eslint-disable-next-line no-new-func
const api = new Function('window', block + shortFn + `
  return { PICTURE_PRESETS, PICTURE_PRESET_ORDER, picturePresetValues, analysePicture,
    guessPictureType, creatorThreadCounts, threadCountsSentence, threadCountsShort };`)({ detectUniformBorder });

function image(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fn(x, y), i = (y * w + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c.length > 3 ? c[3] : 255;
  }
  return { data, width: w, height: h };
}
// A white square with a red disc and a dark bar: a logo.
const logo = image(200, 200, (x, y) => {
  if ((x - 100) ** 2 + (y - 90) ** 2 < 60 ** 2) return [200, 30, 30];
  if (y > 160 && y < 175 && x > 40 && x < 160) return [20, 30, 40];
  return [255, 255, 255];
});
// Smooth gradients with noise: a photo.
let seed = 3;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 40) - 20;
const photo = image(300, 200, (x, y) => [x * 0.8 + rnd(), y + rnd(), (x + y) * 0.4 + rnd()].map((v) => Math.max(0, Math.min(255, Math.round(v)))));
// 24 x 24 with six colours: pixel art.
const PIX = [[170, 215, 240], [210, 40, 40], [250, 250, 250], [30, 30, 30], [240, 200, 160], [60, 150, 60]];
const pixel = image(24, 24, (x, y) => PIX[(Math.floor(x / 4) + Math.floor(y / 6)) % 6]);

describe('guessing the picture type', () => {
  test('a logo is a graphic', () => {
    const info = api.analysePicture(logo);
    expect(info.distinct).toBe(3);
    expect(info.border).not.toBeNull();
    expect(api.guessPictureType(info)).toBe('graphic');
  });
  test('a photo is a photo', () => {
    const info = api.analysePicture(photo);
    expect(info.distinct).toBeGreaterThan(1000);
    expect(api.guessPictureType(info)).toBe('photo');
  });
  test('a tiny picture with few colours is pixel art', () => {
    const info = api.analysePicture(pixel);
    expect(info.distinct).toBe(6);
    expect(api.guessPictureType(info)).toBe('pixel');
  });
  test('the picture\'s own size is kept when the analysis ran on a scaled copy', () => {
    const info = api.analysePicture(logo, 1200, 1200);
    expect([info.w, info.h]).toEqual([1200, 1200]);
  });
  test('transparent pixels are ignored', () => {
    const info = api.analysePicture(image(10, 10, (x) => (x < 5 ? [0, 0, 0, 0] : [10, 20, 30])));
    expect(info.distinct).toBe(1);
  });
  test('no picture is treated as a photo', () => {
    expect(api.guessPictureType(null)).toBe('photo');
  });
});

describe('preset values', () => {
  test('the order is Graphic or logo, Photo, Pixel art', () => {
    expect(api.PICTURE_PRESET_ORDER.map((id) => api.PICTURE_PRESETS[id].label)).toEqual(['Graphic or logo', 'Photo', 'Pixel art']);
  });
  test('Graphic: 8 threads, no shading, no blends, background skipped when the border is one colour', () => {
    const v = api.picturePresetValues('graphic', api.analysePicture(logo));
    expect(v).toEqual({ maxC: 8, dithMode: 'off', allowBlends: false, skipBg: true, bgCol: [255, 255, 255] });
    expect(api.picturePresetValues('graphic', api.analysePicture(photo)).skipBg).toBeUndefined();
  });
  test('Photo: 20 threads, subtle shading, blends, balanced cleanup', () => {
    expect(api.picturePresetValues('photo', null)).toEqual({ maxC: 20, dithMode: 'weak', allowBlends: true, cleanupStrength: 'balanced' });
  });
  test('Pixel art: the picture\'s colours (at most 30) at its own size (up to 500)', () => {
    expect(api.picturePresetValues('pixel', api.analysePicture(pixel))).toEqual({ dithMode: 'off', allowBlends: false, maxC: 6, sW: 24, sH: 24 });
    expect(api.picturePresetValues('pixel', { w: 64, h: 64, distinct: 300 }).maxC).toBe(30);
    expect(api.picturePresetValues('pixel', { w: 800, h: 600, distinct: 12 }).sW).toBeUndefined();
    expect(api.picturePresetValues('pixel', { w: 40, h: 40, distinct: 1 }).maxC).toBe(2);
  });
  test('an unknown preset sets nothing', () => {
    expect(api.picturePresetValues('custom', null)).toBeNull();
  });
});

describe('the hook', () => {
  test('choosing a preset only sets values, and changing one shows Custom', () => {
    expect(src).toMatch(/setPresetApplied\(\{ id: id, values: v \}\);/);
    const derive = src.match(/var pictureType = \(function \(\) \{[\s\S]*?\n {2}\}\)\(\);/)[0];
    const run = (applied, cur) => new Function('presetApplied', 'maxC', 'dithMode', 'allowBlends', 'skipBg', 'sW', 'sH', 'stitchCleanup', 'bgCol', // eslint-disable-line no-new-func
      derive + ' return pictureType;')(applied, cur.maxC, cur.dithMode, cur.allowBlends, cur.skipBg, cur.sW, cur.sH, cur.stitchCleanup, cur.bgCol);
    const photoV = api.picturePresetValues('photo', null);
    const cur = { maxC: 20, dithMode: 'weak', allowBlends: true, skipBg: false, sW: 80, sH: 80, stitchCleanup: { enabled: true, strength: 'balanced' } };
    expect(run({ id: 'photo', values: photoV }, cur)).toBe('photo');
    expect(run({ id: 'photo', values: photoV }, Object.assign({}, cur, { maxC: 21 }))).toBe('custom');
    expect(run({ id: 'photo', values: photoV }, Object.assign({}, cur, { stitchCleanup: { enabled: false, strength: 'balanced' } }))).toBe('custom');
    // Size isn't part of the Photo preset.
    expect(run({ id: 'photo', values: photoV }, Object.assign({}, cur, { sW: 120 }))).toBe('photo');
    expect(run(null, cur)).toBe('custom');

    // Graphic records the skipped background colour; picking another one is
    // a change (compared by value, not by array identity).
    const graphicV = api.picturePresetValues('graphic', api.analysePicture(logo));
    const g = { maxC: 8, dithMode: 'off', allowBlends: false, skipBg: true, sW: 80, sH: 80, stitchCleanup: { enabled: true, strength: 'gentle' }, bgCol: [255, 255, 255] };
    expect(run({ id: 'graphic', values: graphicV }, g)).toBe('graphic');
    expect(run({ id: 'graphic', values: graphicV }, Object.assign({}, g, { bgCol: [255, 255, 255, 255] }))).toBe('graphic');
    expect(run({ id: 'graphic', values: graphicV }, Object.assign({}, g, { bgCol: [240, 240, 240] }))).toBe('custom');
  });

  test('Preferences can turn the guess off, so its own defaults apply', () => {
    expect(loadSource('user-prefs.js')).toMatch(/creatorGuessPictureType:\s*true,/);
    const prefs = loadSource('preferences-modal.js');
    expect(prefs).toMatch(/usePref\("creatorGuessPictureType", true\)/);
    expect(prefs).toMatch(/label: "Guess the picture type"/);
    const io = loadSource('creator/useProjectIO.js');
    expect(io).toMatch(/UserPrefs\.get\("creatorGuessPictureType"\) !== false/);
    expect(io).toMatch(/if \(guess && state\.applyPicturePreset[\s\S]{0,120}state\.applyPicturePreset\(window\.guessPictureType\(info\), info\);/);
  });

  test('the picture-type radios have one Tab stop and arrow keys', () => {
    const sb = loadSource('creator/Sidebar.js');
    const sec = sb.slice(sb.indexOf('var pictureTypeSection'), sb.indexOf('// ── Palette section'));
    expect(sec).toMatch(/tabIndex: tabbable \? 0 : -1/);
    expect(sec).toMatch(/e\.key === "ArrowRight" \|\| e\.key === "ArrowDown"/);
    expect(sec).toMatch(/gen\.applyPicturePreset\(next\);/);
  });
  test('the guess is applied on upload, before a resumed draft puts its own settings back', () => {
    const io = loadSource('creator/useProjectIO.js');
    expect(io).toMatch(/state\.applyPicturePreset\(window\.guessPictureType\(info\), info\);/);
    expect(io).toMatch(/examinePicture\(i\);[^\n]*startDraft\(f\);/);
    expect(io).toMatch(/examinePicture\(scaledImg\);[^\n]*startDraft\(f\);/);
    expect(src).toMatch(/setPictureInfo\(null\); setPresetApplied\(null\);/);
  });
  test('the Convert panel starts with the question', () => {
    const sb = loadSource('creator/Sidebar.js');
    expect(sb).toMatch(/"What kind of picture is this\?"/);
    const panel = sb.slice(sb.indexOf('var createPanel = h("div"'));
    expect(panel.indexOf('pictureTypeSection')).toBeLessThan(panel.indexOf('dimSection'));
  });
});

describe('threads and symbols', () => {
  const pal = [
    { id: '310', type: 'solid', count: 10 },
    { id: '550', type: 'solid', count: 5 },
    { id: '310+550', type: 'blend', count: 4, threads: [{ id: '310' }, { id: '550' }] },
    { id: '321+666', type: 'blend', count: 2, threads: [{ id: '321' }, { id: '666' }] },
    { id: '__skip__', type: 'solid', count: 30 },
    { id: '799', type: 'solid', count: 0 },
  ];
  test('a blend is one symbol made of two threads', () => {
    expect(api.creatorThreadCounts(pal)).toEqual({ threads: 4, symbols: 4, blends: 2 });
    expect(api.creatorThreadCounts([{ id: '310+550', type: 'blend', count: 1 }])).toEqual({ threads: 2, symbols: 1, blends: 1 });
    expect(api.creatorThreadCounts(null)).toEqual({ threads: 0, symbols: 0, blends: 0 });
  });
  test('wording', () => {
    expect(api.threadCountsSentence({ threads: 24, symbols: 40, blends: 16 })).toBe('24 threads, 40 chart symbols (16 are blends of two threads)');
    expect(api.threadCountsSentence({ threads: 24, symbols: 24, blends: 0 })).toBe('24 threads');
    expect(api.threadCountsSentence({ threads: 2, symbols: 3, blends: 1 })).toBe('2 threads, 3 chart symbols (1 is a blend of two threads)');
    expect(api.threadCountsShort({ threads: 24, symbols: 40, blends: 16 })).toBe('24 threads · 40 symbols');
    expect(api.threadCountsShort({ threads: 1, symbols: 1, blends: 0 })).toBe('1 thread · 1 symbol');
  });
  test('the success toast, Palette header and summaries use it', () => {
    expect(src).toMatch(/var counts = threadCountsSentence\(creatorThreadCounts\(result\.pal\)\);/);
    const sb = loadSource('creator/Sidebar.js');
    expect(sb).toMatch(/className:"palette-counts"[^\n]*window\.threadCountsShort\(window\.creatorThreadCounts\(displayPal\)\)/);
    expect(sb).toMatch(/label:"Threads \(max\)"/);
    expect(sb).toMatch(/helpText:"Each thread is one colour of stranded cotton"/);
    expect(sb).not.toMatch(/" colours used"/);
  });
});
