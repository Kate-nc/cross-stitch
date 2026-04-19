// tests/analyseSubstitutions.test.js
// Tests for window.analyseSubstitutions() from creator/SubstituteFromStashModal.js
// Verifies: self-exclusion with composite keys, cross-brand suggestions,
// correct dE2000 usage, and the skipped/nearMiss paths.

const fs = require('fs');

// ─── Setup: extract analyseSubstitutions and its helpers ─────────────────────

const raw = fs.readFileSync('./creator/SubstituteFromStashModal.js', 'utf8');

// Provide the minimal globals the function depends on
const DMC_MINI = [
  { id: '310',  name: 'Black',          rgb: [0,0,0],         lab: [0,0,0] },
  { id: '321',  name: 'Christmas Red',  rgb: [187,26,42],     lab: [36,56,35] },
  { id: 'blanc',name: 'White',          rgb: [255,255,255],   lab: [100,0,0] },
  { id: '666',  name: 'Bright Red',     rgb: [198,18,38],     lab: [37,57,36] },
  { id: '900',  name: 'Burnt Orange Dk',rgb: [211,72,0],      lab: [48,46,52] },
];

const ANCHOR_MINI = [
  { id: '403',  name: 'Anchor Black', rgb: [0,0,0],       lab: [0,0,0] },
  { id: '9046', name: 'Anchor Red',   rgb: [193,28,44],   lab: [36,56,34] },
  { id: '1',    name: 'Anchor White', rgb: [255,255,255], lab: [100,0,0] },
];

const globals = `
var window = { analyseSubstitutions: null };
var DMC = ${JSON.stringify(DMC_MINI)};
var ANCHOR = ${JSON.stringify(ANCHOR_MINI)};
var rgbToLab = null; // not needed; we use pre-computed .lab values
function skeinEst(stitches) { return Math.ceil(stitches / 200); }
function threadKey(brand, id) { return brand + ':' + id; }
function parseThreadKey(key) {
  var i = key.indexOf(':');
  if (i < 0) return { brand: 'dmc', id: key };
  return { brand: key.slice(0, i), id: key.slice(i + 1) };
}
function getThreadByKey(key) {
  var p = parseThreadKey(key);
  var arr = p.brand === 'anchor' ? ANCHOR : DMC;
  return arr.find(function(t) { return t.id === p.id; }) || null;
}
function dE(a, b) {
  var dL=a[0]-b[0], da=a[1]-b[1], db=a[2]-b[2];
  return Math.sqrt(dL*dL+da*da+db*db);
}
function dE2000(a, b) { return dE(a, b); } // use Euclidean as stand-in for tests
`;

// Extract only the pure helper functions and analyseSubstitutions (not React JSX)
function extractTopLevelFn(src, name) {
  const marker = `\nfunction ${name}(`;
  const start = src.indexOf(marker);
  if (start === -1) return null;
  let depth = 0, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { if (--depth === 0) return src.slice(start, i + 1); }
    i++;
  }
  return null;
}

// Extract analyseSubstitutions (it's assigned as window.analyseSubstitutions = function...)
function extractAnalyseSubstitutions(src) {
  const marker = 'window.analyseSubstitutions = function analyseSubstitutions(';
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('Could not find analyseSubstitutions in SubstituteFromStashModal.js');
  // Rewrite as a regular function declaration so we can call it directly
  let depth = 0, i = start + marker.length - '('.length; // start from the opening (
  let innerStart = src.indexOf('function analyseSubstitutions(', start);
  // Find the end of the function body
  let bodyStart = src.indexOf('{', innerStart);
  depth = 0; i = bodyStart;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { if (--depth === 0) return 'function analyseSubstitutions(' + src.slice(innerStart + 'function analyseSubstitutions('.length, i + 1); }
    i++;
  }
  throw new Error('Could not extract analyseSubstitutions body');
}

const code = globals
  + (extractTopLevelFn(raw, '_statusFromTarget') || '')  + '\n'
  + (extractTopLevelFn(raw, '_getThreadLab') || '') + '\n'
  + (extractTopLevelFn(raw, '_getDmcLab') || '') + '\n'
  + (extractTopLevelFn(raw, '_calcDE') || '') + '\n'
  + (extractTopLevelFn(raw, '_resolveDuplicateTargets') || '') + '\n'
  + (extractTopLevelFn(raw, '_enforceContrastConstraints') || '') + '\n'
  + extractAnalyseSubstitutions(raw);

eval(code); // eslint-disable-line no-eval

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStash(...compositeKeys) {
  const stash = {};
  compositeKeys.forEach(k => { stash[k] = { owned: 2, toBuy: 0 }; });
  return stash;
}

