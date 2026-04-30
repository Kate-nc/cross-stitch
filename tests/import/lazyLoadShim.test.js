/* Tests for the lazy-load shim in import-engine/lazy-shim.js.
 *
 * The shim runs in the browser before the real import-engine bundle is
 * fetched. It must:
 *   - install a `window.ImportEngine` placeholder with the public methods
 *     callers expect (`openImportPicker`, `importAndReview`,
 *     `importPattern`, `preload`).
 *   - on first call to any of those methods, append exactly one
 *     <script src="import-engine/bundle.js"> tag to <head>.
 *   - when the bundle resolves (real implementation overwrites the stubs
 *     via Object.assign), forward the original call to the real method
 *     with the original arguments and resolve with its return value.
 *   - subsequent calls reuse the same loadBundle promise (no duplicate
 *     <script> tag, no duplicate fetch).
 *
 * We exercise the shim by reading lazy-shim.js with fs.readFileSync and
 * invoking it as a `new Function('window', 'document', code)` against a
 * tiny browser-shape mock. This matches the regex+eval pattern documented
 * in .github/copilot-instructions.md for testing browser-only code from
 * a Node Jest run.
 */

const fs = require('fs');
const path = require('path');

const SHIM_PATH = path.join(__dirname, '..', '..', 'import-engine', 'lazy-shim.js');
const SHIM_CODE = fs.readFileSync(SHIM_PATH, 'utf8');

function makeMocks() {
  const headChildren = [];
  let appendImpl = null;
  const head = {
    appendChild(node) {
      headChildren.push(node);
      if (appendImpl) appendImpl(node);
      else setImmediate(() => { if (typeof node.onload === 'function') node.onload(); });
    },
  };
  const document = { head, createElement: () => ({ tag: 'script', onload: null, onerror: null, src: null }) };
  const window = {};
  return {
    window, document, headChildren,
    setAppendImpl(fn) { appendImpl = fn; },
  };
}

function loadShim(window, document) {
  // The shim wraps itself in `(function(){ ... })()`. Run it with the
  // browser globals it expects.
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', SHIM_CODE)(window, document);
}

describe('import-engine/lazy-shim.js', () => {
  test('installs window.ImportEngine with the documented public surface', () => {
    const m = makeMocks();
    loadShim(m.window, m.document);
    const eng = m.window.ImportEngine;
    expect(eng).toBeDefined();
    expect(eng.__lazy).toBe(true);
    expect(typeof eng.openImportPicker).toBe('function');
    expect(typeof eng.importAndReview).toBe('function');
    expect(typeof eng.importPattern).toBe('function');
    expect(typeof eng.preload).toBe('function');
  });

  test('does not append any <script> until a method is called', () => {
    const m = makeMocks();
    loadShim(m.window, m.document);
    expect(m.headChildren).toHaveLength(0);
  });

  test('first method call appends exactly one bundle <script> tag', async () => {
    const m = makeMocks();
    loadShim(m.window, m.document);
    m.setAppendImpl((node) => {
      // Simulate the real bundle replacing window.ImportEngine on load.
      m.window.ImportEngine = Object.assign(m.window.ImportEngine || {}, {
        openImportPicker: () => Promise.resolve('real-openImportPicker'),
      });
      setImmediate(() => node.onload());
    });
    const result = await m.window.ImportEngine.openImportPicker();
    expect(result).toBe('real-openImportPicker');
    expect(m.headChildren).toHaveLength(1);
    expect(m.headChildren[0].src).toBe('import-engine/bundle.js');
  });

  test('concurrent calls during loading reuse the same fetch', async () => {
    const m = makeMocks();
    loadShim(m.window, m.document);
    let pendingNode = null;
    m.setAppendImpl((node) => { pendingNode = node; }); // never fire onload
    const p1 = m.window.ImportEngine.openImportPicker();
    const p2 = m.window.ImportEngine.importAndReview('file.pdf');
    expect(m.headChildren).toHaveLength(1);
    // Now install the real engine and fire onload manually.
    m.window.ImportEngine = Object.assign(m.window.ImportEngine || {}, {
      openImportPicker: () => Promise.resolve('A'),
      importAndReview: (f) => Promise.resolve('B-' + f),
    });
    pendingNode.onload();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe('A');
    expect(r2).toBe('B-file.pdf');
    expect(m.headChildren).toHaveLength(1);
  });

  test('preload() warms the bundle without forwarding any call', async () => {
    const m = makeMocks();
    loadShim(m.window, m.document);
    let onloadFired = false;
    m.setAppendImpl((node) => {
      m.window.ImportEngine = Object.assign(m.window.ImportEngine || {}, {
        importPattern: () => Promise.resolve('via-real'),
      });
      setImmediate(() => { onloadFired = true; node.onload(); });
    });
    await m.window.ImportEngine.preload();
    expect(onloadFired).toBe(true);
    expect(m.headChildren).toHaveLength(1);
  });

  test('shim contract is type-compatible with the existing presence checks', () => {
    // home-app.js / creator-main.js gate on
    //   window.ImportEngine && typeof window.ImportEngine.importAndReview === 'function'
    const m = makeMocks();
    loadShim(m.window, m.document);
    const eng = m.window.ImportEngine;
    expect(eng && typeof eng.importAndReview === 'function').toBe(true);
    expect(eng && typeof eng.openImportPicker === 'function').toBe(true);
  });

  test("survives the bundle's Object.assign(window.ImportEngine || {}, …) merge", () => {
    // Mirrors what every IIFE in import-engine/bundle.js does on load.
    const m = makeMocks();
    loadShim(m.window, m.document);
    const beforeRef = m.window.ImportEngine;
    m.window.ImportEngine = Object.assign(m.window.ImportEngine || {}, {
      errors: { Foo: 1 },
      openImportPicker: () => 'real',
    });
    // Reference identity preserved (Object.assign mutates target).
    expect(m.window.ImportEngine).toBe(beforeRef);
    // Real implementation took over the stub.
    expect(m.window.ImportEngine.openImportPicker()).toBe('real');
    // New surface added.
    expect(m.window.ImportEngine.errors.Foo).toBe(1);
  });

  test('does not stomp on an already-loaded real ImportEngine', () => {
    const m = makeMocks();
    const realPicker = () => 'already-real';
    m.window.ImportEngine = { openImportPicker: realPicker, importAndReview: () => {} };
    loadShim(m.window, m.document);
    // Shim should detect the non-lazy ImportEngine and not overwrite it.
    expect(m.window.ImportEngine.openImportPicker).toBe(realPicker);
    expect(m.window.ImportEngine.__lazy).toBeUndefined();
  });
});
