/* tests/import/pipeline.test.js — Unit 1: core pipeline + registry. */

const path = require('path');
const ENGINE = require(path.resolve(__dirname, '..', '..', 'import-engine', 'index.js'));

function makeProbe(extra) {
  return Object.assign({
    fileName: 'sample.pdf',
    mimeType: 'application/pdf',
    bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    fullBytes: () => Promise.resolve(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
  }, extra || {});
}

function freshRegistry() {
  // Wipe registered strategies between tests by unregistering all.
  for (const s of ENGINE.listStrategies().slice()) {
    ENGINE.unregister(s.id);
  }
}

describe('import-engine: registry', () => {
  beforeEach(freshRegistry);

  it('registers and lists strategies', () => {
    ENGINE.register({ id: 'a', formats: ['pdf'], canHandle: async () => 0.5, parse: async () => ({}) });
    expect(ENGINE.listStrategies()).toHaveLength(1);
  });

  it('rejects malformed strategies', () => {
    expect(() => ENGINE.register({})).toThrow(/id required/);
    expect(() => ENGINE.register({ id: 'x' })).toThrow(/canHandle required/);
    expect(() => ENGINE.register({ id: 'x', canHandle: () => 0 })).toThrow(/parse required/);
  });

  it('replaces an existing registration with the same id (hot-swap)', async () => {
    ENGINE.register({ id: 'pdf', canHandle: async () => 0.4, parse: async () => ({ tag: 'old' }) });
    ENGINE.register({ id: 'pdf', canHandle: async () => 0.9, parse: async () => ({ tag: 'new' }) });
    const picked = await ENGINE.pick(makeProbe({ format: 'pdf' }));
    const r = await picked.parse();
    expect(r.tag).toBe('new');
  });

  it('picks the highest-scoring strategy', async () => {
    ENGINE.register({ id: 'low', formats: ['pdf'], canHandle: async () => 0.3, parse: async () => ({}) });
    ENGINE.register({ id: 'high', formats: ['pdf'], canHandle: async () => 0.9, parse: async () => ({}) });
    const picked = await ENGINE.pick(makeProbe({ format: 'pdf' }));
    expect(picked.id).toBe('high');
  });

  it('skips strategies whose formats list excludes the probe', async () => {
    ENGINE.register({ id: 'oxs', formats: ['oxs'], canHandle: async () => 1, parse: async () => ({}) });
    const picked = await ENGINE.pick(makeProbe({ format: 'pdf' }));
    expect(picked).toBeNull();
  });

  it('treats canHandle exceptions as score 0', async () => {
    ENGINE.register({ id: 'bad', canHandle: async () => { throw new Error('boom'); }, parse: async () => ({}) });
    ENGINE.register({ id: 'good', canHandle: async () => 0.5, parse: async () => ({}) });
    const picked = await ENGINE.pick(makeProbe({ format: 'pdf' }));
    expect(picked.id).toBe('good');
  });
});

describe('import-engine: pipeline', () => {
  beforeEach(freshRegistry);

  it('runs end-to-end with a mock strategy', async () => {
    ENGINE.register({
      id: 'mock-pdf',
      formats: ['pdf'],
      canHandle: async () => 0.9,
      parse: async () => ({
        grid: [
          { x: 0, y: 0, source: { kind: 'dmc', id: '310' }, confidence: 1 },
          { x: 1, y: 0, source: { kind: 'dmc', id: '550' }, confidence: 0.9 },
        ],
        legend: [
          { code: '310', confidence: 1 },
          { code: '550', confidence: 0.9 },
        ],
        meta: { publisher: 'TestCo', title: 'Mock' },
        flags: { warnings: [], uncertainCells: 0 },
      }),
    });

    const result = await ENGINE.importPattern({
      name: 'mock.pdf', type: 'application/pdf',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });

    expect(result.ok).toBe(true);
    expect(result.publisher).toBe('TestCo');
    expect(result.project.v).toBe(8);
    expect(result.project.w).toBe(2);
    expect(result.project.h).toBe(1);
    expect(result.confidence.overall).toBeGreaterThan(0.85);
  });

  it('returns UnsupportedError when no strategy matches', async () => {
    const result = await ENGINE.importPattern({
      name: 'mystery.weird', type: '',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    expect(result.ok).toBe(false);
    expect(result.error.name).toBe('ImportUnsupportedError');
  });

  it('returns ParseError when the strategy throws', async () => {
    ENGINE.register({
      id: 'broken', formats: ['pdf'],
      canHandle: async () => 0.5,
      parse: async () => { throw new Error('boom'); },
    });
    const result = await ENGINE.importPattern({
      name: 'broken.pdf', type: 'application/pdf',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    expect(result.ok).toBe(false);
    expect(result.error.name).toBe('ImportParseError');
    expect(result.error.message).toMatch(/boom/);
  });

  it('respects cancellation', async () => {
    ENGINE.register({
      id: 'slow', formats: ['pdf'],
      canHandle: async () => 0.5,
      parse: async (probe, opts, ctx) => {
        // Strategy takes a tick; meanwhile the caller cancels.
        await new Promise(r => setTimeout(r, 5));
        return { grid: [], legend: [], meta: {}, flags: { warnings: [], uncertainCells: 0 } };
      },
    });
    const cancelToken = ENGINE.makeAbortToken();
    const promise = ENGINE.importPattern({
      name: 'x.pdf', type: 'application/pdf',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    }, { cancelToken });
    cancelToken.abort();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error.name).toBe('ImportAbortedError');
  });

  it('propagates strategy warnings into the result', async () => {
    ENGINE.register({
      id: 'warner', formats: ['pdf'],
      canHandle: async () => 0.5,
      parse: async () => ({
        grid: [{ x: 0, y: 0, source: { kind: 'dmc', id: '310' }, confidence: 0.9 }],
        legend: [{ code: '310', confidence: 0.9 }],
        meta: {},
        flags: { warnings: ['LAYOUT_INDETERMINATE'], uncertainCells: 0 },
      }),
    });
    const result = await ENGINE.importPattern({
      name: 'w.pdf', type: 'application/pdf',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.some(w => w.message === 'LAYOUT_INDETERMINATE')).toBe(true);
  });

  it('reports progress for each stage', async () => {
    ENGINE.register({
      id: 'tiny', formats: ['pdf'],
      canHandle: async () => 0.5,
      parse: async () => ({
        grid: [{ x: 0, y: 0, source: { kind: 'dmc', id: '310' }, confidence: 1 }],
        legend: [{ code: '310', confidence: 1 }],
        meta: {},
        flags: { warnings: [], uncertainCells: 0 },
      }),
    });
    const stages = [];
    await ENGINE.importPattern({
      name: 't.pdf', type: 'application/pdf',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    }, { onProgress: (msg) => stages.push(msg.stage) });
    expect(stages).toEqual(expect.arrayContaining(['sniff', 'classify', 'extract', 'assemble', 'palette', 'validate', 'materialise']));
  });
});

describe('import-engine: confidence helpers', () => {
  it('combineConfidence returns the minimum', () => {
    expect(ENGINE.combineConfidence(1, 0.8, 0.5)).toBe(0.5);
    expect(ENGINE.combineConfidence(1, 1, 1)).toBe(1);
    expect(ENGINE.combineConfidence(0.9)).toBe(0.9);
    expect(ENGINE.combineConfidence()).toBe(1);
  });

  it('combineConfidence clamps to [0,1]', () => {
    expect(ENGINE.combineConfidence(-0.2, 0.5)).toBe(0);
    expect(ENGINE.combineConfidence(1.5, 2)).toBe(1);
  });

  it('pickReviewMode honours the locked thresholds', () => {
    expect(ENGINE.pickReviewMode(0.99, [])).toBe('fast-path');
    expect(ENGINE.pickReviewMode(0.85, [])).toBe('standard');
    expect(ENGINE.pickReviewMode(0.6, [])).toBe('guided');
    expect(ENGINE.pickReviewMode(0.99, [{ severity: 'error', code: 'X' }])).toBe('guided');
  });

  it('exposes the threshold constants', () => {
    expect(ENGINE.THRESHOLDS.fastPath).toBe(0.95);
    expect(ENGINE.THRESHOLDS.standard).toBe(0.80);
  });
});
