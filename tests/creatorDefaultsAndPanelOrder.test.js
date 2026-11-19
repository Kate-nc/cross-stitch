// P0-4 (audit IMG-01 defaults, IMG-06): stitchable defaults, automatic
// plain-background skip, and the Convert panel order.
const { loadSource } = require('./_helpers/loadSource');
const { detectUniformBorder } = require('../colour-utils.js');

function makeImage(w, h, fill) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = fill(x, y);
      const i = (y * w + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c.length > 3 ? c[3] : 255;
    }
  }
  return { data, width: w, height: h };
}

// Seeded PRNG so the "photo" is the same on every run.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

describe('detectUniformBorder', () => {
  test('a logo on white returns white', () => {
    // logo.png-like: white field, coloured shapes in the middle.
    const img = makeImage(400, 400, (x, y) => {
      const dx = x - 200, dy = y - 200;
      if (dx * dx + dy * dy < 120 * 120) return [200, 40, 40];
      if (x > 150 && x < 250 && y > 330 && y < 360) return [30, 60, 160];
      return [255, 255, 255];
    });
    const found = detectUniformBorder(img);
    expect(found).not.toBeNull();
    expect(found.rgb).toEqual([255, 255, 255]);
    expect(found.share).toBeGreaterThanOrEqual(0.85);
  });

  test('slight noise on the background still counts (within ΔE 8)', () => {
    const r = rng(7);
    const img = makeImage(200, 150, () => {
      const n = Math.round((r() - 0.5) * 6);
      return [240 + n, 235 + n, 220 + n];
    });
    const found = detectUniformBorder(img);
    expect(found).not.toBeNull();
    found.rgb.forEach((v, i) => expect(Math.abs(v - [240, 235, 220][i])).toBeLessThanOrEqual(4));
  });

  test('a noisy photo-like image returns null', () => {
    const r = rng(42);
    const img = makeImage(300, 200, () => [Math.floor(r() * 256), Math.floor(r() * 256), Math.floor(r() * 256)]);
    expect(detectUniformBorder(img)).toBeNull();
  });

  test('a smooth gradient border returns null', () => {
    const img = makeImage(300, 200, (x, y) => [Math.round(x / 300 * 255), Math.round(y / 200 * 255), 128]);
    expect(detectUniformBorder(img)).toBeNull();
  });

  test('just under 85% of the border in one colour returns null', () => {
    // Left 20% of every row is black, rest white: the border is ~70% white.
    const img = makeImage(200, 200, (x) => (x < 40 ? [0, 0, 0] : [255, 255, 255]));
    expect(detectUniformBorder(img)).toBeNull();
  });

  test('transparent pixels are ignored; an empty or fully transparent image returns null', () => {
    expect(detectUniformBorder(makeImage(50, 50, () => [0, 0, 0, 0]))).toBeNull();
    expect(detectUniformBorder(null)).toBeNull();
    expect(detectUniformBorder({ data: new Uint8ClampedArray(0), width: 0, height: 0 })).toBeNull();
  });
});

