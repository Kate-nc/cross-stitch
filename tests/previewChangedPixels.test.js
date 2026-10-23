const fs = require('fs');
const win = {};
new Function('window', fs.readFileSync('creator/usePreview.js', 'utf8'))(win);
const overlay = win.previewChangedPixels;
const snap = (ids, w = ids.length, h = 1) => ({ ids, w, h });

test('only changed cells are marked, including skipped-to-stitched cells and thread identity changes', () => {
  const a = snap(['310|0,0,0', '__skip__|', '310|0,0,0', '310|0,0,0']);
  const b = snap(['310|0,0,0', '310|0,0,0', '__skip__|', 'anchor:310|0,0,0']);
  const data = overlay(a, b);
  expect(Array.from(data)).toEqual([0,0,0,0,255,80,0,200,255,80,0,200,255,80,0,200]);
});
test('unchanged previews have a transparent overlay', () => {
  expect(Array.from(overlay(snap(['a','b']), snap(['a','b'])))).toEqual(Array(8).fill(0));
});
test('size changes cannot be compared even when the area is unchanged', () => {
  expect(overlay(snap(['a','b'],2,1), snap(['b','a'],1,2))).toBeNull();
  expect(overlay(null,snap(['a']))).toBeNull();
});
