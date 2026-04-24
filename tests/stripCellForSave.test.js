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
  + 'var _DMC_BY_ID=null,_ANCHOR_BY_ID=null;\n'
  + extractFn(helpersSource, '_getDmcById') + '\n'
  + extractFn(helpersSource, '_getAnchorById') + '\n'
  + extractFn(helpersSource, 'findThreadInCatalog') + '\n'
  + extractFn(helpersSource, 'isBlendId') + '\n'
  + extractFn(helpersSource, 'splitBlendId') + '\n'
  + extractFn(helpersSource, 'stripCellForSave') + '\n'
  + extractFn(helpersSource, 'serializePattern') + '\n'
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
    // 310 (0,0,0) + 321 (200,30,40) → averaged (100,15,20)
    const out = stripCellForSave({ id: '310+321', type: 'blend', rgb: [100, 15, 20] });
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
      { id: '310', type: 'solid' },
      { id: 'custom', type: 'solid', rgb: [9, 9, 9] },
      { id: '__skip__' },
      { id: '310+321', type: 'blend' }
    ]);
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

  test('blend: rgb survives round-trip via catalog average', () => {
    const original = { id: '310+321', type: 'blend', rgb: [100, 15, 20] };
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
