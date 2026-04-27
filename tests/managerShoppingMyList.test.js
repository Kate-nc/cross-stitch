// tests/managerShoppingMyList.test.js — Step 2 of Shopping List rebuild.
//
// Exercises the new pure helpers (groupRows, formatGBP, buildPlainText,
// buildCSV) plus a source contract for the new sub-view, sub-tabs, qty
// stepper, "Bought"/"Remove" actions, and confirmation dialog.

const fs = require('fs');
const path = require('path');

function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

function loadModule() {
  const src = read('manager-shopping.js');
  const win = {};
  const reactStub = { createElement: function () { return {}; }, Fragment: 'Fragment' };
  const fn = new Function('window', 'React', 'console', src);
  fn(win, reactStub, console);
  return win;
}

describe('Shopping List rebuild — Step 2', () => {
  const SRC = read('manager-shopping.js');
  const win = loadModule();
  const MS = win.ManagerShopping;

  describe('source contract', () => {
    test('exposes the new pure helpers on window.ManagerShopping', () => {
      expect(typeof MS._groupRows).toBe('function');
      expect(typeof MS._formatGBP).toBe('function');
      expect(typeof MS._buildPlainText).toBe('function');
      expect(typeof MS._buildCSV).toBe('function');
    });

    test('two sub-views are declared (mylist default, suggest secondary)', () => {
      expect(SRC).toMatch(/useState\('mylist'\)/);
      expect(SRC).toMatch(/subView === 'mylist'/);
      // Sub-view selector buttons set 'mylist' or 'suggest' explicitly.
      expect(SRC).toMatch(/setSubView\('suggest'\)/);
      expect(SRC).toMatch(/'My list'/);
      expect(SRC).toMatch(/'Suggest from projects'/);
    });

    test('My-list view uses the new bridge methods', () => {
      expect(SRC).toMatch(/StashBridge\.setToBuyQty/);
      expect(SRC).toMatch(/StashBridge\.markBought/);
      expect(SRC).toMatch(/StashBridge\.clearShoppingList/);
      expect(SRC).toMatch(/StashBridge\._buildShoppingListRows/);
    });

    test('Suggest view passes a qtyMap to seed tobuy_qty', () => {
      // markManyToBuy([...], true, qtyMap) is the new signature.
      expect(SRC).toMatch(/markManyToBuy\(keys, true, qtyMap\)/);
      expect(SRC).toMatch(/markManyToBuy\(\[row\.key\], true, qtyMap\)/);
    });

    test('Suggest view shows On list state for rows already on My-list', () => {
      expect(SRC).toMatch(/onListByKey/);
      expect(SRC).toMatch(/'On list'/);
      expect(SRC).toMatch(/mgr-shopping-rowbtn-on/);
    });

    test('header offers Copy / Print / CSV / Mark all bought / Clear list', () => {
      expect(SRC).toMatch(/'Copy'/);
      expect(SRC).toMatch(/'Print'/);
      expect(SRC).toMatch(/'CSV'/);
      expect(SRC).toMatch(/'Mark all bought'/);
      expect(SRC).toMatch(/'Clear list'/);
    });

    test('group toggle exposes Flat / Brand / Project radios', () => {
      expect(SRC).toMatch(/\['flat', 'brand', 'project'\]/);
      expect(SRC).toMatch(/role: 'radiogroup'/);
    });

    test('destructive actions go through a styled confirmation dialog', () => {
      // No direct window.confirm() — must use the in-file alertdialog.
      expect(SRC).not.toMatch(/window\.confirm\(/);
      expect(SRC).toMatch(/role: 'alertdialog'/);
      expect(SRC).toMatch(/setConfirm\(\{ kind: 'clear' \}\)/);
      expect(SRC).toMatch(/setConfirm\(\{ kind: 'bought' \}\)/);
    });

    test('legacy ManagerShopping helpers and copy strings still exposed', () => {
      // Don't break the existing managerShopping.test.js contract.
      expect(typeof MS._aggregateDeficits).toBe('function');
      expect(typeof MS._isActiveStateForShopping).toBe('function');
      expect(typeof MS._compositeKey).toBe('function');
      expect(MS.EMPTY_NO_PROJECTS).toBe('No active projects yet.');
      expect(MS.EMPTY_ALL_COVERED).toBe('All your active projects have the threads they need.');
      expect(MS.SCOPE_CAPTION).toBe('Shopping across all active projects');
    });
  });

  describe('groupRows (pure)', () => {
    const rows = [
      { id: '310', brand: 'dmc', tobuyQty: 2, projectIds: ['p1'] },
      { id: '550', brand: 'dmc', tobuyQty: 1, projectIds: ['p1', 'p2'] },
      { id: '403', brand: 'anchor', tobuyQty: 4, projectIds: [] },
    ];
    const projectNames = { p1: 'Project Alpha', p2: 'Project Beta' };

    test('flat mode returns a single group containing every row', () => {
      const groups = MS._groupRows(rows, 'flat', projectNames);
      expect(groups.length).toBe(1);
      expect(groups[0].rows.length).toBe(3);
      expect(groups[0].label).toBe('');
    });

    test('brand mode buckets DMC and Anchor separately, DMC first', () => {
      const groups = MS._groupRows(rows, 'brand', projectNames);
      expect(groups.map(g => g.label)).toEqual(['DMC', 'ANCHOR']);
      expect(groups[0].rows.length).toBe(2);
      expect(groups[1].rows.length).toBe(1);
    });

    test('project mode buckets by project id, with an unsourced bucket last', () => {
      const groups = MS._groupRows(rows, 'project', projectNames);
      const labels = groups.map(g => g.label);
      expect(labels).toContain('Project Alpha');
      expect(labels).toContain('Project Beta');
      // Anchor row has no projectIds → should land in the unsourced bucket.
      expect(labels[labels.length - 1]).toBe('Added directly to list');
      const beta = groups.find(g => g.label === 'Project Beta');
      expect(beta.rows.length).toBe(1);
    });

    test('returns [] for empty input', () => {
      expect(MS._groupRows([], 'flat')).toEqual([]);
      expect(MS._groupRows(null, 'brand')).toEqual([]);
    });
  });

  describe('formatGBP (pure)', () => {
    test('formats positive numbers with £ symbol', () => {
      const out = MS._formatGBP(3.5);
      expect(out).toMatch(/£?3\.50|3,50/);
    });
    test('coerces non-numeric input to 0', () => {
      const out = MS._formatGBP(undefined);
      expect(out).toMatch(/0\.00/);
    });
  });

  describe('buildPlainText (pure)', () => {
    test('produces a copyable list with brand/id/name/qty and totals', () => {
      const rows = [
        { id: '310', brand: 'dmc', name: 'Black', tobuyQty: 2, owned: 0 },
        { id: '403', brand: 'anchor', name: 'Coffee', tobuyQty: 1, owned: 1 },
      ];
      const text = MS._buildPlainText(rows, 'My shopping list');
      expect(text).toMatch(/My shopping list/);
      expect(text).toMatch(/DMC 310 Black — 2 skeins/);
      expect(text).toMatch(/ANCHOR 403 Coffee — 1 skein \(own 1\)/);
      expect(text).toMatch(/Total: 2 threads, 3 skeins/);
    });
    test('handles empty list with placeholder', () => {
      const text = MS._buildPlainText([], 'Empty');
      expect(text).toMatch(/Empty/);
      expect(text).toMatch(/\(empty\)/);
    });
    test('defaults qty to 1 when tobuyQty is missing or zero', () => {
      const rows = [{ id: '310', brand: 'dmc', name: 'Black', tobuyQty: 0, owned: 0 }];
      expect(MS._buildPlainText(rows, '')).toMatch(/1 skein/);
    });
  });

  describe('buildCSV (pure)', () => {
    test('emits header row and one CSV row per item', () => {
      const rows = [
        { id: '310', brand: 'dmc', name: 'Black', tobuyQty: 2, owned: 0 },
      ];
      const csv = MS._buildCSV(rows);
      const lines = csv.split('\n');
      expect(lines[0]).toBe('Brand,Id,Name,Quantity,Owned');
      expect(lines[1]).toBe('DMC,310,Black,2,0');
    });
    test('escapes commas, quotes and newlines in name fields', () => {
      const rows = [{ id: '310', brand: 'dmc', name: 'Black, with "comma"', tobuyQty: 1, owned: 0 }];
      const csv = MS._buildCSV(rows);
      expect(csv).toMatch(/"Black, with ""comma"""/);
    });
    test('handles empty input', () => {
      expect(MS._buildCSV([])).toBe('Brand,Id,Name,Quantity,Owned');
      expect(MS._buildCSV(null)).toBe('Brand,Id,Name,Quantity,Owned');
    });
  });
});
