/* tests/import/materialise.test.js — Unit 11. */

const path = require('path');
const ENGINE = require(path.resolve(__dirname, '..', '..', 'import-engine', 'index.js'));
const { materialiseProject, attachOriginalFile } = ENGINE;

describe('materialiseProject', () => {
  it('creates a v8 project with the canonical shape', () => {
    const raw = {
      width: 4, height: 3,
      cells: [
        { col: 0, row: 0, code: '310', color: [0, 0, 0], type: 'full', matchConfidence: 1 },
        { col: 1, row: 0, code: '930', color: [50, 80, 120], type: 'full', matchConfidence: 0.95 },
      ],
    };
    const p = materialiseProject(raw, { fabricCt: 14, name: 'Test' });
    expect(p.v).toBe(8);
    expect(p.w).toBe(4);
    expect(p.h).toBe(3);
    expect(p.name).toBe('Test');
    expect(p.settings).toEqual({ sW: 4, sH: 3, fabricCt: 14 });
    expect(p.pattern).toHaveLength(12);
    expect(p.pattern[0]).toEqual({ id: '310', type: 'solid', rgb: [0, 0, 0] });
    expect(p.pattern[1]).toEqual({ id: '930', type: 'solid', rgb: [50, 80, 120] });
    expect(p.pattern[2]).toEqual({ id: '__skip__' });
    expect(p.done).toBeNull();
    expect(p.parkMarkers).toEqual([]);
    expect(p.totalTime).toBe(0);
    expect(p.sessions).toEqual([]);
    expect(p.threadOwned).toEqual({});
    expect(p.bsLines).toEqual([]);
  });

  it('preserves stitch types other than full', () => {
    const raw = { width: 2, height: 1, cells: [
      { col: 0, row: 0, code: '310', color: [0, 0, 0], type: 'half', matchConfidence: 1 },
      { col: 1, row: 0, code: '930', color: [0, 0, 0], type: 'bs', matchConfidence: 1 },
    ] };
    const p = materialiseProject(raw);
    expect(p.pattern[0].type).toBe('half');
    expect(p.pattern[1].type).toBe('bs');
  });

  it('stores per-cell confidence under _import', () => {
    const raw = { width: 2, height: 1, cells: [
      { col: 0, row: 0, code: '310', color: [0, 0, 0], matchConfidence: 1.0 },
      { col: 1, row: 0, code: '930', color: [0, 0, 0], matchConfidence: 0.5 },
    ] };
    const p = materialiseProject(raw);
    expect(p._import.perCellConfidence).toEqual([1, 0.5]);
  });

  it('passes through legacy projects unchanged', () => {
    const legacy = { v: 8, w: 1, h: 1, name: 'X', settings: { sW: 1, sH: 1, fabricCt: 14 },
      pattern: [{ id: '310', type: 'solid', rgb: [0,0,0] }],
      bsLines: [], done: null, parkMarkers: [], totalTime: 0, sessions: [], threadOwned: {} };
    const p = materialiseProject({ _legacyProject: legacy });
    expect(p).toBe(legacy);
  });

  it('throws on invalid dimensions', () => {
    expect(() => materialiseProject({ width: 0, height: 5, cells: [] })).toThrow();
  });
});

describe('attachOriginalFile', () => {
  it('attaches raw bytes when pako is unavailable', () => {
    const proj = { v: 8 };
    const bytes = new Uint8Array([1, 2, 3]);
    const out = attachOriginalFile(proj, { originalFile: { name: 'a.pdf', type: 'application/pdf', bytes }, pako: null });
    expect(out.meta.attachments.originalFile.encoding).toBe('raw');
    expect(out.meta.attachments.originalFile.bytes).toBe(bytes);
  });

  it('compresses bytes when pako is provided', () => {
    const proj = { v: 8 };
    const bytes = new Uint8Array(1000).map((_, i) => i % 7);
    const fakePako = { deflate: (b) => new Uint8Array([99]) };
    const out = attachOriginalFile(proj, { originalFile: { name: 'a.pdf', bytes }, pako: fakePako });
    expect(out.meta.attachments.originalFile.encoding).toBe('pako-deflate');
    expect(out.meta.attachments.originalFile.bytes[0]).toBe(99);
  });

  it('is a no-op without an originalFile', () => {
    const proj = { v: 8 };
    expect(attachOriginalFile(proj, {}).meta).toBeUndefined();
  });
});
