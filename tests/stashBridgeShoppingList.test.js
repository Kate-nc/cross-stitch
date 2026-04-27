// tests/stashBridgeShoppingList.test.js — Schema v4 Shopping-List rebuild.
//
// Source-contract checks plus pure-helper assertions on
// StashBridge._buildShoppingListRows. The IndexedDB-backed methods
// (setToBuyQty, markBought, getShoppingList, clearShoppingList) are
// exercised indirectly via the source contract; full IDB integration is
// covered by Playwright.

const fs = require('fs');
const path = require('path');

function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

function extractMethod(src, sig, paramNames) {
  const start = src.indexOf(sig);
  if (start === -1) throw new Error(`could not find ${sig}`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const body = src.slice(src.indexOf('{', start) + 1, i);
        // eslint-disable-next-line no-new-func
        return new Function(...paramNames, body);
      }
    }
  }
  throw new Error(`could not balance braces for ${sig}`);
}

const SRC = read('stash-bridge.js');

describe('Schema v4 — Shopping List bridge', () => {
  describe('source contract', () => {
    test('exposes new methods on StashBridge', () => {
      expect(SRC).toMatch(/async setToBuyQty\(/);
      expect(SRC).toMatch(/async setToBuyQtyMany\(/);
      expect(SRC).toMatch(/async markBought\(/);
      expect(SRC).toMatch(/async getShoppingList\(/);
      expect(SRC).toMatch(/async clearShoppingList\(/);
      expect(SRC).toMatch(/_buildShoppingListRows: _buildShoppingListRows/);
    });

    test('every writer dispatches cs:stashChanged', () => {
      // updateThreadOwned, updateThreadToBuy, markManyToBuy, setToBuyQty,
      // setToBuyQtyMany, markBought (via updateThreadOwned + own clear),
      // and clearShoppingList — at least 7 _dispatchStashChanged calls.
      const matches = SRC.match(/_dispatchStashChanged\(\)/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(7);
    });

    test('markManyToBuy accepts an optional qtyMap parameter', () => {
      expect(SRC).toMatch(/markManyToBuy\(keysOrIds, toBuy, qtyMap\)/);
    });

    test('clearing tobuy also clears tobuy_qty / tobuy_added_at', () => {
      // updateThreadToBuy must drop both fields when toBuy === false.
      expect(SRC).toMatch(/if \(!toBuy\) \{[\s\S]{0,200}tobuy_qty = 0/);
    });
  });

  describe('_buildShoppingListRows (pure)', () => {
    const buildRows = extractMethod(SRC, 'function _buildShoppingListRows(threadsDict, infoLookup)', ['threadsDict', 'infoLookup']);

    test('returns [] for empty / missing input', () => {
      expect(buildRows({}, function() { return null; })).toEqual([]);
      expect(buildRows(null, function() { return null; })).toEqual([]);
      expect(buildRows(undefined, function() { return null; })).toEqual([]);
    });

    test('only includes rows where tobuy === true', () => {
      const threads = {
        'dmc:310': { owned: 0, tobuy: true, tobuy_qty: 2 },
        'dmc:550': { owned: 5, tobuy: false, tobuy_qty: 0 },
        'dmc:666': { owned: 0, tobuy: false }, // legacy entry, no tobuy_qty
      };
      const rows = buildRows(threads, function() { return null; });
      expect(rows.map(function(r) { return r.id; })).toEqual(['310']);
    });

    test('parses composite keys into brand + id', () => {
      const threads = {
        'dmc:310': { owned: 0, tobuy: true, tobuy_qty: 1, tobuy_added_at: '2026-04-26T10:00:00Z' },
        'anchor:403': { owned: 1, tobuy: true, tobuy_qty: 3, tobuy_added_at: '2026-04-27T10:00:00Z' },
      };
      const rows = buildRows(threads, function(brand, id) { return { name: brand.toUpperCase() + ' ' + id, rgb: [1, 2, 3] }; });
      expect(rows.length).toBe(2);
      // Most recent first (anchor:403 added 2026-04-27 > dmc:310 2026-04-26).
      expect(rows[0].brand).toBe('anchor');
      expect(rows[0].id).toBe('403');
      expect(rows[0].name).toBe('ANCHOR 403');
      expect(rows[1].brand).toBe('dmc');
      expect(rows[1].id).toBe('310');
    });

    test('legacy bare keys default to dmc brand', () => {
      const threads = { '310': { owned: 0, tobuy: true } };
      const rows = buildRows(threads, function() { return null; });
      expect(rows[0].brand).toBe('dmc');
      expect(rows[0].id).toBe('310');
    });

    test('defaults tobuyQty to 0 when missing or non-positive', () => {
      const threads = {
        'dmc:310': { owned: 0, tobuy: true },                    // no qty
        'dmc:550': { owned: 0, tobuy: true, tobuy_qty: 0 },
        'dmc:666': { owned: 0, tobuy: true, tobuy_qty: -3 },
      };
      const rows = buildRows(threads, function() { return null; });
      expect(rows.length).toBe(3);
      rows.forEach(function(r) { expect(r.tobuyQty).toBe(0); });
    });

    test('coerces string tobuy_qty to a number', () => {
      const threads = { 'dmc:310': { owned: 0, tobuy: true, tobuy_qty: '4' } };
      const rows = buildRows(threads, function() { return null; });
      expect(rows[0].tobuyQty).toBe(4);
    });

    test('falls back to id and grey rgb when info lookup returns null', () => {
      const threads = { 'dmc:999999': { owned: 0, tobuy: true } };
      const rows = buildRows(threads, function() { return null; });
      expect(rows[0].name).toBe('999999');
      expect(rows[0].rgb).toEqual([200, 200, 200]);
    });

    test('ties on tobuy_added_at sort by brand then numeric id', () => {
      const sameTs = '2026-04-27T10:00:00Z';
      const threads = {
        'dmc:550': { owned: 0, tobuy: true, tobuy_added_at: sameTs },
        'dmc:310': { owned: 0, tobuy: true, tobuy_added_at: sameTs },
        'anchor:403': { owned: 0, tobuy: true, tobuy_added_at: sameTs },
      };
      const rows = buildRows(threads, function() { return null; });
      // anchor < dmc lexicographically, so anchor first; then dmc:310, dmc:550.
      expect(rows.map(function(r) { return r.key; })).toEqual(['anchor:403', 'dmc:310', 'dmc:550']);
    });

    test('rows missing tobuy_added_at sort below rows that have one', () => {
      const threads = {
        'dmc:310': { owned: 0, tobuy: true, tobuy_added_at: '2026-04-27T10:00:00Z' },
        'dmc:550': { owned: 0, tobuy: true }, // no timestamp
      };
      const rows = buildRows(threads, function() { return null; });
      expect(rows[0].id).toBe('310');
      expect(rows[1].id).toBe('550');
    });
  });
});
