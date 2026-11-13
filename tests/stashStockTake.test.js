/**
 * Stock-take (docs/stash-redesign/hub-and-stock-take-plan.md, Phase 4):
 * the code matcher behind "Next thread", the line that describes a match,
 * and the end-of-session summary.
 */
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../manager-app.js'), 'utf8');
const rules = source.slice(source.indexOf('const OPENED_SKEIN'), source.indexOf('// Opened-skein level as a small pie'));
const stock = source.slice(source.indexOf('// Numbers compare without leading zeros'), source.indexOf('const STOCK_TAKE_WHITES'));
const S = new Function(rules + '\n' + stock + '\nreturn { normaliseThreadCode, matchThreadCode, describeThreadMatch, summariseStockTake };')();

const T = (brand, id, name) => ({ brand, id, name: name || 'Thread ' + id, compositeKey: brand + ':' + id });
const items = [
  T('dmc', 'blanc', 'White'), T('dmc', 'ecru', 'Ecru'), T('dmc', 'B5200', 'Snow White'),
  T('dmc', '01', 'White Tin'), T('dmc', '31', 'Blueberry'), T('dmc', '310', 'Black'), T('dmc', '3104'),
  T('dmc', '791'), T('dmc', '792'), T('dmc', '799'),
  T('anchor', '1', 'White'), T('anchor', '403', 'Black'), T('anchor', '1047'),
];

describe('matching what was typed', () => {
  test('a number names its thread, and longer numbers still match', () => {
    const m = S.matchThreadCode('31', 'dmc', items);
    expect(m.exact.id).toBe('31');
    expect(m.matches.map(d => d.id)).toEqual(['31', '310', '3104']);
  });

  test('words match as typed, in any case', () => {
    expect(S.matchThreadCode('blanc', 'dmc', items).exact.id).toBe('blanc');
    expect(S.matchThreadCode('ECRU', 'dmc', items).exact.id).toBe('ecru');
    expect(S.matchThreadCode('b5200', 'dmc', items).exact.id).toBe('B5200');
  });

  test('leading zeros are optional', () => {
    expect(S.matchThreadCode('1', 'dmc', items).exact.id).toBe('01');
    expect(S.matchThreadCode('01', 'dmc', items).exact.id).toBe('01');
    expect(S.matchThreadCode('0403', 'anchor', items).exact.id).toBe('403');
    expect(S.normaliseThreadCode(' 007 ')).toBe('7');
    expect(S.normaliseThreadCode('B5200')).toBe('b5200');
  });

  test('the brand chooses the catalogue', () => {
    expect(S.matchThreadCode('1', 'anchor', items).exact.compositeKey).toBe('anchor:1');
    expect(S.matchThreadCode('310', 'anchor', items).exact).toBeNull();
    expect(S.matchThreadCode('1047', 'anchor', items).exact.id).toBe('1047');
  });

  test('nothing typed matches nothing', () => {
    expect(S.matchThreadCode('  ', 'dmc', items)).toEqual({ exact: null, matches: [] });
  });
});

describe('the line under the entry box', () => {
  const say = (q, b) => S.describeThreadMatch(q, b === 'anchor' ? 'Anchor' : 'DMC', S.matchThreadCode(q, b || 'dmc', items));
  test('an exact match names the thread and says when more numbers start the same', () => {
    expect(say('310')).toBe('DMC 310 Black (1 more start with 310)');
    expect(say('blanc')).toBe('DMC blanc White');
  });
  test('a partial number gives the range', () => {
    expect(say('79')).toBe('Matches 791 to 799');
  });
  test('an unknown number says so', () => {
    expect(say('999')).toBe('No DMC thread 999');
    expect(say('310', 'anchor')).toBe('No Anchor thread 310');
  });
});

describe('summary', () => {
  test('counts unchanged, changed and new threads', () => {
    const e = (bo, bp, ao, ap) => ({ before: { owned: bo, partialStatus: bp }, after: { owned: ao, partialStatus: ap } });
    expect(S.summariseStockTake([
      e(3, null, 3, null),              // unchanged
      e(3, null, 5, null),              // changed count
      e(1, null, 1, 'about-half'),      // changed opened skein
      e(0, null, 2, null),              // new
      e(0, 'used-up', 0, 'remnant'),    // back in the stash: new
      e(2, null, 0, 'used-up'),         // used up: changed
    ])).toEqual({ counted: 6, unchanged: 1, changed: 3, added: 2 });
  });
});

describe('wiring', () => {
  test('Stock-take opens from Add threads, the phone button, Import and export and the command palette', () => {
    expect(source).toMatch(/close\(\); setStockTakeOpen\(true\);/);
    expect(source).toMatch(/className="stash-fab" onClick=\{\(\) => setStockTakeOpen\(true\)\}/);
    expect(source).toMatch(/Start a stock-take/);
    expect(source).toMatch(/id: 'mgr_stock_take'/);
  });

  test('counts are written through updateThread, opened level first', () => {
    const fn = source.slice(source.indexOf('const setThreadCount = useCallback('), source.indexOf('const addThreadToStash'));
    expect(fn.indexOf('"partialStatus"')).toBeLessThan(fn.indexOf('"owned"'));
  });

  test('Undo all restores every counted thread to its snapshot', () => {
    const fn = source.slice(source.indexOf('  function undoAll() {'), source.indexOf('// Threads in your stash that this stock-take'));
    expect(fn).toMatch(/entries\.forEach\(e => onSet\(e\.item\.compositeKey, e\.before\.owned, e\.before\.partialStatus\)\)/);
  });

  test('marking uncounted threads used up needs its own confirmation step', () => {
    expect(source).toMatch(/onClick=\{\(\) => setPhase\("usedup"\)\}/);
    expect(source).toMatch(/\{phase === "usedup" && \(/);
  });
});
