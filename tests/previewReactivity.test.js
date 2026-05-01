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
const { DMC, rgbToLab, dE2 } = require('../dmc-data.js');

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
global.dE = dE2;            // colour-utils uses both names; alias
global.dE2 = dE2;
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
global.STRENGTH_MAP = {
  gentle:   { maxOrphanSize: 2, saliencyMultiplier: 1.0 },
  balanced: { maxOrphanSize: 3, saliencyMultiplier: 2.0 },
  thorough: { maxOrphanSize: 5, saliencyMultiplier: 3.0 },
};

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
});
