/**
 * Phone shopping checklist (docs/stash-redesign/hub-and-stock-take-plan.md,
 * Phase 5): ticks kept on the device, rows grouped by pattern.
 */
const fs = require('fs');
const path = require('path');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const source = read('manager-app.js');
const block = source.slice(source.indexOf('const BOUGHT_TICKS_KEY'), source.indexOf('// True while the window is at most'));
const C = new Function(block + '\nreturn { BOUGHT_TICKS_KEY, readBoughtTicks, writeBoughtTicks, pruneBoughtTicks, groupShoppingRows };')();

function memoryStorage(initial) {
  const m = new Map(Object.entries(initial || {}));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), map: m };
}

describe('ticks kept on this device', () => {
  test('round-trips whole skein counts under a versioned key', () => {
    const s = memoryStorage();
    C.writeBoughtTicks(s, { 'dmc:720': 2, 'dmc:3753': 1 });
    expect(C.BOUGHT_TICKS_KEY).toBe('cs_stash_bought_v1');
    expect(C.readBoughtTicks(s)).toEqual({ 'dmc:720': 2, 'dmc:3753': 1 });
  });

  test('no ticks removes the key', () => {
    const s = memoryStorage({ cs_stash_bought_v1: '{"dmc:720":2}' });
    C.writeBoughtTicks(s, {});
    expect(s.map.has('cs_stash_bought_v1')).toBe(false);
  });

  test('bad or hostile values are ignored', () => {
    expect(C.readBoughtTicks(memoryStorage({ cs_stash_bought_v1: '{broken' }))).toEqual({});
    expect(C.readBoughtTicks(memoryStorage({ cs_stash_bought_v1: '[1,2]' }))).toEqual({});
    expect(C.readBoughtTicks(memoryStorage({ cs_stash_bought_v1: '{"a":0,"b":-1,"c":"x","d":2.6,"e":5000,"f":3}' }))).toEqual({ d: 3, f: 3 });
    expect(C.readBoughtTicks(null)).toEqual({});
  });

  test('blocked storage never throws', () => {
    const blocked = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); }, removeItem() { throw Error('denied'); } };
    expect(C.readBoughtTicks(blocked)).toEqual({});
    expect(() => C.writeBoughtTicks(blocked, { a: 1 })).not.toThrow();
  });

  test('ticks for threads that left the list are dropped; otherwise the same object is kept', () => {
    const ticks = { 'dmc:720': 2, 'dmc:3753': 1 };
    expect(C.pruneBoughtTicks(ticks, [{ key: 'dmc:720' }, { key: 'dmc:3753' }])).toBe(ticks);
    expect(C.pruneBoughtTicks(ticks, [{ key: 'dmc:720' }])).toEqual({ 'dmc:720': 2 });
  });

  test('backups leave the ticks out (they belong to this device)', () => {
    const lsKeys = read('backup-restore.js').match(/const LS_KEYS = \[([\s\S]*?)\];/)[1];
    expect(lsKeys).not.toMatch(/cs_stash_bought/);
  });
});

describe('grouping by pattern', () => {
  const rows = ['dmc:310', 'dmc:321', 'dmc:720', 'dmc:3753', 'dmc:3865'].map(key => ({ key }));
  const byKey = {
    'dmc:321': ['Fox', 'Robin'],   // both patterns: listed once, under the first
    'dmc:720': ['Fox'],
    'dmc:310': ['Fox', 'Robin'],   // a conflict only
    'dmc:3865': ['Robin'],
  };

  test('patterns in shortfall order, hand-added threads last', () => {
    const g = C.groupShoppingRows(rows, ['Fox', 'Robin'], byKey);
    expect(g.map(x => [x.title, x.rows.map(r => r.key)])).toEqual([
      ['Fox', ['dmc:310', 'dmc:321', 'dmc:720']],
      ['Robin', ['dmc:3865']],
      ['Added by you', ['dmc:3753']],
    ]);
  });

  test('a pattern named only by a conflict still gets a group, before Added by you', () => {
    const g = C.groupShoppingRows([{ key: 'dmc:310' }, { key: 'dmc:3753' }], [], { 'dmc:310': ['Delft'] });
    expect(g.map(x => x.title)).toEqual(['Delft', 'Added by you']);
  });
});

describe('wiring', () => {
  test('ticks load from and save to this device', () => {
    expect(source).toMatch(/useState\(\(\) => readBoughtTicks\(window\.localStorage\)\)/);
    expect(source).toMatch(/writeBoughtTicks\(window\.localStorage, boughtTicks\)/);
    expect(source).toMatch(/setBoughtTicks\(prev => pruneBoughtTicks\(prev, toBuy\.shopping\)\)/);
  });

  test('phones group the list and pin Copy and Done to the bottom', () => {
    expect(source).toMatch(/groupShoppingRows\(toBuy\.shopping, projectTitles, projectsByKey\)/);
    expect(source).toMatch(/className="stash-shop-footer"/);
    expect(source).toMatch(/"Done: add " \+ plural\(tickedSkeins, 'skein'\)/);
    const css = read('styles.css');
    expect(css).toMatch(/\.stash-shop-footer\{position:sticky;bottom:0;/);
  });
});