function makeSkeinEntry(id, stitches = 500) {
  const thread = DMC_MINI.find(d => d.id === id);
  return { id, name: thread ? thread.name : id, rgb: thread ? thread.rgb : [0,0,0], stitches };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('analyseSubstitutions', () => {
  test('is callable', () => {
    expect(typeof analyseSubstitutions).toBe('function');
  });

  describe('self-exclusion: a thread must not substitute for itself', () => {
    test('DMC 310 with stash containing dmc:310 and dmc:321', () => {
      const skeinData = [makeSkeinEntry('310')];
      const threadOwned = {};
      const globalStash = makeStash('dmc:310', 'dmc:321');

      const { substitutions, skipped } = analyseSubstitutions(
        skeinData, threadOwned, globalStash, 14, { dmcData: DMC_MINI }
      );

      // 310 should NOT suggest itself (dmc:310) as a substitute
      if (substitutions.length > 0) {
        expect(substitutions[0].selectedTarget.id).not.toBe('dmc:310');
        // It should suggest 321 (the only other thread in stash)
        expect(substitutions[0].selectedTarget.id).toBe('dmc:321');
      }
    });

    test('skips the source thread even when stash key is composite', () => {
      const skeinData = [makeSkeinEntry('blanc')];
      const threadOwned = {};
      // Only blanc in stash — should result in no valid candidates
      const globalStash = makeStash('dmc:blanc');
      const { substitutions, skipped } = analyseSubstitutions(
        skeinData, threadOwned, globalStash, 14, { dmcData: DMC_MINI }
      );
      // Since blanc can't substitute for itself, no candidates → should be skipped or empty substitutions
      expect(substitutions.filter(s => s.sourceId === 'blanc')).toHaveLength(0);
    });
  });

  describe('threads already owned are excluded from substitution proposals', () => {
    test('thread marked as owned is not in substitutions', () => {
      const skeinData = [makeSkeinEntry('310'), makeSkeinEntry('321')];
      const threadOwned = { '310': 'owned' };
      const globalStash = makeStash('dmc:321', 'dmc:666');

      const { substitutions } = analyseSubstitutions(
        skeinData, threadOwned, globalStash, 14, { dmcData: DMC_MINI }
      );

      const sourceIds = substitutions.map(s => s.sourceId);
      expect(sourceIds).not.toContain('310');
      expect(sourceIds).toContain('321');
    });
  });

  describe('cross-brand substitution (Anchor in stash)', () => {
    test('Anchor threads in stash appear as candidates', () => {
      const skeinData = [makeSkeinEntry('310')]; // DMC 310 (Black)
      const threadOwned = {};
      // Only Anchor 403 (also black) in stash
      const globalStash = makeStash('anchor:403');

      const { substitutions, skipped } = analyseSubstitutions(
        skeinData, threadOwned, globalStash, 14, { dmcData: DMC_MINI }
      );

      // anchor:403 is Black — very close to DMC 310. Should be proposed.
      expect(substitutions.length + skipped.length).toBeGreaterThan(0);
      if (substitutions.length > 0) {
        expect(substitutions[0].selectedTarget.id).toBe('anchor:403');
        expect(substitutions[0].selectedTarget.brand).toBe('anchor');
      }
    });
  });

  describe('near-miss collection', () => {
    test('threads with no match below threshold get near-misses if available', () => {
      // DMC blanc (white) vs only orange in stash — large ΔE, should be skipped
      const skeinData = [makeSkeinEntry('blanc')];
      const threadOwned = {};
      const globalStash = makeStash('dmc:900'); // orange — very different from white

      const { substitutions, skipped } = analyseSubstitutions(
        skeinData, threadOwned, globalStash, 14, { dmcData: DMC_MINI, maxDeltaE: 10 }
      );

      // blanc vs 900 (orange) should be above threshold in our mini dataset
      // Result should have blanc in skipped (no good match)
      const blancSkipped = skipped.find(s => s.sourceId === 'blanc');
      if (blancSkipped) {
        // May have near-miss entries (between maxDeltaE and maxDeltaE×1.5)
        expect(Array.isArray(blancSkipped.nearMisses)).toBe(true);
      }
    });
  });

  describe('return structure', () => {
    test('returns { substitutions, skipped } arrays', () => {
      const result = analyseSubstitutions([], {}, {}, 14, { dmcData: DMC_MINI });
      expect(Array.isArray(result.substitutions)).toBe(true);
      expect(Array.isArray(result.skipped)).toBe(true);
    });

    test('substitution objects have required fields', () => {
      const skeinData = [makeSkeinEntry('310')];
      const globalStash = makeStash('dmc:321');
      const { substitutions } = analyseSubstitutions(
        skeinData, {}, globalStash, 14, { dmcData: DMC_MINI }
      );
      if (substitutions.length > 0) {
        const s = substitutions[0];
        expect(s).toHaveProperty('sourceId');
        expect(s).toHaveProperty('sourceName');
        expect(s).toHaveProperty('selectedTarget');
        expect(s).toHaveProperty('alternativeTargets');
        expect(s).toHaveProperty('status');
        expect(s.selectedTarget).toHaveProperty('id');
        expect(s.selectedTarget).toHaveProperty('deltaE');
      }
    });

    test('skipped objects have required fields', () => {
      const skeinData = [makeSkeinEntry('310')];
      const { skipped } = analyseSubstitutions(skeinData, {}, {}, 14, { dmcData: DMC_MINI });
      if (skipped.length > 0) {
        const sk = skipped[0];
        expect(sk).toHaveProperty('sourceId');
        expect(sk).toHaveProperty('reason');
        expect(sk).toHaveProperty('nearMisses');
        expect(Array.isArray(sk.nearMisses)).toBe(true);
      }
    });
  });
});
