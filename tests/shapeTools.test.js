// tests/shapeTools.test.js — line, rectangle and ellipse cells, and mirror
// drawing (P4-2, audit DRAW-04).

const T = require("../creator/shapeTools.js");
const key = (cells) => cells.map(c => c.x + ":" + c.y).sort().join(" ");

describe("line", () => {
  test("follows the Bresenham line, both ends included", () => {
    expect(T.shapeLineCells(0, 0, 4, 2, false).map(c => [c.x, c.y])).toEqual([[0, 0], [1, 1], [2, 1], [3, 2], [4, 2]]);
    expect(T.shapeLineCells(2, 2, 2, 2, false)).toEqual([{ x: 2, y: 2 }]);
  });

  test("snapping straightens it to 0, 45 or 90 degrees", () => {
    expect(T.snapLineEnd(0, 0, 10, 2)).toEqual({ x: 10, y: 0 });
    expect(T.snapLineEnd(0, 0, -1, 9)).toEqual({ x: 0, y: 9 });
    expect(T.snapLineEnd(0, 0, 8, 6)).toEqual({ x: 7, y: 7 });
    expect(T.snapLineEnd(5, 5, 1, 8)).toEqual({ x: 1, y: 9 });
    const snapped = T.shapeLineCells(0, 0, 10, 2, true);
    expect(snapped.length).toBe(11);
    expect(snapped.every(c => c.y === 0)).toBe(true);
    const diag = T.shapeLineCells(0, 0, 8, 6, true);
    expect(diag.every(c => c.x === c.y)).toBe(true);
  });
});

describe("rectangle and ellipse", () => {
  test("a rectangle outline is its border, a filled one every cell", () => {
    expect(T.rectCells(0, 0, 3, 2, false).length).toBe(10);
    expect(T.rectCells(3, 2, 0, 0, true).length).toBe(12);
    expect(key(T.rectCells(1, 1, 3, 3, false))).not.toContain("2:2");
    // A 10 × 10 outline: 36 cells.
    expect(T.rectCells(0, 0, 9, 9, false).length).toBe(36);
    // A one-row box is a line.
    expect(T.rectCells(0, 0, 4, 0, false).length).toBe(5);
  });

  test("an ellipse fits its box and is symmetric", () => {
    const filled = T.ellipseCells(0, 0, 8, 4, true);
    const outline = T.ellipseCells(0, 0, 8, 4, false);
    expect(outline.length).toBeLessThan(filled.length);
    filled.forEach(c => { expect(c.x >= 0 && c.x <= 8 && c.y >= 0 && c.y <= 4).toBe(true); });
    const set = new Set(filled.map(c => c.x + ":" + c.y));
    filled.forEach(c => {
      expect(set.has((8 - c.x) + ":" + c.y)).toBe(true);
      expect(set.has(c.x + ":" + (4 - c.y))).toBe(true);
    });
    // It reaches the middle of each side.
    ["0:2", "8:2", "4:0", "4:4"].forEach(k => expect(set.has(k)).toBe(true));
    // ...and not the corners.
    expect(set.has("0:0")).toBe(false);
  });

  test("shapeCells picks the tool", () => {
    expect(T.shapeCells("rect", { x: 0, y: 0 }, { x: 2, y: 2 }, { filled: true }).length).toBe(9);
    expect(T.shapeCells("line", { x: 0, y: 0 }, { x: 9, y: 1 }, { snap: true }).every(c => c.y === 0)).toBe(true);
    expect(T.shapeCells("nope", { x: 0, y: 0 }, { x: 2, y: 2 })).toEqual([]);
  });
});

describe("mirror drawing", () => {
  const m = (axis, ax, ay) => ({ on: true, axis, ax, ay });

  test("off gives the cell alone", () => {
    expect(T.mirrorPoints(3, 4, { on: false, axis: "v", ax: 5, ay: 5 })).toEqual([{ x: 3, y: 4, flipH: false, flipV: false }]);
    expect(T.mirrorPoints(3, 4, null).length).toBe(1);
  });

  test("a vertical axis reflects across columns", () => {
    // 30 wide, axis at 15: column 2 reflects to column 27.
    expect(T.mirrorPoints(2, 5, m("v", 15, 15))).toEqual([
      { x: 2, y: 5, flipH: false, flipV: false }, { x: 27, y: 5, flipH: true, flipV: false }]);
    // 31 wide, axis 15.5 runs through column 15, which reflects onto itself.
    expect(T.mirrorPoints(15, 3, m("v", 15.5, 0)).length).toBe(1);
    expect(T.mirrorPoints(14, 3, m("v", 15.5, 0))[1].x).toBe(16);
  });

  test("a horizontal axis reflects across rows, both axes make four", () => {
    expect(T.mirrorPoints(4, 1, m("h", 10, 10))[1]).toEqual({ x: 4, y: 18, flipH: false, flipV: true });
    const four = T.mirrorPoints(1, 2, m("both", 10, 10));
    expect(four.map(p => [p.x, p.y, p.flipH, p.flipV])).toEqual([
      [1, 2, false, false], [18, 2, true, false], [1, 17, false, true], [18, 17, true, true]]);
  });

  test("a half stitch changes direction in one mirror and not in two", () => {
    expect(T.mirrorHalf("half-fwd", true, false)).toBe("half-bck");
    expect(T.mirrorHalf("half-bck", false, true)).toBe("half-fwd");
    expect(T.mirrorHalf("half-fwd", true, true)).toBe("half-fwd");
    expect(T.mirrorHalf("paint", true, false)).toBe("paint");
  });

  test("quarter stitches move to the mirrored corner", () => {
    expect(T.mirrorQuadrant("TL", true, false)).toBe("TR");
    expect(T.mirrorQuadrant("TL", false, true)).toBe("BL");
    expect(T.mirrorQuadrant("TL", true, true)).toBe("BR");
    expect(T.mirrorQuadrant("BR", false, false)).toBe("BR");
  });

  test("the default mirror is centred on the pattern", () => {
    expect(T.centredMirror(30, 20, "v")).toEqual({ on: true, axis: "v", ax: 15, ay: 10 });
  });
});
