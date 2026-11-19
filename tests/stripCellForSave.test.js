// tests/stripCellForSave.test.js
// Tests for the rgb-stripping save helper added to helpers.js.
// Verifies: (1) only safe cells (DMC catalog hits whose rgb matches the
// catalog) lose their rgb; (2) restoreStitch round-trips the stripped cell
// back to the original rgb; (3) the PERF_FLAGS.stripRgbOnSave flag falls
// back to the legacy {id,type,rgb} shape when disabled.

const fs = require('fs');

const helpersSource = fs.readFileSync('./helpers.js', 'utf8');
const colourSource  = fs.readFileSync('./colour-utils.js', 'utf8');

function extractFn(src, name) {
  const start = src.indexOf(`\nfunction ${name}(`);
  if (start === -1) throw new Error(`Could not find function ${name}`);
  let depth = 0, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { if (--depth === 0) return src.slice(start, i + 1); }
    i++;
  }
  throw new Error(`Could not extract function ${name}`);
}

// Minimal DMC catalogue covering the ids used below.
const mockGlobals = `
  var window = { PERF_FLAGS: {} };
  var DMC = [
    { id: '310',  name: 'Black',   rgb: [0, 0, 0],       lab: [0, 0, 0] },
    { id: '321',  name: 'Red',     rgb: [200, 30, 40],   lab: [40, 60, 30] },
    { id: '550',  name: 'Violet',  rgb: [100, 20, 120],  lab: [22, 50, -50] },
    { id: 'blanc',name: 'White',   rgb: [255, 255, 255], lab: [100, 0, 0] }
  ];
  var ANCHOR = [
    { id: '403', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0] }
  ];
  function rgbToLab(r, g, b) { return [r/2.55, 0, 0]; }
`;

const helperFns = mockGlobals
  // Module-level caches the extracted functions close over in helpers.js.
  // _serialisedPatterns memoises serializePattern on the pattern's identity.
  + 'var _DMC_BY_ID=null,_DMC_BY_ID_CI=null,_ANCHOR_BY_ID=null,_serialisedPatterns=new WeakMap();\n'
  + extractFn(helpersSource, '_getDmcById') + '\n'
  + extractFn(helpersSource, 'getDmcByIdCI') + '\n'
  + extractFn(helpersSource, '_getAnchorById') + '\n'
  + extractFn(helpersSource, 'findThreadInCatalog') + '\n'
  + extractFn(helpersSource, 'isBlendId') + '\n'
  + extractFn(helpersSource, 'splitBlendId') + '\n'
  + extractFn(helpersSource, 'cellBrandForSave') + '\n'
  + extractFn(helpersSource, 'stripCellForSave') + '\n'
  + extractFn(helpersSource, 'serializePattern') + '\n'
  + extractFn(colourSource,  '_srgb8ToLinearExact') + '\n'
  + extractFn(colourSource,  '_linearToSrgb8') + '\n'
  + extractFn(colourSource,  'blendThreadRgb') + '\n'
  + extractFn(colourSource,  'legacyBlendRgb') + '\n'
  + extractFn(colourSource,  'restoreStitch') + '\n';

eval(helperFns); // eslint-disable-line no-eval

