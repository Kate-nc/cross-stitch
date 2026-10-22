/**
 * Reactivity tests for the conversion preview pipeline.
 *
 * Some tests in this file are EXPECTED TO FAIL on `main` and pass once the
 * unified ConversionSettings refactor lands. They document the bugs found
 * during the audit (reports/preview-1..6).
 *
 * Bug references:
 *   S1 — "Use only stash threads" preview path builds allowedPalette incorrectly
 *   C3 — Dither strength (weak/balanced/strong) not forwarded by preview
 *   C5 — Min stitches per colour: missing from deps, never read, engine doesn't implement
 *   C4 — Allow blends: progressive fast-pass forces allowBlends:false
 *
 * Test approach mirrors the existing extract-and-eval pattern (see
 * doDither.test.js, quantize.test.js): we read raw JS source, extract the
 * functions we need, and call them as plain functions. No JSX or worker.
 */

const fs = require('fs');
const path = require('path');
const { DMC, rgbToLab, rgbToOklab, dE2, dE2ok } = require('../dmc-data.js');

// ── Source loaders ──────────────────────────────────────────────────────────

const cuSrc       = fs.readFileSync(path.join(__dirname, '..', 'colour-utils.js'), 'utf8');
const generateSrc = fs.readFileSync(path.join(__dirname, '..', 'creator', 'generate.js'), 'utf8');
const usePrevSrc  = fs.readFileSync(path.join(__dirname, '..', 'creator', 'usePreview.js'), 'utf8');
const useStateSrc = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useCreatorState.js'), 'utf8');

// Pull every top-level `function name(` out of colour-utils.js and eval them
// into the test scope so generate.js's references resolve as plain locals.
function extractFn(src, name) {
  let start = src.indexOf(`\nfunction ${name}(`);
  if (start === -1) start = src.indexOf(`function ${name}(`);
  if (start === -1) return null;
  let i = start;
  while (i < src.length && src[i] !== '(') i++;
  let pd = 0;
  while (i < src.length) {
    if (src[i] === '(') pd++;
    else if (src[i] === ')') { pd--; if (pd === 0) { i++; break; } }
    i++;
  }
  while (i < src.length && src[i] !== '{') i++;
  let depth = 0;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { if (--depth === 0) return src.slice(start, i + 1); }
    i++;
  }
  return null;
}

// Globals required by colour-utils.js
global.DMC = DMC;
global.rgbToLab = rgbToLab;
global.rgbToOklab = rgbToOklab;
global.dE = dE2;            // colour-utils uses both names; alias
global.dE2 = dE2;
global.dE2ok = dE2ok;
// SYMS lives in dmc-data.js as a top-level `const SYMS = "…".split("")`. Module
// exports don't surface it, so reproduce here for buildPalette().
global.SYMS = "●◆■▲★♦♥♣♠◄►▼○◇□△☆♢♡♧♤◁▷▽⊕⊗⊞⊠⊡⊘⊙⊚⊛⊜⊝⬡⬢⬣⬥⬦⬧⬨⬩".split("");

// Eval the entire colour-utils.js so internal helpers (sobelMag, sobelOp, etc.)
// resolve. Wrap in a function so vars don't pollute the test file's strict
// scope while still being reachable through the closure.
(function() {
  // colour-utils.js uses some `let`/`const` at top level — those would be
  // block-scoped to this IIFE. We need its functions globally for generate.js.
  // The easiest reliable hack: replace top-level `function name(` declarations
  // so they attach to global, and likewise for `let`/`const` of named arrays.
  let src = cuSrc;
  // promote top-level function declarations to global assignments
  src = src.replace(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm, 'global.$1 = function $1(');
  // promote `let X = …` and `const X = …` (top-level only — naive but adequate)
  src = src.replace(/^(let|const|var)\s+([A-Za-z_$][\w$]*)\s*=/gm, 'global.$2 =');
  eval(src); // eslint-disable-line no-eval
})();

// generate.js attaches to `window`; provide a stub.
global.window = global.window || global;

// Eval generate.js. It defines window.runCleanupPipeline & window.runGenerationPipeline.
eval(generateSrc); // eslint-disable-line no-eval
const runCleanupPipeline = global.window.runCleanupPipeline;

// Extract _extractDmcId helper from useCreatorState.js (lives at the top of the file).
const extractDmcIdSrc = extractFn(useStateSrc, '_extractDmcId');
const _extractDmcId = (function() {
  let fn;
  eval(extractDmcIdSrc + '\nfn = _extractDmcId;'); // eslint-disable-line no-eval
  return fn;
})();

