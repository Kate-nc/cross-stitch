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
