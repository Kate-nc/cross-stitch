// tests/managerShopping.test.js — B4 Stash Manager "Shopping" tab.
//
// Source-contract checks plus pure-helper assertions on the deficit
// aggregator (window.ManagerShopping._aggregateDeficits) and the
// active-state filter, without driving React under jsdom.

const fs = require('fs');
const path = require('path');

function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

// ── Load manager-shopping.js into a stubbed window/React/document ────────
function loadModule() {
  const src = read('manager-shopping.js');
  const win = {};
  const reactStub = { createElement: function () { return {}; } };
  const fn = new Function('window', 'React', 'console', src);
  fn(win, reactStub, console);
  return win;
}

describe('B4 — ManagerShopping', () => {
  describe('source contract', () => {
    const src = read('manager-shopping.js');

    it('exposes window.ManagerShopping', () => {
      expect(src).toMatch(/window\.ManagerShopping\s*=/);
    });

    it('exposes _aggregateDeficits, _isActiveStateForShopping, _compositeKey on the surface', () => {
      expect(src).toMatch(/window\.ManagerShopping\._aggregateDeficits/);
      expect(src).toMatch(/window\.ManagerShopping\._isActiveStateForShopping/);
      expect(src).toMatch(/window\.ManagerShopping\._compositeKey/);
    });

    it('uses British English empty-state strings', () => {
      expect(src).toMatch(/All your active projects have the threads they need\./);
      expect(src).toMatch(/No active projects yet\./);
    });

    // fix-3.4 — explicit scope caption.
    it('exposes a SCOPE_CAPTION on the public surface (fix-3.4)', () => {
      expect(src).toMatch(/SCOPE_CAPTION\s*=\s*'Shopping across all active projects'/);
    });

    // fix-3.9 — per-row source projects disclosure.
    it('renders an expandable "Used in N projects" disclosure (fix-3.9)', () => {
      expect(src).toMatch(/mgr-shopping-sources-toggle/);
      expect(src).toMatch(/Used in '\s*\+\s*projectCount/);
      expect(src).toMatch(/projectNamesById/);
    });

    it('supports onOpenProject prop for navigating to a source project (fix-3.9)', () => {
      expect(src).toMatch(/props\.onOpenProject/);
    });

    it('calls StashBridge.markManyToBuy for both bulk and per-row adds', () => {
      const matches = src.match(/StashBridge\.markManyToBuy/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('uses lazy-load (ProjectStorage.get) per active project', () => {
      expect(src).toMatch(/ProjectStorage\.get\(/);
      expect(src).toMatch(/ProjectStorage\.listProjects\(/);
    });
  });

  describe('manager.html script tag', () => {
    it('loads manager-shopping.js after the BulkAddModal include', () => {
      const src = read('manager.html');
      expect(src).toMatch(/<script src="manager-shopping\.js">/);
    });
  });

  describe('manager-app.js tab integration', () => {
    const src = read('manager-app.js');

    it('declares a "shopping" tab button alongside inventory/patterns', () => {
      expect(src).toMatch(/data-onboard="mgr-shopping-tab"/);
      expect(src).toMatch(/tab === "shopping"/);
    });

    it('renders window.ManagerShopping when the shopping tab is active', () => {
      expect(src).toMatch(/tab === "shopping"[\s\S]{0,200}window\.ManagerShopping/);
    });
  });

  describe('pure helpers', () => {
    const win = loadModule();
    const MS = win.ManagerShopping;

    it('module loaded and exposes the helpers', () => {
      expect(typeof MS).toBe('function');
      expect(typeof MS._aggregateDeficits).toBe('function');
      expect(typeof MS._isActiveStateForShopping).toBe('function');
      expect(typeof MS._compositeKey).toBe('function');
    });

    it('isActiveStateForShopping accepts active/queued/null and rejects paused/complete', () => {
      expect(MS._isActiveStateForShopping(null)).toBe(true);
      expect(MS._isActiveStateForShopping('')).toBe(true);
      expect(MS._isActiveStateForShopping('active')).toBe(true);
      expect(MS._isActiveStateForShopping('queued')).toBe(true);
      expect(MS._isActiveStateForShopping('paused')).toBe(false);
      expect(MS._isActiveStateForShopping('complete')).toBe(false);
      expect(MS._isActiveStateForShopping('design')).toBe(false);
    });

    it('compositeKey adds dmc: prefix to bare ids and leaves composite keys alone', () => {
      expect(MS._compositeKey('dmc', '310')).toBe('dmc:310');
      expect(MS._compositeKey('anchor', '403')).toBe('anchor:403');
      expect(MS._compositeKey('dmc', 'dmc:310')).toBe('dmc:310');
    });

    it('aggregateDeficits sums skeins across projects keyed by composite id', () => {
      const projects = [
        { id: 'p1', fabricCt: 14, threads: [{ id: '310', count: 4000, name: 'Black' }] },
        { id: 'p2', fabricCt: 14, threads: [{ id: '310', count: 2000, name: 'Black' }] },
        { id: 'p3', fabricCt: 14, threads: [{ id: '550', count: 1500, name: 'Violet' }] },
      ];
      const stash = { 'dmc:310': { owned: 1 }, 'dmc:550': { owned: 0 } };
      const rows = MS._aggregateDeficits(projects, stash);
      const black = rows.find(r => r.key === 'dmc:310');
      const violet = rows.find(r => r.key === 'dmc:550');
      expect(black).toBeTruthy();
      expect(violet).toBeTruthy();
      // Both projects should appear under projectIds for 310.
      expect(black.projectIds.sort()).toEqual(['p1', 'p2']);
      expect(black.owned).toBe(1);
      expect(black.deficit).toBeGreaterThan(0);
    });

    it('sorts deficits descending so the biggest gap appears first', () => {
      const projects = [
        { id: 'p1', fabricCt: 14, threads: [
          { id: '310', count: 12000, name: 'Black' },
          { id: '550', count: 800,   name: 'Violet' },
        ] },
      ];
      const rows = MS._aggregateDeficits(projects, {});
      expect(rows.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].deficit).toBeGreaterThanOrEqual(rows[i].deficit);
      }
    });

    it('omits rows that the stash already covers entirely', () => {
      const projects = [{ id: 'p1', fabricCt: 14, threads: [{ id: '310', count: 100, name: 'Black' }] }];
      const stash = { 'dmc:310': { owned: 999 } };
      const rows = MS._aggregateDeficits(projects, stash);
      expect(rows.find(r => r.key === 'dmc:310')).toBeUndefined();
    });

    it('returns [] for empty input', () => {
      expect(MS._aggregateDeficits([], {})).toEqual([]);
      expect(MS._aggregateDeficits(null, null)).toEqual([]);
    });

    it('skips skip/empty palette sentinel ids', () => {
      const projects = [{ id: 'p1', threads: [
        { id: '__skip__', count: 1000 },
        { id: '__empty__', count: 1000 },
        { id: '310', count: 1000, name: 'Black' },
      ] }];
      const rows = MS._aggregateDeficits(projects, {});
      expect(rows.map(r => r.id)).toEqual(['310']);
    });

    it('splits blends into their two component thread keys', () => {
      const projects = [{ id: 'p1', threads: [
        { id: '310+550', type: 'blend', count: 600, threads: [
          { id: '310', name: 'Black', rgb: [0,0,0] },
          { id: '550', name: 'Violet', rgb: [120,40,120] },
        ] },
      ] }];
      const rows = MS._aggregateDeficits(projects, {});
      const keys = rows.map(r => r.key).sort();
      expect(keys).toEqual(['dmc:310', 'dmc:550']);
    });

    it('empty-state copy strings are exposed for the UI', () => {
      expect(MS.EMPTY_NO_PROJECTS).toBe('No active projects yet.');
      expect(MS.EMPTY_ALL_COVERED).toBe('All your active projects have the threads they need.');
    });
  });
});