// ── Image fixtures ──────────────────────────────────────────────────────────

function gradientImage(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = Math.round((x / Math.max(1, w - 1)) * 255);
      data[i]     = v;
      data[i + 1] = Math.round(255 - v * 0.5);
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return data;
}

/** Image where one column is a different colour — used to make a "rare" colour. */
function imageWithRareColour(w, h) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const isRareCol = x === 0;
      data[i]     = isRareCol ? 255 : 50;
      data[i + 1] = isRareCol ? 0   : 50;
      data[i + 2] = isRareCol ? 255 : 50;
      data[i + 3] = 255;
    }
  }
  return data;
}

// ─── _extractDmcId helper ───────────────────────────────────────────────────

describe('_extractDmcId — composite stash key handling', () => {
  test('strips dmc: prefix from composite keys', () => {
    expect(_extractDmcId('dmc:310')).toBe('310');
    expect(_extractDmcId('DMC:550')).toBe('550');
  });
  test('passes bare ids through', () => {
    expect(_extractDmcId('310')).toBe('310');
    expect(_extractDmcId('B5200')).toBe('B5200');
  });
  test('returns null for other brands', () => {
    expect(_extractDmcId('anchor:403')).toBe(null);
    expect(_extractDmcId('madeira:1014')).toBe(null);
  });
  test('returns null for non-strings', () => {
    expect(_extractDmcId(null)).toBe(null);
    expect(_extractDmcId(undefined)).toBe(null);
    expect(_extractDmcId(123)).toBe(null);
  });
});

// ─── runCleanupPipeline reactivity ──────────────────────────────────────────

