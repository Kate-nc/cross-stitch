// Regression tests for the four originally-broken tracker shortcuts:
//   [, ], 1, 2, 3, 4, c
//
// Bug A pre-fix: tracker's input-element guard included BUTTON and A, so any
//   click that left a button focused (which is the whole tracker toolbar)
//   silently killed every single-key shortcut.
// Bug B pre-fix: 1 2 3 4 c were gated on (stitchView==='highlight' &&
//   focusColour set). When focusColour was null they were silent no-ops.
//
// These tests load shortcuts.js + a stripped-down clone of the entries the
// tracker registers via useShortcuts(), then verify each key fires through
// a focused button, with and without focusColour, with and without highlight
// view.

const fs = require('fs');
const path = require('path');

// ─── Minimal DOM stub ───────────────────────────────────────────────
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
global.React = { useEffect: () => {} };

function makeKeyEvent(key, opts) {
  opts = opts || {};
  return {
    type: 'keydown',
    key,
    ctrlKey: !!opts.ctrl, metaKey: !!opts.meta, shiftKey: !!opts.shift, altKey: !!opts.alt,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() {}
  };
}
function fire(key, opts) {
  const e = makeKeyEvent(key, opts);
  window.Shortcuts._dispatch(e);
  return e;
}

const src = fs.readFileSync(path.join(__dirname, '..', 'shortcuts.js'), 'utf8');
eval(src);

// Build the tracker entries that the migration registers. Mirrors the
// declaration in tracker-app.js. We use spies for the side-effects.
function setupTracker(state) {
  state = state || {};
  // Defaults
  const s = Object.assign({
    isActive: true,
    isEditMode: false,
    stitchView: 'highlight',
    focusColour: null,
    focusableColors: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
    colourDoneCounts: {}
  }, state);

  const calls = {
    setHighlightMode: jest.fn(),
    setCountingAidsEnabled: jest.fn(),
    setFocusColour: jest.fn(v => {
      s.focusColour = (typeof v === 'function') ? v(s.focusColour) : v;
    })
  };

  function ensureFocusColour() {
    if (s.focusColour) return;
    const first = s.focusableColors[0];
    if (first) calls.setFocusColour(first.id);
  }
  function cycleFocusColour(direction) {
    calls.setFocusColour(prev => {
      if (!s.focusableColors.length) return prev;
      if (!prev) return s.focusableColors[0].id;
      const idx = s.focusableColors.findIndex(p => p.id === prev);
      if (idx < 0) return s.focusableColors[0].id;
      if (direction > 0) return s.focusableColors[(idx + 1) % s.focusableColors.length].id;
      return s.focusableColors[(idx <= 0 ? s.focusableColors.length : idx) - 1].id;
    });
  }

  // Activate scopes
  window.Shortcuts.pushScope('tracker');
  if (!s.isEditMode) window.Shortcuts.pushScope('tracker.notedit');
  if (s.stitchView === 'highlight') window.Shortcuts.pushScope('tracker.view.highlight');

  // Register entries (only the ones under test; others don't matter here).
  window.Shortcuts.register([
    { id: 'tracker.counting', keys: 'c', scope: 'tracker',
      description: 'Toggle counting aids',
      run: () => calls.setCountingAidsEnabled(v => !v) },
    { id: 'tracker.hl.next', keys: [']', 'arrowright'], scope: 'tracker.view.highlight',
      description: 'Next focus colour', run: () => cycleFocusColour(+1) },
    { id: 'tracker.hl.prev', keys: ['[', 'arrowleft'], scope: 'tracker.view.highlight',
      description: 'Previous focus colour', run: () => cycleFocusColour(-1) },
    { id: 'tracker.hl.isolate', keys: '1', scope: 'tracker.view.highlight',
      description: 'Highlight isolate', run: () => { ensureFocusColour(); calls.setHighlightMode('isolate'); } },
    { id: 'tracker.hl.outline', keys: '2', scope: 'tracker.view.highlight',
      description: 'Highlight outline', run: () => { ensureFocusColour(); calls.setHighlightMode('outline'); } },
    { id: 'tracker.hl.tint', keys: '3', scope: 'tracker.view.highlight',
      description: 'Highlight tint', run: () => { ensureFocusColour(); calls.setHighlightMode('tint'); } },
    { id: 'tracker.hl.spotlight', keys: '4', scope: 'tracker.view.highlight',
      description: 'Highlight spotlight', run: () => { ensureFocusColour(); calls.setHighlightMode('spotlight'); } }
  ]);

  return { state: s, calls };
}

