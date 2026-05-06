// Tests for keyboard-utils.js global "?" → cs:openShortcuts dispatch.
const fs = require('fs');
const path = require('path');

// Build a minimal DOM with EventTarget polyfills.
const listeners = { document: {}, window: {} };

function makeTarget() {
  const map = {};
  return {
    addEventListener: (type, fn) => { (map[type] = map[type] || []).push(fn); },
    removeEventListener: (type, fn) => {
      if (!map[type]) return;
      map[type] = map[type].filter(f => f !== fn);
    },
    dispatchEvent: (evt) => {
      (map[evt.type] || []).forEach(fn => fn(evt));
      return true;
    },
    _listeners: map
  };
}

const win = makeTarget();
const doc = makeTarget();
doc.activeElement = null;

global.window = win;
global.document = doc;
global.CustomEvent = function (type, init) {
  this.type = type;
  this.detail = init && init.detail;
  this.preventDefault = function () { this.defaultPrevented = true; };
  this.stopPropagation = function () { this.stopped = true; };
};
global.React = {
  useEffect: function () {} // not exercised in this test
};

const { loadSource } = require('./_helpers/loadSource');
const src = loadSource('keyboard-utils.js');
eval(src);

describe('keyboard-utils global "?" shortcut', () => {
  test('pressing "?" dispatches cs:openShortcuts (not cs:openHelp)', () => {
    let shortcutsFired = 0;
    let helpFired = 0;
    win.addEventListener('cs:openShortcuts', () => { shortcutsFired++; });
    win.addEventListener('cs:openHelp', () => { helpFired++; });
    // Simulate keydown listener installed by keyboard-utils.
    const handlers = doc._listeners.keydown || [];
    expect(handlers.length).toBeGreaterThan(0);
    handlers.forEach(fn => fn({ key: '?', ctrlKey: false, metaKey: false, altKey: false, preventDefault: () => {}, stopPropagation: () => {} }));
    expect(shortcutsFired).toBe(1);
    expect(helpFired).toBe(0);
  });

  test('"?" with modifier does NOT dispatch', () => {
    let fired = 0;
    win.addEventListener('cs:openShortcuts', () => { fired++; });
    const handlers = doc._listeners.keydown || [];
    handlers.forEach(fn => fn({ key: '?', ctrlKey: true, metaKey: false, altKey: false, preventDefault: () => {}, stopPropagation: () => {} }));
    expect(fired).toBe(0);
  });

  test('"?" while focus on text input does NOT dispatch', () => {
    let fired = 0;
    win.addEventListener('cs:openHelp', () => { fired++; });
    doc.activeElement = { tagName: 'INPUT', getAttribute: () => 'text', isContentEditable: false };
    const handlers = doc._listeners.keydown || [];
    handlers.forEach(fn => fn({ key: '?', ctrlKey: false, metaKey: false, altKey: false, preventDefault: () => {}, stopPropagation: () => {} }));
    expect(fired).toBe(0);
    doc.activeElement = null;
  });

  test('non-"?" keys are ignored', () => {
    let fired = 0;
    win.addEventListener('cs:openHelp', () => { fired++; });
    const handlers = doc._listeners.keydown || [];
    handlers.forEach(fn => fn({ key: 'a', ctrlKey: false, metaKey: false, altKey: false, preventDefault: () => {}, stopPropagation: () => {} }));
    expect(fired).toBe(0);
  });
});
