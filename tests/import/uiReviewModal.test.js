/* tests/import/uiReviewModal.test.js — Unit 12 (pure helper test). */

const path = require('path');

// Stub a minimal React + window so the UI module can register.
const stubH = (type, props) => ({ type, props: props || {} });
global.window = global;
global.React = {
  createElement: stubH,
  useState: (init) => [init, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
};
global.ReactDOM = { render: () => {}, unmountComponentAtNode: () => {} };
global.document = { createElement: () => ({ appendChild: () => {} }), body: { appendChild: () => {} } };
global.Icons = {};

require(path.resolve(__dirname, '..', '..', 'import-engine', 'ui', 'ImportReviewModal.js'));

const { mergeEdits } = window.ImportEngine;

describe('mergeEdits', () => {
  it('returns project unchanged when no edits', () => {
    const p = { name: 'A', settings: { sW: 10, sH: 10, fabricCt: 14 } };
    expect(mergeEdits(p, {})).toBe(p);
    expect(mergeEdits(p, null)).toBe(p);
  });

  it('applies a name edit', () => {
    const p = { name: 'A', settings: { fabricCt: 14 } };
    const out = mergeEdits(p, { name: 'B' });
    expect(out.name).toBe('B');
    expect(out).not.toBe(p);
  });

  it('applies a fabric-count edit while preserving settings', () => {
    const p = { name: 'A', settings: { sW: 80, sH: 80, fabricCt: 14 } };
    const out = mergeEdits(p, { fabricCt: 18 });
    expect(out.settings.fabricCt).toBe(18);
    expect(out.settings.sW).toBe(80);
    expect(out.settings).not.toBe(p.settings);
  });

  it('handles a null project', () => {
    expect(mergeEdits(null, { name: 'X' })).toBeNull();
  });
});

describe('UI registry', () => {
  it('exposes the review API on window.ImportEngine', () => {
    expect(typeof window.ImportEngine.openReview).toBe('function');
    expect(typeof window.ImportEngine.ImportReviewModal).toBe('function');
    expect(typeof window.ImportEngine.ImportPreviewPane).toBe('function');
    expect(typeof window.ImportEngine.ImportPaletteList).toBe('function');
    expect(typeof window.ImportEngine.ImportMetadataForm).toBe('function');
    expect(typeof window.ImportEngine.ImportSideBySide).toBe('function');
    expect(typeof window.ImportEngine.ImportProgress).toBe('function');
    expect(typeof window.ImportEngine.WarningList).toBe('function');
  });
});

describe('mergeEdits — choosing threads for placeholders', () => {
  // A stand-in for the DMC table the PDF importer loads.
  const TABLE = {
    '310': { id: '310', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0] },
    '3371': { id: '3371', name: 'Black Brown', rgb: [30, 17, 8], lab: [5, 4, 6] },
    '321': { id: '321', name: 'Christmas Red', rgb: [199, 43, 59], lab: [43, 63, 30] },
  };
  beforeAll(() => { window.getDmcByIdCI = (id) => TABLE[String(id)] || null; });
  afterAll(() => { delete window.getDmcByIdCI; });

  const cell = (id, extra) => Object.assign({ type: 'solid', id, name: id, rgb: [1, 2, 3], lab: [0, 0, 0], symbol: 'x' }, extra);
  const skip = { type: 'skip', id: '__skip__', rgb: [255, 255, 255] };
  const project = () => ({
    w: 4, h: 1,
    pattern: [cell('U1', { symbol: 'q' }), cell('U2', { symbol: 'r' }), cell('321'), skip],
    partialStitches: [[3, { TL: { id: 'U1', rgb: [1, 2, 3], name: 'U1' } }]],
    importReport: {
      placeholders: [{ id: 'U1', symbol: 'q', reason: 'not-in-key', count: 1 }, { id: 'U2', symbol: 'r', reason: 'not-in-key', count: 1 }],
      warnings: ['2 stitches use a symbol missing from the key (q r) and were imported as placeholders, one per symbol, to be given a thread.', 'Something else.'],
    },
  });

  it('gives a placeholder the chosen DMC thread, everywhere it is used', () => {
    const out = mergeEdits(project(), { threads: { U1: '310' } });
    expect(out.pattern[0]).toEqual(expect.objectContaining({ id: '310', name: 'Black', rgb: [0, 0, 0], symbol: 'q' }));
    expect(out.pattern[1].id).toBe('U2');
    expect(out.pattern[3]).toBe(skip);
    expect(out.partialStitches[0][1].TL).toEqual({ id: '310', rgb: [0, 0, 0], name: 'Black' });
  });

  it('counts the placeholders still to do in place of the importer\'s note', () => {
    const out = mergeEdits(project(), { threads: { U1: '310' } });
    expect(out.importReport.placeholders.map(p => p.id)).toEqual(['U2']);
    expect(out.importReport.warnings).toEqual(['Something else.', '1 symbol still has no thread and keeps its placeholder colour.']);
    const done = mergeEdits(project(), { threads: { U1: '310', U2: '321' } });
    expect(done.importReport.placeholders).toEqual([]);
    expect(done.importReport.warnings).toEqual(['Something else.']);
  });

  it('merges two symbols given the same thread', () => {
    const out = mergeEdits(project(), { threads: { U1: '321', U2: '321' } });
    expect(new Set(out.pattern.slice(0, 3).map(m => m.id))).toEqual(new Set(['321']));
  });

  it('follows a choice made on top of another', () => {
    const out = mergeEdits(project(), { threads: { U1: '310', 310: '3371' } });
    expect(out.pattern[0].id).toBe('3371');
  });

  it('leaves a colour alone when the chosen number is not a thread', () => {
    const out = mergeEdits(project(), { threads: { U1: '99999' } });
    expect(out.pattern[0].id).toBe('U1');
  });

  it('does not apply malformed cyclic assignments', () => {
    const out = mergeEdits(project(), { threads: { U1: '310', 310: '3371', 3371: '310' } });
    expect(out.pattern[0].id).toBe('U1');
  });

  it('does not touch the project it was given', () => {
    const p = project();
    mergeEdits(p, { threads: { U1: '310' } });
    expect(p.pattern[0].id).toBe('U1');
    expect(p.importReport.placeholders).toHaveLength(2);
  });
});

