/**
 * @jest-environment jsdom
 */
/* tests/infoIconHints.test.js ─────────────────────────────────────────────
   The (i) hint icons beside each Convert setting (components.js InfoIcon):
   a real button that keyboards reach, named after its setting, with the
   hint as its description; the hint shows on hover, focus and tap, and
   Escape closes it.
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
window.Icons = { info: () => React.createElement('svg', { 'data-icon': 'info' }) };

const src = fs.readFileSync(path.join(__dirname, '..', 'components.js'), 'utf8');
// eslint-disable-next-line no-new-func
const { InfoIcon, SliderRow } = new Function(src + '\nreturn { InfoIcon: InfoIcon, SliderRow: SliderRow };')();

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

function render(el) { act(() => root.render(el)); }
function tip() { return document.querySelector('[role="tooltip"]'); }

describe('InfoIcon', () => {
  test('is a focusable button named after its setting, described by the hint', () => {
    render(React.createElement(InfoIcon, { label: 'Threads', text: 'Which brand the colours are matched to.' }));
    const btn = container.querySelector('button.info-icon__btn');
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.getAttribute('aria-label')).toBe('About Threads');
    const desc = document.getElementById(btn.getAttribute('aria-describedby'));
    expect(desc.textContent).toBe('Which brand the colours are matched to.');
    expect(btn.querySelector('[data-icon="info"]')).not.toBeNull();
  });

  test('shows the hint on keyboard focus, and Escape closes it', () => {
    render(React.createElement(InfoIcon, { label: 'Threads', text: 'Hint text' }));
    const btn = container.querySelector('button');
    expect(tip()).toBeNull();
    act(() => { btn.focus(); });
    expect(tip().textContent).toBe('Hint text');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(tip()).toBeNull();
  });

  test('shows the hint on hover and on click (touch screens have no hover)', () => {
    render(React.createElement(InfoIcon, { label: 'Threads', text: 'Hint text' }));
    const btn = container.querySelector('button');
    act(() => { btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    expect(tip()).not.toBeNull();
    act(() => { btn.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); });
    expect(tip()).toBeNull();
    act(() => { btn.click(); });
    expect(tip()).not.toBeNull();
  });

  test('pressing it inside a <label> does not tick the checkbox', () => {
    const onChange = jest.fn();
    render(React.createElement('label', null,
      React.createElement('input', { type: 'checkbox', checked: false, onChange }),
      ' Skip background',
      React.createElement(InfoIcon, { label: 'Skip background', text: 'Hint' })));
    act(() => { container.querySelector('button').click(); });
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector('input').checked).toBe(false);
  });

  test('SliderRow names its hint after the slider', () => {
    render(React.createElement(SliderRow, { label: 'Brightness', value: 0, min: -50, max: 50, onChange() {}, helpText: 'Lightens or darkens.' }));
    expect(container.querySelector('button.info-icon__btn').getAttribute('aria-label')).toBe('About Brightness');
  });
});

describe('Convert settings carry hints', () => {
  const sb = fs.readFileSync(path.join(__dirname, '..', 'creator', 'Sidebar.js'), 'utf8');
  const size = fs.readFileSync(path.join(__dirname, '..', 'creator', 'SizeField.js'), 'utf8');
  const fabric = fs.readFileSync(path.join(__dirname, '..', 'creator', 'FabricBlock.js'), 'utf8');

  test.each([
    'What kind of picture is this?', 'Exact pixel-art import', 'Threads', 'Detail and tidiness',
    'Allow two-thread blends', 'Use only stash threads', 'Shading', 'How strict',
    'Skip background', 'Sharpen details'
  ])('%s has a named hint icon', (label) => {
    expect(sb).toContain('h(InfoIcon, {label:"' + label + '"');
  });

  test.each(['Stitch Cleanup', 'Protect fine details', 'Keep look-alike colours apart'])(
    'the %s switch has a hint', (label) => {
      const at = sb.indexOf('label:"' + label + '"');
      expect(at).toBeGreaterThan(-1);
      expect(sb.slice(at, at + 600)).toMatch(/\binfo:"/);
    });

  test.each(['Brightness', 'Contrast', 'Saturation'])('the %s slider has a hint', (label) => {
    expect(sb).toMatch(new RegExp('SliderRow, \\{label:"' + label + '"[^\\n]*\\n\\s*helpText:"'));
  });

  test('size and fabric settings have hints, outside their <label>s', () => {
    expect(size).toMatch(/hint\("Size", "/);
    expect(size).toMatch(/hint\("Lock aspect ratio", "/);
    expect(fabric).toMatch(/hint\("Fabric count", "/);
    expect(fabric).toMatch(/hint\("Fabric colour", "/);
    // A button inside <label> would take the label away from the select.
    expect(fabric).toMatch(/h\("label", \{ className: "fabric-block__label", htmlFor: countId \}/);
  });
});