describe('runCleanupPipeline — settings reach the engine', () => {
  test('respects allowedPalette (stash-only constraint)', () => {
    const w = 24, h = 24;
    const raw = gradientImage(w, h);
    const onlyTwo = DMC.slice(0, 2); // tiny allowed palette
    const result = runCleanupPipeline(raw, w, h, {
      maxC: 10, dith: false, allowBlends: false,
      skipBg: false, bgCol: [255,255,255], bgTh: 15,
      stitchCleanup: null, orphans: 0,
      allowedPalette: onlyTwo,
    });
    expect(result).not.toBeNull();
    const ids = new Set(result.mapped.filter(m => m.id !== '__skip__').map(m => m.id));
    for (const id of ids) {
      const top = id.split('+')[0]; // blends use "id1+id2"
      expect(onlyTwo.map(p => p.id)).toContain(top);
    }
  });

  test('produces different output for different dithStrength values (engine honours C3)', () => {
    const w = 32, h = 32;
    const raw = gradientImage(w, h);
    const opts = {
      maxC: 6, dith: true, allowBlends: false,
      skipBg: false, bgCol: [255,255,255], bgTh: 15,
      stitchCleanup: null, orphans: 0, allowedPalette: null,
    };
    const weak   = runCleanupPipeline(raw, w, h, Object.assign({}, opts, { dithStrength: 0.5 }));
    const strong = runCleanupPipeline(raw, w, h, Object.assign({}, opts, { dithStrength: 1.5 }));
    expect(weak).not.toBeNull();
    expect(strong).not.toBeNull();
    // The two passes should differ in at least one cell (strong dither scatters more).
    let differs = 0;
    for (let i = 0; i < weak.mapped.length; i++) {
      if (weak.mapped[i].id !== strong.mapped[i].id) differs++;
    }
    expect(differs).toBeGreaterThan(0);
  });

  test('different dithering algorithms produce different mapped output', () => {
    const w = 32, h = 32;
    const raw = gradientImage(w, h);
    const base = {
      maxC: 6, allowBlends: false,
      skipBg: false, bgCol: [255,255,255], bgTh: 15,
      stitchCleanup: null, orphans: 0, allowedPalette: null,
    };
    const off = runCleanupPipeline(raw, w, h, Object.assign({}, base, {
      dith: false,
    }));
    const atkinson = runCleanupPipeline(raw, w, h, Object.assign({}, base, {
      dith: true, dithAlgo: 'atkinson', dithStrength: 1.0,
    }));
    const bayer4 = runCleanupPipeline(raw, w, h, Object.assign({}, base, {
      dith: true, dithAlgo: 'bayer', dithBayerSize: 4,
    }));
    expect(off).not.toBeNull();
    expect(atkinson).not.toBeNull();
    expect(bayer4).not.toBeNull();

    let offVsAtkinson = 0;
    let offVsBayer = 0;
    let atkinsonVsBayer = 0;
    for (let i = 0; i < off.mapped.length; i++) {
      if (off.mapped[i].id !== atkinson.mapped[i].id) offVsAtkinson++;
      if (off.mapped[i].id !== bayer4.mapped[i].id) offVsBayer++;
      if (atkinson.mapped[i].id !== bayer4.mapped[i].id) atkinsonVsBayer++;
    }
    expect(offVsAtkinson).toBeGreaterThan(0);
    expect(offVsBayer).toBeGreaterThan(0);
    expect(atkinsonVsBayer).toBeGreaterThan(0);
  });

  test('Bayer matrix size changes the mapped output', () => {
    const w = 32, h = 32;
    const raw = gradientImage(w, h);
    const base = {
      maxC: 6, dith: true, dithAlgo: 'bayer', allowBlends: false,
      skipBg: false, bgCol: [255,255,255], bgTh: 15,
      stitchCleanup: null, orphans: 0, allowedPalette: null,
    };
    const b2 = runCleanupPipeline(raw, w, h, Object.assign({}, base, { dithBayerSize: 2 }));
    const b4 = runCleanupPipeline(raw, w, h, Object.assign({}, base, { dithBayerSize: 4 }));
    const b8 = runCleanupPipeline(raw, w, h, Object.assign({}, base, { dithBayerSize: 8 }));
    expect(b2).not.toBeNull();
    expect(b4).not.toBeNull();
    expect(b8).not.toBeNull();

    let d24 = 0;
    let d48 = 0;
    let d28 = 0;
    for (let i = 0; i < b2.mapped.length; i++) {
      if (b2.mapped[i].id !== b4.mapped[i].id) d24++;
      if (b4.mapped[i].id !== b8.mapped[i].id) d48++;
      if (b2.mapped[i].id !== b8.mapped[i].id) d28++;
    }
    expect(d24).toBeGreaterThan(0);
    expect(d48).toBeGreaterThan(0);
    expect(d28).toBeGreaterThan(0);
  });

  test('respects minSt by collapsing rare colours (engine implements C5)', () => {
    // EXPECTED FAIL on main: runCleanupPipeline does not implement minSt;
    // the rebucket loop currently lives only in runGenerationPipeline.
    // Will pass after commit 3 moves the loop into runCleanupPipeline.
    const w = 30, h = 30;
    const raw = imageWithRareColour(w, h);
    const result = runCleanupPipeline(raw, w, h, {
      maxC: 20, dith: false, allowBlends: false,
      skipBg: false, bgCol: [255,255,255], bgTh: 15,
      stitchCleanup: null, orphans: 0, allowedPalette: null,
      minSt: 100, // larger than the rare-column count (h = 30 stitches)
    });
    expect(result).not.toBeNull();
    // Build per-id counts.
    const counts = {};
    for (const m of result.mapped) {
      if (m.id === '__skip__') continue;
      counts[m.id] = (counts[m.id] || 0) + 1;
    }
    // Every retained colour must clear the threshold.
    for (const id of Object.keys(counts)) {
      expect(counts[id]).toBeGreaterThanOrEqual(100);
    }
  });

  // Reduce confetti (colour-utils.js confettiCleanupPlan): Stitch Cleanup is
  // the on/off switch and the Reduce confetti level (1 to 3) the size; 0 is
  // off. It used to fall back to a hidden "Cleanup strength" size at 0, so 0
  // did not mean off.
  function speckles(w, h, speckle, base) {
    const raw = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, c = (x % 4 === 1 && y % 4 === 1) ? speckle : base;
      raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2]; raw[i + 3] = 255;
    }
    return raw;
  }
  const cleanupBase = {
    maxC: 12, dith: false, allowBlends: false,
    skipBg: false, bgCol: [255,255,255], bgTh: 15, allowedPalette: null,
  };
  const sc = (o) => Object.assign({ enabled: true, strength: 'balanced', protectDetails: false, smoothDithering: false }, o);
  // A dark brown speckle on a mid grey: different enough to get a thread of
  // its own, close enough (well under the ΔE 30 contrast guard) to be noise.
  const noisy = () => speckles(24, 24, [92, 72, 58], [80, 80, 80]);

  test('Stitch Cleanup off: Reduce confetti changes nothing', () => {
    const off = runCleanupPipeline(noisy(), 24, 24, Object.assign({}, cleanupBase, { orphans: 3, stitchCleanup: sc({ enabled: false }) }));
    expect(off.preCleanupIds).toBeNull();
  });

  test('Reduce confetti 0 is off, even with Stitch Cleanup on', () => {
    const zero = runCleanupPipeline(noisy(), 24, 24, Object.assign({}, cleanupBase, { orphans: 0, stitchCleanup: sc() }));
    expect(zero.preCleanupIds).toBeNull();
  });

  test('Stitch Cleanup on with a Reduce confetti level merges noise speckles', () => {
    const before = runCleanupPipeline(noisy(), 24, 24, Object.assign({}, cleanupBase, { orphans: 0, stitchCleanup: sc() }));
    const on = runCleanupPipeline(noisy(), 24, 24, Object.assign({}, cleanupBase, { orphans: 1, stitchCleanup: sc() }));
    expect(on.preCleanupIds).not.toBeNull();
    let differs = 0;
    for (let i = 0; i < on.mapped.length; i++) if (on.mapped[i].id !== before.mapped[i].id) differs++;
    expect(differs).toBeGreaterThan(0);
  });

  test('a high-contrast accent survives with Protect fine details off (contrast guard is always on)', () => {
    const raw = speckles(24, 24, [255, 0, 255], [50, 50, 50]);
    const on = runCleanupPipeline(raw, 24, 24, Object.assign({}, cleanupBase, { orphans: 3, stitchCleanup: sc({ protectDetails: false }) }));
    const ids = new Set(on.mapped.map((m) => m.id));
    expect(ids.size).toBe(2);
  });

  test('the plan: sizes, guard and edge protection', () => {
    expect(confettiCleanupPlan(null, 2)).toBeNull();
    expect(confettiCleanupPlan({ enabled: false }, 2)).toBeNull();
    expect(confettiCleanupPlan({ enabled: true }, 0)).toBeNull();
    const p = confettiCleanupPlan({ enabled: true, strength: 'thorough', protectDetails: true }, 2);
    expect(p.maxOrphanSize).toBe(2);
    expect(p.protectEdges).toBe(true);
    // Strength no longer changes anything: one flat-area multiplier.
    expect(p.options).toEqual(confettiCleanupPlan({ enabled: true, strength: 'gentle', protectDetails: false }, 2).options);
    expect(p.options.deContrastGuard).toBe(30);
    expect(confettiCleanupPlan({ enabled: true, protectDetails: false }, 3).protectEdges).toBe(false);
    // The edge map is not dilated (a dilated map covered half of a photo).
    expect(ORPHAN_EDGE_DILATION).toBe(0);
  });
});

