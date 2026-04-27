// tests/shoppingCrossAppPush.test.js — Step 3 of Shopping List rebuild.
//
// Verifies the cross-app push integrations: Creator surfaces a "push to
// Stash" action that uses setToBuyQtyMany, MaterialsHub passes a qtyMap
// when bulk-flagging deficits, the manager honours ?tab=shopping deep
// links, and /home surfaces the My-list count as a clickable card.

const fs = require('fs');
const path = require('path');

function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

describe('Shopping List rebuild — Step 3 (cross-app push)', () => {
  describe('creator/ShoppingListModal.js', () => {
    const SRC = read('creator/ShoppingListModal.js');

    test('exposes a push action that calls StashBridge.setToBuyQtyMany', () => {
      expect(SRC).toMatch(/StashBridge\.setToBuyQtyMany/);
      expect(SRC).toMatch(/'Add to my Stash list'/);
    });

    test('builds a qtyMap keyed by composite brand:id', () => {
      expect(SRC).toMatch(/qtyMap\[r\.brand \+ ':' \+ r\.id\]/);
    });

    test('Open-Stash link deep-links into manager.html?tab=shopping', () => {
      expect(SRC).toMatch(/manager\.html\?tab=shopping/);
    });

    test('toasts on success and error rather than alerting silently', () => {
      // Two distinct Toast.show calls — success + error.
      const matches = SRC.match(/window\.Toast\.show/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('creator/MaterialsHub.js', () => {
    const SRC = read('creator/MaterialsHub.js');

    test('seeds tobuy_qty via the new markManyToBuy(keys, true, qtyMap) signature', () => {
      expect(SRC).toMatch(/markManyToBuy\(keys, true, qtyMap\)/);
      // qtyMap is built from each deficit row's deficit count.
      expect(SRC).toMatch(/qtyMap\[r\.key\] = r\.deficit/);
    });
  });

  describe('creator/bundle.js (concatenated build)', () => {
    const SRC = read('creator/bundle.js');

    test('bundle includes the new push helpers from both modules', () => {
      expect(SRC).toMatch(/StashBridge\.setToBuyQtyMany/);
      expect(SRC).toMatch(/markManyToBuy\(keys, true, qtyMap\)/);
    });
  });

  describe('manager-app.js', () => {
    const SRC = read('manager-app.js');

    test('initial tab honours ?tab=shopping (and inventory/patterns)', () => {
      expect(SRC).toMatch(/URLSearchParams\(window\.location\.search\)\.get\('tab'\)/);
      expect(SRC).toMatch(/p === 'shopping'/);
    });
  });

  describe('home-app.js', () => {
    const SRC = read('home-app.js');

    test('counts tobuy threads and exposes shoppingCount on the stash card', () => {
      expect(SRC).toMatch(/if \(t && t\.tobuy\) toBuy \+= 1/);
      expect(SRC).toMatch(/shoppingCount: toBuy/);
    });

    test('renders an "On shopping list" row that deep-links to manager.html?tab=shopping', () => {
      expect(SRC).toMatch(/'On shopping list'/);
      expect(SRC).toMatch(/manager\.html\?tab=shopping/);
      expect(SRC).toMatch(/home-stash__row--link/);
    });
  });
});
