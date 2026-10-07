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

  test('Option C: renderStitch deps include parkLayers so toggling repaints', () => {
    expect(src).toMatch(/done,parkMarkers,parkLayers,/);
  });

  test('Option C: per-colour pip toggles via toggleParkLayer(p.id)', () => {
    // Pip is rendered in both legend blocks (mobile lp-section + desktop rpanel).
    const matches = src.match(/toggleParkLayer\(p\.id\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  test('Option C: Clear-park-markers also clears parkLayers', () => {
    expect(src).toMatch(/setParkMarkers\(\[\]\);setParkLayers\(\{\}\)/);
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

  test('a touch long-press contextmenu never parks (Mark mode owns it for rectangle select)', () => {
    expect(src).toMatch(/if\(lastPointerTypeRef\.current!=="mouse"\)\{\s*if\(stitchMode==="navigate"\)e\.preventDefault\(\);\s*return;\s*\}/);
  });

  test('right mouse button does not fall through to the mousedown handlers', () => {
    expect(src).toMatch(/function handleStitchMouseDown\(e\)\{[\s\S]{0,400}if\(e\.button===2\)return;/);
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

  test('full repaint skips spent markers', () => {
    expect(src).toMatch(/if\(parkLayers\[pm\.colorId\]===false\)return;\s*if\(isParkSpent\(pm,done\)\)return;\s*drawParkMarker\(ctx,pm,gut,cSz\);/);
  });

  test('legend counts skip spent markers and recompute when done changes', () => {
    expect(src).toMatch(/if\(isParkSpent\(parkMarkers\[i\],done\)\)continue;/);
    expect(src).toMatch(/\},\[parkMarkers,done,sW\]\);/);
  });

  test('single-cell repaint restores live markers at both exits', () => {
    const body = src.slice(src.indexOf('function drawCellDirectly('), src.indexOf('function hitTestHalfStitch('));
    expect(body).toMatch(/const paintParks=\(\)=>\{\s*if\(isDn\)return;/);
    expect((body.match(/paintParks\(\);/g) || []).length).toBe(2);
    expect(body).toMatch(/parkMarkersRef\.current/);
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
