/* trackerFixture.js — generated tracker projects for the perf/mobile harnesses.
   ═══════════════════════════════════════════════════════════════════════════
   Every spec that needs "a pattern of size N" used to carry its own inline
   fixture builder (mobile-audit.spec.js, verify-fixes.spec.js,
   pan-cost.spec.js, touch-reachability.spec.js), and each stopped at
   200 x 250. That is below the size at which the chart's zoom ceiling drops
   under the symbol-rendering threshold, which is why
   reports/mobile-freeze-large-patterns.md §1.1 was never caught by a test.

   This module is the single builder, and it goes up to 600 x 800.

   On the file format
   ──────────────────
   Cells are emitted as `{id, type}` with **real DMC ids and no rgb** — byte
   for byte what `serializePattern()` (helpers.js) writes for a real saved
   project. That matters twice over:

     - `restoreStitch()` (colour-utils.js) hydrates rgb/lab from the DMC
       catalogue by id. An unknown id instead falls through to the branch that
       calls `rgbToLab()` per cell, so a 480 000-cell fixture with made-up ids
       would measure 480 000 colour-space conversions that no real project
       performs.
     - It keeps the file small enough to be practical: ~28 B/cell instead of
       ~70 B, so the 600 x 800 fixture is ~13 MB rather than ~35 MB.

   Files are cached in tests/.tmp and only rewritten when the parameters
   change, so a repeated run does not pay to regenerate 13 MB.

   API
   ───
     makeTrackerFixture({ sW, sH, nColours, doneFraction, name })  -> file path
     SIZES                                                          -> named sizes
     patternCells(size)                                             -> sW*sH
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TMP = path.join(__dirname, '..', '.tmp');

/* ── Real DMC ids, parsed from the shipped catalogue ──────────────────────
   dmc-data.js declares `const DMC_RAW=[[id,name,r,g,b], ...]`. Parsing it
   rather than hardcoding ids means a fixture can never drift out of sync with
   the catalogue `restoreStitch` looks up. */
let _dmcCache = null;
function dmcThreads() {
  if (_dmcCache) return _dmcCache;
  const src = fs.readFileSync(path.join(ROOT, 'dmc-data.js'), 'utf8');
  const start = src.indexOf('const DMC_RAW=[');
  if (start < 0) throw new Error('trackerFixture: DMC_RAW not found in dmc-data.js');
  const open = src.indexOf('[', start + 'const DMC_RAW='.length - 1);
  let depth = 0, end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('trackerFixture: could not balance DMC_RAW');
  const raw = JSON.parse(src.slice(open, end));
  _dmcCache = raw.map(r => ({ id: String(r[0]), name: String(r[1]), rgb: [r[2], r[3], r[4]] }));
  if (_dmcCache.length < 50) throw new Error('trackerFixture: DMC_RAW parsed but looks empty');
  return _dmcCache;
}

/* Standard sizes. The first two match what the existing specs already used,
   so migrating a spec to this helper does not change what it measures; the
   rest are the gap this module exists to close.

   `symbolsReachable` records whether the chart can reach Tier 3 (symbols) at
   *some* zoom under the iOS canvas budget, as of the pre-fix code. It is
   documentation for whoever reads a failing assertion, not an input. */
const SIZES = {
  small:  { sW: 100, sH: 100, nColours: 12, symbolsReachable: true },
  medium: { sW: 200, sH: 250, nColours: 40, symbolsReachable: true },
  large:  { sW: 400, sH: 500, nColours: 60, symbolsReachable: false },
  huge:   { sW: 600, sH: 800, nColours: 80, symbolsReachable: false },
};

function patternCells(size) {
  const s = typeof size === 'string' ? SIZES[size] : size;
  return s.sW * s.sH;
}

function ensureTmp() { if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true }); }

/**
 * Write (or reuse) a tracker project JSON and return its path.
 *
 * @param {object}  opts
 * @param {number}  opts.sW            columns
 * @param {number}  opts.sH            rows
 * @param {number} [opts.nColours=40]  distinct DMC threads, cycled across cells
 * @param {number} [opts.doneFraction=0] 0..1 — share of cells pre-marked done,
 *                                       spread deterministically rather than in
 *                                       one block so colour progress is mixed
 * @param {string} [opts.name]         project name
 * @returns {string} absolute path to the fixture file
 */
function makeTrackerFixture(opts) {
  const sW = opts.sW, sH = opts.sH;
  if (!sW || !sH) throw new Error('trackerFixture: sW and sH are required');
  const nColours = opts.nColours || 40;
  const doneFraction = opts.doneFraction || 0;
  const name = opts.name || `Fixture ${sW}x${sH}`;

  ensureTmp();
  // Signature in the filename, so changing any parameter yields a new file
  // instead of silently reusing a stale one.
  const sig = `${sW}x${sH}-c${nColours}-d${Math.round(doneFraction * 100)}`;
  const file = path.join(TMP, `tracker-${sig}.json`);
  if (fs.existsSync(file)) return file;

  const threads = dmcThreads();
  if (nColours > threads.length) throw new Error(`trackerFixture: only ${threads.length} DMC threads available`);
  // Stride through the catalogue so the palette is visually varied rather than
  // 80 neighbouring shades of the same hue — closer to a real converted image,
  // and it keeps the symbol/colour views legible when a run is eyeballed.
  const stride = Math.max(1, Math.floor(threads.length / nColours));
  const cols = [];
  for (let i = 0; i < nColours; i++) cols.push(threads[(i * stride) % threads.length]);

  const total = sW * sH;
  // One shared object per colour: JSON.stringify expands each reference anyway,
  // but building 480 000 distinct objects first would cost far more than the
  // write does.
  const cells = cols.map(c => ({ id: c.id, type: 'solid' }));
  const pattern = new Array(total);
  const done = new Array(total).fill(0);
  // Deterministic 7-cell stride: no RNG, so two runs produce byte-identical
  // files and a cached fixture is always the one the parameters describe.
  const doneEvery = doneFraction > 0 ? Math.max(1, Math.round(1 / doneFraction)) : 0;
  const counts = new Array(nColours).fill(0);
  for (let i = 0; i < total; i++) {
    const ci = i % nColours;
    pattern[i] = cells[ci];
    counts[ci]++;
    if (doneEvery && i % doneEvery === 0) done[i] = 1;
  }

  const project = {
    version: 11, page: 'tracker', name,
    settings: { sW, sH, fabricCt: 14, skeinPrice: 0.95, stitchSpeed: 40 },
    pattern, bsLines: [], done, parkMarkers: [], totalTime: 0, sessions: [],
    hlRow: -1, hlCol: -1, threadOwned: {},
    originalPaletteState: cols.map((c, i) => ({
      id: c.id, type: 'solid', name: c.name, rgb: c.rgb, lab: [0, 0, 0], count: counts[i],
    })),
    singleStitchEdits: [], halfStitches: [], halfDone: [],
    statsSessions: [], statsSettings: {},
    savedZoom: 1, savedScroll: { left: 0, top: 0 },
  };
  fs.writeFileSync(file, JSON.stringify(project), 'utf8');
  return file;
}

/** Convenience: `fixtureFor('large')` -> path, using the SIZES table. */
function fixtureFor(sizeName, extra) {
  const s = SIZES[sizeName];
  if (!s) throw new Error(`trackerFixture: unknown size "${sizeName}"`);
  return makeTrackerFixture(Object.assign({}, s, extra || {}));
}

module.exports = { makeTrackerFixture, fixtureFor, SIZES, patternCells, dmcThreads, TMP };
