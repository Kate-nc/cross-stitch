const fs = require('fs');

// Extract the pure helper functions from useMagicWand.js using eval.
// The file wraps everything inside window.useMagicWand = function(...) { ... }.
// We extract the inner functions by regex.
function extractFunctions() {
  const code = fs.readFileSync('./creator/useMagicWand.js', 'utf8');

  // Extract function bodies using regex
  function extractFn(name) {
    // Match: function name(...) { ... } with balanced braces
    var re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
    var m = re.exec(code);
    if (!m) throw new Error('Cannot find function ' + name);
    var start = m.index + m[0].length - 1; // the opening brace
    var depth = 1, i = start + 1;
    while (depth > 0 && i < code.length) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') depth--;
      i++;
    }
    return code.substring(m.index, i);
  }

  // Build a mini-module with the pure functions
  var fnCode = [
    extractFn('labFromEntry'),
    extractFn('deltaE'),
    extractFn('getCellLab'),
    extractFn('floodSelect'),
    extractFn('globalSelect'),
    extractFn('mergeMasks')
  ].join('\n');

  // Provide rgbToLab stub for getCellLab fallback
  var env = {};
  var wrappedCode = '(function(rgbToLab) {\n' + fnCode +
    '\nreturn { labFromEntry: labFromEntry, deltaE: deltaE, getCellLab: getCellLab, floodSelect: floodSelect, globalSelect: globalSelect, mergeMasks: mergeMasks };\n})';
  var factory = eval(wrappedCode); // eslint-disable-line no-eval
  return factory(function rgbToLab(r, g, b) {
    // Simplified sRGB→Lab for test purposes (good enough for delta checks)
    return [r * 0.3 + g * 0.6 + b * 0.1, r - g, g - b];
  });
}

var fns = extractFunctions();
var deltaE = fns.deltaE;
var labFromEntry = fns.labFromEntry;
var getCellLab = fns.getCellLab;
var floodSelect = fns.floodSelect;
var globalSelect = fns.globalSelect;
var mergeMasks = fns.mergeMasks;

// ─── Test helpers ──────────────────────────────────────────────────────────────

// Build a flat pattern array for a small grid
function makePattern(w, h, colorGrid) {
  // colorGrid: array of rows, each row an array of colour ids (or "__skip__")
  var pat = [];
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var id = colorGrid[y][x];
      if (id === "__skip__" || id === "__empty__") {
        pat.push({ id: id });
      } else {
        pat.push({ id: id, type: "solid", rgb: [0, 0, 0] });
      }
    }
  }
  return pat;
}

function makeCmap(entries) {
  // entries: { id: { rgb, lab? } }
  var cmap = {};
  for (var id in entries) {
    cmap[id] = Object.assign({ id: id }, entries[id]);
  }
  return cmap;
}

function maskCount(mask) {
  var c = 0;
  for (var i = 0; i < mask.length; i++) if (mask[i]) c++;
  return c;
}

// ─── deltaE tests ──────────────────────────────────────────────────────────────

describe('useMagicWand deltaE', function() {
  it('returns 0 for identical Lab arrays', function() {
    expect(deltaE([50, 20, -10], [50, 20, -10])).toBe(0);
  });

  it('computes correct Euclidean distance', function() {
    // dL=3, da=4, db=0 → sqrt(9+16) = 5
    expect(deltaE([50, 20, 10], [53, 24, 10])).toBe(5);
  });

  it('uses array indexing (not object properties)', function() {
    // Regression: old code used la.L, la.a, la.b which gave NaN
    var result = deltaE([50, 20, 10], [55, 25, 15]);
    expect(Number.isNaN(result)).toBe(false);
    expect(result).toBeGreaterThan(0);
  });
});

// ─── labFromEntry tests ────────────────────────────────────────────────────────

describe('useMagicWand labFromEntry', function() {
  it('returns lab array when entry has lab as array', function() {
    var entry = { lab: [53.2, 80.1, 67.2] };
    expect(labFromEntry(entry)).toEqual([53.2, 80.1, 67.2]);
  });

  it('converts lab object {L,a,b} to array', function() {
    var entry = { lab: { L: 50, a: 20, b: -10 } };
    expect(labFromEntry(entry)).toEqual([50, 20, -10]);
  });

  it('falls back to rgbToLab when no lab property', function() {
    var entry = { rgb: [255, 0, 0] };
    var result = labFromEntry(entry);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(3);
  });

  it('returns [0,0,0] for null/undefined entry', function() {
    expect(labFromEntry(null)).toEqual([0, 0, 0]);
    expect(labFromEntry(undefined)).toEqual([0, 0, 0]);
  });
});

// ─── floodSelect tests ────────────────────────────────────────────────────────

