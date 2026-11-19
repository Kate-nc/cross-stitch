/**
 * Stage 1 / Task 2 (X4): Ready bar reflects the real auto-save state from
 * creator/saveStatus.js rather than claiming "It is saved in your library".
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function renderReadyBar(appOverrides) {
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

  const calls = { retry: 0, download: 0, close: 0 };
  const app = Object.assign({
    readyBarOpen: true,
    setReadyBarOpen: () => { calls.close++; },
    saveStatus: 'idle',
    savedAt: null,
    retryAutoSave: () => { calls.retry++; },
    saveProject: () => { calls.download++; },
    printPdf: () => {},
    handleOpenInTracker: () => {},
    setMaterialsTab: () => {},
    setTab: () => {},
    pictureFromTracker: false,
  }, appOverrides || {});

  w.useApp = () => app;
  w.usePatternData = () => ({
    pat: [{ id: '310' }],
    pal: [{ id: '310', type: 'solid', count: 100 }],
    sW: 100,
    sH: 100,
    totalSkeins: 2,
  });
  w.creatorThreadCounts = () => ({ threads: 1, symbols: 1, blends: 0 });
  w.threadCountsSentence = () => '1 thread';

  w.eval(read('creator/ReadyBar.js'));
  w.eval(`
    var root = ReactDOM.createRoot(document.getElementById('root'));
    ReactDOM.flushSync(function () {
      root.render(React.createElement(window.CreatorReadyBar));
    });
  `);

  return {
    window: w,
    doc: w.document,
    calls,
    close: () => w.close(),
  };
}

describe('CreatorReadyBar truthful save status (X4)', () => {
  test('pending status shows "Saving on this device…" without error buttons', () => {
    const r = renderReadyBar({ saveStatus: 'pending', savedAt: null });
    const bar = r.doc.querySelector('.ready-bar');
    expect(bar.textContent).toContain('Saving on this device\u2026');
    expect(bar.textContent).not.toContain('Saved on this device');
    expect(bar.textContent).not.toContain('saved in your library');
    expect(r.doc.querySelectorAll('.ready-bar__save-actions button').length).toBe(0);
    r.close();
  });

  test('saving status shows "Saving on this device…" without error buttons', () => {
    const r = renderReadyBar({ saveStatus: 'saving', savedAt: null });
    const bar = r.doc.querySelector('.ready-bar');
    expect(bar.textContent).toContain('Saving on this device\u2026');
    expect(bar.textContent).not.toContain('Saved on this device');
    expect(r.doc.querySelectorAll('.ready-bar__save-actions button').length).toBe(0);
    r.close();
  });

  test('idle before first save completes does not claim "Saved"', () => {
    const r = renderReadyBar({ saveStatus: 'idle', savedAt: null });
    const bar = r.doc.querySelector('.ready-bar');
    expect(bar.textContent).toContain('Saving on this device\u2026');
    expect(bar.textContent).not.toContain('Saved on this device');
    r.close();
  });

  test('saved status shows "Saved on this device"', () => {
    const r = renderReadyBar({ saveStatus: 'saved', savedAt: new Date() });
    const bar = r.doc.querySelector('.ready-bar');
    expect(bar.textContent).toContain('Saved on this device');
    expect(bar.classList.contains('ready-bar--error')).toBe(false);
    expect(r.doc.querySelectorAll('.ready-bar__save-actions button').length).toBe(0);
    r.close();
  });

  test('idle after save completes (savedAt set) keeps "Saved on this device"', () => {
    const r = renderReadyBar({ saveStatus: 'idle', savedAt: new Date() });
    const bar = r.doc.querySelector('.ready-bar');
    expect(bar.textContent).toContain('Saved on this device');
    expect(bar.classList.contains('ready-bar--error')).toBe(false);
    r.close();
  });

  test('error status shows "Couldn\'t save on this device" with working Retry and Download project (.json) buttons', () => {
    const r = renderReadyBar({ saveStatus: 'error', savedAt: null });
    const bar = r.doc.querySelector('.ready-bar');
    expect(bar.classList.contains('ready-bar--error')).toBe(true);
    expect(bar.textContent).toContain("Couldn't save on this device");
    expect(bar.textContent).not.toContain('Saved on this device');
    const btns = Array.from(r.doc.querySelectorAll('.ready-bar__save-actions button'));
    expect(btns.map((b) => b.textContent.trim())).toEqual(['Retry', 'Download project (.json)']);
    btns[0].click();
    btns[1].click();
    expect(r.calls.retry).toBe(1);
    expect(r.calls.download).toBe(1);
    expect(r.calls.close).toBe(0);
    r.close();
  });
});
