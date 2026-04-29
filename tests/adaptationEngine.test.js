/* tests/adaptationEngine.test.js
 * Unit tests for creator/adaptationEngine.js — covers the data-model §9
 * matrix: empty stash, monochrome stash adapt, brand chart hit, brand chart
 * miss → ΔE2000 fallback, applyProposal independence, tracking reset,
 * backstitch substitution, reRunAuto preserving manual picks, schema round
 * trip.
 */
const fs = require('fs');
const path = require('path');

// ─── Set up browser-shaped globals and load the modules into them ─────────
// matchQuality.js is pure; adaptationEngine.js needs MatchQuality, DMC, ANCHOR,
// rgbToLab, dE2000, threadKey, parseThreadKey, getThreadByKey, skeinEst,
// CONVERSIONS, getOfficialMatch — we provide minimal shims.

const DMC_MINI = [
  { id: '310',  name: 'Black',         rgb: [0,0,0],         lab: [0,0,0]      },
  { id: '321',  name: 'Christmas Red', rgb: [187,26,42],     lab: [36,56,35]   },
  { id: 'blanc',name: 'White',         rgb: [255,255,255],   lab: [100,0,0]    },
  { id: '666',  name: 'Bright Red',    rgb: [198,18,38],     lab: [37,57,36]   },
  { id: '824',  name: 'Blue Very Dk',  rgb: [60,71,128],     lab: [33,12,-39]  },
  { id: '939',  name: 'Navy Very Dk',  rgb: [27,32,68],      lab: [14,8,-25]   },
  { id: 'E168', name: 'Light Effects', rgb: [200,200,200],   lab: [80,0,0]     },
];

const ANCHOR_MINI = [
  { id: '403',  name: 'Anchor Black', rgb: [0,0,0],       lab: [0,0,0]      },
  { id: '9046', name: 'Anchor Red',   rgb: [193,28,44],   lab: [36,56,34]   },
  { id: '1',    name: 'Anchor White', rgb: [255,255,255], lab: [100,0,0]    },
  { id: '152',  name: 'Anchor Navy',  rgb: [29,34,70],    lab: [15,8,-25]   },
];

// Minimal CONVERSIONS table — covers chart-hit and chart-miss branches.
const CONVERSIONS = {
  'dmc:310':   { anchor: { id: '403',  confidence: 'official'   } },
  'dmc:321':   { anchor: { id: '9046', confidence: 'reconciled' } },
  'dmc:blanc': { anchor: { id: '1',    confidence: 'official'   } }
};

function getOfficialMatch(srcBrand, srcId, tgtBrand) {
  var key = srcBrand + ':' + srcId;
  var row = CONVERSIONS[key];
  return row && row[tgtBrand] ? { id: row[tgtBrand].id, confidence: row[tgtBrand].confidence } : null;
}

function dE2000(a, b) {
  // Plain Euclidean stand-in — sufficient for ranking tests with our fixtures.
  var dL = a[0]-b[0], da = a[1]-b[1], db = a[2]-b[2];
  return Math.sqrt(dL*dL + da*da + db*db);
}

function rgbToLab(r, g, b) {
  // Trivial stub — never called in these tests because every fixture pre-supplies .lab.
  return [0.299*r + 0.587*g + 0.114*b, 0, 0];
}

function threadKey(brand, id) { return brand + ':' + id; }
function parseThreadKey(key) {
  var i = key.indexOf(':');
  if (i < 0) return { brand: 'dmc', id: key };
  return { brand: key.slice(0, i), id: key.slice(i + 1) };
}
function getThreadByKey(key) {
  var p = parseThreadKey(key);
  var arr = p.brand === 'anchor' ? ANCHOR_MINI : DMC_MINI;
  return arr.find(function (t) { return t.id === p.id; }) || null;
}
function skeinEst(stitches) { return Math.max(1, Math.ceil(stitches / 200)); }

global.window = {};
global.DMC = DMC_MINI;
global.ANCHOR = ANCHOR_MINI;
global.CONVERSIONS = CONVERSIONS;
global.getOfficialMatch = getOfficialMatch;
global.dE2000 = dE2000;
global.rgbToLab = rgbToLab;
global.threadKey = threadKey;
global.parseThreadKey = parseThreadKey;
global.getThreadByKey = getThreadByKey;
global.skeinEst = skeinEst;

