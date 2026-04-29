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