describe('useMagicWand floodSelect', function() {
  // 3x3 grid: all same colour "310"
  var allSame = makePattern(3, 3, [
    ["310", "310", "310"],
    ["310", "310", "310"],
    ["310", "310", "310"]
  ]);
  var cmap310 = makeCmap({ "310": { rgb: [0, 0, 0], lab: [0, 0, 0] } });

  it('selects all connected same-colour cells with tolerance 0', function() {
    var mask = floodSelect(allSame, cmap310, 3, 3, 1, 1, 0);
    expect(maskCount(mask)).toBe(9);
  });

  it('returns empty mask when clicking __skip__ cell', function() {
    var pat = makePattern(3, 3, [
      ["310", "310",     "310"],
      ["310", "__skip__", "310"],
      ["310", "310",     "310"]
    ]);
    var mask = floodSelect(pat, cmap310, 3, 3, 1, 1, 0);
    expect(maskCount(mask)).toBe(0);
  });

  it('does not cross different-colour boundary at tolerance 0', function() {
    // Two colour regions separated by a different colour
    var cmap = makeCmap({
      "310": { rgb: [0, 0, 0], lab: [0, 0, 0] },
      "666": { rgb: [255, 0, 0], lab: [53, 80, 67] }
    });
    var pat = makePattern(5, 1, [
      ["310", "310", "666", "310", "310"]
    ]);
    var mask = floodSelect(pat, cmap, 5, 1, 0, 0, 0);
    expect(maskCount(mask)).toBe(2);
    expect(mask[0]).toBe(1);
    expect(mask[1]).toBe(1);
    expect(mask[2]).toBe(0);
    expect(mask[3]).toBe(0);
    expect(mask[4]).toBe(0);
  });

  it('respects tolerance for similar colours', function() {
    // Two colours with small Lab distance
    var cmap = makeCmap({
      "A": { rgb: [100, 100, 100], lab: [50, 0, 0] },
      "B": { rgb: [102, 102, 102], lab: [52, 0, 0] }
    });
    var pat = makePattern(3, 1, [["A", "B", "A"]]);
    // tolerance 0: should NOT cross B
    var mask0 = floodSelect(pat, cmap, 3, 1, 0, 0, 0);
    expect(maskCount(mask0)).toBe(1);
    // tolerance 5: should cross B (dE = 2)
    var mask5 = floodSelect(pat, cmap, 3, 1, 0, 0, 5);
    expect(maskCount(mask5)).toBe(3);
  });

  it('selects only 4-connected (not diagonal)', function() {
    var cmap = makeCmap({
      "A": { rgb: [0, 0, 0], lab: [0, 0, 0] },
      "B": { rgb: [255, 255, 255], lab: [100, 0, 0] }
    });
    // Diagonal layout:
    // A B
    // B A
    var pat = makePattern(2, 2, [
      ["A", "B"],
      ["B", "A"]
    ]);
    var mask = floodSelect(pat, cmap, 2, 2, 0, 0, 0);
    expect(maskCount(mask)).toBe(1); // only the clicked cell
    expect(mask[0]).toBe(1);
    expect(mask[3]).toBe(0); // diagonal A not connected
  });
});

// ─── globalSelect tests ───────────────────────────────────────────────────────

describe('useMagicWand globalSelect', function() {
  it('selects all matching cells globally, ignoring connectivity', function() {
    var cmap = makeCmap({
      "A": { rgb: [0, 0, 0], lab: [0, 0, 0] },
      "B": { rgb: [255, 255, 255], lab: [100, 0, 0] }
    });
    // A is scattered:
    // A B A
    // B B B
    // A B A
    var pat = makePattern(3, 3, [
      ["A", "B", "A"],
      ["B", "B", "B"],
      ["A", "B", "A"]
    ]);
    var mask = globalSelect(pat, cmap, 3, 3, 0, 0, 0);
    expect(maskCount(mask)).toBe(4);
    expect(mask[0]).toBe(1);
    expect(mask[2]).toBe(1);
    expect(mask[6]).toBe(1);
    expect(mask[8]).toBe(1);
  });

  it('skips __skip__ and __empty__ cells', function() {
    var cmap = makeCmap({ "A": { rgb: [0, 0, 0], lab: [0, 0, 0] } });
    var pat = makePattern(3, 1, [["A", "__skip__", "__empty__"]]);
    var mask = globalSelect(pat, cmap, 3, 1, 0, 0, 0);
    expect(maskCount(mask)).toBe(1);
    expect(mask[0]).toBe(1);
  });

  it('returns empty mask on empty cell click', function() {
    var cmap = makeCmap({ "A": { rgb: [0, 0, 0], lab: [0, 0, 0] } });
    var pat = makePattern(2, 1, [["A", "__skip__"]]);
    var mask = globalSelect(pat, cmap, 2, 1, 1, 0, 0);
    expect(maskCount(mask)).toBe(0);
  });
});

// ─── mergeMasks tests ──────────────────────────────────────────────────────────

describe('useMagicWand mergeMasks', function() {
  it('replace: uses new mask only', function() {
    var existing = new Uint8Array([1, 1, 0, 0]);
    var newMask  = new Uint8Array([0, 0, 1, 1]);
    var result = mergeMasks(existing, newMask, "replace", 4);
    expect(Array.from(result)).toEqual([0, 0, 1, 1]);
  });

  it('add: union of existing and new', function() {
    var existing = new Uint8Array([1, 0, 0, 0]);
    var newMask  = new Uint8Array([0, 0, 1, 0]);
    var result = mergeMasks(existing, newMask, "add", 4);
    expect(Array.from(result)).toEqual([1, 0, 1, 0]);
  });

  it('subtract: removes new from existing', function() {
    var existing = new Uint8Array([1, 1, 1, 0]);
    var newMask  = new Uint8Array([0, 1, 0, 0]);
    var result = mergeMasks(existing, newMask, "subtract", 4);
    expect(Array.from(result)).toEqual([1, 0, 1, 0]);
  });

  it('intersect: keeps only overlapping', function() {
    var existing = new Uint8Array([1, 1, 0, 0]);
    var newMask  = new Uint8Array([0, 1, 1, 0]);
    var result = mergeMasks(existing, newMask, "intersect", 4);
    expect(Array.from(result)).toEqual([0, 1, 0, 0]);
  });

  it('handles null existing mask (fresh selection)', function() {
    var newMask = new Uint8Array([1, 0, 1, 0]);
    var result = mergeMasks(null, newMask, "add", 4);
    expect(Array.from(result)).toEqual([1, 0, 1, 0]);
  });
});