describe('stripCellForSave — flag ON (default)', () => {
  beforeEach(() => { window.PERF_FLAGS.stripRgbOnSave = true; });

  test('skip cell collapses to bare {id}', () => {
    expect(stripCellForSave({ id: '__skip__', rgb: [255,255,255] }))
      .toEqual({ id: '__skip__' });
  });

  test('empty cell collapses to bare {id}', () => {
    expect(stripCellForSave({ id: '__empty__', rgb: [255,255,255] }))
      .toEqual({ id: '__empty__' });
  });

  test('solid DMC cell with matching rgb is stripped', () => {
    const out = stripCellForSave({ id: '310', type: 'solid', rgb: [0, 0, 0] });
    expect(out).toEqual({ id: '310', type: 'solid' });
  });

  test('solid DMC cell with mismatched rgb keeps rgb', () => {
    // E.g. after a palette-swap that drifted the in-memory colour.
    const out = stripCellForSave({ id: '310', type: 'solid', rgb: [10, 10, 10] });
    expect(out).toEqual({ id: '310', type: 'solid', rgb: [10, 10, 10] });
  });

  test('solid non-DMC custom cell keeps rgb (cannot be reconstructed)', () => {
    const out = stripCellForSave({ id: 'custom-1', type: 'solid', rgb: [12, 34, 56] });
    expect(out).toEqual({ id: 'custom-1', type: 'solid', rgb: [12, 34, 56] });
  });

  test('blend cell with both DMC halves and matching average is stripped', () => {
    // 310 (0,0,0) + 321 (200,30,40), mixed as light → (146,19,26)
    const out = stripCellForSave({ id: '310+321', type: 'blend', rgb: [146, 19, 26] });
    expect(out).toEqual({ id: '310+321', type: 'blend' });
  });

  test('blend cell with mismatched average keeps rgb', () => {
    const out = stripCellForSave({ id: '310+321', type: 'blend', rgb: [50, 50, 50] });
    expect(out).toEqual({ id: '310+321', type: 'blend', rgb: [50, 50, 50] });
  });

  test('blend cell with one non-DMC half keeps rgb', () => {
    const out = stripCellForSave({ id: '310+custom', type: 'blend', rgb: [10, 10, 10] });
    expect(out).toEqual({ id: '310+custom', type: 'blend', rgb: [10, 10, 10] });
  });

  test('cell missing rgb is left alone (no crash)', () => {
    const out = stripCellForSave({ id: '310', type: 'solid' });
    expect(out).toEqual({ id: '310', type: 'solid' });
  });

  test('serializePattern maps over array', () => {
    const pat = [
      { id: '310', type: 'solid', rgb: [0, 0, 0] },
      { id: 'custom', type: 'solid', rgb: [9, 9, 9] },
      { id: '__skip__', rgb: [255, 255, 255] },
      { id: '310+321', type: 'blend', rgb: [100, 15, 20] }
    ];
    const out = serializePattern(pat);
    expect(out).toEqual([
      { id: '310', type: 'solid', rgb:[0,0,0] },
      { id: 'custom', type: 'solid', rgb: [9, 9, 9] },
      { id: '__skip__' },
      { id: '310+321', type: 'blend', rgb:[100,15,20] }
    ]);
  });

  describe('memoisation on the pattern identity', () => {
    // The tracker autosaves every 5 s while stitching, and between saves only
    // `done` changes — `pat` is replaced wholesale on a pattern edit and never
    // mutated in place. Re-serialising was allocating one fresh object per
    // cell each time for no benefit.
    const mk = () => [
      { id: '310', type: 'solid', rgb: [0, 0, 0] },
      { id: 'custom', type: 'solid', rgb: [9, 9, 9] },
    ];

    test('the same pattern array is serialised once', () => {
      const pat = mk();
      expect(serializePattern(pat)).toBe(serializePattern(pat));
    });

    test('a different pattern array is serialised afresh', () => {
      // Equal content, different identity — a real edit replaces the array, so
      // identity is the correct cache key and must not be conflated with
      // deep equality.
      const a = serializePattern(mk());
      const b = serializePattern(mk());
      expect(b).not.toBe(a);
      expect(b).toEqual(a);
    });

    test('an edited pattern is not served from the cache', () => {
      const pat = mk();
      const before = serializePattern(pat);
      const edited = pat.slice();
      edited[0] = { id: '321', type: 'solid', rgb: [200, 30, 40] };
      const after = serializePattern(edited);
      expect(after).not.toBe(before);
      expect(after[0]).toEqual({ id: '321', type: 'solid', rgb:[200,30,40] });
    });

    test('a pattern resized in place re-serialises rather than saving a stale cell count', () => {
      const pat = mk();
      serializePattern(pat);
      pat.push({ id: '550', type: 'solid', rgb: [100, 20, 120] });
      expect(serializePattern(pat)).toHaveLength(3);
    });
  });
});

