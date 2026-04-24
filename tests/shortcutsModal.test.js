// Integration smoke-test: confirms modals.js Shortcuts panel reads from
// window.Shortcuts.list() and renders sections grouped by scope label.

const fs = require('fs');
const path = require('path');

// Minimal DOM
const _docListeners = { keydown: [] };
const _doc = {
  _activeElement: null,
  get activeElement() { return _doc._activeElement; },
  addEventListener(type, fn) { (_docListeners[type] = _docListeners[type] || []).push(fn); },
  removeEventListener(type, fn) {
    const arr = _docListeners[type] || [];
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  },
  dispatchEvent(evt) { (_docListeners[evt.type] || []).slice().forEach(fn => fn(evt)); }
};
global.document = _doc;
global.window = global;
global.navigator = { platform: 'Win32', userAgent: 'jest' };

// Stub a flat React.createElement that returns a serialisable tree we can walk.
function ce(type, props /*, ...children */) {
  const children = Array.prototype.slice.call(arguments, 2);
  return { type, props: props || {}, children: flatten(children) };
}
function flatten(arr) {
  const out = [];
  arr.forEach(c => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) out.push(...flatten(c));
    else out.push(c);
  });
  return out;
}
global.React = { createElement: ce, useEffect: () => {} };

// Load the registry + modals. Replace `const SharedModals` with a global
// assignment so we can reach it from the test scope after eval.
eval(fs.readFileSync(path.join(__dirname, '..', 'shortcuts.js'), 'utf8'));
const modalsSrc = fs.readFileSync(path.join(__dirname, '..', 'modals.js'), 'utf8')
  .replace(/^const\s+SharedModals\s*=/, 'global.SharedModals =');
eval(modalsSrc);

// Collect text content from a tree.
function textOf(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node.children) return '';
  return node.children.map(textOf).join(' ');
}

describe('Shortcuts modal — integration', () => {
  beforeEach(() => {
    window.Shortcuts._reset();
  });

  test('renders sections for each active scope from the registry', () => {
    // Activate scopes typical of a Tracker session in highlight view.
    window.Shortcuts.pushScope('global');
    window.Shortcuts.pushScope('tracker');
    window.Shortcuts.pushScope('tracker.notedit');
    window.Shortcuts.pushScope('tracker.view.highlight');

    window.Shortcuts.register([
      { id: 'g.save', keys: 'mod+s', scope: 'global', description: 'Save', run: () => {} },
      { id: 't.view', keys: 'v', scope: 'tracker.notedit', description: 'Cycle view', run: () => {} },
      { id: 't.iso',  keys: '1', scope: 'tracker.view.highlight', description: 'Highlight: isolate', run: () => {} },
      { id: 't.hidden', keys: 'esc', scope: 'tracker', description: 'Cancel', hidden: true, run: () => {} }
    ]);

    const tree = SharedModals.Shortcuts({ onClose: () => {}, page: 'tracker' });
    const text = textOf(tree);

    // Section headers
    expect(text).toMatch(/General/);
    expect(text).toMatch(/Stitch Tracker/);
    expect(text).toMatch(/Highlight View/);

    // Descriptions of visible entries
    expect(text).toMatch(/Save/);
    expect(text).toMatch(/Cycle view/);
    expect(text).toMatch(/Highlight: isolate/);

    // Hidden entries are excluded
    expect(text).not.toMatch(/Cancel/);

    // Formatted modifier key (Windows)
    expect(text).toMatch(/Ctrl\+S/);
  });

  test('falls back to a notice when the registry is missing', () => {
    const saved = window.Shortcuts;
    delete window.Shortcuts;
    try {
      const tree = SharedModals.Shortcuts({ onClose: () => {}, page: 'tracker' });
      const text = textOf(tree);
      expect(text).toMatch(/registry not loaded/i);
    } finally {
      window.Shortcuts = saved;
    }
  });

  test('shows "no shortcuts" when no scopes are active', () => {
    window.Shortcuts.register([
      { id: 'x.foo', keys: 'f', scope: 'never-active', description: 'Foo', run: () => {} }
    ]);
    const tree = SharedModals.Shortcuts({ onClose: () => {}, page: 'creator' });
    const text = textOf(tree);
    expect(text).toMatch(/No shortcuts available/i);
  });
});
