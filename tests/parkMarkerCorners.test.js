/* Regression tests for multi-colour parking (Options A + C).

   Option A — auto-rotate corners:
     Park placement at the same cell must populate the four corners in the
     order ["BL","BR","TR","TL"] before evicting the oldest entry, so up to
     four colours can be parked on the same cell without overwriting one
     another visually.

   Option C — per-colour visibility:
     The renderer must skip parkMarkers whose colour layer is hidden via
     parkLayers[colorId] === false. parkLayers must be persisted/restored
     alongside the per-project layerVis preference. */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');

describe('Multi-colour parking — source assertions', () => {
  test('Option A: park placement uses ORDER = [BL, BR, TR, TL]', () => {
    expect(src).toMatch(/const ORDER\s*=\s*\["BL","BR","TR","TL"\]/);
  });

  test('Option A: picks first free corner from ORDER at this cell', () => {
    expect(src).toMatch(/let corner\s*=\s*ORDER\.find\(c=>!used\.has\(c\)\)/);
  });

  test('Option A: evicts oldest at cell when all four corners occupied', () => {
    // The eviction branch finds the index of the oldest marker at the
    // target cell and filters it out before appending the new one.
    expect(src).toMatch(/oldestIdx=prev\.findIndex\(m=>m===atCell\[0\]\)/);
  });

  test('Option C: parkLayers state declared with empty-object default', () => {
    expect(src).toMatch(/const\[parkLayers,setParkLayers\]=useState\(\{\}\)/);
  });

  test('Option C: renderer skips markers whose colour layer is hidden', () => {
    expect(src).toMatch(/if\(parkLayers\[pm\.colorId\]===false\)return/);
  });

  test('Option C: parkLayers persists to localStorage per project', () => {
    expect(src).toMatch(/localStorage\.setItem\('cs_parkLayers_'\+pid/);
  });

  test('Option C: parkLayers restored from localStorage in processLoadedProject', () => {
    expect(src).toMatch(/localStorage\.getItem\('cs_parkLayers_'\+\(project\.id\|\|''\)\)/);
  });

  test('Option C: toggling a colour layer repaints the cells it changes', () => {
    // Markers are repainted incrementally, not through renderStitch's deps.
    expect(src).toMatch(/\},\[parkMarkers,parkLayers\]\);/);
    expect(src).toMatch(/\(layers\[pm\.colorId\]!==false\)/);
  });

  test('Option C: per-colour visibility is the Park markers list checkbox', () => {
    expect(src).toMatch(/checked=\{parkLayers\[p\.id\]!==false\} onChange=\{\(\)=>toggleParkLayer\(p\.id\)\}/);
  });

  test('the palette P badge goes to where the thread is parked', () => {
    // A badge that looked like a status chip but hid the markers was easy
    // to misread; Markup R-XP uses its P to say where a thread is parked.
    expect(src).toMatch(/className="ppal-tile-park-btn"\s*onClick=\{e=>\{e\.stopPropagation\(\);goToParkedThread\(p\.id\);\}\}/);
  });

  test('Option C: Clear all removes every marker (undoably) and resets parkLayers', () => {
    expect(src).toMatch(/commitParkMarkers\(parkMarkersRef\.current,\[\]\);setParkLayers\(\{\}\)/);
  });
});

// ---------------------------------------------------------------------------
// Behavioural test: re-implement the corner-rotation algorithm and verify it
// matches the documented behaviour. This guards the algorithm's intent (not
// its exact code shape).
// ---------------------------------------------------------------------------
function placePark(prev, x, y, colorId, rgb) {
  const ORDER = ["BL", "BR", "TR", "TL"];
  const atCell = prev.filter(m => m.x === x && m.y === y);
  const used = new Set(atCell.map(m => m.corner || "BL"));
  let corner = ORDER.find(c => !used.has(c));
  let next = prev;
  if (!corner) {
    const oldestIdx = prev.findIndex(m => m === atCell[0]);
    if (oldestIdx >= 0) next = prev.filter((_, i) => i !== oldestIdx);
    corner = atCell[0].corner || "BL";
  }
  return [...next, { x, y, colorId, rgb, corner }];
}