describe('importSummary — the review header', () => {
  const { importSummary } = window.ImportEngine;
  const report = (over) => ({ importReport: Object.assign({
    keyEntries: 9, scanned: false, keyColoursDistinct: false, placeholders: [],
    matched: { symbol: 900, swatch: 95, nearest: 5, catalogue: 0, unresolved: 0 },
  }, over) });

  it('gives the share of stitches matched to the PDF key', () => {
    expect(importSummary(report(), 1)).toEqual(expect.objectContaining({ label: '99% matched to the key', level: 'high' }));
  });

  it('counts nearest-colour matches when the key colours cannot be confused', () => {
    const r = report({ matched: { symbol: 0, swatch: 455, nearest: 4890, catalogue: 0, unresolved: 2 } });
    expect(importSummary(r, 1).label).toBe('8% matched to the key');
    r.importReport.keyColoursDistinct = true;
    expect(importSummary(r, 1).label).toBe('99% matched to the key');
  });

  it('counts fractional stitches by whether their colours match the key exactly or by proximity', () => {
    const r = report({ matched: { symbol: 0, swatch: 0, nearest: 0, catalogue: 0, unresolved: 0, partial: 2, partialSwatch: 1, partialNearest: 1 } });
    expect(importSummary(r, 1).label).toBe('50% matched to the key');
    r.importReport.keyColoursDistinct = true;
    expect(importSummary(r, 1).label).toBe('100% matched to the key');
  });

  it('never rounds up to 100% while something is unmatched', () => {
    const r = report({ matched: { symbol: 999, swatch: 0, nearest: 0, catalogue: 0, unresolved: 1 } });
    expect(importSummary(r, 1).label).toBe('99% matched to the key');
  });

  it('says so for a scan, or a chart with no key', () => {
    expect(importSummary(report({ scanned: true }), 1).label).toBe('Read from a scan');
    expect(importSummary(report({ keyEntries: 0 }), 1).label).toBe('No colour key found');
  });

  it('marks the import low while symbols still need a thread', () => {
    const s = importSummary(report({ placeholders: [{ id: 'U1' }, { id: 'U2' }] }), 1);
    expect(s.level).toBe('low');
    expect(s.detail).toMatch(/2 symbols need a thread/);
  });

  it('keeps the engine figure for formats without an import report', () => {
    expect(importSummary({ pattern: [] }, 0.87)).toEqual(expect.objectContaining({ label: '87% confidence', level: 'medium' }));
  });
});

