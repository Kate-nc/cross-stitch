// tests/trackerPageScripts.test.js — the pages that mount the Tracker load what it needs.
//
// The Tracker runs on stitch.html, and also inline on index.html and create.html (the Creator's Track
// button and Track tab switch to it without leaving the page). Each page keeps its own <script> list, so a
// Tracker feature whose script is added to stitch.html alone silently does nothing on the other two. That
// is how the work area broke there: work-area.js and components/WorkAreaPicker.js were only on
// stitch.html, so the Area button was shown but opened nothing, and create.html also lacked the overview
// map, the hidden-layers chip and tracking-merge.js.
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const localScripts = html => new Set(
  [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map(m => m[1].replace(/^\.\//, ''))
    .filter(src => !/^https?:/.test(src)));

// On stitch.html but deliberately not on the unified pages, with why.
const NOT_NEEDED = {
  'creator/Loupe.js': 'in creator/bundle.js, which the unified pages load',
  'creator/SpecialtyStitchPanel.js': 'in creator/bundle.js, which the unified pages load',
  'creator/symbolFontSpec.js': 'in creator/bundle.js, which the unified pages load',
  'wake-lock.js': 'the Tracker reads window.useWakeLock, which useWakeLock.js (on every page) provides',
};

describe('pages that mount the Tracker inline', () => {
  const stitch = localScripts(read('stitch.html'));

  test.each(['index.html', 'create.html'])('%s loads every Tracker script stitch.html loads', page => {
    const have = localScripts(read(page));
    const missing = [...stitch].filter(src => !have.has(src) && !NOT_NEEDED[src]);
    expect(missing).toEqual([]);
  });

  test.each(['stitch.html', 'index.html', 'create.html'])('%s loads the work area and its picker', page => {
    const have = localScripts(read(page));
    expect(have.has('work-area.js')).toBe(true);
    expect(have.has('components/WorkAreaPicker.js')).toBe(true);
  });

  test('the exceptions are still on stitch.html, so the list cannot go stale', () => {
    Object.keys(NOT_NEEDED).forEach(src => expect(stitch.has(src)).toBe(true));
  });
});

describe('focus mode and the work-area picker', () => {
  test('the focus bar is not drawn over the open picker', () => {
    expect(read('tracker-app.js')).toMatch(/\{focusMode&&!areaPickerOpen&&<div\s+ref=\{focusBarRef\}/);
  });
});