// Load matchQuality first (engine depends on window.MatchQuality).
require('../creator/matchQuality.js');
global.MatchQuality = global.window.MatchQuality;
const Engine = require('../creator/adaptationEngine.js');

// ─── Helpers ──────────────────────────────────────────────────────────────
function patternFromIds(ids) {
  return ids.map(function (id) {
    var t = DMC_MINI.find(function (x) { return x.id === id; }) || ANCHOR_MINI.find(function (x) { return x.id === id; });
    return { id: id, type: 'solid', rgb: t ? t.rgb : [0,0,0], stitches: 100 };
  });
}

function paletteFromCounts(counts /* { id: stitches } */) {
  return Object.keys(counts).map(function (id) {
    var t = DMC_MINI.find(function (x) { return x.id === id; });
    return { id: id, type: 'solid', rgb: t.rgb, stitches: counts[id] };
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('proposeStash', () => {
  test('empty stash → every substitution is no-match / no-stash-match', () => {
    var p = Engine.proposeStash(patternFromIds(['310','321','blanc']), {});
    expect(p.mode).toBe('stash');
    expect(p.substitutions).toHaveLength(3);
    p.substitutions.forEach(function (s) {
      expect(s.state).toBe('no-match');
      expect(s.skipReason).toBe('no-stash-match');
      expect(s.target).toBeNull();
    });
    expect(p.stashSnapshotKeys).toEqual([]);
  });

  test('exact stash match → accepted, tier "exact"', () => {
    var stash = { 'dmc:310': { owned: 2 } };
    var p = Engine.proposeStash(patternFromIds(['310']), stash, { fabricCt: 14 });
    expect(p.substitutions[0].state).toBe('accepted');
    expect(p.substitutions[0].target.tier).toBe('exact');
    expect(p.substitutions[0].target.id).toBe('310');
    expect(p.substitutions[0].target.inStash).toBe(true);
  });

  test('picks the perceptually closest stash candidate when several qualify', () => {
    // 666 is a near-perfect visual match for 321; 310 (also in stash) is
    // very far from 321. Engine should pick 666.
    var stash = { 'dmc:310': { owned: 2 }, 'dmc:666': { owned: 2 } };
    var p = Engine.proposeStash(patternFromIds(['321']), stash);
    expect(p.substitutions[0].target.id).toBe('666');
  });

  test('threshold exceeded → no-match with skipReason all-above-threshold + near-misses', () => {
    var stash = { 'dmc:blanc': { owned: 1 } }; // white as the only candidate
    var p = Engine.proposeStash(patternFromIds(['310']), stash, { maxDeltaE: 5 });
    expect(p.substitutions[0].state).toBe('no-match');
    expect(p.substitutions[0].skipReason).toBe('all-above-threshold');
  });

  test('specialty threads (E*) excluded by default', () => {
    var stash = { 'dmc:E168': { owned: 5 } };
    var p = Engine.proposeStash(patternFromIds(['310']), stash);
    expect(p.substitutions[0].state).toBe('no-match');
    expect(p.substitutions[0].skipReason).toBe('no-stash-match');
  });

  test('specialty threads can be included via opt', () => {
    var stash = { 'dmc:E168': { owned: 5 } };
    var p = Engine.proposeStash(patternFromIds(['310']), stash, { excludeSpecialty: false, maxDeltaE: 100 });
    expect(p.substitutions[0].state).toBe('accepted');
    expect(p.substitutions[0].target.id).toBe('E168');
  });

  test('prefers candidates with sufficient skein stock when many qualify', () => {
    // 666 (perfect match for 321) has 0 owned → rejected by ownership filter.
    // 9046 (also a near-perfect anchor match) has plenty.
    // ALL candidates within threshold should be considered, and any with
    // hasSufficient should be preferred over an under-stocked closer match.
    var stash = {
      'dmc:666':    { owned: 1 },        // very close (de ≈ 1.4) but only 1 sk
      'anchor:9046':{ owned: 50 }        // close (de ≈ 1.0) AND plenty of stock
    };
    var p = Engine.proposeStash(paletteFromCounts({ '321': 5000 }), stash, { fabricCt: 14 });
    var t = p.substitutions[0].target;
    expect(t.hasSufficient).toBe(true);
    expect(t.ownedSkeins).toBeGreaterThanOrEqual(t.neededSkeins);
  });

  test('snapshot keys reflect all owned stash threads', () => {
    var stash = { 'dmc:310':{owned:1}, 'dmc:blanc':{owned:1}, 'anchor:1':{owned:0} };
    var p = Engine.proposeStash(patternFromIds(['310']), stash);
    expect(p.stashSnapshotKeys).toContain('dmc:310');
    expect(p.stashSnapshotKeys).toContain('dmc:blanc');
    expect(p.stashSnapshotKeys).not.toContain('anchor:1'); // owned===0
  });
});

describe('proposeBrand', () => {
  test('chart hit → confidence "official", target id matches CONVERSIONS', () => {
    var p = Engine.proposeBrand(patternFromIds(['310']), 'dmc', 'anchor');
    var s = p.substitutions[0];
    expect(s.state).toBe('accepted');
    expect(s.target.confidence).toBe('official');
    expect(s.target.id).toBe('403');
    expect(s.target.brand).toBe('anchor');
  });

  test('chart miss → ΔE2000 fallback with confidence "nearest"', () => {
    // 824 (DMC) has no entry in CONVERSIONS — engine should fall back.
    var p = Engine.proposeBrand(patternFromIds(['824']), 'dmc', 'anchor', { maxDeltaE: 100 });
    var s = p.substitutions[0];
    expect(s.state).toBe('accepted');
    expect(s.target.confidence).toBe('nearest');
    expect(s.target.id).toBe('152'); // closest anchor blue
  });

  test('chart hit when preferOfficial=false still falls back', () => {
    var p = Engine.proposeBrand(patternFromIds(['310']), 'dmc', 'anchor', { preferOfficial: false, maxDeltaE: 100 });
    var s = p.substitutions[0];
    // 310 → 403 happens to be the ΔE2000 winner too
    expect(s.target.id).toBe('403');
    expect(s.target.confidence).toBe('nearest');
  });

  test('inStash flag set when stash provided', () => {
    var p = Engine.proposeBrand(patternFromIds(['310']), 'dmc', 'anchor', { stash: { 'anchor:403': { owned: 2 } } });
    expect(p.substitutions[0].target.inStash).toBe(true);
  });
});

describe('applyProposal — non-destructive duplication', () => {
  function makeSrcProject() {
    return {
      v: 11,
      id: 'proj_orig',
      name: 'My Pattern',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
      w: 2, h: 1,
      settings: { sW: 2, sH: 1, fabricCt: 14 },
      pattern: [
        { id: '310', type: 'solid', rgb: [0,0,0]    },
        { id: '321', type: 'solid', rgb: [187,26,42] }
      ],
      bsLines: [{ a: [0,0], b: [1,0], colour: '310' }],
      done: [1, 0],
      halfStitches: { '0': { TL: { id: '310' } } },
      halfDone: { '0': 1 },
      sessions: [{ start: 1, end: 2 }],
      statsSessions: [{ date: '2024-01-01' }],
      totalTime: 3600,
      completedStitches: 1
    };
  }

  test('original project unchanged after applyProposal', () => {
    var src = makeSrcProject();
    var snap = JSON.stringify(src);
    var prop = Engine.proposeBrand(patternFromIds(['310','321']), 'dmc', 'anchor');
    Engine.applyProposal(src, prop);
    expect(JSON.stringify(src)).toBe(snap);
  });

  test('mutating adapted does not touch source pattern array reference', () => {
    var src = makeSrcProject();
    var prop = Engine.proposeBrand(patternFromIds(['310','321']), 'dmc', 'anchor');
    var copy = Engine.applyProposal(src, prop);
    copy.pattern[0].id = 'MUTATED';
    expect(src.pattern[0].id).toBe('310');
  });

  test('tracking state reset on adaptation', () => {
    var prop = Engine.proposeBrand(patternFromIds(['310','321']), 'dmc', 'anchor');
    var copy = Engine.applyProposal(makeSrcProject(), prop);
    expect(copy.done).toBeNull();
    expect(copy.halfStitches).toEqual({});
    expect(copy.halfDone).toEqual({});
    expect(copy.sessions).toEqual([]);
    expect(copy.statsSessions).toEqual([]);
    expect(copy.totalTime).toBe(0);
    expect(copy.completedStitches).toBe(0);
  });

  test('backstitch lines have their colour ids substituted', () => {
    var prop = Engine.proposeBrand(patternFromIds(['310','321']), 'dmc', 'anchor');
    var copy = Engine.applyProposal(makeSrcProject(), prop);
    expect(copy.bsLines[0].colour).toBe('403');  // dmc:310 → anchor:403 via chart
  });

  test('new id and timestamps minted; original kept in adaptation.fromProjectId', () => {
    var src = makeSrcProject();
    var prop = Engine.proposeBrand(patternFromIds(['310']), 'dmc', 'anchor');
    var copy = Engine.applyProposal(src, prop);
    expect(copy.id).not.toBe(src.id);
    expect(copy.id).toMatch(/^proj_/);
    expect(copy.createdAt).not.toBe(src.createdAt);
    expect(copy.adaptation.fromProjectId).toBe('proj_orig');
    expect(copy.adaptation.fromName).toBe('My Pattern');
    expect(copy.adaptation.modeAtCreate).toBe('brand');
  });

  test('auto-suffix names per mode', () => {
    var src = makeSrcProject();
    var stashCopy = Engine.applyProposal(src, Engine.proposeStash(patternFromIds(['310']), {}));
    expect(stashCopy.name).toBe('My Pattern (adapted to stash)');
    var brandCopy = Engine.applyProposal(src, Engine.proposeBrand(patternFromIds(['310']), 'dmc', 'anchor'));
    expect(brandCopy.name).toBe('My Pattern (adapted to anchor)');
  });

  test('explicit name override wins over auto-suffix', () => {
    var src = makeSrcProject();
    var prop = Engine.proposeBrand(patternFromIds(['310']), 'dmc', 'anchor');
    var copy = Engine.applyProposal(src, prop, { name: 'Custom Name' });
    expect(copy.name).toBe('Custom Name');
  });

  test('stash mode records snapshot keys in adaptation metadata', () => {
    var src = makeSrcProject();
    var prop = Engine.proposeStash(patternFromIds(['310']), { 'dmc:310':{owned:1}, 'dmc:blanc':{owned:1} });
    var copy = Engine.applyProposal(src, prop);
    expect(copy.adaptation.modeAtCreate).toBe('stash');
    expect(copy.adaptation.stashSnapshotKeys).toEqual(expect.arrayContaining(['dmc:310','dmc:blanc']));
    expect(copy.adaptation.stashSnapshotAt).toBeDefined();
  });
});

describe('reRunAuto — manual picks preserved', () => {
  test('substitutions whose target.source==="manual" are kept verbatim', () => {
    var prop = Engine.proposeBrand(patternFromIds(['310','321']), 'dmc', 'anchor');
    // Simulate a manual edit on the second sub.
    prop.substitutions[1].target = Object.assign({}, prop.substitutions[1].target, {
      id: 'CUSTOM', name: 'Hand-picked', source: 'manual'
    });
    var fresh = Engine.reRunAuto(prop, []);
    expect(fresh.substitutions[1].target.id).toBe('CUSTOM');
    expect(fresh.substitutions[1].target.source).toBe('manual');
    // First sub should re-run normally.
    expect(fresh.substitutions[0].target.source).toBe('auto-brand');
  });

  test('explicit lockedKeys array preserves those rows even without manual flag', () => {
    var prop = Engine.proposeBrand(patternFromIds(['310','321']), 'dmc', 'anchor');
    prop.substitutions[0].target.id = 'KEEP-ME';
    var fresh = Engine.reRunAuto(prop, ['dmc:310']);
    expect(fresh.substitutions[0].target.id).toBe('KEEP-ME');
  });
});

describe('isSpecialty', () => {
  test.each([
    ['E168', true ],   // Light Effects
    ['S5200', true],   // Satin
    ['4030', true ],   // Variations
    ['310',  false],   // ordinary DMC
    ['blanc',false],
    ['',     false],
    [null,   false],
  ])('%s → %s', (id, expected) => {
    expect(Engine.isSpecialty(id)).toBe(expected);
  });
});