describe('merging look-alike scanned symbols', () => {
  const { openLookAlikes } = window.ImportEngine;
  const TABLE = { '310': { id: '310', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0] },
                  '321': { id: '321', name: 'Christmas Red', rgb: [199, 43, 59], lab: [43, 63, 30] } };
  beforeAll(() => { window.getDmcByIdCI = (id) => TABLE[String(id)] || null; });
  afterAll(() => { delete window.getDmcByIdCI; });

  const cell = (id, symbol) => ({ type: 'solid', id, name: 'Symbol ' + symbol + ' (unassigned)', rgb: [9, 9, 9], lab: [1, 1, 1], symbol });
  const project = () => ({
    w: 3, h: 1,
    pattern: [cell('S1', '1'), cell('S2', '2'), cell('S3', '3')],
    importReport: {
      placeholders: ['S1', 'S2', 'S3'].map((id, i) => ({ id, symbol: String(i + 1), reason: 'scanned', count: 1 })),
      warnings: ['This chart is a scanned image. 3 different symbols were found and imported as placeholders.'],
    },
  });

  it('merges one placeholder into another, symbol and all', () => {
    const out = mergeEdits(project(), { threads: { S2: 'S1' } });
    expect(out.pattern[1]).toEqual(expect.objectContaining({ id: 'S1', symbol: '1' }));
    expect(out.importReport.placeholders.map(p => p.id)).toEqual(['S1', 'S3']);
  });

  it('gives merged symbols the thread later chosen for either', () => {
    const out = mergeEdits(project(), { threads: { S2: 'S1', S1: '310' } });
    expect(out.pattern.slice(0, 2).map(m => m.id)).toEqual(['310', '310']);
    expect(out.importReport.placeholders.map(p => p.id)).toEqual(['S3']);
  });

  const pairs = [{ a: 'S1', b: 'S2', d: 0.05 }, { a: 'S1', b: 'S3', d: 0.09 }, { a: 'S2', b: 'S3', d: 0.11 }];

  it('asks about every pair at first', () => {
    expect(openLookAlikes(pairs, {}, {}).map(p => p.key)).toEqual(['S1|S2', 'S1|S3', 'S2|S3']);
  });

  it('stops asking about a pair once its symbols are one', () => {
    // S2 merged into S1, then S3 into S1: every pair is now one colour.
    expect(openLookAlikes(pairs, { S2: 'S1' }, {}).map(p => p.key)).toEqual(['S1|S3', 'S2|S3']);
    expect(openLookAlikes(pairs, { S2: 'S1', S3: 'S1' }, {})).toEqual([]);
  });

  it('stops asking about a pair dismissed as different, or both already given threads', () => {
    expect(openLookAlikes(pairs, {}, { 'S1|S2': true }).map(p => p.key)).toEqual(['S1|S3', 'S2|S3']);
    expect(openLookAlikes(pairs, { S1: '310', S2: '321' }, {}).map(p => p.key)).toEqual(['S1|S3', 'S2|S3']);
  });

  it('reports which colours a pair would now join', () => {
    const p = openLookAlikes(pairs, { S1: '310' }, {})[0];
    expect([p.rootA, p.rootB]).toEqual(['310', 'S2']);
  });
});
