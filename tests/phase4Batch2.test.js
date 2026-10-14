/* Phase 4 batch 2 (tracking audit TRACK-07): source-level guards for the review findings. */
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');

describe('the how-to-mark banners', () => {
  test('go away on any marked stitch (full, half or knot), not only a full cross', () => {
    const src = read('tracker-app.js');
    expect(src).toMatch(/useEffect\(\(\)=>\{\s*if\(hintsSeen\|\|!_hasMarks\)return;\s*setHintsSeen\(true\);/);
    expect(src).toMatch(/const _hasMarks=doneCount>0\|\|_halfMarked\|\|knotsDone\.length>0\|\|partialDone\.size>0\|\|bsDone\.length>0;/);
  });
});

describe('Focus keeps what a placed guide needs', () => {
  test('only the idle bar is hidden in Focus', () => {
    const css = read('styles.css');
    expect(css).toMatch(/body\.cs-focus \.tracker-hover-wrap--idle \{ display: none !important; \}/);
    expect(css).not.toMatch(/body\.cs-focus \.tracker-hover-wrap \{ display: none/);
  });
});

describe('the controls strip is named as it appears', () => {
  test('help and Preferences call the strip button "Nav", and the Colours button names the current colour', () => {
    expect(read('help-drawer.js')).toMatch(/\(Colours, Mark, Nav, Fit, Area, Undo, More\)/);
    expect(read('preferences-modal.js')).toMatch(/the Mark, Nav and Undo buttons/);
    expect(read('tracker-app.js')).toMatch(/\(current colour "\+threadLabel\(cmap\[focusColour\]\)\+"\)"/);
  });
});