describe('defaults', () => {
  test('UserPrefs.DEFAULTS: 15 colours, no dithering, blends allowed', () => {
    const src = loadSource('user-prefs.js');
    expect(src).toMatch(/creatorDefaultPaletteSize:\s*15,/);
    expect(src).toMatch(/creatorDefaultDithering:\s*"off",/);
    expect(src).toMatch(/creatorAllowBlends:\s*true,/);
  });

  test('the Preferences panel and the Creator fall back to the same values', () => {
    const prefs = loadSource('preferences-modal.js');
    expect(prefs).toMatch(/usePref\("creatorDefaultPaletteSize", 15\)/);
    expect(prefs).toMatch(/usePref\("creatorDefaultDithering", "off"\)/);
    const st = loadSource('creator/useCreatorState.js');
    expect(st).toMatch(/loadUserPref\("creatorDefaultPaletteSize", 15\)/);
  });

  test('a new image runs the background check', () => {
    const io = loadSource('creator/useProjectIO.js');
    // The picture is looked at once (P2-5): analysePicture includes the
    // border check, then the offer and the picture-type guess follow.
    expect(io).toMatch(/window\.analysePicture\(data, imgEl\.width, imgEl\.height\)/);
    expect(io).toMatch(/window\.detectUniformBorder\(data\)/);
    expect(io).toMatch(/offerBackground\(info \? info\.border : null, reframed\)/);
  });

  test('a plain background is offered, not applied, for every type of picture', () => {
    const io = loadSource('creator/useProjectIO.js');
    // The subject can touch the background (a pale shirt on a pale wall), so
    // the stitcher opts in from a toast. Nothing depends on the picture type.
    const at = io.indexOf('function offerBackground('), fn = io.slice(at, io.indexOf('state.pictureExaminerRef.current = examinePicture', at));
    expect(fn).not.toMatch(/guessPictureType|looksLikePhoto/);
    expect(fn).toMatch(/label: "Leave it unstitched", onClick: function \(\) \{[\s\S]*?state\.setBgCol\(found\.rgb\);\n\s*state\.setSkipBg\(true\);/);
    expect(fn).toMatch(/state\.setShowBackground\(true\)/);
    expect(io).not.toMatch(/Background left unstitched\./);
    // An offer belongs to its picture: a new picture or project withdraws it,
    // and a stale button does nothing (it would apply one picture's
    // background colour to another).
    expect(fn).toMatch(/if \(bgOfferRef\.current !== offer\) return;/);
    // examinePicture offers; the offer withdraws the previous one first.
    expect(io).toMatch(/function examinePicture\(imgEl, opts\) \{[\s\S]*?offerBackground\(/);
    expect(fn).toMatch(/cancelBackgroundOffer\(\);/);
    // After a crop, a background the stitcher left out stays when the border
    // is the same colour, or when they chose it themselves.
    expect(fn).toMatch(/if \(reframed && state\.skipBg && !accepted\) return;/);
    const load = io.slice(io.indexOf('function processLoadedProject(project) {'));
    expect(load.slice(0, 1600)).toMatch(/if\(!project\)return;[\s\S]*?\n    cancelBackgroundOffer\(\);/);
    expect(io).toMatch(/function cancelBackgroundOffer\(\) \{[\s\S]*?state\.dismissToast\(offer\.toastId\)/);
    // Nothing is switched on before the stitcher chooses it.
    expect(fn.slice(0, fn.indexOf('label: "Leave it unstitched"'))).not.toMatch(/state\.setSkipBg\(true\)/);
    expect((io.match(/examinePicture\((i|scaledImg)\)/g) || []).length).toBe(2);
    // No preset switches it on either.
    expect(loadSource('creator/useCreatorState.js')).not.toMatch(/skipBorderBackground/);
  });
});

describe('Convert panel order', () => {
  // The steps and their sections are rendered in tests/convertPanel.test.js;
  // this pins the order in the source.
  const cp = loadSource('creator/ConvertPanel.js');

  // A setting comes before the ones it limits: the stash before the thread
  // count; rare colours sit with the other tidying (reports/create-from-image-workflow).
  test('steps: Size (size, fabric), Threads (stash first), Detail; the picture is framed first', () => {
    expect(cp).toMatch(/if \(tab === "size"\) content = \[sizeSec, fabricSec\];/);
    // Frame the picture: type, background, and fixes folded away.
    expect(cp).toMatch(/return h\(React\.Fragment, null, pictureType, background,\s*h\("details", \{ className: "cv-fix"/);
    expect(cp).toMatch(/else if \(tab === "threads"\) content = \[stashSec, countSec, keepSec, blendSec, brandSec, stashToolsSec\];/);
    expect(cp).toMatch(/else content = \[stepsSec, shadingSec, edgesSec, tidySec, rareSec, lookSec\];/);
    expect(cp).not.toMatch(/projectSec/);
  });

  test('section headings', () => {
    ['"picture-type", "Picture type"', '"background", "Background"', '"adjust", null, null',
     '"brand", "Thread brand"', '"count", "Number of threads"', '"blends", "Blends"', '"rare", "Rare colours"',
     '"style", "Detail and tidiness"', '"shading", "Shading pattern"', '"tidying", "Tidying"', '"lookalike", "Look-alike colours"']
      .forEach((h) => expect(cp).toContain('sec(' + h));
    // Min stitches per colour merges rare colours away; it is in Detail with tidying.
    const rare = cp.slice(cp.indexOf('var rareSec = '), cp.indexOf('var stashSec = '));
    expect(rare).toMatch(/label: "Min stitches per colour"/);
  });

  test('no accordion open-state is kept for Convert any more', () => {
    const st = loadSource('creator/useCreatorState.js');
    expect(st).not.toMatch(/_dimOpen|_palOpen|_adjOpen|_clOpen|_bgOpen/);
    expect(st).toMatch(/var _convertTab = useState\("size"\);/);
    expect(st).toMatch(/var _convertStage = useState\("make"\);/);
  });
});
