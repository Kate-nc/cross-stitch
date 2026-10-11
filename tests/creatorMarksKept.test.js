// What the Creator does with stitching progress when the pattern is edited (tracking audit TRACK-12).
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const STATE = read('creator/useCreatorState.js');
const IO = read('creator/useProjectIO.js');

test('the blocking alert about progress being reset is gone, replaced by a toast that says what is kept', () => {
  expect(IO).not.toMatch(/alert\("This pattern has tracking progress/);
  expect(IO).toMatch(/Drawing and resizing the canvas keep it; generating a new pattern from a picture clears it/);
});

test('resizing a blank design keeps marked stitches on their cells', () => {
  expect(STATE).toMatch(/newDone\[dy \* sW \+ dx\] = done\[dy \* oldW \+ dx\]/);
  expect(STATE).not.toMatch(/setCmap\(result\.cmap\); setDone\(new Uint8Array\(sW \* sH\)\);\s*\n\s*\}, \[sW, sH, isScratchMode\]/);
});

test('confirming a regenerate keeps a copy of the marks as a "Before pattern change" snapshot', () => {
  expect(STATE).toMatch(/keepMarksSnapshot\(done\);/);
  expect(STATE).toMatch(/label: "Before pattern change"/);
});

test('the canvas resize path still remaps the marks (existing behaviour)', () => {
  expect(read('creator-main.js')).toMatch(/applyCanvasResize\(\s*state\.pat,state\.bsLines,state\.done/);
});
