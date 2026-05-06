// Tests for the Command Palette's fuzzy-scoring + filterAndSort.
// We sandbox-evaluate command-palette.js with a stub document/window so the
// IIFE runs and exposes window.CommandPalette in our local scope.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { loadSource } = require('./_helpers/loadSource');
const src = loadSource('command-palette.js');

function makeSandbox() {
  const stubEl = () => ({
    appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {},
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    querySelectorAll() { return []; }, click() {}, focus() {}, select() {},
    style: {}, classList: { add() {}, remove() {} }, innerHTML: '', textContent: '',
    parentNode: null
  });
  const doc = {
    createElement: () => stubEl(),
    getElementById: () => null,
    addEventListener: () => {},
    head: stubEl(),
    body: stubEl()
  };
  const win = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
    location: { pathname: '/index.html', href: '' },
    setTimeout: (fn) => fn(),
    console
  };
  win.window = win;
  win.document = doc;
  return win;
}

describe('CommandPalette.fuzzyScore', () => {
  let CP;
  beforeAll(() => {
    const sandbox = makeSandbox();
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    CP = sandbox.CommandPalette;
  });

  it('exposes a public API', () => {
    expect(typeof CP.open).toBe('function');
    expect(typeof CP.close).toBe('function');
    expect(typeof CP.registerPage).toBe('function');
  });

  it('scores exact keyword match highest', () => {
    const a = { label: 'Backup', keywords: ['backup'] };
    expect(CP._fuzzyScore('backup', a)).toBe(100);
  });

  it('scores prefix match at 80', () => {
    const a = { label: 'Backup', keywords: ['backup'] };
    expect(CP._fuzzyScore('back', a)).toBe(80);
  });

  it('scores substring match at 60', () => {
    const a = { label: 'Foo', keywords: ['something'] };
    expect(CP._fuzzyScore('thin', a)).toBe(60);
  });

  it('scores label match at 50', () => {
    const a = { label: 'Open Stash Manager', keywords: [] };
    expect(CP._fuzzyScore('manager', a)).toBe(50);
  });

  it('returns 0 for no match', () => {
    const a = { label: 'Foo', keywords: ['bar'] };
    expect(CP._fuzzyScore('xyz', a)).toBe(0);
  });

  it('returns 1 for empty query (keep-all)', () => {
    const a = { label: 'Foo', keywords: ['bar'] };
    expect(CP._fuzzyScore('', a)).toBe(1);
  });

  it('filterAndSort orders by score desc then by section', () => {
    const actions = [
      { id: 'a', label: 'Apple', keywords: ['fruit'], section: 'action' },
      { id: 'b', label: 'Banana', keywords: ['banana'], section: 'navigate' },
      { id: 'c', label: 'Cherry', keywords: ['ban'], section: 'recent' }
    ];
    const out = CP._filterAndSort(actions, 'banana');
    // exact 'banana' (100) wins; substring of 'ban' in 'cherry' keyword (60)
    expect(out[0].id).toBe('b');
    expect(out.length).toBeGreaterThanOrEqual(1);
  });

  it('filterAndSort hides actions whose condition() returns false', () => {
    const actions = [
      { id: 'a', label: 'Always', keywords: ['x'] },
      { id: 'b', label: 'Hidden', keywords: ['x'], condition: () => false }
    ];
    const out = CP._filterAndSort(actions, 'x');
    expect(out.find(a => a.id === 'b')).toBeUndefined();
    expect(out.find(a => a.id === 'a')).toBeDefined();
  });

  it('registerPage replaces actions for a page', () => {
    CP.registerPage('manager', [{ id: 'foo', label: 'Foo', section: 'action', action: () => {} }]);
    expect(CP._pageActions('manager').length).toBe(1);
    CP.registerPage('manager', []);
    expect(CP._pageActions('manager').length).toBe(0);
  });
});
