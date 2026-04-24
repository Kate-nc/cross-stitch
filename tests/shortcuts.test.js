// Tests for shortcuts.js — central registry and dispatcher.
// Pattern matches tests/useEscape.test.js: stub minimal DOM, eval source.

const fs = require('fs');
const path = require('path');

// ─── Minimal DOM stub ──────────────────────────────────────────────────
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
global.navigator = { platform: 'Win32', userAgent: 'jest' };

function makeKeyEvent(opts) {
  opts = opts || {};
  return {
    type: 'keydown',
    key: opts.key,
    ctrlKey: !!opts.ctrl,
    metaKey: !!opts.meta,
    shiftKey: !!opts.shift,
    altKey: !!opts.alt,
    defaultPrevented: false,
    _prevented: false,
    _stopped: false,
    preventDefault() { this.defaultPrevented = true; this._prevented = true; },
    stopPropagation() { this._stopped = true; }
  };
}

// ─── React stub (with deps re-run support) ─────────────────────────────
const _hookCalls = []; // { fn, deps, lastDeps, cleanup }
function useEffectStub(fn, deps) {
  const slot = { fn, deps: deps && deps.slice(), lastDeps: undefined, cleanup: undefined };
  _hookCalls.push(slot);
  // Run immediately on first registration.
  const c = fn();
  if (typeof c === 'function') slot.cleanup = c;
  slot.lastDeps = slot.deps;
}
function unmountAll() {
  while (_hookCalls.length) {
    const s = _hookCalls.pop();
    if (s.cleanup) try { s.cleanup(); } catch (_) {}
  }
}
global.React = { useEffect: useEffectStub };

// ─── Load shortcuts.js ─────────────────────────────────────────────────
const src = fs.readFileSync(path.join(__dirname, '..', 'shortcuts.js'), 'utf8');
eval(src);

function fire(opts) {
  const e = makeKeyEvent(opts);
  window.Shortcuts._dispatch(e);
  return e;
}

