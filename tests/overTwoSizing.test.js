// Audit B-04 and B-05.
//
// B-04: 25/28/32-count fabrics are stitched over two threads, but the Creator
// divided by the raw count, showing half the real finished size, and the
// skein maths treated 28-count like a fine Aida, needing half the thread.
// B-05: Max colours caps threads, but shopping and stash views counted each
// blend as an extra colour to buy.

const fs = require('fs');
const path = require('path');

function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

// constants.js, pattern-size-calc.js and threadCalc.js share one scope, as on
// a page.
// eslint-disable-next-line no-new-func
const env = new Function(
  read('constants.js') + '\n' + read('pattern-size-calc.js').replace(/if \(typeof module[\s\S]*$/, '') + '\n' +
  read('threadCalc.js').replace(/if \(typeof module[\s\S]*$/, '') + '\n' +
  'return { FABRIC_COUNTS, stitchOverFor, fabricShortLabel, calcDesignSizeIn, finishedSizeText, stitchesToSkeins };'
)();

describe('stitchOverFor', () => {
  test('is 2 for the "(over 2)" fabrics and 1 for Aida', () => {
    env.FABRIC_COUNTS.forEach((f) => {
      expect(env.stitchOverFor(f.ct)).toBe(/over 2/.test(f.label) ? 2 : 1);
    });
    expect(env.stitchOverFor('28')).toBe(2);
    expect(env.stitchOverFor(99)).toBe(1);
  });

  test('fabricShortLabel says so', () => {
    expect(env.fabricShortLabel(28)).toBe('28ct over 2');
    expect(env.fabricShortLabel(14)).toBe('14ct');
  });
});

describe('finished size', () => {
  test('calcDesignSizeIn(80, 80, 28, 2) is about 5.71 in', () => {
    const d = env.calcDesignSizeIn(80, 80, 28, 2);
    expect(d.widthIn).toBeCloseTo(5.714, 2);
    expect(d.heightIn).toBeCloseTo(5.714, 2);
  });

  test('the Creator text for 28 count (over 2) matches 14 count', () => {
    expect(env.finishedSizeText(80, 80, 28)).toBe('5.7 × 5.7 in');
    expect(env.finishedSizeText(80, 80, 14)).toBe('5.7 × 5.7 in');
    expect(env.finishedSizeText(80, 40, 16)).toBe('5.0 × 2.5 in');
  });

  test('the Sidebar uses the shared helper, not sW / fabricCt', () => {
    const sidebar = read('creator/Sidebar.js');
    expect(sidebar).not.toMatch(/ctx\.sW\s*\/\s*\(?\s*(ctx\.)?fabricCt/);
    expect((sidebar.match(/window\.finishedSizeText\(/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('thread estimates', () => {
  test('28 count over 2 needs the same thread as 14 count', () => {
    const a = env.stitchesToSkeins({ stitchCount: 5000, fabricCount: 28 });
    const b = env.stitchesToSkeins({ stitchCount: 5000, fabricCount: 14 });
    expect(a.skeinsExact).toBeCloseTo(b.skeinsExact, 2);
    expect(a.skeinsToBuy).toBe(b.skeinsToBuy);
  });

  test('an explicit stitchOver still wins', () => {
    const over1 = env.stitchesToSkeins({ stitchCount: 5000, fabricCount: 28, stitchOver: 1 });
    const over2 = env.stitchesToSkeins({ stitchCount: 5000, fabricCount: 28, stitchOver: 2 });
    expect(over2.skeinsExact).toBeCloseTo(over1.skeinsExact * 2, 1);
  });
});

describe('buildThreadShoppingRows', () => {
  const src = read('creator/useCreatorState.js');
  const start = src.indexOf('window.buildThreadShoppingRows = function');
  const end = src.indexOf('\n};\n', start) + 3;
  const window = {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'stitchesToSkeins', 'threadKey', 'findThreadInCatalog', 'stashEffectiveQty', src.slice(start, end))(
    window, env.stitchesToSkeins, (b, id) => b + ':' + id, () => null,
    (entry) => entry ? (entry.owned || 0) + ({ 'mostly-full': 0.75, 'about-half': 0.5, remnant: 0.25 }[entry.partialStatus] || 0) : 0);
  const build = window.buildThreadShoppingRows;

  const pal = [
    { id: '310', type: 'solid', count: 1000, rgb: [0, 0, 0], name: 'Black' },
    { id: '310+550', type: 'blend', count: 400, rgb: [30, 0, 40],
      threads: [{ id: '310', name: 'Black', rgb: [0, 0, 0] }, { id: '550', name: 'Violet VDK', rgb: [92, 24, 78] }] },
  ];

  test('one row per thread, blend stitches summed in, no blend row', () => {
    const rows = build(pal, { fabricCt: 14 });
    expect(rows.map((r) => r.p.id)).toEqual(['310', '550']);
    expect(rows[0].p.count).toBe(1400);
    expect(rows[1].p.count).toBe(400);
    expect(rows[1].name).toBe('Violet VDK');
    rows.forEach((r) => expect(r.needed).toBeGreaterThanOrEqual(1));
  });

  test('stash status is per thread', () => {
    const rows = build(pal, { fabricCt: 14, stash: { 'dmc:550': { owned: 5 } } });
    expect(rows.find((r) => r.p.id === '550').status).toBe('owned');
    expect(rows.find((r) => r.p.id === '310').status).toBe('needed');
  });

  test('separates equal numeric IDs by brand, including blend components', () => {
    const rows = build([
      { id: '403', type: 'solid', count: 100, brand: 'dmc' },
      { id: '403', type: 'solid', count: 200, brand: 'anchor' },
      { id: '403+310', type: 'blend', count: 80, threads: [
        { id: '403', brand: 'anchor', name: 'Anchor 403' },
        { id: '310', brand: 'dmc', name: 'DMC 310' }
      ] }
    ], { fabricCt: 14 });
    expect(rows.map((r) => r.key)).toEqual(['dmc:403', 'anchor:403', 'dmc:310']);
    expect(rows.map((r) => r.p.count)).toEqual([100, 280, 80]);
    expect(rows.map((r) => r.p.brand)).toEqual(['dmc', 'anchor', 'dmc']);
  });

  test('counts fractional partial skeins toward owned quantity', () => {
    const rows = build(pal, { fabricCt: 14, stash: { 'dmc:310': { owned: 0, partialStatus: 'mostly-full' } } });
    const row = rows.find((r) => r.key === 'dmc:310');
    expect(row.owned).toBe(0.75);
    expect(row.status).toBe('partial');
  });

  test('skips background and empty cells', () => {
    expect(build([{ id: '__skip__', count: 9 }, { id: '__empty__', count: 9 }], {})).toEqual([]);
  });
});
