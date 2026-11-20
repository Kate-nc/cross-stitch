// tests/viewNames.test.js
// Stage 3 (X6): views are named by what they show and comparisons by their
// two sides (TERMINOLOGY.md "Views and comparisons"). No Creator control is
// labelled only "Compare" or "Preview", and the terminology lint says so.

const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const { lintAll, VAGUE_VIEW, TARGET_FILES } = require('../scripts/lint-terminology.js');

describe('views and comparisons are named by what they show (Stage 3, X6)', () => {
  test('the lint flags a string that is only Compare, Preview or Before / after', () => {
    for (const s of ['"Compare"', "'Preview'", '"Before / after"', '"Compare side-by-side"']) expect(VAGUE_VIEW.test(s)).toBe(true);
    for (const s of ['"Compare options"', '"Picture and chart"', '"See before and after"', '"Chart and stitched"']) expect(VAGUE_VIEW.test(s)).toBe(false);
    for (const f of ['creator/SplitPane.js', 'creator/ChartStitchedView.js', 'palette-swap.js', 'creator/Sidebar.js', 'creator-main.js']) {
      expect(TARGET_FILES).toContain(f);
    }
    expect(lintAll()).toEqual([]);
  });

  test("Convert's comparison is Picture and chart, with its two sides labelled", () => {
    const main = read('creator-main.js');
    expect(main).toContain("{ id: 'compare', label: 'Picture and chart',");
    expect(main).not.toMatch(/label: 'Before \/ after'/);
    expect(main).toMatch(/leftLabel=\{sampledBefore \? 'At stitch size' : 'Your picture'\} rightLabel="Chart"/);
  });

  test("Edit's side-by-side view is Chart and stitched, and Flat replaces Pixel", () => {
    const sb = read('creator/Sidebar.js');
    expect(sb).toContain('"Chart and stitched"');
    expect(sb).not.toMatch(/"Compare side-by-side"|"Exit compare"/);
    expect(sb).toMatch(/\{id:"pixel",label:"Flat"/);
    expect(sb).not.toMatch(/\{id:"preview",\s*label:"Preview"/);
  });

  test('the docs use the same names', () => {
    expect(read('TERMINOLOGY.md')).toMatch(/### Views and comparisons[\s\S]*Picture and chart[\s\S]*Chart and stitched[\s\S]*Before and after/);
    expect(read('help-drawer.js')).toContain('Picture and chart puts your picture and the pattern');
    expect(read('help-drawer.js')).toContain('["Chart and stitched (\\\\)"');
  });
});