describe('Corner-rotation algorithm — behavioural', () => {
  test('first marker at empty cell uses BL', () => {
    const out = placePark([], 5, 5, "310", [0, 0, 0]);
    expect(out).toHaveLength(1);
    expect(out[0].corner).toBe("BL");
  });

  test('second colour at same cell uses BR', () => {
    let m = placePark([], 5, 5, "310", [0, 0, 0]);
    m = placePark(m, 5, 5, "550", [100, 0, 100]);
    expect(m[1].corner).toBe("BR");
  });

  test('third uses TR, fourth uses TL', () => {
    let m = [];
    m = placePark(m, 5, 5, "310", [0, 0, 0]);
    m = placePark(m, 5, 5, "550", [1, 1, 1]);
    m = placePark(m, 5, 5, "666", [2, 2, 2]);
    m = placePark(m, 5, 5, "777", [3, 3, 3]);
    expect(m.map(x => x.corner)).toEqual(["BL", "BR", "TR", "TL"]);
  });

  test('fifth marker evicts the oldest and reuses its corner', () => {
    let m = [];
    m = placePark(m, 5, 5, "310", [0, 0, 0]); // BL
    m = placePark(m, 5, 5, "550", [1, 1, 1]); // BR
    m = placePark(m, 5, 5, "666", [2, 2, 2]); // TR
    m = placePark(m, 5, 5, "777", [3, 3, 3]); // TL
    m = placePark(m, 5, 5, "888", [4, 4, 4]); // evicts "310" (BL), reuses BL
    expect(m).toHaveLength(4);
    expect(m.map(x => x.colorId).sort()).toEqual(["550", "666", "777", "888"]);
    const eight = m.find(x => x.colorId === "888");
    expect(eight.corner).toBe("BL");
  });

  test('corners at different cells are independent', () => {
    let m = [];
    m = placePark(m, 5, 5, "310", [0, 0, 0]);
    m = placePark(m, 6, 5, "310", [0, 0, 0]);
    expect(m[0].corner).toBe("BL");
    expect(m[1].corner).toBe("BL");
  });
});

// ---------------------------------------------------------------------------
// Placement hits the cell under the pointer. Markers are drawn inside a cell,
// so the tracker must never ask gridCoord to snap (round) to the nearest grid
// line — that moved a marker onto the neighbouring column/row whenever the
// click landed in the right or bottom half of a cell, and silently dropped
// clicks in the right half of the last column.
// ---------------------------------------------------------------------------
describe('Park placement — cell under the pointer', () => {
  test('every tracker gridCoord call passes snap=false', () => {
    const calls = src.match(/gridCoord\(stitchRef,[^;]*?,\s*G\s*,\s*[^,)]+/g) || [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).toMatch(/,\s*G\s*,\s*false$/);
  });
});