describe('tracker — broken shortcuts restored', () => {
  beforeEach(() => {
    window.Shortcuts._reset();
    _doc._activeElement = null;
  });

  // ─── Bug A: focused button must NOT swallow shortcuts ──────────────
  describe('shortcuts fire even when focus is on a toolbar button', () => {
    test('1 fires through a focused BUTTON', () => {
      const { calls } = setupTracker();
      _doc._activeElement = { tagName: 'BUTTON' };
      fire('1');
      expect(calls.setHighlightMode).toHaveBeenCalledWith('isolate');
    });

    test('] fires through a focused BUTTON', () => {
      const { calls } = setupTracker();
      _doc._activeElement = { tagName: 'BUTTON' };
      fire(']');
      expect(calls.setFocusColour).toHaveBeenCalled();
    });

    test('c fires through a focused anchor', () => {
      const { calls } = setupTracker();
      _doc._activeElement = { tagName: 'A' };
      fire('c');
      expect(calls.setCountingAidsEnabled).toHaveBeenCalled();
    });

    test('1 still BLOCKED through a focused INPUT', () => {
      const { calls } = setupTracker();
      _doc._activeElement = { tagName: 'INPUT' };
      fire('1');
      expect(calls.setHighlightMode).not.toHaveBeenCalled();
    });

    test('c still BLOCKED through a focused TEXTAREA', () => {
      const { calls } = setupTracker();
      _doc._activeElement = { tagName: 'TEXTAREA' };
      fire('c');
      expect(calls.setCountingAidsEnabled).not.toHaveBeenCalled();
    });
  });

  // ─── Bug B: 1-4 must work without focusColour pre-set ──────────────
  describe('1-4 work without a pre-set focus colour', () => {
    test('1 auto-picks the first focusable colour and applies isolate', () => {
      const { state, calls } = setupTracker({ focusColour: null });
      fire('1');
      expect(calls.setFocusColour).toHaveBeenCalledWith('A');
      expect(calls.setHighlightMode).toHaveBeenCalledWith('isolate');
      expect(state.focusColour).toBe('A');
    });

    test('4 auto-picks the first focusable colour and applies spotlight', () => {
      const { state, calls } = setupTracker({ focusColour: null });
      fire('4');
      expect(calls.setFocusColour).toHaveBeenCalledWith('A');
      expect(calls.setHighlightMode).toHaveBeenCalledWith('spotlight');
      expect(state.focusColour).toBe('A');
    });

    test('2 with focusColour already set does NOT change it', () => {
      const { state, calls } = setupTracker({ focusColour: 'B' });
      fire('2');
      // ensureFocusColour is a no-op when focusColour is set
      expect(calls.setFocusColour).not.toHaveBeenCalled();
      expect(calls.setHighlightMode).toHaveBeenCalledWith('outline');
      expect(state.focusColour).toBe('B');
    });
  });

  // ─── [ ] cycle from a null starting point ──────────────────────────
  describe('[ and ] cycle focus colour from null', () => {
    test('] starting at null jumps to first colour', () => {
      const { state, calls } = setupTracker({ focusColour: null });
      fire(']');
      expect(calls.setFocusColour).toHaveBeenCalled();
      expect(state.focusColour).toBe('A');
    });

    test('[ starting at null jumps to first colour', () => {
      const { state, calls } = setupTracker({ focusColour: null });
      fire('[');
      expect(calls.setFocusColour).toHaveBeenCalled();
      expect(state.focusColour).toBe('A');
    });

    test('] from middle wraps forward', () => {
      const { state } = setupTracker({ focusColour: 'C' });
      fire(']');
      expect(state.focusColour).toBe('A');
    });

    test('[ from first wraps backward', () => {
      const { state } = setupTracker({ focusColour: 'A' });
      fire('[');
      expect(state.focusColour).toBe('C');
    });
  });

  // ─── c (counting aids) works in any tracker view ───────────────────
  describe('c (counting aids) is no longer gated on highlight + focused', () => {
    test('c fires in symbol view with no focus colour', () => {
      const { calls } = setupTracker({ stitchView: 'symbol', focusColour: null });
      fire('c');
      expect(calls.setCountingAidsEnabled).toHaveBeenCalled();
    });

    test('c fires in colour view with no focus colour', () => {
      const { calls } = setupTracker({ stitchView: 'colour', focusColour: null });
      fire('c');
      expect(calls.setCountingAidsEnabled).toHaveBeenCalled();
    });

    test('c fires in highlight view with no focus colour', () => {
      const { calls } = setupTracker({ stitchView: 'highlight', focusColour: null });
      fire('c');
      expect(calls.setCountingAidsEnabled).toHaveBeenCalled();
    });
  });

  // ─── 1-4 and [ ] are scoped to highlight view only ─────────────────
  describe('highlight-only shortcuts do not fire in other views', () => {
    test('1 does NOT fire in symbol view', () => {
      const { calls } = setupTracker({ stitchView: 'symbol' });
      fire('1');
      expect(calls.setHighlightMode).not.toHaveBeenCalled();
    });

    test('] does NOT cycle in colour view', () => {
      const { calls } = setupTracker({ stitchView: 'colour' });
      fire(']');
      expect(calls.setFocusColour).not.toHaveBeenCalled();
    });
  });
});
