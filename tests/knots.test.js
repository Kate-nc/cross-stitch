// tests/knots.test.js — French knot helpers (P4-4, audit DRAW-04 item 6).

const K = require("../knots.js");

describe("snap", () => {
  test("a tap near a cell's middle lands on its centre", () => {
    expect(K.snap(3.5, 2.5, 10, 10)).toEqual({ x: 7, y: 5 });
    expect(K.snap(3.4, 2.6, 10, 10)).toEqual({ x: 7, y: 5 });
  });
  test("a tap near a grid crossing lands on that corner", () => {
    expect(K.snap(4.05, 2.9, 10, 10)).toEqual({ x: 8, y: 6 });
    expect(K.snap(0.1, 0.1, 10, 10)).toEqual({ x: 0, y: 0 });
  });
  test("never an edge midpoint, and kept inside the pattern", () => {
    for (let fx = -1; fx <= 11; fx += 0.13) {
      for (let fy = -1; fy <= 11; fy += 0.17) {
        const p = K.snap(fx, fy, 10, 10);
        expect(K.onLattice(p.x, p.y)).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(20);
        expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(20);
      }
    }
    expect(K.snap(12, 12, 10, 10)).toEqual({ x: 20, y: 20 });
  });
});

describe("toggle", () => {
  const red = { id: "666", rgb: [227, 29, 66] };
  test("adds a knot, and a second tap on the spot removes it", () => {
    const a = K.toggle([], 3, 5, red);
    expect(a.added).toBe(true);
    expect(a.knots).toEqual([{ x: 3, y: 5, id: "666", rgb: [227, 29, 66] }]);
    const b = K.toggle(a.knots, 3, 5, { id: "310", rgb: [0, 0, 0] });
    expect(b.added).toBe(false);
    expect(b.knots).toEqual([]);
  });
  test("doesn't change the array it was given", () => {
    const list = [{ x: 1, y: 1, id: "310" }];
    K.toggle(list, 1, 1, red);
    K.toggle(list, 3, 3, red);
    expect(list).toEqual([{ x: 1, y: 1, id: "310" }]);
  });
});

describe("normalise", () => {
  test("keeps well-formed knots, one per spot, drops the rest", () => {
    const out = K.normalise([
      { x: 1, y: 1, id: "310" },
      { x: 2, y: 3, id: "310" },          // edge midpoint
      { x: 1.5, y: 1, id: "310" },        // not on the lattice
      { x: 30, y: 2, id: "310" },         // outside a 10-wide pattern
      { x: 4, y: 4 },                     // no thread
      null,
      { x: 1, y: 1, id: 666, rgb: [1, 2, 3] }
    ], 10, 10);
    expect(out).toEqual([{ x: 1, y: 1, id: "666", rgb: [1, 2, 3] }]);
    expect(K.normalise(undefined)).toEqual([]);
  });
});

describe("mirror", () => {
  test("copies across a grid-line axis and a mid-cell axis, staying on corners and centres", () => {
    // Axis between columns 4 and 5 (ax = 5): centre of cell 1 (x=3) lands
    // on the centre of cell 8 (x=17).
    expect(K.mirrorKnot(3, 3, { on: true, axis: "v", ax: 5, ay: 5 })).toEqual([{ x: 3, y: 3 }, { x: 17, y: 3 }]);
    // Axis through the middle of column 4 (ax = 4.5): corner x=4 lands on x=14.
    const m = K.mirrorKnot(4, 6, { on: true, axis: "both", ax: 4.5, ay: 3 });
    // (The knot is on the top-bottom axis, y = 2 · 3, so its copies there coincide.)
    expect(m).toEqual([{ x: 4, y: 6 }, { x: 14, y: 6 }]);
    m.forEach(p => expect(K.onLattice(p.x, p.y)).toBe(true));
    expect(K.mirrorKnot(3, 3, { on: false })).toEqual([{ x: 3, y: 3 }]);
  });
});

describe("selection, resize and progress", () => {
  test("a knot belongs to its own cell (centre) or the cell to its bottom right (corner)", () => {
    expect(K.cellOf({ x: 7, y: 5 }, 10, 10)).toEqual({ x: 3, y: 2 });
    expect(K.cellOf({ x: 8, y: 4 }, 10, 10)).toEqual({ x: 4, y: 2 });
    expect(K.cellOf({ x: 20, y: 20 }, 10, 10)).toEqual({ x: 9, y: 9 });
  });
  test("offset moves by whole cells and drops what leaves the pattern", () => {
    const list = [{ x: 1, y: 1, id: "a" }, { x: 19, y: 19, id: "b" }];
    expect(K.offset(list, 1, 0, 10, 10)).toEqual([{ x: 3, y: 1, id: "a" }]);
    expect(K.offsetDone(["1,1", "19,19"], 1, 0)).toEqual(["3,1", "21,19"]);
  });
  test("progress counts only done keys that still match a knot", () => {
    const list = [{ x: 1, y: 1, id: "a" }, { x: 3, y: 1, id: "a" }, { x: 5, y: 5, id: "b" }];
    expect(K.progress(list, ["1,1", "9,9"])).toEqual({ total: 3, done: 1 });
    expect(K.byThread(list, ["5,5"])).toEqual({ a: { total: 2, done: 0 }, b: { total: 1, done: 1 } });
    expect(K.progress(undefined, undefined)).toEqual({ total: 0, done: 0 });
  });
  test("hitTest finds the nearest knot within the radius", () => {
    const list = [{ x: 1, y: 1, id: "a" }, { x: 2, y: 2, id: "b" }];
    expect(K.hitTest(list, 0.55, 0.5, 0.4).id).toBe("a");
    expect(K.hitTest(list, 1.05, 0.95, 0.4).id).toBe("b");
    expect(K.hitTest(list, 4, 4, 0.4)).toBeNull();
  });
});

describe("thread counts", () => {
  test("each knot adds its allowance to its thread, and knot-only threads get a row", () => {
    const pal = [{ id: "310", type: "solid", count: 10 }, { id: "666", type: "solid", count: 4 }];
    const knots = [{ x: 1, y: 1, id: "310" }, { x: 3, y: 1, id: "310" }, { x: 5, y: 5, id: "321", rgb: [1, 2, 3] }];
    const out = K.withKnotCounts(pal, knots);
    expect(out[0]).toEqual({ id: "310", type: "solid", count: 10 + 2 * K.THREAD_ALLOWANCE, knots: 2 });
    expect(out[1]).toBe(pal[1]);
    expect(out[2]).toEqual({ id: "321", type: "solid", name: "321", rgb: [1, 2, 3], count: K.THREAD_ALLOWANCE, knots: 1, knotsOnly: true });
    expect(pal[0].count).toBe(10);
    expect(K.withKnotCounts(pal, [])).toBe(pal);
  });
});
