/**
 * tests/statsStoredPattern.test.js
 *
 * Regression: opening another project's stats (a project tab in the stats
 * view, or a project card on the Stats page before the tracker has loaded
 * it) crashed with "Stats failed to render — Cannot read properties of
 * undefined (reading '0')".
 *
 * StatsContainer fed the project's raw stored grid to the dashboard. Saved
 * cells have rgb stripped wherever the DMC catalogue can rebuild it
 * (stripCellForSave), and compact-format projects keep `.p` instead of
 * `.pattern`, so the comparison canvas read `cell.rgb[0]` on undefined for
 * every done stitch.
 *
 * These tests mount the real components in jsdom with React 18.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const APP_SCRIPTS = ['constants.js', 'dmc-data.js', 'colour-utils.js', 'helpers.js', 'icons.js', 'components.js', 'insights-engine.js', 'components-stats.js'];

function makeWindow() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/stitch.html'
  });
  const w = dom.window;
  const fills = [];
  w.HTMLCanvasElement.prototype.getContext = function () {
    const ctx = { fillRect() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {}, fillText() {}, measureText: () => ({ width: 0 }) };
    Object.defineProperty(ctx, 'fillStyle', { get: () => '', set: (v) => { fills.push(v); } });
    return ctx;
  };
  w.console.error = () => {};
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  w.eval(read('node_modules/react/umd/react.development.js'));
  w.eval(read('node_modules/react-dom/umd/react-dom.development.js'));
  // One script, so top-level consts (DMC, ...) are shared as they are across
  // <script> tags in the page.
  w.eval(APP_SCRIPTS.map(read).join('\n;\n'));
  return { w, fills };
}

const sW = 4, sH = 4;
const DONE = Array.from({ length: sW * sH }, (_, i) => (i < 6 ? 1 : 0));

async function renderOtherProject(stored) {
  const { w, fills } = makeWindow();
  w.ProjectStorage = {
    listProjects: () => Promise.resolve([{ id: 'current', name: 'Current' }, { id: stored.id, name: stored.name }]),
    get: () => Promise.resolve(stored)
  };
  const root = w.ReactDOM.createRoot(w.document.getElementById('root'));
  w.ReactDOM.flushSync(() => root.render(w.React.createElement(w.StatsContainer, {
    statsTab: stored.id, setStatsTab() {}, onClose() {}, currentProjectId: 'current',
    statsSessions: [], statsSettings: {}, onUpdateSettings() {}, onEditNote() {}, onOpenProject() {}
  })));
  // Wait for the project load and the progress canvas's paint effect (or
  // the error boundary, which replaces it).
  const settled = () => fills.length > 0 || w.document.body.textContent.includes('Stats failed to render');
  for (let i = 0; i < 100 && !settled(); i++) await new Promise((r) => setTimeout(r, 10));
  return { text: w.document.body.textContent, fills };
}

describe('StatsContainer — another project loaded from storage', () => {
  test('cells saved without rgb render, painting catalogue colours', async () => {
    // What stripCellForSave writes for DMC solids: no rgb.
    const pattern = [];
    for (let i = 0; i < sW * sH; i++) pattern.push(i < 8 ? { id: '310', type: 'solid' } : i < 14 ? { id: '321', type: 'solid' } : { id: '__skip__' });
    const { text, fills } = await renderOtherProject({ id: 'other', name: 'Other', settings: { sW, sH }, pattern, done: DONE, statsSessions: [] });
    expect(text).not.toMatch(/Stats failed to render/);
    expect(text).toMatch(/Stats/);
    // Done stitches on the progress canvas use DMC 310's real colour.
    expect(fills).toContain('rgb(0,0,0)');
  });

  test('compact-format projects (.p grid) render and count their stitches', async () => {
    const p = [];
    for (let i = 0; i < sW * sH; i++) p.push(i < 8 ? ['310'] : i < 14 ? ['321'] : ['', 'k']);
    const { text, fills } = await renderOtherProject({ id: 'compact', name: 'Compact', settings: { sW, sH }, p, done: DONE, statsSessions: [] });
    expect(text).not.toMatch(/Stats failed to render/);
    expect(text).toMatch(/6\s*\/\s*14|of 14/);
    expect(fills).toContain('rgb(0,0,0)');
  });
});

describe('restoreStoredPattern', () => {
  const { w } = makeWindow();

  test('rebuilds rgb for stripped cells and keeps skips', () => {
    const out = w.restoreStoredPattern({ pattern: [{ id: '321', type: 'solid' }, { id: '__skip__' }] });
    expect(Array.from(out[0].rgb)).toEqual([199, 43, 59]);
    expect(out[1].id).toBe('__skip__');
  });

  test('expands the compact .p grid, including blends and skips', () => {
    const out = w.restoreStoredPattern({ p: [['310'], ['310+321', 'b'], ['', 'k']] });
    expect(out.map((c) => c.id)).toEqual(['310', '310+321', '__skip__']);
    expect(out[1].type).toBe('blend');
    expect(Array.isArray(out[1].rgb)).toBe(true);
  });

  test('returns null when the project has no grid', () => {
    expect(w.restoreStoredPattern({})).toBeNull();
  });
});

describe('comparison canvases tolerate cells without rgb', () => {
  const { w, fills } = makeWindow();
  const canvas = w.document.createElement('canvas');
  const pat = [{ id: '310', type: 'solid' }, { id: '321', type: 'solid', rgb: [199, 43, 59] }];

  test('renderComparisonCanvas falls back to grey', () => {
    expect(() => w.renderComparisonCanvas(canvas, pat, 2, 1, [1, 1])).not.toThrow();
    expect(fills).toContain('rgb(128,128,128)');
    expect(fills).toContain('rgb(199,43,59)');
  });

  test('renderDiffCanvas falls back to grey', () => {
    expect(() => w.renderDiffCanvas(canvas, pat, 2, 1, [0, 0], [1, 1])).not.toThrow();
  });
});
