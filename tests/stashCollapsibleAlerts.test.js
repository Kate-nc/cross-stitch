/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react-dom/test-utils');
const babel = require('@babel/core');
const source = fs.readFileSync(path.join(__dirname, '../manager-app.js'), 'utf8');
const panelSource = source.slice(source.indexOf('function StashAlertPanel'), source.indexOf('function ManagerApp'));
const code = babel.transformSync(panelSource, { presets: ['@babel/preset-react'] }).code;
const Icons = { chevronRight: () => 'right', chevronDown: () => 'down' };
const Panel = new Function('React', 'useState', 'Icons', code + '\nreturn StashAlertPanel;')(React, React.useState, Icons);
const keys = ['stashConflictsCollapsed', 'stashLowStockNeededCollapsed', 'stashLowStockNotNeededCollapsed'];
let container, root;
function render(counts = [1, 2, 3]) {
  act(() => root.render(React.createElement(React.Fragment, null, counts.map((count, i) => count > 0 && React.createElement(Panel, {
    key: keys[i], id: 'alert-' + i, title: 'Alert ' + i, preferenceKey: keys[i], count, icon: 'box'
  }, React.createElement('p', null, 'Description'), React.createElement('button', null, 'Inventory action'))))));
}
function toggle(i) { return container.querySelector('#alert-' + i + '-heading button'); }
function click(i) { act(() => toggle(i).click()); }
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  window.eval(fs.readFileSync(path.join(__dirname, '../user-prefs.js'), 'utf8'));
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

test('independent choices survive remounts and are included in preference backups', () => {
  render(); click(0); click(2);
  expect(keys.map(k => window.UserPrefs.loadAll()[k])).toEqual([true, false, true]);
  act(() => root.unmount()); root = createRoot(container); render();
  expect([0, 1, 2].map(i => toggle(i).getAttribute('aria-expanded'))).toEqual(['false', 'true', 'false']);
  click(0);
  expect(window.UserPrefs.get(keys[0])).toBe(false);
  expect(window.UserPrefs.get(keys[2])).toBe(true);
});

test('live counts change without opening a panel; zero alerts and tab visits retain its choice', () => {
  render(); click(1); render([1, 7, 3]);
  expect(toggle(1).textContent).toContain('(7)');
  expect(toggle(1).getAttribute('aria-expanded')).toBe('false');
  render([0, 0, 0]); expect(container.textContent).toBe('');
  expect(window.UserPrefs.get(keys[1])).toBe(true);
  render([2, 4, 5]); expect(toggle(1).getAttribute('aria-expanded')).toBe('false');
  expect(toggle(0).getAttribute('aria-expanded')).toBe('true');
});

test('native button controls a hidden description and action list, retaining focus', () => {
  render(); const button = toggle(0); button.focus(); click(0);
  expect(button.type).toBe('button');
  expect(button.closest('h3')).not.toBeNull();
  const body = document.getElementById(button.getAttribute('aria-controls'));
  expect(body.hidden).toBe(true);
  expect(body.textContent).toContain('Description');
  expect(document.activeElement).toBe(button);
  click(0); expect(body.hidden).toBe(false);
});

test('missing or invalid preferences default to expanded; only boolean true collapses', () => {
  window.UserPrefs.set(keys[0], 'false'); window.UserPrefs.set(keys[1], 1);
  localStorage.setItem('cs_pref_' + keys[2], '{broken');
  render(); expect([0, 1, 2].map(i => toggle(i).getAttribute('aria-expanded'))).toEqual(['true', 'true', 'true']);
});

test('a preference write failure still permits toggling without touching inventory storage', () => {
  render(); const set = jest.spyOn(window.UserPrefs, 'set').mockImplementation(() => { throw Error('unavailable'); });
  click(0); expect(toggle(0).getAttribute('aria-expanded')).toBe('false');
  expect(set).toHaveBeenCalledWith(keys[0], true);
  expect(Object.keys(localStorage).filter(k => k !== 'cs_state_schema_version')).toEqual([]);
  set.mockRestore();
});

test('loading current version 4 inventory preserves per-thread minima and does not write a legacy migration', () => {
  const block = source.slice(source.indexOf('let finalThreads = threadsData;'), source.indexOf('setThreads(finalThreads);'));
  const load = new Function('threadsData', 'versionData', 'store', 'DMC', 'ANCHOR', 'normaliseStashKey', 'threadKey', 'threadsBaselineRef', block + '\nreturn finalThreads;');
  const data = { 'dmc:310': { owned: 1, min_stock: 2, partialStatus: 'about-half' }, 'anchor:403': { owned: 3, min_stock: 4 } };
  const store = { put: jest.fn() };
  expect(load(data, 4, store, [], [], k => k, (b, id) => b + ':' + id, {current:{}})).toBe(data);
  expect(store.put).not.toHaveBeenCalled();
});
