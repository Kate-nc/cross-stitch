// Test for the useEscape hook in keyboard-utils.js — verifies stack ordering.
// Avoids the jsdom dependency by stubbing the minimal DOM surface we need.

const fs = require('fs');
const path = require('path');

// ── Minimal DOM stub ────────────────────────────────────────────────────
const _docListeners = { keydown: [] };
const _doc = {
  _activeElement: null,
  get activeElement() { return _doc._activeElement; },
  addEventListener(type, fn /*, opts */) { (_docListeners[type] = _docListeners[type] || []).push(fn); },
  removeEventListener(type, fn) {
    const arr = _docListeners[type] || [];
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  },
  dispatchEvent(evt) { (_docListeners[evt.type] || []).slice().forEach(fn => fn(evt)); }
};

global.document = _doc;
global.window = global;

function makeKeyEvent(key) {
  return {
    type: 'keydown',
    key: key,
    keyCode: key === 'Escape' ? 27 : 13,
    stopPropagation() {},
    preventDefault() {}
  };
}

// ── React stub ──────────────────────────────────────────────────────────
const _effects = [];
let _cleanups = [];
function flushEffects() {
  while (_effects.length) {
    const c = _effects.shift()();
    if (typeof c === 'function') _cleanups.push(c);
  }
}
function unmountAll() {
  _cleanups.forEach(fn => { try { fn(); } catch (e) {} });
  _cleanups = [];
}
global.React = { useEffect(fn) { _effects.push(fn); } };

// Load and run keyboard-utils.js
const src = fs.readFileSync(path.join(__dirname, '..', 'keyboard-utils.js'), 'utf8');
eval(src);

describe('useEscape', () => {
  beforeEach(() => {
    if (window.useEscape && typeof window.useEscape._reset === 'function') window.useEscape._reset();
    unmountAll();
    _doc._activeElement = null;
  });

  it('is exposed on window after script execution', () => {
    expect(typeof window.useEscape).toBe('function');
  });

  it('pushes onto the stack on mount and pops on unmount', () => {
    window.useEscape(jest.fn());
    flushEffects();
    expect(window.useEscape._stackSize()).toBe(1);
    unmountAll();
    expect(window.useEscape._stackSize()).toBe(0);
  });

  it('only the topmost handler fires on ESC', () => {
    const outer = jest.fn();
    const inner = jest.fn();
    window.useEscape(outer);
    window.useEscape(inner);
    flushEffects();

    document.dispatchEvent(makeKeyEvent('Escape'));
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).toHaveBeenCalledTimes(0);
  });

  it('outer handler fires after inner is unmounted', () => {
    const outer = jest.fn();
    const inner = jest.fn();
    window.useEscape(outer);
    window.useEscape(inner);
    flushEffects();

    // Pop the most recent cleanup (inner)
    const innerCleanup = _cleanups.pop();
    innerCleanup();

    document.dispatchEvent(makeKeyEvent('Escape'));
    expect(outer).toHaveBeenCalledTimes(1);
    expect(inner).toHaveBeenCalledTimes(0);
  });

  it('does not fire when a text input is focused (default skipWhenEditingTextField)', () => {
    const handler = jest.fn();
    _doc._activeElement = { tagName: 'INPUT', getAttribute: () => 'text' };
    window.useEscape(handler);
    flushEffects();
    document.dispatchEvent(makeKeyEvent('Escape'));
    expect(handler).toHaveBeenCalledTimes(0);
  });

  it('fires when text input focused but skipWhenEditingTextField=false', () => {
    const handler = jest.fn();
    _doc._activeElement = { tagName: 'INPUT', getAttribute: () => 'text' };
    window.useEscape(handler, { skipWhenEditingTextField: false });
    flushEffects();
    document.dispatchEvent(makeKeyEvent('Escape'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignores non-Escape keys', () => {
    const handler = jest.fn();
    window.useEscape(handler);
    flushEffects();
    document.dispatchEvent(makeKeyEvent('Enter'));
    expect(handler).toHaveBeenCalledTimes(0);
  });
});
