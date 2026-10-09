/* tests/import/importDestinations.test.js
 *
 * P1-5 (audit IMPORT-06, IMPORT-07): where the import review's buttons go,
 * and which threads count as placeholders.
 */

const path = require('path');
const { loadSource } = require('../_helpers/loadSource');

function loadWireApp(href) {
  jest.resetModules();
  const win = {};
  // location stub — assignments to .href are recorded but do nothing.
  let assigned = null;
  win.location = {
    pathname: '/' + (href || 'home.html'),
    href: 'http://localhost/' + (href || 'home.html'),
  };
  Object.defineProperty(win.location, 'href', {
    configurable: true,
    get() { return this._href; },
    set(v) { assigned = v; this._href = v; },
  });
  win.location._href = 'http://localhost/' + (href || 'home.html');

  const toastCalls = [];
  win.Toast = { show: (opts) => { toastCalls.push(opts); } };

  const saved = [];
  win.ProjectStorage = {
    save: jest.fn((p) => { saved.push(p); return Promise.resolve(p.id); }),
    get: jest.fn((id) => Promise.resolve(saved.find((p) => p.id === id) || null)),
    setActiveProject: jest.fn(),
    clearActiveProject: jest.fn(),
    newId: () => 'proj_test_' + Math.random().toString(36).slice(2, 7),
  };
  win.ImportEngine = {};

  global.window = win;
  global.document = { createElement: () => ({ appendChild() {}, addEventListener() {}, click() {} }), body: { appendChild() {} } };
  global.localStorage = { setItem: () => {}, getItem: () => null };

  // Load the file under test (clean require cache via resetModules above).
  require(path.resolve(__dirname, '..', '..', 'import-engine', 'wireApp.js'));

  return { win, toastCalls, saved, getAssigned: () => assigned };
}

const baseProject = () => ({
  v: 8, w: 2, h: 2, name: 'Test pattern',
  pattern: [{ id: '310' }, { id: '__skip__' }, { id: '__skip__' }, { id: '__skip__' }],
  settings: { sW: 2, sH: 2, fabricCt: 14 },
});

describe('import review destinations', () => {
  it('Start stitching opens the Tracker on the new project', async () => {
    const ctx = loadWireApp('home.html');
    const opts = ctx.win.ImportEngine._destinationOpts('stitch', {});
    const out = await ctx.win.ImportEngine.saveAndNavigate(baseProject(), opts);
    expect(ctx.getAssigned()).toBe('stitch.html?from=home&id=' + encodeURIComponent(out.id));
    expect(ctx.win.ProjectStorage.setActiveProject).toHaveBeenCalledWith(out.id);
  });

  it('Edit first keeps the caller\'s destination, the Creator by default', async () => {
    const ctx = loadWireApp('home.html');
    await ctx.win.ImportEngine.saveAndNavigate(baseProject(), ctx.win.ImportEngine._destinationOpts('edit', {}));
    expect(ctx.getAssigned()).toBe('create.html?from=home');
    const ctx2 = loadWireApp('create.html');
    const o2 = ctx2.win.ImportEngine._destinationOpts('edit', { navigateTo: 'create.html?from=home' });
    expect(o2.navigateTo).toBe('create.html?from=home');
  });

  it('a booklet imported whole goes to Home > Projects, even from Home', async () => {
    const ctx = loadWireApp('home.html');
    const opts = ctx.win.ImportEngine._destinationOpts('home', {});
    await ctx.win.ImportEngine.saveAndNavigate(baseProject(), opts);
    expect(ctx.getAssigned()).toBe('home.html?tab=projects');
  });

  it('the review leads with Edit first only when the import came from the Creator', () => {
    const src = loadSource('import-engine/wireApp.js');
    expect(src).toMatch(/preferEdit: cameFromCreator\(opts\)/);
    expect(src).toMatch(/if \(opts && opts\.navigateTo && \/create\\\.html\/i\.test\(opts\.navigateTo\)\) return true;/);
  });
});

describe('isPlaceholderThread', () => {
  const win = {};
  const fn = loadSource('helpers.js').match(/function isPlaceholderThread[\s\S]*?\n\}/)[0];
  // eslint-disable-next-line no-new-func
  const isPlaceholderThread = new Function(fn + '; return isPlaceholderThread;')();
  void win;

  it('treats the importer\'s U-numbered ids as placeholders', () => {
    expect(isPlaceholderThread('U1')).toBe(true);
    expect(isPlaceholderThread('U12')).toBe(true);
  });

  it('leaves real threads alone', () => {
    for (const id of ['310', 'blanc', 'B5200', 'Ecru', '3865', 'U', 'Ultra', '310+550']) {
      expect(isPlaceholderThread(id)).toBe(false);
    }
    expect(isPlaceholderThread(null)).toBe(false);
  });

  it('honours the import report\'s placeholder list', () => {
    expect(isPlaceholderThread('X9', [{ id: 'X9' }])).toBe(true);
    expect(isPlaceholderThread('310', [{ id: 'X9' }])).toBe(false);
  });
});
