/**
 * Thread Stash rules (docs/stash-redesign/option-1-plan.md).
 *
 * One definition of "in your stash", "opened" and "low" is shared by the
 * thread list, its filters, the Low stock panel and the attention line. The
 * old page had three: the card badge used `owned <= threshold`, the alerts
 * used `owned < minimum`, and the Low Stock filter a third variant, so a
 * thread could show "Low" while its panel said its minimum was 0.
 */
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../manager-app.js'), 'utf8');
const block = source.slice(source.indexOf('const OPENED_SKEIN'), source.indexOf('// Opened-skein level as a small pie'));
const R = new Function(block + '\nreturn { OPENED_SKEIN, OPENED_LEVELS, usableSkeins, isInStash, isOpenedSkein, isUsedUp, stashMinimum, isThreadLow, matchesStashFilter, formatSkeins, listJoin, STASH_PAGE_SIZE };')();

describe('usable skeins and stash membership', () => {
  test('opened skeins count as three quarters, a half and a quarter', () => {
    expect(R.usableSkeins({ owned: 2, partialStatus: 'mostly-full' })).toBe(2.75);
    expect(R.usableSkeins({ owned: 0, partialStatus: 'about-half' })).toBe(0.5);
    expect(R.usableSkeins({ owned: 1, partialStatus: 'remnant' })).toBe(1.25);
    expect(R.usableSkeins({ owned: 0, partialStatus: 'used-up' })).toBe(0);
    expect(R.usableSkeins(undefined)).toBe(0);
  });

  test('a thread is in your stash with a full or an opened skein, not when used up', () => {
    expect(R.isInStash({ owned: 1 })).toBe(true);
    expect(R.isInStash({ owned: 0, partialStatus: 'remnant' })).toBe(true);
    expect(R.isInStash({ owned: 0, partialStatus: 'used-up' })).toBe(false);
    expect(R.isInStash({ owned: 0, tobuy: true })).toBe(false);
    expect(R.isUsedUp({ owned: 0, partialStatus: 'used-up' })).toBe(true);
    expect(R.isUsedUp({ owned: 2, partialStatus: 'used-up' })).toBe(false);
  });
});

describe('one rule for running low', () => {
  const T = 1; // the Preferences default

  test('a single full skein is not low at the default; less than one skein is', () => {
    expect(R.isThreadLow({ owned: 1 }, T)).toBe(false);
    expect(R.isThreadLow({ owned: 0, partialStatus: 'about-half' }, T)).toBe(true);
  });

  test("a thread's own minimum replaces the Preferences value", () => {
    expect(R.stashMinimum({ min_stock: 3 }, T)).toBe(3);
    expect(R.stashMinimum({ min_stock: 0 }, T)).toBe(T);
    expect(R.isThreadLow({ owned: 2, min_stock: 3 }, T)).toBe(true);
    expect(R.isThreadLow({ owned: 3, min_stock: 3 }, T)).toBe(false);
  });

  test('opened skeins count towards the minimum', () => {
    expect(R.isThreadLow({ owned: 2, partialStatus: 'mostly-full', min_stock: 3 }, T)).toBe(true);
    expect(R.isThreadLow({ owned: 1, partialStatus: 'about-half', min_stock: 1.5 }, T)).toBe(false);
  });

  test('threads not in the stash are only low when you keep a minimum of them', () => {
    expect(R.isThreadLow({ owned: 0 }, T)).toBe(false);
    expect(R.isThreadLow({ owned: 0, partialStatus: 'used-up' }, T)).toBe(false);
    expect(R.isThreadLow({ owned: 0, partialStatus: 'used-up', min_stock: 2 }, T)).toBe(true);
  });

  test('a threshold of 0 turns the default off', () => {
    expect(R.isThreadLow({ owned: 0, partialStatus: 'remnant' }, 0)).toBe(false);
  });
});

describe('filters', () => {
  const rows = {
    full: { owned: 2 },
    opened: { owned: 0, partialStatus: 'remnant' },
    used: { owned: 0, partialStatus: 'used-up' },
    none: undefined,
  };
  const pick = f => Object.keys(rows).filter(k => R.matchesStashFilter(rows[k], f, 1));

  test('Owned lists threads you have, including opened ones', () => {
    expect(pick('owned')).toEqual(['full', 'opened']);
  });
  test('Running low, Opened and Used up narrow the list', () => {
    expect(pick('low')).toEqual(['opened']);
    expect(pick('opened')).toEqual(['opened']);
    expect(pick('usedup')).toEqual(['used']);
  });
  test('Every shade lists the whole catalogue', () => {
    expect(pick('all')).toEqual(['full', 'opened', 'used', 'none']);
  });
});

describe('opened-skein control and labels', () => {
  test('one control lists None, three levels and Used up, in that order', () => {
    expect(R.OPENED_LEVELS.map(l => l.value)).toEqual([null, 'mostly-full', 'about-half', 'remnant', 'used-up']);
    expect(R.OPENED_LEVELS[4].label).toBe('Used up');
  });

  test('used up draws as an empty circle, never fuller than an opened skein', () => {
    expect(R.OPENED_SKEIN['used-up']).toBeUndefined();
    expect(source).toMatch(/status === "used-up" \? " stash-level--empty"/);
  });

  test('skein counts print without float noise', () => {
    expect(R.formatSkeins(3)).toBe('3');
    expect(R.formatSkeins(1.8000000000000003)).toBe('1.8');
  });

  test('pattern names join naturally', () => {
    expect(R.listJoin(['A'])).toBe('A');
    expect(R.listJoin(['A', 'B'])).toBe('A and B');
    expect(R.listJoin(['A', 'B', 'C'])).toBe('A, B and C');
    expect(R.listJoin(['A', 'B', 'C', 'D', 'E'])).toBe('A, B and 3 more');
  });
});

describe('page wiring', () => {
  test('deep links to the old shopping and materials tabs open the Shopping list', () => {
    expect(source).toMatch(/if \(p === 'shopping' \|\| p === 'materials'\) return 'shopping';/);
  });

  test('the tab badge counts threads in the stash, not skeins', () => {
    expect(source).toMatch(/Thread Stash <span className="cnt"[^>]*>\{stashCounts\.owned\}<\/span>/);
  });

  test('the low-stock panel and the row badge use the shared rule', () => {
    expect(source).toMatch(/\.filter\(\(\[, t\]\) => isThreadLow\(t, lowStockThreshold\)\)/);
    expect(source).toMatch(/low=\{isThreadLow\(st, lowStockThreshold\)\}/);
    expect(source).not.toMatch(/owned <= lowStockThreshold/);
  });

  test('the attention line remembers what was hidden in a registered preference', () => {
    expect(fs.readFileSync(path.join(__dirname, '../user-prefs.js'), 'utf8')).toMatch(/stashAttentionDismissed:\s+""/);
  });
});
