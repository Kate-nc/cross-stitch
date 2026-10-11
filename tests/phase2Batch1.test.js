// Phase 2, batch 1 (tracking audit BUG-02, BUG-04, BUG-05 and the daily snapshot): source-level guards
// next to the browser tests in tests/e2e/phase2-batch1.spec.js.
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const STATS = read('components-stats.js');
const TRACKER = read('tracker-app.js');

test('BUG-02: the share card is given the streak helpers.js actually returns', () => {
  expect(STATS).toMatch(/streak: streakInfo\.current,/);
  expect(STATS).not.toMatch(/streakInfo\.currentStreak/);
  // and computeStreaks does return { current, longest }
  expect(read('helpers.js')).toMatch(/return \{ current: currentStreak, longest: longest \};/);
});

test('BUG-05: "~N sessions" is singular for one, and Projects reads as finished / in progress', () => {
  expect(STATS).toMatch(/n === 1 \? " session" : " sessions"/);
  expect(STATS).toMatch(/value: lifetimeTotals\.complete \+ ' finished', sub: \(lifetimeTotals\.total - lifetimeTotals\.complete\) \+ ' in progress'/);
  expect(STATS).not.toMatch(/lifetimeTotals\.complete \+ ' \/ ' \+ lifetimeTotals\.total/);
});

test('BUG-04: Fit looks at the height as well as the width of the scroll box', () => {
  expect(TRACKER).toMatch(/function fitWholeView\(\)\{[\s\S]{0,300}el\.clientHeight-G-8\)\/\(sH\*20\)/);
  expect(TRACKER).toMatch(/function fitChart\(\)\{if\(areaOn\)fitWorkAreaView\(\);else fitWholeView\(\);\}/);
  expect(TRACKER).not.toMatch(/onClick=\{fitSZ\}/);
});

describe('daily snapshot', () => {
  test('uses the shared stitching-day helper, not a function that only exists inside useAutoSession', () => {
    const block = TRACKER.slice(TRACKER.indexOf('// Auto-snapshot: on a new stitching day'), TRACKER.indexOf('// Auto-snapshot: on a new stitching day') + 2600);
    expect(block).toMatch(/getStitchingDate\(new Date\(\),/);
    expect(block).not.toMatch(/getStitchingDateLocal/);
  });
  test('compresses when the browser is idle and records the pattern size', () => {
    const block = TRACKER.slice(TRACKER.indexOf('// Auto-snapshot: on a new stitching day'), TRACKER.indexOf('// Auto-snapshot: on a new stitching day') + 2600);
    expect(block).toMatch(/requestIdleCallback\(make,\{timeout:5000\}\)/);
    expect(block).toMatch(/w:w,h:hgt/);
  });
  test('a failure is reported, not swallowed', () => {
    expect(TRACKER).toMatch(/could not save the daily snapshot/);
    expect(TRACKER).toMatch(/daily snapshot check failed/);
  });
});

describe('Stats > Compare with a snapshot from before a size change', () => {
  test('is not drawn on the current grid and says why', () => {
    expect(STATS).toMatch(/if\(snapDone&&snapDone\.length!==pat\.length\)return;/);
    expect(STATS).toMatch(/var sizeMismatch=!!\(snapDone&&pat&&snapDone\.length!==pat\.length\);/);
    expect(STATS).toMatch(/was taken before the pattern changed size/);
  });
});
