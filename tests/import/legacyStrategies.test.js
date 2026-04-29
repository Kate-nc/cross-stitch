/* tests/import/legacyStrategies.test.js — Unit 4: parity tests.
 *
 * For OXS we'd need a DOMParser, which Jest doesn't ship by default — so
 * the OXS strategy parity test asserts the wrapper shape and that errors
 * are translated. Real OXS parsing is covered by the existing
 * tracker/integration tests in the wider suite once Unit 13 lands.
 *
 * For JSON we have a clean parity test against the in-process behaviour.
 */

const path = require('path');
const ENGINE = require(path.resolve(__dirname, '..', '..', 'import-engine', 'index.js'));
const { jsonStrategy } = require(path.resolve(__dirname, '..', '..', 'import-engine', 'strategies', 'jsonStrategy.js'));
const { oxsStrategy } = require(path.resolve(__dirname, '..', '..', 'import-engine', 'strategies', 'oxsStrategy.js'));

beforeEach(() => {
  for (const s of ENGINE.listStrategies().slice()) ENGINE.unregister(s.id);
  ENGINE.register(jsonStrategy);
  ENGINE.register(oxsStrategy);
});

function makeFile(name, type, body) {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  return {
    name, type,
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  };
}

describe('jsonStrategy', () => {
  it('passes through a v8 project verbatim', async () => {
    const proj = {
      v: 8, id: 'proj_x', createdAt: '2024-01-01T00:00:00Z',
      name: 'Saved', w: 2, h: 1,
      settings: { sW: 2, sH: 1, fabricCt: 14 },
      pattern: [{ id: '310', type: 'solid', rgb: [0, 0, 0] }, { id: '__skip__' }],
      bsLines: [], done: null, parkMarkers: [], totalTime: 0, sessions: [], threadOwned: {},
    };
    const f = makeFile('pat.json', 'application/json', JSON.stringify(proj));
    const result = await ENGINE.importPattern(f);
    expect(result.ok).toBe(true);
    expect(result.project.id).toBe('proj_x');
    expect(result.project.pattern).toHaveLength(2);
    expect(result.project.pattern[0].id).toBe('310');
  });

  it('rejects JSON without a pattern field', async () => {
    const f = makeFile('bad.json', 'application/json', JSON.stringify({ v: 8 }));
    const result = await ENGINE.importPattern(f);
    expect(result.ok).toBe(false);
    expect(result.error.name).toBe('ImportParseError');
    expect(result.error.message).toMatch(/pattern/);
  });

  it('rejects malformed JSON with ParseError', async () => {
    const f = makeFile('broken.json', 'application/json', '{ not valid');
    const result = await ENGINE.importPattern(f);
    expect(result.ok).toBe(false);
    expect(result.error.name).toBe('ImportParseError');
  });

  it('synthesises id and createdAt when missing', async () => {
    const proj = { v: 8, w: 1, h: 1, pattern: [{ id: '__skip__' }] };
    const f = makeFile('p.json', 'application/json', JSON.stringify(proj));
    const result = await ENGINE.importPattern(f);
    expect(result.ok).toBe(true);
    expect(typeof result.project.id).toBe('string');
    expect(result.project.id).toMatch(/^proj_/);
    expect(typeof result.project.createdAt).toBe('string');
  });

  it('normalises legacy "p" field into "pattern"', async () => {
    const legacy = { v: 8, w: 1, h: 1, p: [{ id: '__skip__' }] };
    const f = makeFile('legacy.json', 'application/json', JSON.stringify(legacy));
    const result = await ENGINE.importPattern(f);
    expect(result.ok).toBe(true);
    expect(result.project.pattern).toHaveLength(1);
  });
});

describe('oxsStrategy', () => {
  it('errors out helpfully when parseOXS is not loaded', async () => {
    const f = makeFile('p.oxs', 'application/xml', '<?xml version="1.0"?><chart></chart>');
    const result = await ENGINE.importPattern(f);
    expect(result.ok).toBe(false);
    expect(result.error.name).toBe('ImportUnsupportedError');
    expect(result.error.message).toMatch(/parseOXS/);
  });

  it('accepts the format with high confidence on .oxs files', async () => {
    const f = makeFile('p.oxs', 'application/xml', '<?xml version="1.0"?><chart></chart>');
    const score = await oxsStrategy.canHandle({
      fileName: 'p.oxs', mimeType: 'application/xml', format: 'oxs',
      bytes: new TextEncoder().encode('<?xml version="1.0"?><chart></chart>'),
    });
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('translates parser exceptions into ParseError', async () => {
    // Stub a fake parseOXS on globalThis so the strategy picks it up.
    global.window = global.window || {};
    global.window.parseOXS = function () { throw new Error('Invalid OXS file: malformed XML'); };
    try {
      const f = makeFile('p.oxs', 'application/xml', 'not xml');
      const result = await ENGINE.importPattern(f);
      expect(result.ok).toBe(false);
      expect(result.error.name).toBe('ImportParseError');
      expect(result.error.message).toMatch(/malformed/);
    } finally {
      delete global.window.parseOXS;
    }
  });
});

describe('imageStrategy', () => {
  it('declines to handle when no document is available (Node)', async () => {
    const { imageStrategy } = require(path.resolve(__dirname, '..', '..', 'import-engine', 'strategies', 'imageStrategy.js'));
    const score = await imageStrategy.canHandle({ format: 'image', fileName: 'a.png' });
    expect(score).toBe(0);
  });
});
