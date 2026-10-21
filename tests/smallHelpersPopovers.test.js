/** @jest-environment jsdom */
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react-dom/test-utils');
const { browserScripts } = require('./_helpers/browserScripts');

describe.each([
  ['components.js', 'AppInfoPopover', '.app-info-scrim'],
  ['creator/PatternInfoPopover.js', 'CreatorPatternInfoPopover', '.creator-popover-info-scrim']
])('%s dismissal lifecycle', (path, exported, scrim) => {
  let scope, root, host, trigger, triggerRef, onClose, previousAct;
  beforeEach(() => {
    previousAct = global.IS_REACT_ACT_ENVIRONMENT;
    global.IS_REACT_ACT_ENVIRONMENT = true;
    // The Creator popover shares components.js's dismissal hook, as on the pages that carry both.
    scope = browserScripts(path === 'components.js' ? [path] : ['components.js', path], { React, document });
    host = document.createElement('div');
    trigger = document.createElement('button');
    trigger.appendChild(document.createElement('span'));
    document.body.append(trigger, host);
    triggerRef = { current: trigger };
    onClose = jest.fn();
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    trigger.remove();
    if (previousAct === undefined) delete global.IS_REACT_ACT_ENVIRONMENT;
    else global.IS_REACT_ACT_ENVIRONMENT = previousAct;
    jest.restoreAllMocks();
  });
  function render(props = {}) {
    act(() => root.render(React.createElement(scope[exported], {
      open: true, triggerRef, onClose, ...props
    }, React.createElement('button', null, 'Inside'))));
  }
  function down(node) {
    act(() => node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  }
  function key(value) {
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })));
  }
  test('inside and trigger descendants are ignored; outside mousedown dismisses once', () => {
    render();
    const dialog = host.querySelector('[role="dialog"]');
    down(dialog);
    expect(dialog.firstElementChild).not.toBeNull();
    down(dialog.firstElementChild);
    down(trigger.firstChild);
    key('Enter');
    expect(onClose).not.toHaveBeenCalled();
    down(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  test('Escape closes before restoring trigger focus, including after callback replacement', () => {
    const order = [];
    const focus = jest.spyOn(trigger, 'focus').mockImplementation(() => order.push('focus'));
    render();
    const latest = jest.fn(() => order.push('close'));
    render({ onClose: latest });
    key('Escape');
    expect(onClose).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['close', 'focus']);
  });
  test('scrim click dismisses and closed or unmounted popovers have no live listeners', () => {
    render();
    act(() => host.querySelector(scrim).dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(1);
    render({ open: false });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    down(document.body); key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    render();
    act(() => root.render(null));
    down(document.body); key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  test('listener cleanup removes the exact registered functions on close and unmount', () => {
    const add = jest.spyOn(document, 'addEventListener');
    const remove = jest.spyOn(document, 'removeEventListener');
    render();
    render({ open: false });
    render();
    act(() => root.render(null));
    for (const type of ['mousedown', 'keydown']) {
      const added = add.mock.calls.filter(c => c[0] === type);
      expect(added).toHaveLength(2);
      expect(remove.mock.calls.filter(c => c[0] === type)).toEqual(added);
    }
  });
  test('registers mousedown then keydown on document, and only re-registers when open, onClose or triggerRef change', () => {
    const add = jest.spyOn(document, 'addEventListener');
    const remove = jest.spyOn(document, 'removeEventListener');
    const ours = c => c[0] === 'mousedown' || c[0] === 'keydown';
    render();
    expect(add.mock.calls.filter(ours).map(c => c[0])).toEqual(['mousedown', 'keydown']);
    render({ ariaLabel: 'Changed' }); // same open, onClose and triggerRef: effect must not re-run
    expect(add.mock.calls.filter(ours)).toHaveLength(2);
    expect(remove.mock.calls.filter(ours)).toHaveLength(0);
    render({ onClose: jest.fn() });
    expect(add.mock.calls.filter(ours)).toHaveLength(4);
    expect(remove.mock.calls.filter(ours)).toHaveLength(2);
    const other = { current: trigger };
    render({ triggerRef: other });
    expect(add.mock.calls.filter(ours)).toHaveLength(6);
    expect(remove.mock.calls.filter(ours)).toHaveLength(4);
  });
  test('reopening dismisses once per open with the latest handlers and the trigger ref in force', () => {
    render();
    down(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
    render({ open: false });
    const second = jest.fn();
    render({ onClose: second });
    down(document.body);
    key('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    const swapped = document.createElement('button');
    document.body.appendChild(swapped);
    render({ onClose: second, triggerRef: { current: swapped } });
    second.mockClear();
    down(trigger); // no longer the trigger, so it counts as outside
    down(swapped);
    expect(second).toHaveBeenCalledTimes(1);
    swapped.remove();
  });
  test('a closed popover never moves focus to the trigger on Escape', () => {
    const focus = jest.spyOn(trigger, 'focus');
    render({ open: false });
    key('Escape');
    expect(focus).not.toHaveBeenCalled();
  });
  test('missing optional trigger and callback remain safe', () => {
    render({ triggerRef: null, onClose: undefined });
    expect(() => { down(document.body); key('Escape'); }).not.toThrow();
  });
});

describe('info popover dismissal hook loading', () => {
  const fs = require('fs');
  const pathMod = require('path');
  const root = pathMod.join(__dirname, '..');
  const scriptsOf = file => [...fs.readFileSync(pathMod.join(root, file), 'utf8')
    .matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(m => ({ src: m[1], tag: m[0] }));
  test.each(['create.html', 'index.html'])('%s loads components.js synchronously before creator/bundle.js', page => {
    const scripts = scriptsOf(page);
    const components = scripts.findIndex(s => s.src === 'components.js');
    const bundle = scripts.findIndex(s => s.src === 'creator/bundle.js');
    expect(components).toBeGreaterThanOrEqual(0);
    expect(bundle).toBeGreaterThan(components);
    expect(scripts[components].tag).not.toMatch(/\b(?:async|defer)\b/);
    expect(scripts[bundle].tag).not.toMatch(/\b(?:async|defer)\b/);
  });
  test('no page loads creator/bundle.js without components.js', () => {
    const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
    const withBundle = pages.filter(f => scriptsOf(f).some(s => /creator\/(?:extras-)?bundle\.js$/.test(s.src)));
    expect(withBundle.sort()).toEqual(['create.html', 'index.html']);
  });
});