// ─── usePreview source-level coverage manifest ──────────────────────────────

describe('preview pipeline — coverage manifest', () => {
  // EXPECTED FAIL on main: the manifest does not yet exist. After commit 2
  // introduces CONVERSION_STATE_KEYS in useCreatorState.js, this test
  // documents the contract.
  test('useCreatorState.js declares CONVERSION_STATE_KEYS array', () => {
    expect(useStateSrc).toMatch(/CONVERSION_STATE_KEYS\s*=\s*\[/);
  });

  test('useCreatorState.js exposes conversionSettings on the returned state', () => {
    expect(useStateSrc).toMatch(/conversionSettings\s*:/);
  });

  test('usePreview.js depends on state.conversionSettings (single watch)', () => {
    expect(usePrevSrc).toMatch(/state\.conversionSettings/);
  });

  test('usePreview.js no longer hand-builds allowedPalette via raw stash keys', () => {
    // This is the S1 bug signature — calling findThreadInCatalog directly on
    // raw globalStash keys without _extractDmcId. After the refactor the
    // builder lives in useCreatorState.js (or the shared helper) only.
    const offending = /globalStash\)\s*\.forEach\([^)]*function\([^)]*\)\s*\{[^}]*findThreadInCatalog\s*\(\s*['"]dmc['"]\s*,/s;
    expect(usePrevSrc).not.toMatch(offending);
  });

  test('usePreview.js forwards dithStrength to runCleanupPipeline', () => {
    // After the fix, the preview's call site must include dithStrength.
    // Today it does not — this test documents the wiring gap.
    expect(usePrevSrc).toMatch(/dithStrength/);
  });

  test('usePreview.js forwards dithAlgo and dithBayerSize to runCleanupPipeline', () => {
    expect(usePrevSrc).toMatch(/dithAlgo/);
    expect(usePrevSrc).toMatch(/dithBayerSize/);
  });
});
