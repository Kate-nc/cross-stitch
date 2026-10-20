/** @jest-environment jsdom */
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act, Simulate } = require('react-dom/test-utils');
const { browserScripts } = require('./_helpers/browserScripts');

describe('wizard field setters and their component callers', () => {
  let scope, root, host, wizard, previousAct;
  const image = { width: 120, height: 60 };
  beforeEach(() => {
    previousAct = global.IS_REACT_ACT_ENVIRONMENT;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    scope = browserScripts(['creator/useImportWizard.js', 'creator/ImportWizard.js'], {
      React, localStorage, CONFETTI_HELP: { definition: 'single stitches of a colour on their own' }
    });
    host = document.createElement('div'); document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount()); host.remove(); localStorage.clear();
    if (previousAct === undefined) delete global.IS_REACT_ACT_ENVIRONMENT;
    else global.IS_REACT_ACT_ENVIRONMENT = previousAct;
  });
  function mountHook() {
    function Harness() { wizard = scope.useImportWizard({ image, baseName: 'Rose' }); return null; }
    act(() => root.render(React.createElement(Harness)));
  }
  test.each([
    ['Crop', 'crop', { rotate: 90, flipH: true, flipV: false, aspect: 'free' }, p => ({ ...p, rotate: p.rotate + 90 }), p => ({ ...p, flipH: !p.flipH }), { rotate: 180, flipH: false, flipV: false, aspect: 'free' }],
    ['Palette', 'palette', { mode: 'limited', maxColours: 12, allowBlends: true }, p => ({ ...p, maxColours: p.maxColours + 3 }), p => ({ ...p, allowBlends: !p.allowBlends }), { mode: 'limited', maxColours: 15, allowBlends: false }],
    ['Size', 'size', { w: 100, h: 50, fabricCt: 14, lock: true }, p => ({ ...p, w: p.w + 10 }), p => ({ ...p, fabricCt: 18 }), { w: 110, h: 50, fabricCt: 18, lock: true }],
    ['Settings', 'settings', { contrast: 5, skipBg: false, bgThreshold: 15 }, p => ({ ...p, contrast: p.contrast + 5 }), p => ({ ...p, skipBg: !p.skipBg }), { contrast: 10, skipBg: true, bgThreshold: 15 }],
    ['Name', 'name', 'Rose', p => p + ' garden', p => p + ' sampler', 'Rose garden sampler']
  ])('set%s evaluates batched updaters against the latest field', (suffix, key, initial, first, second, expected) => {
    mountHook();
    const siblings = { crop: wizard.crop, palette: wizard.palette, size: wizard.size, settings: wizard.settings, name: wizard.name };
    const setter = wizard['set' + suffix];
    act(() => { setter(initial); setter(first); setter(second); });
    expect(wizard[key]).toEqual(expected);
    for (const sibling of Object.keys(siblings).filter(k => k !== key)) expect(wizard[sibling]).toBe(siblings[sibling]);
    const saved = JSON.parse(localStorage.getItem('cs_import_wizard_draft'));
    expect(saved[key]).toEqual(expected);
    expect(saved.baseName).toBe('Rose');
    expect(saved.imageW).toBe(120);
  });
  test('batched updates to distinct fields survive together and value setters replace a field', () => {
    mountHook();
    const stale = wizard;
    act(() => {
      stale.setCrop(p => ({ ...p, rotate: 180 }));
      stale.setPalette(p => ({ ...p, mode: 'stash' }));
      stale.setSize(p => ({ ...p, fabricCt: 18 }));
      stale.setSettings(p => ({ ...p, contrast: 25 }));
      stale.setName(p => p + ' garden');
    });
    expect(wizard.crop.rotate).toBe(180); expect(wizard.palette.mode).toBe('stash');
    expect(wizard.size.fabricCt).toBe(18); expect(wizard.settings.contrast).toBe(25);
    expect(wizard.name).toBe('Rose garden');
    act(() => wizard.setPalette({ mode: 'dmc', maxColours: 8, allowBlends: false }));
    expect(wizard.palette).toEqual({ mode: 'dmc', maxColours: 8, allowBlends: false });
    let committed;
    act(() => { committed = wizard.commit(); });
    expect(committed).toEqual(expect.objectContaining({ name: 'Rose garden', maxColours: 8, fabricCt: 18,
      crop: wizard.crop, palette: wizard.palette, settings: wizard.settings }));
    expect(localStorage.getItem('cs_import_wizard_draft')).toBeNull();
  });
  function change(selector, value) {
    const node = host.querySelector(selector);
    expect(node).not.toBeNull();
    act(() => Simulate.change(node, { target: { value } }));
  }
  function next() {
    const button = Array.from(host.querySelectorAll('button')).find(b => /Next/.test(b.textContent));
    expect(button).toBeDefined(); act(() => button.click());
  }
  test('component field handlers preserve sibling settings across palette, size and preview steps', () => {
    act(() => root.render(React.createElement(scope.ImportWizard, { image, baseName: 'Rose' })));
    next();
    change('input[value="limited"]', 'limited');
    change('#iw-max-colours', '120');
    change('.iw-step-palette input[type="checkbox"]');
    let saved = JSON.parse(localStorage.getItem('cs_import_wizard_draft'));
    expect(saved.palette).toEqual({ mode: 'limited', maxColours: 100, allowBlends: false });
    next();
    change('.iw-step-size input[type="number"]', '140');
    change('.iw-step-size select', '18');
    saved = JSON.parse(localStorage.getItem('cs_import_wizard_draft'));
    expect(saved.size).toEqual({ w: 140, h: 70, lock: true, fabricCt: 18 });
    next();
    change('#iw-contrast', '-80');
    saved = JSON.parse(localStorage.getItem('cs_import_wizard_draft'));
    expect(saved.settings).toEqual({ dithAlgo: 'atkinson', contrast: -50, saliency: false, skipBg: false, bgThreshold: 15, preSmooth: false });
    expect(saved.palette.maxColours).toBe(100);
    expect(saved.size.fabricCt).toBe(18);
  });
});
