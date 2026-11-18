/**
 * @jest-environment jsdom
 */
/* tests/convertPanel.test.js ─────────────────────────────────────────────
   The Convert settings panel (creator/ConvertPanel.js), rendered with stub
   Creator contexts:
   - laid out like Edit: the same tab strip and section headings, with the
     steps in the order the choices are made (Picture, Size, Threads, Detail,
     then Project) and a Next button that falls through to the next step;
   - every setting appears once, in one step, and each has a named hint;
   - Generate is pinned underneath with a summary of what it will make, and
     says when a chart already exists and the settings have moved on.
   ─────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');
const React = require('react');
const ReactDOM = require('react-dom');
const ReactDOMClient = require('react-dom/client');
const { act } = require('react-dom/test-utils');

global.IS_REACT_ACT_ENVIRONMENT = true;
global.React = React;
global.ReactDOM = ReactDOM;
window.Icons = new Proxy({}, { get: (_, name) => () => React.createElement('svg', { 'data-icon': String(name) }) });

const components = fs.readFileSync(path.join(__dirname, '..', 'components.js'), 'utf8');
// eslint-disable-next-line no-new-func
Object.assign(global, new Function(components + '\nreturn { InfoIcon: InfoIcon, SliderRow: SliderRow, Tooltip: Tooltip };')());
window.InfoIcon = global.InfoIcon; window.SliderRow = global.SliderRow; window.Tooltip = global.Tooltip;

// What the panel reads from other Creator files.
window.PICTURE_PRESET_ORDER = ['graphic', 'photo', 'pixel'];
window.PICTURE_PRESETS = { graphic: { label: 'Graphic or logo' }, photo: { label: 'Photo' }, pixel: { label: 'Pixel art' } };
window.STITCH_STYLE_ORDER = ['detail', 'balanced', 'tidier', 'easiest'];
window.STITCH_STYLE_LABELS = { detail: 'More detail', balanced: 'Balanced', tidier: 'Tidier', easiest: 'Easiest to stitch' };
window.STITCH_STYLE_DESCRIPTIONS = { photo: { detail: 'd', balanced: 'Balanced desc', tidier: 't', easiest: 'e' } };
window.THREAD_BRANDS = { dmc: { label: 'DMC' }, anchor: { label: 'Anchor' } };
window.threadBrandLabel = (b) => (b === 'anchor' ? 'Anchor' : 'DMC');
window.CONFETTI_HELP = { definition: 'single stitches of a colour on their own; slow to stitch' };
window.finishedSizeText = (w, h) => w + 'x' + h + ' size';
window.fabricShortLabel = (ct) => ct + 'ct';
window.CreatorSizeField = () => React.createElement('div', { 'data-stub': 'size-field' }, 'Size field');
window.CreatorFabricBlock = () => React.createElement('div', { 'data-stub': 'fabric-block' }, 'Fabric block');
window.BlendHelpNote = () => null;
global.StashBridge = { addToStash: () => Promise.resolve() };
global.formatThread = (t) => 'DMC ' + t.id;
global.findThreadInCatalog = () => null;

require('../creator/ConvertPanel.js');

let container, root, gen, ctx, app, cv;
function fresh() {
  const set = () => jest.fn();
  gen = {
    img: { src: 'data:x', width: 400, height: 300, naturalWidth: 400, naturalHeight: 300 },
    pictureType: 'photo', stitchStyleBasis: 'photo', applyPicturePreset: set(),
    exactPixelArt: false, setExactPixelArt: set(),
    skipBg: false, setSkipBg: set(), bgCol: [255, 255, 255], pickBg: false, setPickBg: set(), bgTh: 10, setBgTh: set(),
    bri: 0, setBri: set(), con: 0, setCon: set(), sat: 0, setSat: set(),
    smooth: 0, setSmooth: set(), smoothType: 'median', setSmoothType: set(),
    preSharpen: false, setPreSharpen: set(), preSharpenAmount: 0.5, setPreSharpenAmount: set(),
    convertBrand: 'dmc', setConvertBrand: set(), maxC: 24, setMaxC: set(), effectiveMaxC: 24,
    allowBlends: true, setAllowBlends: set(), blendsAutoDisabled: false,
    minSt: 0, setMinSt: set(), stashConstrained: false, setStashConstrained: set(),
    stitchStyle: 'balanced', applyStitchStyle: set(), dithMode: 'weak', setDith: set(),
    stitchCleanup: { enabled: true, protectDetails: true }, setStitchCleanup: set(), orphans: 2, setOrphans: set(),
    disambig: true, setDisambig: set(), disambigLevel: 'standard', setDisambigLevel: set(),
    variationHistory: [], gallerySlots: [], galleryOpen: false, setGalleryOpen: set(),
    generate: set(), hasGenerated: false, busy: false, origW: 400, origH: 300
  };
  ctx = { sW: 100, sH: 75, fabricCt: 14, chgW: set(), chgH: set(), setArLock: set(), arLock: true, ar: 4 / 3, setFabricCt: set(), pat: null, setGlobalStash: set() };
  app = { convertTab: 'picture', previewStats: null, previewLoading: false, fabricColour: '#FFFFFF', setFabricColour: set(), lastGenSnapshot: null };
  app.setConvertTab = jest.fn((id) => { app.convertTab = id; draw(); });
  cv = { editHistory: [] };
  window.usePatternData = () => ctx;
  window.useCanvas = () => cv;
  window.useApp = () => app;
  window.useGeneration = () => gen;
}
function draw() { act(() => root.render(React.createElement(window.CreatorConvertPanel, {}))); }
function q(sel) { return container.querySelector(sel); }
function all(sel) { return Array.from(container.querySelectorAll(sel)); }
function text() { return container.textContent; }
function hints() { return all('button.info-icon__btn').map((b) => b.getAttribute('aria-label')); }
function headings() { return all('h3.cs-toolsec__title').map((h) => h.textContent); }

beforeEach(() => {
  fresh();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = ReactDOMClient.createRoot(container);
  draw();
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('laid out like Edit, in the order the choices are made', () => {
  test('the steps are the Edit tab strip: Picture, Size, Threads, Detail, Project', () => {
    expect(q('[role="tablist"] .creator-sidebar-tabs')).not.toBeNull();
    const tabs = all('[role="tab"].creator-sidebar-tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Picture', 'Size', 'Threads', 'Detail', 'Project']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(q('[role="tabpanel"]').getAttribute('aria-labelledby')).toBe('convert-tab-picture');
  });

  test('sections use the Edit panel headings (cs-toolsec)', () => {
    expect(all('section.cs-toolsec').length).toBeGreaterThan(0);
    expect(headings()).toEqual(['Picture type', 'Background', 'Adjust picture']);
  });

  test('Next falls through Picture, Size, Threads and Detail to Project', () => {
    const seen = [];
    for (let i = 0; i < 4; i++) {
      const next = all('.cv-next__btn')[0];
      seen.push(next.textContent);
      act(() => next.click());
    }
    expect(seen).toEqual(['Next: Size and fabric', 'Next: Threads', 'Next: Detail and tidiness', 'Next: Project']);
    expect(app.convertTab).toBe('project');
    expect(q('.cv-next__btn')).toBeNull();
  });

  test('arrow keys move between the steps', () => {
    const first = q('#convert-tab-picture');
    act(() => { first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(app.convertTab).toBe('size');
    act(() => { q('#convert-tab-size').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
    expect(app.convertTab).toBe('picture');
  });

  test('an unknown stored step opens Picture', () => {
    app.convertTab = 'dimensions';
    draw();
    expect(q('#convert-tab-picture').getAttribute('aria-selected')).toBe('true');
  });
});

describe('each setting once, each with a named hint', () => {
  const byTab = {
    picture: { headings: ['Picture type', 'Background', 'Adjust picture'],
      hints: ['About Picture type', 'About Background', 'About Adjust picture',
        'About Brightness', 'About Contrast', 'About Saturation', 'About Sharpen details', 'About Soften grainy photos'] },
    size: { headings: [], stubs: ['size-field', 'fabric-block'] },
    threads: { headings: ['Thread brand', 'Number of threads', 'Blends', 'Rare colours', 'Stash'],
      hints: ['About Thread brand', 'About Threads (max)', 'About Allow two-thread blends', 'About Min stitches per colour', 'About Use only stash threads'] },
    detail: { headings: ['Detail and tidiness', 'Shading pattern', 'Tidying', 'Look-alike colours'],
      hints: ['About Detail and tidiness', 'About Shading pattern', 'About Stitch Cleanup', 'About Reduce confetti', 'About Protect fine details',
        'About Keep look-alike colours apart', 'About How strict'] },
    project: { headings: ['Project info'] }
  };
  test.each(Object.keys(byTab))('the %s step', (tab) => {
    app.convertTab = tab; draw();
    expect(headings()).toEqual(byTab[tab].headings);
    (byTab[tab].hints || []).forEach((h) => expect(hints()).toContain(h));
    (byTab[tab].stubs || []).forEach((s) => expect(q('[data-stub="' + s + '"]')).not.toBeNull());
  });

  test('no setting is in two steps', () => {
    const where = {};
    Object.keys(byTab).forEach((tab) => {
      app.convertTab = tab; draw();
      headings().concat(hints()).forEach((name) => {
        expect(where[name]).toBeUndefined();
        where[name] = tab;
      });
    });
  });

  test('radio rows have one Tab stop and arrow keys choose', () => {
    const radios = all('[role="radiogroup"][aria-label="What kind of picture is this?"] [role="radio"]');
    expect(radios.map((r) => r.textContent)).toEqual(['Graphic or logo', 'Photo', 'Pixel art', 'Custom']);
    expect(radios.filter((r) => r.tabIndex === 0).map((r) => r.textContent)).toEqual(['Photo']);
    expect(radios[3].disabled).toBe(true);
    act(() => { radios[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(gen.applyPicturePreset).toHaveBeenLastCalledWith('pixel');
    // Custom is a state, not a choice: arrows skip it.
    act(() => { radios[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(gen.applyPicturePreset).toHaveBeenLastCalledWith('graphic');
  });

  test('checkbox hints sit outside their <label>s', () => {
    all('label.cs-toolsec__check').forEach((l) => expect(l.querySelector('button')).toBeNull());
  });

  test('Reset adjustments appears once the picture is adjusted, and resets it', () => {
    expect(text()).not.toContain('Reset adjustments');
    gen.bri = 10; draw();
    const reset = all('button').find((b) => b.textContent === 'Reset adjustments');
    act(() => reset.click());
    expect(gen.setBri).toHaveBeenCalledWith(0);
    expect(gen.setPreSharpen).toHaveBeenCalledWith(false);
  });
});

describe('the counts come from the preview', () => {
  test('Threads says how many the preview uses', () => {
    app.convertTab = 'threads';
    app.previewStats = { threadsUsed: 18, uniqueColors: 30, stitchable: 7500, blendsUsed: 12, blendPct: 25 };
    draw();
    expect(q('[data-threads-used]').textContent).toBe('In the preview: 18 threads and 30 chart symbols; 12 blends, 25% of stitches. ');
  });

  test('Detail says how many stitches Reduce confetti changed and can show them', () => {
    app.convertTab = 'detail';
    app.previewStats = { stitchable: 2000, tidiedStitches: 50, confettiFinalSingles: 20 };
    app.setShowTidied = jest.fn();
    draw();
    expect(text()).toContain('In the preview, Reduce confetti changed 50 stitches (2.5%).');
    act(() => all('button').find((b) => b.textContent === 'Show them on the preview').click());
    expect(app.setShowTidied).toHaveBeenCalledWith(true);
  });

  test('Stitch Cleanup says what it does for the picture type, and what Off still changes', () => {
    app.convertTab = 'detail';
    // A photo keeps its in-between shades (no edge-shade fold).
    gen.stitchCleanup = { enabled: true, protectDetails: true, foldEdgeShades: false };
    draw();
    expect(text()).toContain('Merges confetti stitches into the colour around them.');
    expect(text()).not.toContain('folds blurry in-between shades');
    gen.orphans = 0; draw();
    expect(text()).toContain('Nothing is tidied while Reduce confetti is Off.');
    // A graphic folds them; so does a chart saved before the setting existed.
    gen.orphans = 2; gen.stitchCleanup = { enabled: true, protectDetails: true };
    draw();
    expect(text()).toContain('Merges confetti stitches and folds blurry in-between shades along edges into the colours either side.');
    // Off no longer claims every stitch stays as matched.
    gen.stitchCleanup = { enabled: false, protectDetails: true };
    draw();
    expect(text()).toContain('Off: no tidying. Colours used by only a few stitches still merge into a neighbouring colour, and Threads (max) still applies.');
    expect(text()).not.toContain('exactly as matched');
  });

  test('Colours to keep lists kept threads, removes them and starts picking', () => {
    app.convertTab = 'threads';
    gen.keepColours = [{ id: '945', name: 'Tawny', rgb: [230, 170, 140] }, { id: '3865', name: 'Winter White', rgb: [250, 247, 240] }];
    gen.keepUnavailable = [];
    gen.setPickKeep = jest.fn(); gen.removeKeepColour = jest.fn();
    draw();
    expect(headings()).toContain('Colours to keep');
    expect(all('[data-keep-id]').map((e) => e.getAttribute('data-keep-id'))).toEqual(['945', '3865']);
    expect(text()).toContain('Kept threads are always in the pattern and count towards Threads (max).');
    act(() => q('button[aria-label="Stop keeping DMC 945 Tawny"]').click());
    expect(gen.removeKeepColour).toHaveBeenCalledWith('945');
    act(() => all('button').find((b) => b.textContent === 'Pick from picture').click());
    expect(gen.setPickKeep).toHaveBeenCalledWith(true);
    // While picking, it says where to click.
    gen.pickKeep = true; draw();
    expect(all('button').find((b) => b.textContent === 'Click a colour in the preview…').getAttribute('aria-pressed')).toBe('true');
    // A kept thread the pattern can't use (another brand, not in the stash) is named.
    gen.pickKeep = false; gen.keepUnavailable = ['3865']; draw();
    expect(text()).toContain("DMC 3865 Winter White isn't among the threads this pattern can use, so it isn't kept.");
    // Exact pixel art keeps every pixel's own colour: no section.
    gen.exactPixelArt = true; draw();
    expect(headings()).not.toContain('Colours to keep');
  });

  test('Background says how many stitches are left unstitched and can show them', () => {
    gen.skipBg = true; gen.bgCol = [230, 230, 230];
    app.previewStats = { stitchable: 6000, skipped: 1500 };
    app.setShowBackground = jest.fn();
    draw();
    expect(text()).toContain('In the preview, 1,500 stitches are left unstitched (20.0% of the chart).');
    act(() => all('button').find((b) => b.textContent === 'Show them on the preview').click());
    expect(app.setShowBackground).toHaveBeenCalledWith(true);
  });
});

describe('Generate', () => {
  test('sits under a summary of what it will make', () => {
    expect(q('[data-convert-summary]').textContent).toBe('Photo · 100 × 75 stitches · up to 24 DMC threads · Balanced');
    const btn = q('.cv-generate');
    expect(btn.getAttribute('aria-label')).toBe('Generate pattern');
    act(() => btn.click());
    expect(gen.generate).toHaveBeenCalled();
  });

  test('with a chart, says how it relates to these settings, without claiming more than it knows', () => {
    ctx.pat = [{}];
    gen.hasGenerated = true;
    const state = () => [q('.cv-footer__state').getAttribute('data-chart-state'), q('.cv-footer__state').textContent];
    app.convertChartState = 'same'; draw();
    expect(state()).toEqual(['same', 'Your chart was made with these settings.']);
    cv.editHistory = [1, 2]; draw();
    expect(state()).toEqual(['same', 'Your chart was made with these settings, then edited. Regenerate starts again from the picture.']);
    app.convertChartState = 'changed'; draw();
    expect(state()).toEqual(['changed', 'The preview shows new settings. Regenerate to replace your chart and its 2 edits.']);
    // A reopened project: nothing is known about how its chart was made.
    app.convertChartState = 'unknown'; cv.editHistory = []; draw();
    expect(state()).toEqual(['unknown', 'Regenerate replaces your chart with one made from these settings.']);
    // The button goes straight to Generate, which asks before replacing an
    // edited or unknown chart (one check for every Regenerate button).
    act(() => q('.cv-generate').click());
    expect(gen.generate).toHaveBeenCalledTimes(1);
  });
});
