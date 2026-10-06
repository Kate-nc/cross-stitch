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

global.DMC = [
  { id: '310', name: 'Black', rgb: [0, 0, 0] },
  { id: '321', name: 'Red', rgb: [199, 43, 59] },
  { id: '3371', name: 'Black Brown', rgb: [30, 17, 8] },
  { id: 'B5200', name: 'Snow White', rgb: [255, 255, 255] }
];

// Minimal Overlay stub: render children inside a dialog element.
function Overlay(props) {
  return React.createElement('div', { role: 'dialog', onKeyDown: props.onKeyDown }, props.children);
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
    expect(row('3371').getAttribute('aria-pressed')).toBe('true');
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
    expect(row('3371').getAttribute('aria-pressed')).toBe('false');
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
    expect(row('310').disabled).toBe(true);
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
    // Top result skips the source colour (310), so 321 is picked.
    expect(row('321').getAttribute('aria-pressed')).toBe('true');
    expect(props.onApply).not.toHaveBeenCalled();
    enter();
    expect(props.onApply).toHaveBeenCalledTimes(1);
    expect(props.onApply.mock.calls[0][0].id).toBe('321');
  });

  test('renders before/after preview thumbnails', () => {
    render();
    expect(container.querySelectorAll('.colour-replace-preview canvas').length).toBe(2);
  });

  test('omits the preview when there is no pattern', () => {
    render({ pat: null, sW: 0, sH: 0 });
    expect(container.querySelector('.colour-replace-preview')).toBeNull();
  });
});
