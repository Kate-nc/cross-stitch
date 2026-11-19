// Crisp edges (Convert > Detail > Edges): each stitch that is mostly one
// colour takes that colour instead of the blend of everything under it
// (dominantAreaDownscale, colour-utils.js; reports/photo-conversion-audit-2026-11.md,
// finding 4).
const fs = require('fs');
const { runtime } = require('../scripts/conversion-accuracy/harness');
const { loadSource } = require('./_helpers/loadSource');

const W = runtime();
const BLACK = [0, 0, 0], WHITE = [255, 255, 255];
// sw × sh pixels; colourAt(x, y) -> [r, g, b(, a)].
function picture(sw, sh, colourAt) {
  const d = new Uint8ClampedArray(sw * sh * 4);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const c = colourAt(x, y), i = (y * sw + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] == null ? 255 : c[3];
  }
  return d;
}
const stitch = (out, i) => Array.from(out.slice(i * 4, i * 4 + 4));

describe('dominantAreaDownscale', () => {
  // 40 pixels across to 4 stitches of 10: black up to x = 13, then white.
  // Stitch 1 is 3 black and 7 white pixels.
  const edge = (cut) => picture(40, 10, (x) => (x < cut ? BLACK : WHITE));

  test('a stitch that is mostly one colour takes that colour', () => {
    const avg = W.linearAreaDownscale(edge(13), 40, 10, 4, 1), crisp = W.dominantAreaDownscale(edge(13), 40, 10, 4, 1);
    expect(stitch(avg, 1)[0]).toBeGreaterThan(100);   // the blend: a grey
    expect(stitch(avg, 1)[0]).toBeLessThan(255);
    expect(stitch(crisp, 1)).toEqual([255, 255, 255, 255]);
    // The stitches on either side are one colour already.
    expect([stitch(crisp, 0), stitch(crisp, 2), stitch(crisp, 3)]).toEqual([stitch(avg, 0), stitch(avg, 2), stitch(avg, 3)]);
  });

  test('half and half, or two colours that look alike, keeps the blend', () => {
    expect(stitch(W.dominantAreaDownscale(edge(15), 40, 10, 4, 1), 1)).toEqual(stitch(W.linearAreaDownscale(edge(15), 40, 10, 4, 1), 1));
    const alike = picture(40, 10, (x) => (x < 13 ? [200, 200, 200] : [210, 210, 210]));
    expect(W.dominantAreaDownscale(alike, 40, 10, 4, 1)).toEqual(W.linearAreaDownscale(alike, 40, 10, 4, 1));
  });

  test('see-through pixels, and too few pixels per stitch, keep the blend', () => {
    const seeThrough = picture(40, 10, (x) => (x === 19 ? [255, 255, 255, 0] : x < 13 ? BLACK : WHITE));
    expect(stitch(W.dominantAreaDownscale(seeThrough, 40, 10, 4, 1), 1)).toEqual(stitch(W.linearAreaDownscale(seeThrough, 40, 10, 4, 1), 1));
    const small = picture(6, 3, (x) => (x < 2 ? BLACK : WHITE));
    expect(W.dominantAreaDownscale(small, 6, 3, 4, 2)).toEqual(W.linearAreaDownscale(small, 6, 3, 4, 2));
  });

  test('only ever a colour that is in the picture under the stitch, or the blend', () => {
    // A soft photo-like gradient with a hard edge through it.
    // The edge splits each stitch it crosses about 80 to 20.
    const src = picture(120, 120, (x, y) => (x + y < 133 ? [30 + x, 60, 120] : [230, 200 - y, 90]));
    const avg = W.linearAreaDownscale(src, 120, 120, 12, 12), crisp = W.dominantAreaDownscale(src, 120, 120, 12, 12);
    let changed = 0;
    for (let i = 0; i < 144; i++) {
      if (stitch(crisp, i).join() === stitch(avg, i).join()) continue;
      changed++;
      // A changed stitch is on the edge and takes one side's colour family.
      const c = stitch(crisp, i), blue = c[2] > 100 && c[0] < 160, gold = c[0] > 200 && c[2] < 110;
      expect(blue || gold).toBe(true);
    }
    expect(changed).toBeGreaterThan(5);
    expect(changed).toBeLessThan(40);
  });
});