describe('stripCellForSave — flag OFF (legacy fallback)', () => {
  beforeEach(() => { window.PERF_FLAGS.stripRgbOnSave = false; });

  test('solid DMC cell keeps rgb byte-for-byte', () => {
    expect(stripCellForSave({ id: '310', type: 'solid', rgb: [0, 0, 0] }))
      .toEqual({ id: '310', type: 'solid', rgb: [0, 0, 0] });
  });

  test('blend keeps rgb byte-for-byte', () => {
    expect(stripCellForSave({ id: '310+321', type: 'blend', rgb: [100, 15, 20] }))
      .toEqual({ id: '310+321', type: 'blend', rgb: [100, 15, 20] });
  });

  test('skip still collapses (pre-existing optimisation, not gated)', () => {
    expect(stripCellForSave({ id: '__skip__', rgb: [255,255,255] }))
      .toEqual({ id: '__skip__' });
  });
});

describe('Round-trip: strip → restoreStitch reproduces original rgb', () => {
  beforeEach(() => { window.PERF_FLAGS.stripRgbOnSave = true; });

  test('solid DMC: rgb survives round-trip', () => {
    const original = { id: '550', type: 'solid', rgb: [100, 20, 120] };
    const stripped = stripCellForSave(original);
    expect(stripped.rgb).toBeUndefined();
    const restored = restoreStitch(stripped);
    expect(restored.rgb).toEqual(original.rgb);
    expect(restored.id).toBe(original.id);
  });

  test("blend: an old save's stored-value average follows the threads", () => {
    // Before blends were mixed as light their colour was (100,15,20). A save
    // that kept it was worked out from these threads, so it is recomputed.
    const restored = restoreStitch({ id: '310+321', type: 'blend', rgb: [100, 15, 20] });
    expect(restored.rgb).toEqual([146, 19, 26]);
    // Any other saved colour was chosen, and stays.
    expect(restoreStitch({ id: '310+321', type: 'blend', rgb: [99, 15, 20] }).rgb).toEqual([99, 15, 20]);
  });

  test("blend saved with its recipe: the old average follows the threads, a chosen colour stays", () => {
    // serializePattern saves a blend's threads and colour, so a chart saved
    // before blends were mixed as light reopens through the recipe path.
    const threads = [{ id: '310', rgb: [0, 0, 0] }, { id: '321', rgb: [200, 30, 40] }];
    expect(restoreStitch({ id: '310+321', type: 'blend', rgb: [100, 15, 20], threads: threads }).rgb).toEqual([146, 19, 26]);
    expect(restoreStitch({ id: '310+321', type: 'blend', rgb: [99, 15, 20], threads: threads }).rgb).toEqual([99, 15, 20]);
    // Strand shares: the old weighted average is recognised too.
    const two = { id: '310+321', type: 'blend', blendRatio: [2, 1], threads: threads };
    expect(restoreStitch(Object.assign({ rgb: [67, 10, 13] }, two)).rgb).toEqual(blendThreadRgb([0, 0, 0], [200, 30, 40], 2, 1));
  });

  test('blend: rgb survives round-trip via catalog average', () => {
    const original = { id: '310+321', type: 'blend', rgb: [146, 19, 26] };
    const stripped = stripCellForSave(original);
    expect(stripped.rgb).toBeUndefined();
    const restored = restoreStitch(stripped);
    expect(restored.rgb).toEqual(original.rgb);
  });

  test('non-DMC: rgb is preserved on disk, survives round-trip', () => {
    const original = { id: 'custom-1', type: 'solid', rgb: [12, 34, 56] };
    const stripped = stripCellForSave(original);
    expect(stripped.rgb).toEqual([12, 34, 56]);
    const restored = restoreStitch(stripped);
    expect(restored.rgb).toEqual(original.rgb);
  });

  test('skip cell: round-trips to skip', () => {
    const stripped = stripCellForSave({ id: '__skip__' });
    const restored = restoreStitch(stripped);
    expect(restored.type).toBe('skip');
  });
});
