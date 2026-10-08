/* Parking and guide follow-ups.

   - Touch long-press in Mark mode anchors a rectangle; a bar says what to do
     next and offers Park thread here / Cancel (there was no way out).
   - Parking is part of the undo history (diffs, not snapshots).
   - The palette P badge goes to where a thread is parked.
   - The bar under the chart describes the guide and can clear it; hovering
     shows the thread in every mode.
   - Navigate mode: arrow keys move the guide; a live region announces it. */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
const dragMarkSrc = fs.readFileSync(path.join(__dirname, '..', 'useDragMark.js'), 'utf8');
const mod = require(path.join(__dirname, '..', 'useDragMark.js'));

function body(startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  const e = src.indexOf(endMarker, s + 1);
  expect(s).toBeGreaterThan(-1);
  expect(e).toBeGreaterThan(s);
  return src.slice(s, e);
}

describe('long-press anchor bar', () => {
  test('useDragMark exposes reset, and RESET returns to idle', () => {
    expect(dragMarkSrc).toMatch(/var reset = R\.useCallback\(function \(\) \{\s*dispatch\(\{ type: 'RESET' \}\);/);
    expect((dragMarkSrc.match(/reset: noop,/g) || []).length).toBe(2);
    const r = mod.dragMarkReducer(Object.assign(mod.initialState(), { mode: 'range', anchor: 3 }), { type: 'RESET' }, { w: 4, h: 4, pattern: [], done: new Uint8Array(16) });
    expect(r.state.mode).toBe('idle');
  });

  test('the bar shows only for a Mark-mode touch anchor and offers Park and Cancel', () => {
    const b = body("{_dragMarkActive&&dragMarkState&&dragMarkState.mode==='range'", '})()}');
    expect(b).toMatch(/Tap the opposite corner to fill a rectangle/);
    expect(b).toMatch(/onClick=\{\(\)=>\{dragMarkReset\(\);toggleParkAt\(ax,ay\);\}\}/);
    expect(b).toMatch(/onClick=\{dragMarkReset\}/);
    expect(b).toMatch(/\{!anchorDone&&<button/);
  });
});

describe('park undo', () => {
  test('toggleParkAt commits through the history', () => {
    expect(body('function toggleParkAt(gx,gy){', '\n}\n')).toMatch(/commitParkMarkers\(prev,next\);/);
  });

  test('history entries are diffs of added and removed markers', () => {
    const b = body('function commitParkMarkers(prev,next){', '\n}\n');
    expect(b).toMatch(/\{type:"PARK",added,removed\}/);
    expect(b).toMatch(/setRedoStack\(\[\]\);/);
  });

  test('undo and redo apply PARK entries without touching done', () => {
    const u = body('function undoTrack(){', '\n}\n');
    expect(u).toMatch(/if\(lastEntry&&lastEntry\.type==="PARK"\)\{\s*applyParkEntry\(lastEntry,false\);[\s\S]*?return;\s*\}/);
    const r = body('function redoTrack(){', '\n}\n');
    expect(r).toMatch(/if\(lastEntry&&lastEntry\.type==="PARK"\)\{\s*applyParkEntry\(lastEntry,true\);[\s\S]*?return;\s*\}/);
  });
});

// Behavioural: the diff logic, re-implemented from the source shape.
describe('park history diff — behavioural', () => {
  const same = (a, b) => a.x === b.x && a.y === b.y && a.colorId === b.colorId && (a.corner || 'BL') === (b.corner || 'BL');
  const diff = (prev, next) => ({ added: next.filter(m => !prev.some(o => same(o, m))), removed: prev.filter(m => !next.some(o => same(o, m))) });
  const apply = (cur, e, fwd) => { const add = fwd ? e.added : e.removed, drop = fwd ? e.removed : e.added; return cur.filter(m => !drop.some(o => same(o, m))).concat(add.filter(m => !cur.some(o => same(o, m)))); };
  const A = { x: 1, y: 1, colorId: '310', corner: 'BL' }, B = { x: 5, y: 2, colorId: '606', corner: 'BL' }, C = { x: 9, y: 9, colorId: '744', corner: 'BL' };

  test('undo of a park removes just that marker, redo puts it back', () => {
    const e = diff([A], [A, B]);
    expect(apply([A, B], e, false)).toEqual([A]);
    expect(apply([A], e, true)).toEqual([A, B]);
  });

  test('undo does not resurrect a marker removed some other way since', () => {
    const e = diff([A, B], [A]);      // user removed B
    // C arrived by sync afterwards; undo of the removal brings back B only.
    expect(apply([A, C], e, false)).toEqual([A, C, B]);
  });
});

describe('palette P badge', () => {
  test('goToParkedThread cycles through the colour\'s live markers and sets the guide', () => {
    const b = body('function goToParkedThread(colorId){', '\n}\n');
    expect(b).toMatch(/!isParkSpent\(m,doneRef\.current\|\|done\)/);
    expect(b).toMatch(/const i=\(parkJumpIndexRef\.current\[colorId\]\|\|0\)%list\.length;/);
    expect(b).toMatch(/setHlRow\(m\.y\);setHlCol\(m\.x\);\s*centreOnCell\(m\.x,m\.y\);/);
  });

  test('a hidden colour is shown before jumping to it', () => {
    expect(body('function goToParkedThread(colorId){', '\n}\n')).toMatch(/if\(parkLayers\[colorId\]===false\)setParkLayers/);
  });

  test('a marker outside the work area view is reported, not scrolled to', () => {
    expect(body('function goToParkedThread(colorId){', '\n}\n')).toMatch(/is parked outside this work area, at row /);
  });
});

describe('status bar', () => {
  test('with nothing hovered it describes the guide', () => {
    const b = body('function renderHoverBar(){', '\n}\n');
    expect(b).toMatch(/const g=guideRef\.current;/);
    expect(b).toMatch(/cellThreadLabel\(g\.row\*sW\+g\.col\)/);
  });

  test('it updates when the guide moves', () => {
    expect(src).toMatch(/prevGuidePaintRef\.current=\{row:hlRow,col:hlCol\};\s*renderHoverBar\(\);/);
  });

  test('a Clear guide button appears while there is a guide', () => {
    expect(src).toMatch(/\{hlRow>=0&&hlCol>=0&&<button type="button" className="tracker-hover-bar__clear" onClick=\{\(\)=>\{setHlRow\(-1\);setHlCol\(-1\);\}\}/);
  });

  test('hovering shows the thread in every mode, not only Mark', () => {
    expect(src).toMatch(/\} else if\(pat && gc && gc\.gx>=0 && gc\.gx<sW && gc\.gy>=0 && gc\.gy<sH\)\{/);
    expect(src).not.toMatch(/else if\(stitchMode==="track" && pat && gc/);
  });
});

describe('keyboard guide', () => {
  test('arrow keys move the guide in Navigate mode, Shift by 10', () => {
    const b = body('function handleStitchKeyDown(e){', '\n}\n');
    expect(b).toMatch(/if\(stitchMode==="navigate"&&!isEditMode&&!e\.altKey&&!e\.ctrlKey&&!e\.metaKey&&GUIDE_KEYS\[e\.key\]\)\{\s*e\.preventDefault\(\);/);
    expect(b).toMatch(/\(e\.shiftKey\?10:1\)/);
  });

  test('the guide stays inside the chart or work-area view and is announced', () => {
    const b = body('function moveGuideBy(dx,dy){', '\n}\n');
    expect(b).toMatch(/col=Math\.max\(bx0,Math\.min\(bx1-1,col\)\);row=Math\.max\(by0,Math\.min\(by1-1,row\)\);/);
    expect(b).toMatch(/live\.textContent="Guide at row "/);
    expect(src).toMatch(/<span ref=\{guideLiveRef\} className="tracker-sr-only" aria-live="polite"\/>/);
  });

  test('the chart label says how', () => {
    expect(src).toMatch(/aria-label="Cross stitch pattern grid\. In Navigate mode the arrow keys move the guide; Menu or Shift\+F10 parks a thread at the guide\."/);
  });
});
