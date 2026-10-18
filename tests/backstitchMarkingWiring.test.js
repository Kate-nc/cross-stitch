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
    expect(tracker).toMatch(/buildPalette\(restored,partialCells\.concat\(knotCells,bsCells,loadedSpecialty\.map/);
    expect(tracker).toMatch(/if\(dc\.total>0\|\|!other\)parts\.push/);
    expect(tracker).toMatch(/" lines"\);/);
  });
  test('the touch magnifier is the Creator\'s', () => {
    expect(tracker).toMatch(/window\.creatorLoupe/);
    expect(read('stitch.html')).toContain('creator/Loupe.js');
    expect(read('sw.js')).toContain("./creator/Loupe.js");
  });
});

describe('Unpick area wiring (Phase 6 batch 4)', () => {
  test('the rectangle bar offers it, and a pending choice or Alt at release unpicks instead of filling', () => {
    expect(tracker).toMatch(/Unpick area\s*<\/button>/);
    expect(tracker).toMatch(/if\(unpickPendingRef\.current\|\|altDownRef\.current\)\{/);
  });
  test('Ctrl or Cmd + Shift + Enter is the keyboard variant', () => {
    expect(tracker).toMatch(/e\.key==="Enter"&&e\.shiftKey&&\(e\.ctrlKey\|\|e\.metaKey\)&&!e\.altKey/);
  });
  test('it is one history entry, undone and redone with its plan, recorded as a "frog" session event', () => {
    expect(tracker).toMatch(/\{type:"UNPICK",plan:p\}/);
    expect(tracker).toMatch(/applyUnpickPlan\(lastEntry\.plan,true\)/);
    expect(tracker).toMatch(/applyUnpickPlan\(lastEntry\.plan,false\)/);
    expect(tracker).toMatch(/recordAutoActivity\(0,p\.stitches,0,p\.units,0,'frog'\)/);
    expect(read('useAutoSession.js')).toMatch(/\{kind:'frog',t:now/);
  });
  test('the diff-based session detector is told about the counts it would otherwise read as marks', () => {
    expect(tracker).toMatch(/prevAutoCountRef\.current=\{done:doneCountRef\.current,halfDone:\(halfStitchCounts\.done\|\|0\)\+sign\*p\.counts\.half/);
  });
  test('the script is loaded and precached', () => {
    ['stitch.html', 'index.html', 'create.html'].forEach(f => expect(read(f)).toContain('<script src="unpick.js"></script>'));
    expect(read('sw.js')).toContain("'./unpick.js'");
  });
});

describe('Notes and photos wiring (Phase 6 batch 5)', () => {
  test('notes ride the project: loaded, saved with it, kept by the Creator', () => {
    expect(tracker).toMatch(/setProjectNotes\(typeof project\.notes==="string"\?project\.notes:""\)/);
    expect(tracker).toMatch(/notes: projectNotes \|\| undefined/);
    expect(tracker).toMatch(/notes:project\.notes,/);
    expect(read('creator/useProjectIO.js')).toMatch(/_tf\.notes = project\.notes/);
  });
  test('the panel is in the Session tab and only reads photos while that tab is showing', () => {
    expect(tracker).toMatch(/React\.createElement\(window\.TrackerNotesPhotos,\{[^}]*active:morePanelOpen&&leftSidebarTab==="session"\}\)/);
    const panel = read('tracker-notes.js');
    expect(panel).toMatch(/if \(!active\) \{ revokeAll\(\)/);
    expect(read('photos.js')).toMatch(/list\(pid\)/);
  });
  test('the scripts are loaded and precached', () => {
    ['stitch.html', 'index.html', 'create.html'].forEach(f => { expect(read(f)).toContain('<script src="photos.js"></script>'); expect(read(f)).toContain('<script src="tracker-notes.js"></script>'); });
    expect(read('stitch.html')).toContain('<script src="blob-store.js"></script>');
    expect(read('sw.js')).toContain("'./photos.js'");
    expect(read('sw.js')).toContain("'./tracker-notes.js'");
  });
  test('no raw colour in the panel', () => {
    expect(read('tracker-notes.js')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
