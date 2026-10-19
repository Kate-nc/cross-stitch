// UX-025: counts read "1 pattern" / "16,950 full-cross cells", and the
// Generate toast no longer ends in a double closing bracket.

const fs = require('fs');
const path = require('path');

function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

const helpers = read('helpers.js');
// eslint-disable-next-line no-new-func
const { plural, fmtNum } = new Function(
  helpers.slice(helpers.indexOf('function fmtNum('), helpers.indexOf('// threadKm:')) + '\nreturn { plural, fmtNum };')();

const state = read('creator/useCreatorState.js');
const start = state.indexOf('function _threadPlural(');
const end = state.indexOf('// The printed chart has a fixed set of distinct symbols');
// eslint-disable-next-line no-new-func
const { threadCountsSentence, threadCountsShort } = new Function(
  state.slice(start, end) + '\nreturn { threadCountsSentence, threadCountsShort };')();

describe('plural helper', () => {
  test('agrees in number and groups thousands', () => {
    expect(plural(1, 'pattern')).toBe('1 pattern');
    expect(plural(0, 'pattern')).toBe('0 patterns');
    expect(plural(16950, 'full-cross cell')).toBe('16,950 full-cross cells');
    expect(plural(5, 'cross', 'crosses')).toBe('5 crosses');
    expect(fmtNum(16950)).toBe('16,950');
  });
});

describe('thread counts', () => {
  test('large counts are grouped', () => {
    expect(threadCountsShort({ threads: 1200, symbols: 1500, blends: 0 })).toBe('1,200 threads · 1,500 symbols');
    expect(threadCountsSentence({ threads: 24, symbols: 1040, blends: 16 }))
      .toBe('24 threads, 1,040 chart symbols (16 are blends of two threads)');
  });

  test('the Generate toast puts the counts in running text, not inside brackets', () => {
    const m = state.match(/addToast\("Pattern generated and saved[^\n]*/);
    expect(m).not.toBeNull();
    expect(m[0]).toContain('now editing at " + sW + "\\u00D7" + sH + " with " + counts + ". Use the Convert tab');
    expect(m[0]).not.toContain('(" + sW');
    // With the sentence's own bracket, the old text ended "...two threads))."
    expect(m[0]).not.toMatch(/counts \+ "\)\./);
  });
});

describe('count call sites', () => {
  test('Ready to stitch review', () => {
    const src = read('creator/ReadyReview.js');
    expect(src).toContain("plural(m.total, 'full-cross cell')");
    expect(src).toContain("plural(m.rare.length, 'rarely used symbol')");
    expect(src).toContain("plural(p.count, 'cross', 'crosses')");
  });

  test('Tracker layer list formats its counts', () => {
    expect(read('tracker-app.js')).toContain('{layer.label} ({fmtNum(layerCounts[layer.id])})');
  });

  test('restore-from-backup summary and sync conflicts', () => {
    const header = read('header.js');
    expect(header).toContain("plural(s.patternCount, 'pattern')");
    expect(header).toContain("plural(s.projectCount, 'project')");
    expect(read('modals.js')).toContain("plural(conflict.localStitchCount, 'stitch', 'stitches')");
  });
});
