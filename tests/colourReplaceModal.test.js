/**
 * @jest-environment jsdom
 */
/* tests/colourReplaceModal.test.js ────────────────────────────────────────
   Render tests for creator/ColourReplaceModal.js: picking a thread previews
   it, and the replacement only happens on Apply (or double-click / Enter).
   ─────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');
const React = require('react');
const ReactDOMClient = require('react-dom/client');
const { act } = require('react-dom/test-utils');

global.IS_REACT_ACT_ENVIRONMENT = true;
global.React = React;
// The app's real colour maths (globals in the browser via dmc-data.js).
const dmcData = require('../dmc-data.js');
global.rgbToLab = dmcData.rgbToLab;
global.dE00 = dmcData.dE00;

global.DMC = [
  { id: '310', name: 'Black', rgb: [0, 0, 0] },
  { id: '321', name: 'Red', rgb: [199, 43, 59] },
  { id: '3371', name: 'Black Brown', rgb: [30, 17, 8] },
  { id: 'B5200', name: 'Snow White', rgb: [255, 255, 255] }
];

// Minimal Overlay stub: render children inside a dialog element.
function Overlay(props) {
  Overlay.lastProps = props;
  return React.createElement('div', Object.assign({ role: 'dialog' }, props.panelProps || {}), props.children);
}
Overlay.CloseButton = function(props) {
  return React.createElement('button', { type: 'button', 'aria-label': 'Close', onClick: props.onClose });
};
window.Overlay = Overlay;
window.Icons = { chevronRight: () => null, check: () => null };

function load(rel) {
  // eslint-disable-next-line no-new-func
  new Function(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'))();
}
load('creator/colourReplace.js');
load('creator/ColourReplaceModal.js');

// Silence jsdom's "canvas getContext not implemented" noise.
HTMLCanvasElement.prototype.getContext = function() { return null; };

const BLACK = { id: '310', name: 'Black', rgb: [0, 0, 0] };
const RED = { id: '321', name: 'Red', rgb: [199, 43, 59] };

let container, root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = ReactDOMClient.createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(extra) {
  const props = Object.assign({
    modal: { srcId: '310', srcName: 'Black', srcRgb: [0, 0, 0] },
    onClose: jest.fn(),
    onApply: jest.fn(),
    pat: [BLACK, RED, BLACK, { id: '__skip__' }],
    sW: 2, sH: 2,
    selectionMask: null
  }, extra || {});
  act(() => { root.render(React.createElement(window.ColourReplaceModal, props)); });
  return props;
}

const row = id => container.querySelector('[data-thread-id="' + id + '"]');
const applyBtn = () => container.querySelector('.colour-replace-apply');
const summary = () => container.querySelector('.colour-replace-summary').textContent;
const click = el => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

describe('ColourReplaceModal', () => {
  test('Apply is disabled until a thread is picked', () => {
    render();
    expect(applyBtn().disabled).toBe(true);
  });

  test('shows how many stitches will change', () => {
    render();
    expect(summary()).toMatch(/2 stitches will change/);
  });

  test('clicking a thread previews it without applying', () => {
    const props = render();
    click(row('3371'));
    expect(props.onApply).not.toHaveBeenCalled();
    expect(row('3371').getAttribute('aria-selected')).toBe('true');
    expect(summary()).toMatch(/DMC 3371/);
    expect(applyBtn().disabled).toBe(false);
  });

  test('Apply calls onApply with the picked thread', () => {
    const props = render();
    click(row('3371'));
    click(applyBtn());
    expect(props.onApply).toHaveBeenCalledTimes(1);
    expect(props.onApply.mock.calls[0][0].id).toBe('3371');
  });

  test('picking a different thread replaces the pick', () => {
    const props = render();
    click(row('3371'));
    click(row('321'));
    expect(row('3371').getAttribute('aria-selected')).toBe('false');
    click(applyBtn());
    expect(props.onApply.mock.calls[0][0].id).toBe('321');
  });

  test('double-click applies straight away', () => {
    const props = render();
    act(() => { row('321').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(props.onApply).toHaveBeenCalledTimes(1);
    expect(props.onApply.mock.calls[0][0].id).toBe('321');
  });

  test('the source colour cannot be picked', () => {
    const props = render();
    expect(row('310').getAttribute('aria-disabled')).toBe('true');
    click(row('310'));
    expect(applyBtn().disabled).toBe(true);
    expect(props.onApply).not.toHaveBeenCalled();
  });

  test('Enter picks the top search result, a second Enter applies it', () => {
    const props = render();
    const input = container.querySelector('input[type="text"]');
    const enter = () => act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    enter();
    // With no search, the top result is the closest match to black (3371).
    expect(row('3371').getAttribute('aria-selected')).toBe('true');
    expect(props.onApply).not.toHaveBeenCalled();
    enter();
    expect(props.onApply).toHaveBeenCalledTimes(1);
    expect(props.onApply.mock.calls[0][0].id).toBe('3371');
  });

  test('Enter after typing picks the top search match', () => {
    const props = render();
    const input = container.querySelector('input[type="text"]');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'red');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(row('321').getAttribute('aria-selected')).toBe('true');
    expect(props.onApply).not.toHaveBeenCalled();
  });

  test('renders before/after preview thumbnails', () => {
    render();
    expect(container.querySelectorAll('.colour-replace-preview canvas').length).toBe(2);
  });

  test('opts out of the legacy dark-mode button override', () => {
    // html.pref-dark button:not([data-pref-modal] *) would otherwise hide the
    // picked row, the active scope segment and the Apply button colours.
    render();
    expect(container.querySelector('[role="dialog"]').hasAttribute('data-pref-modal')).toBe(true);
    const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
    expect(css).toMatch(/html\.pref-dark button:not\(\.btn-primary\):not\(\[data-pref-modal\] \*\)/);
  });

  test('omits the preview when there is no pattern', () => {
    render({ pat: null, sW: 0, sH: 0 });
    expect(container.querySelector('.colour-replace-preview')).toBeNull();
  });
});

describe('ColourReplaceModal scope', () => {
  // Pattern: 310, 321, 310, skip  → two 310 stitches (cells 0 and 2).
  const scopeText = () => container.querySelector('.colour-replace-scope').textContent;
  const seg = v => container.querySelector('[data-scope="' + v + '"]');

  test('without a selection it says the whole pattern is affected', () => {
    const props = render();
    expect(scopeText()).toMatch(/whole pattern \(2 stitches\)/);
    expect(seg('selection')).toBeNull();
    click(row('321'));
    click(applyBtn());
    expect(props.onApply.mock.calls[0][1]).toEqual({ scope: 'all', alsoIds: [] });
  });

  test('with a selection it defaults to the selection and shows both counts', () => {
    const props = render({ selectionMask: new Uint8Array([1, 0, 0, 0]) });
    expect(seg('selection').getAttribute('aria-checked')).toBe('true');
    expect(seg('selection').textContent).toBe('Selection (1)');
    expect(seg('all').textContent).toBe('Whole pattern (2)');
    expect(summary()).toMatch(/1 stitch will change/);
    click(row('321'));
    click(applyBtn());
    expect(props.onApply.mock.calls[0][1]).toEqual({ scope: 'selection', alsoIds: [] });
  });

  test('switching to whole pattern updates the count and the applied scope', () => {
    const props = render({ selectionMask: new Uint8Array([1, 0, 0, 0]) });
    click(seg('all'));
    expect(seg('all').getAttribute('aria-checked')).toBe('true');
    expect(summary()).toMatch(/2 stitches will change/);
    click(row('321'));
    click(applyBtn());
    expect(props.onApply.mock.calls[0][1]).toEqual({ scope: 'all', alsoIds: [] });
  });

  test('a selection with no matching stitches defaults to whole pattern and explains why', () => {
    render({ selectionMask: new Uint8Array([0, 1, 0, 0]) });
    expect(seg('all').getAttribute('aria-checked')).toBe('true');
    expect(scopeText()).toMatch(/None of your selected stitches use this colour/);
  });

  test('Apply stays disabled when the chosen scope has nothing to change', () => {
    const props = render({ selectionMask: new Uint8Array([0, 1, 0, 0]) });
    click(seg('selection'));
    click(row('321'));
    expect(summary()).toMatch(/nothing to change/);
    expect(applyBtn().disabled).toBe(true);
    act(() => { row('321').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
    expect(props.onApply).not.toHaveBeenCalled();
  });
});

describe('ColourReplaceModal suggestions', () => {
  const sectionIds = key => Array.from(container.querySelectorAll('[data-section="' + key + '"] [data-thread-id]'))
    .map(el => el.getAttribute('data-thread-id'));
  const PAL = [
    { id: '310', name: 'Black', rgb: [0, 0, 0], count: 2 },
    { id: '321', name: 'Red', rgb: [199, 43, 59], count: 1 },
    { id: '310+321', name: 'Black + Red', rgb: [100, 21, 30], type: 'blend', count: 0 }
  ];

  test('lists palette colours first, then closest matches, then all threads', () => {
    render({ pal: PAL });
    const order = Array.from(container.querySelectorAll('[data-section]')).map(el => el.getAttribute('data-section'));
    expect(order).toEqual(['palette', 'closest', 'all']);
    // Source colour is not offered as its own replacement in the palette list.
    expect(sectionIds('palette')).not.toContain('310');
    expect(sectionIds('palette')).toEqual(expect.arrayContaining(['321', '310+321']));
  });

  test('closest matches exclude the source and palette colours and are nearest first', () => {
    render({ pal: PAL });
    const ids = sectionIds('closest');
    expect(ids).not.toContain('310');
    expect(ids).not.toContain('321');
    expect(ids[0]).toBe('3371');
  });

  test('without a palette the list starts with closest matches', () => {
    render();
    expect(container.querySelector('[data-section]').getAttribute('data-section')).toBe('closest');
  });

  test('picking a palette colour warns that the colours will merge', () => {
    render({ pal: PAL });
    expect(container.querySelector('.colour-replace-merge')).toBeNull();
    click(container.querySelector('[data-section="palette"] [data-thread-id="321"]'));
    expect(container.querySelector('.colour-replace-merge').textContent).toMatch(/already in your palette/);
  });

  test('picking a colour not in the palette shows no merge warning', () => {
    render({ pal: PAL });
    click(container.querySelector('[data-section="closest"] [data-thread-id="3371"]'));
    expect(container.querySelector('.colour-replace-merge')).toBeNull();
  });

  test('searching shows one flat result list, including palette-only blends', () => {
    render({ pal: PAL });
    const input = container.querySelector('input[type="text"]');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'black');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const order = Array.from(container.querySelectorAll('[data-section]')).map(el => el.getAttribute('data-section'));
    expect(order).toEqual(['results']);
    expect(sectionIds('results')).toEqual(expect.arrayContaining(['310+321', '310', '3371']));
  });
});

describe('ColourReplaceModal keyboard and screen-reader support', () => {
  const input = () => container.querySelector('input[role="combobox"]');
  const key = k => act(() => { input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });
  const activeId = () => input().getAttribute('aria-activedescendant');
  const activeRow = () => container.querySelector('#' + activeId());
  const type = text => act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input(), text);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });

  test('Escape closes the modal even while typing in the search box', () => {
    // Overlay's central Escape handler skips focused text inputs unless the
    // modal opts in; focus starts in the search box.
    render();
    expect(Overlay.lastProps.escapeOptions).toEqual({ skipWhenEditingTextField: false });
  });

  test('search box is marked for Overlay autofocus', () => {
    render();
    expect(input().hasAttribute('data-autofocus')).toBe(true);
  });

  test('search box is a combobox that controls the thread listbox', () => {
    render();
    const list = container.querySelector('[role="listbox"]');
    expect(list).not.toBeNull();
    expect(input().getAttribute('aria-controls')).toBe(list.id);
    expect(container.querySelectorAll('[role="option"]').length).toBeGreaterThan(0);
    expect(activeId()).toBeNull();
  });

  test('ArrowDown moves through options and picks each one (preview follows)', () => {
    const props = render();
    key('ArrowDown');
    expect(activeRow().getAttribute('data-thread-id')).toBe('3371'); // closest match first
    expect(activeRow().getAttribute('aria-selected')).toBe('true');
    key('ArrowDown');
    const second = activeRow().getAttribute('data-thread-id');
    expect(second).not.toBe('3371');
    expect(summary()).toMatch(new RegExp('DMC ' + second));
    key('ArrowUp');
    expect(activeRow().getAttribute('data-thread-id')).toBe('3371');
    expect(props.onApply).not.toHaveBeenCalled();
  });

  test('Enter applies the active option', () => {
    const props = render();
    key('ArrowDown');
    key('ArrowDown');
    const id = activeRow().getAttribute('data-thread-id');
    key('Enter');
    expect(props.onApply).toHaveBeenCalledTimes(1);
    expect(props.onApply.mock.calls[0][0].id).toBe(id);
  });

  test('the source colour is skipped by arrow navigation', () => {
    render();
    for (let i = 0; i < 20; i++) key('ArrowDown');
    expect(activeRow().getAttribute('data-thread-id')).not.toBe('310');
    for (let i = 0; i < 20; i++) key('ArrowUp');
    expect(activeRow().getAttribute('data-thread-id')).not.toBe('310');
  });

  test('typing a new search clears the active option', () => {
    render();
    key('ArrowDown');
    expect(activeId()).not.toBeNull();
    type('red');
    expect(activeId()).toBeNull();
  });

  test('clicking an option makes it the active descendant', () => {
    render();
    click(row('321'));
    expect(activeRow().getAttribute('data-thread-id')).toBe('321');
  });

  test('scope radios support arrow keys and roving tabindex', () => {
    render({ selectionMask: new Uint8Array([1, 0, 0, 0]) });
    const sel = container.querySelector('[data-scope="selection"]');
    const all = container.querySelector('[data-scope="all"]');
    expect(sel.tabIndex).toBe(0);
    expect(all.tabIndex).toBe(-1);
    act(() => { sel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(container.querySelector('[data-scope="all"]').getAttribute('aria-checked')).toBe('true');
    expect(container.querySelector('[data-scope="all"]').tabIndex).toBe(0);
  });
});

describe('ColourReplaceModal similar shades', () => {
  // 310 black ×2, 3371 black-brown ×1, 321 red ×1
  const PAT = [
    { id: '310', rgb: [0, 0, 0] }, { id: '3371', rgb: [30, 17, 8] },
    { id: '310', rgb: [0, 0, 0] }, { id: '321', rgb: [199, 43, 59] }
  ];
  const PAL = [
    { id: '310', name: 'Black', rgb: [0, 0, 0], count: 2 },
    { id: '3371', name: 'Black Brown', rgb: [30, 17, 8], count: 1 },
    { id: '321', name: 'Red', rgb: [199, 43, 59], count: 1 }
  ];
  const toggle = () => container.querySelector('[data-fuzzy-toggle]');
  const extras = () => Array.from(container.querySelectorAll('[data-extra-id]')).map(e => e.getAttribute('data-extra-id'));
  const setTol = v => act(() => {
    const el = container.querySelector('[data-fuzzy-tol]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  test('is off by default and hidden without other palette colours', () => {
    render({ pat: PAT, pal: PAL });
    expect(toggle().checked).toBe(false);
    act(() => { root.unmount(); });
    root = ReactDOMClient.createRoot(container);
    render({ pat: PAT, pal: [PAL[0]] });
    expect(toggle()).toBeNull();
  });

  test('turning it on lists nearby palette shades and raises the count', () => {
    render({ pat: PAT, pal: PAL });
    expect(summary()).toMatch(/2 stitches will change/);
    click(toggle());
    setTol(20);
    expect(extras()).toEqual(['3371']);
    expect(summary()).toMatch(/3 stitches will change/);
  });

  test('Apply passes the extra shades to onApply', () => {
    const props = render({ pat: PAT, pal: PAL });
    click(toggle());
    setTol(20);
    click(container.querySelector('[data-section="closest"] [data-thread-id]'));
    click(applyBtn());
    expect(props.onApply.mock.calls[0][1]).toEqual({ scope: 'all', alsoIds: ['3371'] });
  });

  test('the picked destination is never also replaced', () => {
    const props = render({ pat: PAT, pal: PAL });
    click(toggle());
    setTol(20);
    click(container.querySelector('[data-section="palette"] [data-thread-id="3371"]'));
    expect(extras()).toEqual([]);
    expect(summary()).toMatch(/2 stitches will change/);
    click(applyBtn());
    expect(props.onApply.mock.calls[0][1].alsoIds).toEqual([]);
  });

  test('without the option, onApply gets no extra shades', () => {
    const props = render({ pat: PAT, pal: PAL });
    click(row('3371'));
    click(applyBtn());
    expect(props.onApply.mock.calls[0][1]).toEqual({ scope: 'all', alsoIds: [] });
  });
});


describe('ColourReplaceModal counts part stitches and backstitch', () => {
  const PS = new Map([[1, { TL: { id: '310', rgb: [0, 0, 0] } }]]);
  const BS = [{ x1: 0, y1: 0, x2: 1, y2: 0, colorId: '310' }, { x1: 0, y1: 1, x2: 1, y2: 1, colorId: '321' }];

  test('summary and scope text break the count down by kind', () => {
    render({ partialStitches: PS, bsLines: BS });
    expect(container.querySelector('.colour-replace-scope').textContent)
      .toMatch(/2 stitches, 1 part stitch and 1 backstitch line/);
    expect(summary()).toMatch(/2 stitches, 1 part stitch and 1 backstitch line will change/);
  });

  test('a colour used only in part stitches can still be replaced', () => {
    const props = render({ pat: [RED, RED, RED, RED], partialStitches: PS });
    expect(summary()).toMatch(/1 part stitch will change/);
    click(row('3371'));
    expect(applyBtn().disabled).toBe(false);
    click(applyBtn());
    expect(props.onApply).toHaveBeenCalledTimes(1);
  });
});

describe('ColourReplaceModal swap', () => {
  const PAT = [BLACK, RED, BLACK, { id: '__skip__' }];
  const PAL = [
    { id: '310', name: 'Black', rgb: [0, 0, 0], count: 2 },
    { id: '321', name: 'Red', rgb: [199, 43, 59], count: 1 }
  ];
  const modeSeg = v => container.querySelector('[data-mode="' + v + '"]');
  const pickRed = () => click(container.querySelector('[data-section="palette"] [data-thread-id="321"]'));

  test('merge / swap choice appears only for colours already in the palette', () => {
    render({ pat: PAT, pal: PAL });
    click(row('3371'));
    expect(modeSeg('swap')).toBeNull();
    pickRed();
    expect(modeSeg('merge').getAttribute('aria-checked')).toBe('true');
    expect(modeSeg('swap').getAttribute('aria-checked')).toBe('false');
  });

  test('choosing Swap counts both colours, relabels Apply and passes swap: true', () => {
    const props = render({ pat: PAT, pal: PAL });
    pickRed();
    expect(summary()).toMatch(/2 stitches will change/);
    click(modeSeg('swap'));
    expect(summary()).toMatch(/3 stitches will change/);
    expect(applyBtn().textContent).toBe('Swap');
    expect(container.querySelector('.colour-replace-scope').textContent).toMatch(/^Swaps these two colours across the whole pattern \(3 stitches\)/);
    expect(container.querySelector('.colour-replace-mode-help').textContent).toMatch(/every DMC 321 stitch becomes DMC 310/);
    click(applyBtn());
    expect(props.onApply.mock.calls[0][1]).toEqual({ scope: 'all', alsoIds: [], swap: true });
  });

  test('similar shades are disabled while swapping', () => {
    render({ pat: PAT, pal: PAL.concat([{ id: '3371', name: 'Black Brown', rgb: [30, 17, 8], count: 0 }]) });
    click(container.querySelector('[data-fuzzy-toggle]'));
    pickRed();
    click(modeSeg('swap'));
    expect(container.querySelector('[data-fuzzy-toggle]').disabled).toBe(true);
    expect(container.querySelector('[data-fuzzy-tol]')).toBeNull();
  });

  test('switching back to Merge restores normal apply', () => {
    const props = render({ pat: PAT, pal: PAL });
    pickRed();
    click(modeSeg('swap'));
    click(modeSeg('merge'));
    expect(applyBtn().textContent).toBe('Apply');
    click(applyBtn());
    expect(props.onApply.mock.calls[0][1]).toEqual({ scope: 'all', alsoIds: [] });
  });
});
