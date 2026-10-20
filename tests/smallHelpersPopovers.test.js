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
    scope = browserScripts([path], { React, document });
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
    down(host.querySelector('[role="dialog"]'));
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
  test('missing optional trigger and callback remain safe', () => {
    render({ triggerRef: null, onClose: undefined });
    expect(() => { down(document.body); key('Escape'); }).not.toThrow();
  });
});