// ---------------------------------------------------------------------------
// Parking takes its colour from the stitch. The colour picker that used to
// feed `selectedColorId` was removed from the tracker, which left parking
// unreachable; the marker now belongs to the stitch it is placed on.
// ---------------------------------------------------------------------------
describe('Parking gestures — colour from the stitch', () => {
  test('toggleParkAt reads the colour from the cell, not a picker', () => {
    expect(src).toMatch(/function toggleParkAt\(gx,gy\)/);
    expect(src).toMatch(/const colorId=cell\.id;/);
    expect(src).not.toMatch(/colorId:selectedColorId/);
  });

  test('a finished stitch cannot be parked on', () => {
    expect(src).toMatch(/const cur=doneRef\.current\|\|done;\s*if\(cur&&cur\[idx\]\)\{/);
  });

  test('canvas wires right-click and the Nav-mode press-and-hold', () => {
    expect(src).toMatch(/\{\.\.\.dragMarkHandlers\} onContextMenu=\{handleStitchContextMenu\}/);
    expect(src).toMatch(/onPointerDownCapture=\{handleCanvasPointerDownCapture\}/);
    expect(src).toMatch(/onPointerCancelCapture=\{clearNavHold\}/);
  });

  test('parking a cell with a legacy marker removes every marker at that cell', () => {
    expect(src).toMatch(/const existing=prev\.some\(m=>m\.x===gx&&m\.y===gy\);\s*if\(existing\)return prev\.filter\(m=>m\.x!==gx\|\|m\.y!==gy\);/);
  });

  test('the focused canvas supports keyboard parking at the guide cell', () => {
    expect(src).toMatch(/function handleStitchKeyDown\(e\)\{[\s\S]*?e\.key!=="ContextMenu"&&!\(e\.shiftKey&&e\.key==="F10"\)[\s\S]*?toggleParkAt\(guide\.col,guide\.row\);/);
    expect(src).toMatch(/onKeyDown=\{handleStitchKeyDown\}/);
  });

  test('a touch long-press contextmenu never parks (Mark mode owns it for rectangle select)', () => {
    expect(src).toMatch(/if\(lastPointerTypeRef\.current!=="mouse"\)\{\s*if\(stitchMode==="navigate"\)e\.preventDefault\(\);\s*return;\s*\}/);
  });

  test('right mouse button does not fall through to the mousedown handlers', () => {
    expect(src).toMatch(/function handleStitchMouseDown\(e\)\{[\s\S]{0,400}if\(e\.button===2\|\|isMacSecondaryClick\(e\)\)return;/);
  });

  test('a click straight after a fired hold is ignored in Nav mode', () => {
    expect(src).toMatch(/if\(Date\.now\(\)<suppressNavClickUntilRef\.current\)return;/);
  });
});

// ---------------------------------------------------------------------------
// A marker is spent once its stitch is done (Pattern Keeper behaves the same
// way). It is hidden, not deleted, so undo brings it back, and it is pruned
// on the next load. The single-cell repaint must put live markers back after
// its clearRect, otherwise unmarking a parked stitch loses the marker until
// the next full redraw.
// ---------------------------------------------------------------------------
describe('Spent park markers', () => {
  test('isParkSpent tests the done array at the marker cell', () => {
    expect(src).toMatch(/function isParkSpent\(pm,doneArr\)\{return !!\(doneArr&&doneArr\[pm\.y\*sW\+pm\.x\]\);\}/);
  });

  test('drawStitch skips spent markers, using the same done source as the cells', () => {
    expect(src).toMatch(/if\(isDone\(pm\.y\*sW\+pm\.x\)\)return; \/\/ spent/);
    expect(src).toMatch(/const isDone=isDoneAt\|\|\(i=>!!\(done&&done\[i\]\)\);/);
  });

  test('legend counts skip spent markers and recompute when done changes', () => {
    expect(src).toMatch(/if\(isParkSpent\(parkMarkers\[i\],done\)\)continue;/);
    expect(src).toMatch(/\},\[parkMarkers,done,sW\]\);/);
  });

  test('toggled stitches repaint through the clipped full renderer with the new done state', () => {
    const body = src.slice(src.indexOf('function paintDoneChanges('), src.indexOf('function hitTestHalfStitch('));
    expect(body).toMatch(/const isDoneAt=i=>!!nd\[i\];/);
    expect(body).toMatch(/repaintChartCells\(x,y,x\+1,y\+1,isDoneAt\)/);
    expect(body).not.toMatch(/clearRect/);
  });

  test('load prunes markers on finished stitches without counting them as removed colours', () => {
    const toastAt = src.indexOf('for colours no longer in the palette');
    const pruneAt = src.indexOf('liveParkMarkers.filter(function(m) { return !loadedDone[m.y * nextW + m.x]; })');
    expect(toastAt).toBeGreaterThan(0);
    expect(pruneAt).toBeGreaterThan(toastAt);
  });
});

// Behavioural: the spent rule itself.
describe('isParkSpent — behavioural', () => {
  const sW = 10;
  function isParkSpent(pm, doneArr) { return !!(doneArr && doneArr[pm.y * sW + pm.x]); }
  test('live while the stitch is open, spent once done, live again after undo', () => {
    const done = new Uint8Array(100);
    const pm = { x: 3, y: 4 };
    expect(isParkSpent(pm, done)).toBe(false);
    done[43] = 1;
    expect(isParkSpent(pm, done)).toBe(true);
    done[43] = 0;
    expect(isParkSpent(pm, done)).toBe(false);
  });
  test('no done array (pattern still loading) never hides markers', () => {
    expect(isParkSpent({ x: 0, y: 0 }, null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Right-click parking is only for a real secondary press on the canvas. The
// context menu also opens from the keyboard (Menu key, Shift+F10), where no
// cell is meant; and on a Mac, Ctrl+click is the secondary click, so it must
// park without also marking the stitch or moving the guide.
// ---------------------------------------------------------------------------
describe('Secondary-click parking guards', () => {
  const dragMarkSrc = fs.readFileSync(path.join(__dirname, '..', 'useDragMark.js'), 'utf8');

  test('a contextmenu only parks right after a secondary press on the canvas', () => {
    expect(src).toMatch(/if\(e\.button===2\|\|isMacSecondaryClick\(e\)\)lastSecondaryPressRef\.current=Date\.now\(\);/);
    expect(src).toMatch(/if\(Date\.now\(\)-lastSecondaryPressRef\.current>1000\)return;\s*const gc=gridCoord/);
  });

  test('Mac Ctrl+click skips the mousedown handlers', () => {
    expect(src).toMatch(/if\(e\.button===2\|\|isMacSecondaryClick\(e\)\)return;/);
    expect(src).toMatch(/function isMacSecondaryClick\(e\)\{\s*return e\.button===0&&e\.ctrlKey&&/);
  });

  test('Mac Ctrl+click does not start a drag-mark', () => {
    expect(dragMarkSrc).toMatch(/if \(e\.ctrlKey && e\.button === 0 && typeof window !== 'undefined'\s*&& window\.Shortcuts && window\.Shortcuts\.isMac && window\.Shortcuts\.isMac\(\)\) return;/);
  });
});

// ---------------------------------------------------------------------------
// Visibility. A marker is the colour of the stitch it sits on, so without an
// outline it vanished in Colour view (black on black). It also sat under the
// Spotlight overlay (94% dim) and the work-area margin fade, while a thread
// is usually parked ahead of where you are stitching — outside both.
// ---------------------------------------------------------------------------
describe('Park marker visibility', () => {
  test('marker gets a dark outer ring and a white inner ring before its fill', () => {
    const b = src.slice(src.indexOf('function drawParkMarker('), src.indexOf('function drawStitch('));
    expect(b).toMatch(/ctx\.strokeStyle="rgba\(27,24,20,0\.9\)";ctx\.lineWidth=PARK_MARKER_RING;ctx\.stroke\(\);\s*ctx\.strokeStyle="#fff";ctx\.lineWidth=1\.5;ctx\.stroke\(\);\s*ctx\.fillStyle=`rgb\(\$\{pm\.rgb\[0\]\},\$\{pm\.rgb\[1\]\},\$\{pm\.rgb\[2\]\}\)`;ctx\.fill\(\);/);
  });

  test('marker is inset from the cell corner so its ring stays inside the cell', () => {
    expect(src).toMatch(/const inset=Math\.min\(2,cSz\*0\.1\);/);
    expect(src).toMatch(/const PARK_MARKER_RING=3\.5;/);
  });

  test('markers are drawn after the work-area fade', () => {
    const fade = src.indexOf('ctx.strokeRect(ax0-1,ay0-1,ax1-ax0+2,ay1-ay0+2);');
    const markers = src.indexOf('// Park markers last, over the work-area fade');
    expect(fade).toBeGreaterThan(0);
    expect(markers).toBeGreaterThan(fade);
    expect(src.slice(markers, markers + 600)).toMatch(/drawParkMarker\(ctx,pm,gut,cSz\);/);
  });

  test('the Spotlight overlay cuts live markers out of its dimming', () => {
    const b = src.slice(src.indexOf('// ═══ Focus area three-zone dimming overlay ═══'), src.indexOf('// ═══ Breadcrumb trail overlay ═══'));
    expect(b).toMatch(/const lpm=liveParkMarkersRef\.current;/);
    expect(b).toMatch(/parkMarkerPath\(ctx,lpm\[i\],G,scs\);ctx\.fill\(\);ctx\.stroke\(\);/);
    // Still inside the destination-out block.
    expect(b.indexOf('const lpm=')).toBeGreaterThan(b.indexOf('globalCompositeOperation="destination-out"'));
    expect(b.indexOf('const lpm=')).toBeLessThan(b.indexOf('ctx.restore();\n  // Focus block border'));
    expect(src).toMatch(/\},\[focusBlock,focusEnabled,stitchingStyle,scs,sW,sH,blockW,blockH,liveParkKey\]\);/);
  });

  test('live markers exclude hidden layers and spent markers', () => {
    expect(src).toMatch(/const liveParkMarkers=useMemo\(\(\)=>\(parkMarkers\|\|\[\]\)\.filter\(pm=>parkLayers\[pm\.colorId\]!==false&&!isParkSpent\(pm,done\)\),\[parkMarkers,parkLayers,done,sW\]\);/);
  });
});
