/**
 * tests/doDitherShortCircuit.test.js
 *
 * Safety net for deferred item #4 — secondBest short-circuit in
 * doDither (perf-7). The chosen optimization (id-map lookup
 * replacing per-pixel palette scan) is asserted bit-equivalent:
 * the same chosen palette entries must come out for both flag
 * states.
 */

const fs = require("fs");
const { rgbToLab } = require("../dmc-data.js");

// Reuse the extractFn pattern from tests/doDither.test.js.
const embSrc = fs.readFileSync("./embroidery.js", "utf8");
const cuSrc = fs.readFileSync("./colour-utils.js", "utf8");

function extractFn(src, name) {
  let start = src.indexOf(`\nfunction ${name}(`);
  if (start === -1) start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`Function ${name} not found`);
  let i = start;
  while (i < src.length && src[i] !== "(") i++;
  let pd = 0;
  while (i < src.length) {
    if (src[i] === "(") pd++;
    else if (src[i] === ")") {
      pd--;
      if (pd === 0) {
        i++;
        break;
      }
    }
    i++;
  }
  while (i < src.length && src[i] !== "{") i++;
  let depth = 0;
  while (i < src.length) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      if (--depth === 0) return src.slice(start, i + 1);
    }
    i++;
  }
  throw new Error(`Unterminated function ${name}`);
}

function loadDoDither(flags) {
  // Each call re-evals the source so PERF_FLAGS can be tweaked
  // independently per scenario.
  // eslint-disable-next-line no-new-func
  return new Function(
    "flags",
    "extractedFns",
    [
      "var window = { PERF_FLAGS: flags || {} };",
      "var rgbToLab = extractedFns.rgbToLab;",
      "var dE2 = extractedFns.dE2;",
      extractFn(embSrc, "sobelMag"),
      extractFn(cuSrc, "findSolid"),
      extractFn(cuSrc, "findBest"),
      extractFn(cuSrc, "_gaussianBlur1"),
      extractFn(cuSrc, "generateSaliencyMap"),
      extractFn(cuSrc, "doDither"),
      "return doDither;",
    ].join("\n")
  )(flags || {}, { rgbToLab, dE2: require("../dmc-data.js").dE2 });
}

function makeImage(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [rv, gv, bv] = fn(x, y);
      const i = (y * w + x) * 4;
      data[i] = rv;
      data[i + 1] = gv;
      data[i + 2] = bv;
      data[i + 3] = 255;
    }
  }
  return data;
}

function makeRainbowPalette(n) {
  const pal = [];
  for (let i = 0; i < n; i++) {
    const hue = (i / n) * 360;
    const h = hue / 60;
    const c = 0.8;
    const x = c * (1 - Math.abs((h % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (h < 1) { r = c; g = x; }
    else if (h < 2) { r = x; g = c; }
    else if (h < 3) { g = c; b = x; }
    else if (h < 4) { g = x; b = c; }
    else if (h < 5) { r = x; b = c; }
    else { r = c; b = x; }
    const m = 0.5 - c / 2;
    const rv = Math.round((r + m) * 255);
    const gv = Math.round((g + m) * 255);
    const bv = Math.round((b + m) * 255);
    pal.push({
      type: "solid",
      id: `color${i}`,
      name: `color${i}`,
      rgb: [rv, gv, bv],
      lab: rgbToLab(rv, gv, bv),
      dist: 0,
    });
  }
  return pal;
}

function compareOutputs(a, b) {
  if (a.length !== b.length) return { equal: false, firstDiff: -1 };
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return { equal: false, firstDiff: i, a: a[i].id, b: b[i].id };
  }
  return { equal: true };
}

describe("doDither — secondBest id-map short-circuit (deferred-4)", () => {
  test("output is bit-equivalent: gradient image, 16-colour palette", () => {
    const w = 24, h = 24;
    const img = makeImage(w, h, (x, y) => [
      (x * 255) / (w - 1) | 0,
      (y * 255) / (h - 1) | 0,
      ((x + y) * 128) / (w + h - 2) | 0,
    ]);
    const pal = makeRainbowPalette(16);
    const off = loadDoDither({ dodither_secondBest_idmap: false })(
      img, w, h, pal, false, null, { confettiDitherThreshold: 4.0 }
    );
    const on = loadDoDither({ dodither_secondBest_idmap: true })(
      img, w, h, pal, false, null, { confettiDitherThreshold: 4.0 }
    );
    const cmp = compareOutputs(off, on);
    expect(cmp.equal).toBe(true);
  });

  test("output is bit-equivalent: solid block image, 8-colour palette", () => {
    const w = 16, h = 16;
    const img = makeImage(w, h, (x, y) => [
      x < 8 ? 200 : 50,
      y < 8 ? 200 : 50,
      ((x + y) * 16) | 0,
    ]);
    const pal = makeRainbowPalette(8);
    const off = loadDoDither({ dodither_secondBest_idmap: false })(
      img, w, h, pal, false, null, { confettiDitherThreshold: 5.0 }
    );
    const on = loadDoDither({ dodither_secondBest_idmap: true })(
      img, w, h, pal, false, null, { confettiDitherThreshold: 5.0 }
    );
    const cmp = compareOutputs(off, on);
    expect(cmp.equal).toBe(true);
  });

  test("threshold = 0 disables secondBest selection (chosen === best for both paths)", () => {
    const w = 12, h = 12;
    const img = makeImage(w, h, (x, y) => [
      (x * 21) | 0, (y * 21) | 0, 128,
    ]);
    const pal = makeRainbowPalette(12);
    const off = loadDoDither({ dodither_secondBest_idmap: false })(
      img, w, h, pal, false, null, { confettiDitherThreshold: 0 }
    );
    const on = loadDoDither({ dodither_secondBest_idmap: true })(
      img, w, h, pal, false, null, { confettiDitherThreshold: 0 }
    );
    const cmp = compareOutputs(off, on);
    expect(cmp.equal).toBe(true);
  });

  test("output equivalence holds with saliencyMap supplied", () => {
    const w = 20, h = 20;
    const img = makeImage(w, h, (x, y) => [
      (x * 12) | 0, (y * 12) | 0, ((x * y) % 256) | 0,
    ]);
    const pal = makeRainbowPalette(10);
    const sal = new Float32Array(w * h);
    for (let i = 0; i < sal.length; i++) sal[i] = (i % 7) / 10;
    const off = loadDoDither({ dodither_secondBest_idmap: false })(
      img, w, h, pal, false, sal, { confettiDitherThreshold: 3.5 }
    );
    const on = loadDoDither({ dodither_secondBest_idmap: true })(
      img, w, h, pal, false, sal, { confettiDitherThreshold: 3.5 }
    );
    const cmp = compareOutputs(off, on);
    expect(cmp.equal).toBe(true);
  });

  test("default-on: undefined flag == true (matches OFF path output)", () => {
    const w = 10, h = 10;
    const img = makeImage(w, h, (x, y) => [x * 25, y * 25, 100]);
    const pal = makeRainbowPalette(6);
    const def = loadDoDither({})(img, w, h, pal, false, null, { confettiDitherThreshold: 4.0 });
    const off = loadDoDither({ dodither_secondBest_idmap: false })(
      img, w, h, pal, false, null, { confettiDitherThreshold: 4.0 }
    );
    expect(compareOutputs(def, off).equal).toBe(true);
  });
});
