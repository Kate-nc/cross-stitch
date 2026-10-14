// tests/backstitchMarkingWiring.test.js — how the Tracker marks backstitch lines (Phase 6 batch 3), pinned at source level.
// The behaviour itself is exercised in a browser (reports/tracking-audit/harness/p6b3.js); these keep the wiring from drifting.
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const tracker = read('tracker-app.js');

describe('backstitch marking in the Tracker', () => {
  test('a press near a line is the line\'s: 14 px for a mouse, 20 px for a finger, never more than half a cell', () => {
    expect(tracker).toMatch(/const px=\(pointerType==="touch"\|\|pointerType==="pen"\)\?20:14;/);
    expect(tracker).toMatch(/const tol=Math\.min\(0\.5,px\/scs\);/);
  });
  test('where the cell has a stitch, the line must be nearer than the cell centre', () => {
    expect(tracker).toMatch(/!\(hit\.d<Math\.hypot\(fx-gx-0\.5,fy-gy-0\.5\)\)/);
  });
  test('a drag is one undo step, and undo and redo flip it', () => {
    expect(tracker).toMatch(/\{type:"BS",keys,on\}/);
    expect(tracker).toMatch(/lastEntry\.type==="BS"\)\{\s*setBsKeysDone\(lastEntry\.keys,!lastEntry\.on\);/);
    expect(tracker).toMatch(/lastEntry\.type==="BS"\)\{\s*setBsKeysDone\(lastEntry\.keys,lastEntry\.on\);/);
  });
  test('the painter reads marks through refs and a mark repaints only the cells its lines cover', () => {
    expect(tracker).toMatch(/const bsKeysNow=bsKeysRef\.current,bsDoneNow=bsDoneSetRef\.current/);
    expect(tracker).toMatch(/function paintBsKeys\(keys\)\{[\s\S]*?repaintChartCells\(/);
  });
  test('B is registered, and Enter marks the chosen line', () => {
    expect(tracker).toMatch(/id: "tracker\.bs\.select", keys: "b", scope: "tracker\.notedit"/);
    expect(tracker).toMatch(/bsSelectRef\.current>=0&&bsLines\[bsSelectRef\.current\]\)\{toggleBsLine\(bsSelectRef\.current\);return;\}/);
  });
  test('a colour used only for backstitch gets a legend entry, and never reads 0/0', () => {
    expect(tracker).toMatch(/buildPalette\(restored\.concat\(partialCells,knotCells,bsCells\)\)/);
    expect(tracker).toMatch(/if\(dc\.total>0\|\|!other\)parts\.push/);
    expect(tracker).toMatch(/" lines"\);/);
  });
  test('the touch magnifier is the Creator\'s', () => {
    expect(tracker).toMatch(/window\.creatorLoupe/);
    expect(read('stitch.html')).toContain('creator/Loupe.js');
    expect(read('sw.js')).toContain("./creator/Loupe.js");
  });
});