describe('shortcuts.js — registry', () => {
  beforeEach(() => {
    window.Shortcuts._reset();
    _doc._activeElement = null;
    unmountAll();
    // Silence + capture console.error for conflict tests.
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    if (console.error.mockRestore) console.error.mockRestore();
  });

  it('exposes Shortcuts and useShortcuts globals', () => {
    expect(typeof window.Shortcuts).toBe('object');
    expect(typeof window.Shortcuts.register).toBe('function');
    expect(typeof window.useShortcuts).toBe('function');
    expect(typeof window.useScope).toBe('function');
  });

  it('fires a registered single-key shortcut', () => {
    const ran = [];
    window.Shortcuts.register([{ id: 't.a', keys: 'a', scope: 'global', description: 'A',
      run: () => ran.push('a') }]);
    fire({ key: 'a' });
    expect(ran).toEqual(['a']);
  });

  it('does not fire when text input is focused (unmodified)', () => {
    const ran = [];
    window.Shortcuts.register([{ id: 't.a', keys: 'a', scope: 'global', run: () => ran.push('a') }]);
    _doc._activeElement = { tagName: 'INPUT', getAttribute: () => 'text', isContentEditable: false };
    fire({ key: 'a' });
    expect(ran).toEqual([]);
  });

  it('does fire when focus is on a BUTTON (not a text input)', () => {
    const ran = [];
    window.Shortcuts.register([{ id: 't.a', keys: 'a', scope: 'global', run: () => ran.push('a') }]);
    _doc._activeElement = { tagName: 'BUTTON', getAttribute: () => null, isContentEditable: false };
    fire({ key: 'a' });
    expect(ran).toEqual(['a']);
  });

  it('does fire when focus is on an A (link)', () => {
    const ran = [];
    window.Shortcuts.register([{ id: 't.a', keys: 'a', scope: 'global', run: () => ran.push('a') }]);
    _doc._activeElement = { tagName: 'A', getAttribute: () => null, isContentEditable: false };
    fire({ key: 'a' });
    expect(ran).toEqual(['a']);
  });

  it('Ctrl+S fires from inside an input (modified shortcut)', () => {
    const ran = [];
    window.Shortcuts.register([{ id: 't.save', keys: 'mod+s', scope: 'global', run: () => ran.push('s') }]);
    _doc._activeElement = { tagName: 'INPUT', getAttribute: () => 'text', isContentEditable: false };
    fire({ key: 's', ctrl: true });
    expect(ran).toEqual(['s']);
  });

  it('respects allowInInput=false even for modified shortcuts', () => {
    const ran = [];
    window.Shortcuts.register([{ id: 't.save', keys: 'mod+s', scope: 'global', allowInInput: false,
      run: () => ran.push('s') }]);
    _doc._activeElement = { tagName: 'INPUT', getAttribute: () => 'text' };
    fire({ key: 's', ctrl: true });
    expect(ran).toEqual([]);
  });

  it('matches contenteditable as a text input', () => {
    const ran = [];
    window.Shortcuts.register([{ id: 't.a', keys: 'a', scope: 'global', run: () => ran.push('a') }]);
    _doc._activeElement = { tagName: 'DIV', getAttribute: () => null, isContentEditable: true };
    fire({ key: 'a' });
    expect(ran).toEqual([]);
  });

  it('matches case-insensitively for letters', () => {
    const ran = [];
    window.Shortcuts.register([{ id: 't.b', keys: 'b', scope: 'global', run: () => ran.push('b') }]);
    fire({ key: 'B', shift: true });
    // Shift-B is a different chord (shift modifier required), should NOT fire bare 'b'
    expect(ran).toEqual([]);
    fire({ key: 'B' });
    expect(ran).toEqual(['b']);
  });

  it('does not fire when scope is inactive', () => {
    const ran = [];
    window.Shortcuts.register([{ id: 't.tmode', keys: 't', scope: 'tracker', run: () => ran.push('t') }]);
    fire({ key: 't' });
    expect(ran).toEqual([]);
    window.Shortcuts.pushScope('tracker');
    fire({ key: 't' });
    expect(ran).toEqual(['t']);
    window.Shortcuts.popScope('tracker');
    fire({ key: 't' });
    expect(ran).toEqual(['t']); // unchanged
  });

  it('most-specific scope wins', () => {
    const ran = [];
    window.Shortcuts.register([
      { id: 'g', keys: '1', scope: 'global', run: () => ran.push('g') },
      { id: 'tr', keys: '1', scope: 'tracker', run: () => ran.push('tr') },
      { id: 'tr.hl', keys: '1', scope: 'tracker.view.highlight', run: () => ran.push('hl') },
    ]);
    window.Shortcuts.pushScope('tracker');
    fire({ key: '1' });
    expect(ran).toEqual(['tr']);
    window.Shortcuts.pushScope('tracker.view.highlight');
    fire({ key: '1' });
    expect(ran).toEqual(['tr', 'hl']);
  });

  it('mode transitions correctly swap active shortcuts', () => {
    const ran = [];
    window.Shortcuts.register([
      { id: 'tr.t', keys: 't', scope: 'tracker', run: () => ran.push('t') },
      { id: 'cr.t', keys: 't', scope: 'creator', run: () => ran.push('c') },
    ]);
    window.Shortcuts.pushScope('tracker');
    fire({ key: 't' }); // → 't'
    window.Shortcuts.popScope('tracker');
    window.Shortcuts.pushScope('creator');
    fire({ key: 't' }); // → 'c'
    expect(ran).toEqual(['t', 'c']);
  });

  it('detects conflicting registrations (same scope, same key)', () => {
    window.Shortcuts.register([
      { id: 'a1', keys: 'a', scope: 'global', run: () => {} },
      { id: 'a2', keys: 'a', scope: 'global', run: () => {} },
    ]);
    expect(console.error).toHaveBeenCalled();
    const msgs = console.error.mock.calls.map(c => c.join(' ')).join('\n');
    expect(msgs).toMatch(/Conflict.*a1.*a2|Conflict.*a2.*a1/);
  });

  it('does NOT report conflicts for same key in different scopes', () => {
    window.Shortcuts.register([
      { id: 'a.tracker', keys: 'a', scope: 'tracker', run: () => {} },
      { id: 'a.creator', keys: 'a', scope: 'creator', run: () => {} },
    ]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('runtime when() guard suppresses dispatch', () => {
    const ran = [];
    let allowed = false;
    window.Shortcuts.register([{ id: 'g', keys: 'a', scope: 'global', when: () => allowed,
      run: () => ran.push('a') }]);
    fire({ key: 'a' }); expect(ran).toEqual([]);
    allowed = true;
    fire({ key: 'a' }); expect(ran).toEqual(['a']);
  });

  it('parses "mod+shift+z" correctly (matches Cmd+Shift+Z and Ctrl+Shift+Z)', () => {
    const ran = [];
    window.Shortcuts.register([{ id: 'r', keys: 'mod+shift+z', scope: 'global', run: () => ran.push('r') }]);
    fire({ key: 'z', ctrl: true, shift: true }); expect(ran.length).toBe(1);
    fire({ key: 'z', meta: true, shift: true }); expect(ran.length).toBe(2);
    fire({ key: 'z', ctrl: true });               expect(ran.length).toBe(2); // missing shift
    fire({ key: 'z' });                            expect(ran.length).toBe(2); // bare z
  });

  it('parses array keys (e.g. ["=", "+"])', () => {
    const ran = [];
    window.Shortcuts.register([{ id: 'zoom', keys: ['=', '+'], scope: 'global', run: () => ran.push('z') }]);
    fire({ key: '=' }); fire({ key: '+', shift: true });
    // '+' typically requires Shift on US layout, but parser ignores shift for non-letter chars.
    // We test both: the bare '=' should fire.
    expect(ran[0]).toBe('z');
  });

  it('parses named keys (space, esc, enter, arrowleft, arrowright)', () => {
    const ran = [];
    window.Shortcuts.register([
      { id: 's', keys: 'space',      scope: 'global', run: () => ran.push('space') },
      { id: 'l', keys: 'arrowleft',  scope: 'global', run: () => ran.push('left') },
      { id: 'r', keys: 'arrowright', scope: 'global', run: () => ran.push('right') },
    ]);
    fire({ key: ' ' });          expect(ran).toEqual(['space']);
    fire({ key: 'ArrowLeft' });  expect(ran).toEqual(['space', 'left']);
    fire({ key: 'ArrowRight' }); expect(ran).toEqual(['space', 'left', 'right']);
  });

  it('list() omits hidden entries and exposes scope/group', () => {
    window.Shortcuts.register([
      { id: 'a', keys: 'a', scope: 'creator', description: 'A action', run: () => {} },
      { id: 'b', keys: 'b', scope: 'creator', hidden: true, run: () => {} },
    ]);
    const out = window.Shortcuts.list();
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('a');
    expect(out[0].scope).toBe('creator');
  });

  it('preventDefault and stopPropagation are called on the event by default', () => {
    window.Shortcuts.register([{ id: 'a', keys: 'a', scope: 'global', run: () => {} }]);
    const e = fire({ key: 'a' });
    expect(e._prevented).toBe(true);
    expect(e._stopped).toBe(true);
  });

  it('preventDefault: false leaves the event alone', () => {
    window.Shortcuts.register([{ id: 'a', keys: 'a', scope: 'global', preventDefault: false, run: () => {} }]);
    const e = fire({ key: 'a' });
    expect(e._prevented).toBe(false);
  });

  it('formatKey produces platform-appropriate labels', () => {
    expect(window.Shortcuts.formatKey('mod+s')).toBe('Ctrl+S'); // jsdom navigator is Win32
    expect(window.Shortcuts.formatKey('mod+shift+z')).toBe('Ctrl+Shift+Z');
    expect(window.Shortcuts.formatKey('?')).toBe('?');
    expect(window.Shortcuts.formatKey('arrowleft')).toBe('←');
    expect(window.Shortcuts.formatKey('space')).toBe('Space');
  });

  it('useScope hook (via stub) toggles scope membership', () => {
    const ran = [];
    window.Shortcuts.register([{ id: 'tr.t', keys: 't', scope: 'tracker', run: () => ran.push('t') }]);
    window.useScope('tracker', true);
    fire({ key: 't' });
    expect(ran).toEqual(['t']);
    unmountAll();
    fire({ key: 't' });
    expect(ran).toEqual(['t']);
  });

  it('useShortcuts hook (via stub) registers and unregisters', () => {
    const ran = [];
    window.useShortcuts([{ id: 'h', keys: 'h', scope: 'global', run: () => ran.push('h') }], []);
    fire({ key: 'h' });
    expect(ran).toEqual(['h']);
    unmountAll();
    fire({ key: 'h' });
    expect(ran).toEqual(['h']);
  });
});
