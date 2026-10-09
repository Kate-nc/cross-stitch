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

  test('a new image runs the background check with an Undo toast', () => {
    const io = loadSource('creator/useProjectIO.js');
    // The picture is looked at once (P2-5): analysePicture includes the
    // border check, then the skip and the picture-type guess are applied.
    expect(io).toMatch(/window\.analysePicture\(data, imgEl\.width, imgEl\.height\)/);
    expect(io).toMatch(/window\.detectUniformBorder\(data\)/);
    expect(io).toMatch(/autoSkipBackground\(info \? info\.border : null\)/);
    expect(io).toMatch(/state\.addToast\("Background left unstitched\.", \{[\s\S]*?label: "Undo"/);
    expect((io.match(/examinePicture\((i|scaledImg)\)/g) || []).length).toBe(2);
  });
});

describe('Convert panel order', () => {
  const sb = loadSource('creator/Sidebar.js');

  test('sections are Size & fabric, Colours, Background, Quality, Adjust image, palette swap, Project', () => {
    const start = sb.indexOf('var createPanel = h("div"');
    const block = sb.slice(start, sb.indexOf('createProjectSection\n', start) + 30);
    const order = ['dimSection', 'palSection', 'bgSection', 'tidySection', 'adjSection', 'paletteSwap.shiftSection', 'createProjectSection']
      .map((n) => block.indexOf(n));
    order.forEach((i) => expect(i).toBeGreaterThan(-1));
    expect(order.slice().sort((a, b) => a - b)).toEqual(order);
  });

  test('headings are renamed', () => {
    expect(sb).toMatch(/var dimSection = h\(Section, \{title:"Size & fabric",/);
    expect(sb).toMatch(/var palSection = !ctx\.isScratchMode \? h\(Section, \{title:"Colours",/);
    expect(sb).toMatch(/var adjSection = !ctx\.isScratchMode \? h\(Section, \{title:"Adjust image",/);
  });

  test('Adjust image and Project start collapsed; Size and Colours open', () => {
    const st = loadSource('creator/useCreatorState.js');
    expect(st).toMatch(/var _dimOpen\s*=\s*useState\(true\)/);
    expect(st).toMatch(/var _palOpen\s*=\s*useState\(true\)/);
    expect(st).toMatch(/var _adjOpen\s*=\s*useState\(false\)/);
    expect(sb).toMatch(/var createProjectSection = h\(Section, \{title:"Project", defaultOpen:false\}/);
  });
});