describe('gridPixels with Crisp edges', () => {
  const genSrc = loadSource('creator/generate.js');
  function load() {
    const calls = { avg: 0, crisp: [], draws: [] };
    const document = { createElement: () => {
      const c = { width: 0, height: 0 }, ctx = {
        drawImage(src, x, y, w, h) { calls.draws.push([w, h]); ctx.px = new Uint8ClampedArray(w * h * 4).fill(128); },
        getImageData: (x, y, w, h) => ({ data: ctx.px, width: w, height: h }),
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
      };
      c.getContext = () => ctx;
      return c;
    } };
    const fn = new Function('document', 'linearAreaDownscale', 'dominantAreaDownscale', '_applyImageFilters', 'LINEAR_SHRINK_MAX_SOURCE_AREA', 'CRISP_MAX_SOURCE_AREA',   // eslint-disable-line no-new-func
      genSrc.slice(genSrc.indexOf('// The averaged picture for each picture element'), genSrc.indexOf("// Reduce confetti's settings")) + '\nreturn { gridPixels };');
    const g = fn(document,
      (s, sw, sh, dw, dh) => { calls.avg++; return new Uint8ClampedArray(dw * dh * 4); },
      (s, sw, sh, dw, dh) => { calls.crisp.push([sw, sh, dw, dh]); return new Uint8ClampedArray(dw * dh * 4); },
      () => {}, 4096 * 4096, 2048 * 2048).gridPixels;
    return { g, calls };
  }

  test('uses the crisp shrink only when asked, cached apart from the blend', () => {
    const { g, calls } = load();
    const img = { width: 1000, height: 800 };
    g(img, 100, 80); g(img, 100, 80, { crisp: true }); g(img, 100, 80, { crisp: true }); g(img, 100, 80);
    expect(calls.avg).toBe(1);
    expect(calls.crisp).toEqual([[1000, 800, 100, 80]]);
  });

  test('reads at most 16 pixels per stitch each way, and CRISP_MAX_SOURCE_AREA in all', () => {
    const { g, calls } = load();
    g({ width: 4000, height: 3000 }, 100, 75, { crisp: true });
    expect(calls.crisp[0]).toEqual([1600, 1200, 100, 75]);
    g({ width: 8000, height: 6000 }, 400, 300, { crisp: true });
    const [sw, sh] = calls.crisp[1];
    expect(sw * sh).toBeLessThanOrEqual(2048 * 2048);
    expect(sw / sh).toBeCloseTo(4 / 3, 1);
  });
});

test('Crisp edges travels with every conversion and is saved with the project', () => {
  const st = loadSource('creator/useCreatorState.js'), io = loadSource('creator/useProjectIO.js');
  expect(st).toMatch(/'preSharpenAmount', 'crispEdges',/);   // CONVERSION_STATE_KEYS
  expect(st).toMatch(/imageData = gridPixels\(img, convertW, convertH, \{ crisp: crispEdges \}\);/);   // Generate (worker)
  expect(st).toMatch(/preSharpenAmount: preSharpenAmount, crispEdges: crispEdges,\n\s*\}\);/);   // Generate (page)
  expect(st).toMatch(/_gcxImgData = gridPixels\(img, gw, gh, \{ crisp: crispEdges \}\);/);   // gallery
  expect(st).toMatch(/setCrispEdges\(!!values\.crispEdges\);/);   // pinned preview
  expect(loadSource('creator/usePreview.js')).toMatch(/var geoSig = img\.src \+ '\|' \+ pw \+ '\|' \+ ph \+ \(crisp \? '\|crisp' : ''\);/);
  expect(loadSource('creator/FrameView.js')).toMatch(/var grid = gridPixels\(img, sW, sH, \{ crisp: !!opts\.crisp \}\);/);
  expect(io.match(/crispEdges: state\.crispEdges \|\| undefined,/g)).toHaveLength(3);
  expect(io).toMatch(/state\.setCrispEdges\(!!s\.crispEdges\);/);
  expect(io).toMatch(/'preSharpenAmount', 'crispEdges',/);   // drafts
  expect(fs.readFileSync('creator-main.js', 'utf8')).toMatch(/crispEdges: state\.crispEdges, setCrispEdges: state\.setCrispEdges,/);
});
