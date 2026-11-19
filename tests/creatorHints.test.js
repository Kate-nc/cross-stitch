/**
 * Stage 1 / Task 5 (A2, A3, X3): Hints match the actual controls on screen.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function makeWindow() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.eval(read('node_modules/react/umd/react.development.js'));
  w.eval(read('node_modules/react-dom/umd/react-dom.development.js'));
  w.eval(`
    window.Icons = new Proxy({}, {
      get: function (_, name) {
        return function () { return React.createElement('i', { 'data-icon': String(name) }); };
      }
    });
    var Icons = window.Icons;
  `);
  return w;
}

function renderPatternTab({ coarse = false, drawMode = false, isScratchMode = false, displayPal = [], selectedColorId = null, totalStitchable = 100 }) {
  const w = makeWindow();
  const calls = { sidebarTab: null, panelOpen: null };
  w.Platform = { isCoarsePointer: () => coarse };
  w.formatThread = (t) => (t ? ((t.brand === 'anchor' ? 'Anchor ' : 'DMC ') + t.id + (t.name ? ' ' + t.name : '')) : '');
  w.PatternCanvas = () => w.React.createElement('div', { className: 'stub-canvas' });
  w.MagicWandPanel = () => null;
  w.CreatorReadyBar = () => null;
  w.CreatorContextMenu = () => null;
  const cmap = {};
  displayPal.forEach((p) => { cmap[p.id] = p; });
  w.usePatternData = () => ({
    pat: [{ id: '__empty__' }],
    pal: displayPal,
    displayPal,
    cmap,
    sW: 20,
    sH: 20,
    isScratchMode,
    totalStitchable,
    progressPct: 0,
  });
  w.useCanvas = () => ({
    drawMode,
    activeTool: drawMode ? 'paint' : null,
    brushMode: 'paint',
    stitchType: 'cross',
    selectedColorId,
    cs: 16,
    view: 'both',
    showStitched: false,
    setShowStitched: () => {},
    setSelectionModifier: () => {},
    setContextMenu: () => {},
    setSelectedColorId: () => {},
    clip: null,
  });
  w.useApp = () => ({
    tab: 'pattern',
    readyBarOpen: false,
    coachTipActive: false,
    shortcutsHintDismissed: true,
    setShortcutsHintDismissed: () => {},
    splitPaneEnabled: false,
    previewActive: false,
    scrollRef: { current: null },
    pcRef: { current: null },
    G: 28,
    setSidebarTab: (t) => { calls.sidebarTab = t; },
    setPanelOpen: (v) => { calls.panelOpen = v; },
    setMaterialsTab: () => {},
    setTab: () => {},
  });
  w.useGeneration = () => ({ orphans: 0, disambig: false });
  w.useHover = () => ({ hoverCoords: null });

  w.eval(read('creator/PatternTab.js'));
  w.eval(`
    var root = ReactDOM.createRoot(document.getElementById('root'));
    ReactDOM.flushSync(function () {
      root.render(React.createElement(window.CreatorPatternTab));
    });
  `);
  return { doc: w.document, calls, close: () => w.close() };
}

describe('Hints match the screen (A2, A3, X3)', () => {
  test('desktop Navigate hint names Paint, Fill or Erase (P, F, 5)', () => {
    const r = renderPatternTab({ coarse: false, drawMode: false });
    expect(r.doc.querySelector('.tb-status').textContent).toBe('Drag to pan. Choose Paint, Fill or Erase (P, F, 5) to change stitches.');
    r.close();
  });

  test('touch Navigate hint keeps "Choose Draw to edit"', () => {
    const r = renderPatternTab({ coarse: true, drawMode: false });
    expect(r.doc.querySelector('.tb-status').textContent).toContain('Choose Draw to edit');
    r.close();
  });

  test('blank grid before adding a thread prompts "Choose your first thread" with a button that opens Palette', () => {
    const r = renderPatternTab({ coarse: false, isScratchMode: true, displayPal: [], totalStitchable: 0 });
    const hint = r.doc.querySelector('.scratch-empty-hint');
    expect(hint).not.toBeNull();
    expect(hint.textContent).toContain('Choose your first thread');
    expect(hint.textContent).not.toContain('Colours panel');
    const btn = hint.querySelector('button');
    expect(btn).not.toBeNull();
    btn.click();
    expect(r.calls.sidebarTab).toBe('palette');
    expect(r.calls.panelOpen).toBe(true);
    r.close();
  });

  test('blank grid after adding a thread names the real thread on desktop and touch', () => {
    const pal = [{ id: '310', name: 'Black', rgb: [0, 0, 0], count: 0, brand: 'dmc' }];
    const d = renderPatternTab({ coarse: false, drawMode: true, isScratchMode: true, displayPal: pal, selectedColorId: '310', totalStitchable: 0 });
    expect(d.doc.querySelector('.scratch-empty-hint').textContent).toBe('Click a square to stitch with DMC 310 Black');
    d.close();

    const t = renderPatternTab({ coarse: true, drawMode: true, isScratchMode: true, displayPal: pal, selectedColorId: '310', totalStitchable: 0 });
    expect(t.doc.querySelector('.scratch-empty-hint').textContent).toBe('Tap a square to stitch with DMC 310 Black');
    t.close();
  });

  test('blank grid in Navigate prompts Paint and never names an unselected thread', () => {
    const pal = [{ id: '310', name: 'Black', rgb: [0, 0, 0], count: 0, brand: 'dmc' }];
    const options = { coarse: true, isScratchMode: true, displayPal: pal, totalStitchable: 0 };
    const selected = renderPatternTab({ ...options, selectedColorId: '310' });
    expect(selected.doc.querySelector('.scratch-empty-hint').textContent).toBe('Select Paint to stitch with DMC 310 Black');
    selected.close();

    const cleared = renderPatternTab(options);
    expect(cleared.doc.querySelector('.scratch-empty-hint').textContent).toContain('Choose a working thread');
    expect(cleared.doc.querySelector('.scratch-empty-hint').textContent).not.toContain('DMC 310');
    cleared.close();
  });

  test('Palette summary count is hidden while zero and labelled "Threads used in stitches" when non-zero', () => {
    const sb = read('creator/Sidebar.js');
    expect(sb).toMatch(/window\.creatorThreadCounts\(displayPal\)\.threads > 0 && h\("span", \{className:"palette-counts", title:"Threads used in stitches"/);
  });

  test('review prompt is hidden while the chart has no stitches', () => {
    const compact = read('creator/CompactBar.js');
    expect(compact).toMatch(/hasStitches \? h\("button", \{[^\n]+?"Ready to stitch review"\) : null/);
    const ready = read('creator/ReadyBar.js');
    expect(ready).toMatch(/\(Number\(ctx\.totalStitchable\) \|\| 0\) > 0 && h\("button", \{[^\n]+?"Ready to stitch review"\)/);
  });

  test('no "Colours panel" text remains anywhere in the creator sources', () => {
    const creatorDir = path.join(ROOT, 'creator');
    const files = fs.readdirSync(creatorDir)
      .filter((f) => f.endsWith('.js') && !f.includes('bundle'))
      .map((f) => path.join(creatorDir, f))
      .concat([path.join(ROOT, 'creator-main.js')]);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      expect({ file: path.basename(file), hasColoursPanel: /Colours panel/.test(content) })
        .toEqual({ file: path.basename(file), hasColoursPanel: false });
    }
  });
});
