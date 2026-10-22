// sync-merge-helpers.js is a classic script that sync-engine.js calls by global name. Every page that loads
// sync-engine.js must load it first, the service worker must precache it, and it must stand alone: no globals
// needed at load, no storage, no asynchronous results.

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

describe('sync-merge-helpers.js loading contexts', () => {
  const pages = fs.readdirSync(root).filter(f => /\.html$/.test(f)).filter(f => read(f).includes('src="sync-engine.js"'));

  test('the pages that load sync-engine.js are the five known ones', () => {
    expect(pages.sort()).toEqual(['create.html', 'home.html', 'index.html', 'manager.html', 'stitch.html']);
  });

  test.each(['create.html', 'home.html', 'index.html', 'manager.html', 'stitch.html'])('%s loads the helpers once, before sync-engine.js', (page) => {
    const html = read(page);
    const tag = '<script src="sync-merge-helpers.js"></script>';
    expect(html.split(tag).length - 1).toBe(1);
    expect(html.indexOf(tag)).toBeLessThan(html.indexOf('src="sync-engine.js"'));
  });

  test('no worker or lazy loader pulls in sync-engine.js without the helpers', () => {
    const loaders = fs.readdirSync(root).filter(f => /\.js$/.test(f) && !/^sw\.js$|^sync-/.test(f))
      .filter(f => /importScripts\([^)]*sync-engine|loadScript\([^)]*sync-engine/.test(read(f)));
    expect(loaders).toEqual([]);
  });

  test('the service worker precaches the helpers and fingerprints them', () => {
    const sw = read('sw.js');
    expect(sw).toContain("'./sync-merge-helpers.js'");
    expect(sw).toContain('"./sync-merge-helpers.js": {');
  });
});

describe('sync-merge-helpers.js stands alone', () => {
  const src = read('sync-merge-helpers.js');

  test('evaluates in an empty global scope and publishes SyncMergeHelpers on it', () => {
    const ctx = {};
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    expect(Object.keys(ctx.SyncMergeHelpers).sort()).toEqual([
      'earlierIso', 'laterIso', 'mergeDeletedIds', 'mergeDoneArrays', 'mergeIndexedPairs', 'mergeParkingMarkers',
      'mergeSessions', 'mergeStitchLogs', 'mergeWorkArea', 'recomputeMergedTotals', 'sumSessionSeconds'
    ]);
  });

  test('every helper returns synchronously and runs without storage, timers or a clone', () => {
    const H = require('../sync-merge-helpers.js');
    const calls = [
      () => H.mergeDoneArrays([1], [0], 1),
      () => H.mergeSessions([{ id: 'a' }], [{ id: 'b' }], []),
      () => H.recomputeMergedTotals([], [], []),
      () => H.mergeDeletedIds(['a'], ['b']),
      () => H.sumSessionSeconds([{ durationMinutes: 1 }]),
      () => H.mergeIndexedPairs([], [], null),
      () => H.mergeStitchLogs([], []),
      () => H.earlierIso('2026-01-01', '2026-01-02'),
      () => H.laterIso('2026-01-01', '2026-01-02'),
      () => H.mergeWorkArea(null, null),
      () => H.mergeParkingMarkers([], [], null)
    ];
    for (const call of calls) {
      const out = call();
      expect(out && typeof out.then).not.toBe('function');
    }
  });

  test('the copy function is the caller\'s: mergeIndexedPairs and mergeParkingMarkers use what they are given', () => {
    const H = require('../sync-merge-helpers.js');
    const seen = [];
    const clone = x => { seen.push(x); return { copied: true }; };
    expect(H.mergeIndexedPairs([[1, { a: 1 }]], [], clone)).toEqual([[1, { copied: true }]]);
    expect(H.mergeParkingMarkers([{ x: 1, y: 2, colorId: '3' }], [], clone)).toEqual([{ copied: true }]);
    expect(seen.length).toBe(2);
  });
});
