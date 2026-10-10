// tests/selectionTransforms.test.js — copy, paste, flip and rotate for a
// selection (P4-1, audit DRAW-04).

const T = require("../creator/selectionTransforms.js");

const S = (id) => ({ id: id, type: "solid", rgb: [0, 0, 0] });
const E = () => ({ id: "__empty__", rgb: [255, 255, 255] });

// A pattern from rows of characters: "." is empty, anything else a thread.
function grid(rows) {
  const sH = rows.length, sW = rows[0].length, pat = [];
  rows.forEach(r => r.split("").forEach(ch => pat.push(ch === "." ? E() : S(ch))));
  return { pat, sW, sH };
}
function rowsOf(pat, sW) {
  const out = [];
  for (let i = 0; i < pat.length; i += sW) out.push(pat.slice(i, i + sW).map(c => (c.id === "__empty__" || c.id === "__skip__") ? "." : c.id).join(""));
  return out;
}
function clipRows(clip) {
  const out = [];
  for (let y = 0; y < clip.h; y++) {
    let r = "";
    for (let x = 0; x < clip.w; x++) { const c = clip.cells[y * clip.w + x]; r += c ? c.id : "."; }
    out.push(r);
  }
  return out;
}
function maskAll(n) { return new Uint8Array(n).fill(1); }
function maskRect(sW, sH, x0, y0, x1, y1) {
  const m = new Uint8Array(sW * sH);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * sW + x] = 1;
  return m;
}

describe("extractClip", () => {
  test("cuts the selection out of its bounding box", () => {
    const g = grid(["....", ".ab.", ".c..", "...."]);
    const clip = T.extractClip(g.pat, new Map(), [], maskRect(4, 4, 1, 1, 2, 2), 4, 4);
    expect([clip.w, clip.h, clip.srcX, clip.srcY]).toEqual([2, 2, 1, 1]);
    expect(clipRows(clip)).toEqual(["ab", "c."]);
    expect(Array.from(clip.sel)).toEqual([1, 1, 1, 1]);
    expect(T.clipStitchCount(clip)).toBe(3);
  });

  test("keeps an irregular selection's shape", () => {
    const g = grid(["ab", "cd"]);
    const mask = new Uint8Array([1, 0, 1, 1]);
    const clip = T.extractClip(g.pat, new Map(), [], mask, 2, 2);
    expect(Array.from(clip.sel)).toEqual([1, 0, 1, 1]);
    expect(clipRows(clip)).toEqual(["a.", "cd"]);
  });

  test("takes backstitch with both ends in the box, in local units, keeping other fields", () => {
    const g = grid(["...", "...", "..."]);
    const bs = [{ x1: 1, y1: 1, x2: 2, y2: 2, id: "666" }, { x1: 0, y1: 0, x2: 3, y2: 3 }];
    const clip = T.extractClip(g.pat, new Map(), bs, maskRect(3, 3, 1, 1, 1, 1), 3, 3);
    expect(clip.bs).toEqual([{ x1: 0, y1: 0, x2: 1, y2: 1, id: "666" }]);
  });

  test("no selection gives no clip", () => {
    const g = grid(["ab"]);
    expect(T.extractClip(g.pat, new Map(), [], new Uint8Array(2), 2, 1)).toBeNull();
  });
});

describe("transformClip", () => {
  const g = grid(["abc", "d.e"]);
  const clip = T.extractClip(g.pat, new Map(), [], maskAll(6), 3, 2);

  test("flips horizontally and vertically", () => {
    expect(clipRows(T.transformClip(clip, "flipH"))).toEqual(["cba", "e.d"]);
    expect(clipRows(T.transformClip(clip, "flipV"))).toEqual(["d.e", "abc"]);
  });

  test("rotates a quarter turn each way, swapping width and height", () => {
    const cw = T.transformClip(clip, "rotCW");
    expect([cw.w, cw.h]).toEqual([2, 3]);
    expect(clipRows(cw)).toEqual(["da", ".b", "ec"]);
    expect(clipRows(T.transformClip(clip, "rotCCW"))).toEqual(["ce", "b.", "ad"]);
  });

  test("flipping twice and rotating four times give the original", () => {
    const twiceH = T.transformClip(T.transformClip(clip, "flipH"), "flipH");
    const twiceV = T.transformClip(T.transformClip(clip, "flipV"), "flipV");
    let four = clip; for (let i = 0; i < 4; i++) four = T.transformClip(four, "rotCW");
    let fourBack = clip; for (let i = 0; i < 4; i++) fourBack = T.transformClip(fourBack, "rotCCW");
    [twiceH, twiceV, four, fourBack].forEach(c => {
      expect([c.w, c.h]).toEqual([3, 2]);
      expect(clipRows(c)).toEqual(clipRows(clip));
      expect(Array.from(c.sel)).toEqual(Array.from(clip.sel));
    });
    expect(clipRows(T.transformClip(T.transformClip(clip, "rotCW"), "rotCCW"))).toEqual(clipRows(clip));
  });

  const red = { id: "666", rgb: [200, 0, 0] };
  const fwd = { BL: red, TR: red };   // half stitch "/"
  const bck = { TL: red, BR: red };   // half stitch "\"
  function oneCellClip(p) {
    return T.extractClip([S("a")], new Map([[0, p]]), [], new Uint8Array([1]), 1, 1);
  }
  const quads = p => Object.keys(p).filter(k => ["TL", "TR", "BL", "BR"].includes(k)).sort();

  test("a half stitch changes direction when flipped either way or turned", () => {
    ["flipH", "flipV", "rotCW", "rotCCW"].forEach(op => {
      expect(quads(T.transformClip(oneCellClip(fwd), op).ps[0])).toEqual(["BR", "TL"]);
      expect(quads(T.transformClip(oneCellClip(bck), op).ps[0])).toEqual(["BL", "TR"]);
    });
  });

  test("a quarter stitch moves to the mirrored or turned quadrant", () => {
    const tl = { TL: red };
    expect(quads(T.transformClip(oneCellClip(tl), "flipH").ps[0])).toEqual(["TR"]);
    expect(quads(T.transformClip(oneCellClip(tl), "flipV").ps[0])).toEqual(["BL"]);
    expect(quads(T.transformClip(oneCellClip(tl), "rotCW").ps[0])).toEqual(["TR"]);
    expect(quads(T.transformClip(oneCellClip(tl), "rotCCW").ps[0])).toEqual(["BL"]);
    // Three-quarter: everything but BR, turned clockwise, is everything but BL.
    const tq = { TL: red, TR: red, BL: red };
    expect(quads(T.transformClip(oneCellClip(tq), "rotCW").ps[0])).toEqual(["BR", "TL", "TR"]);
    expect(T.transformClip(oneCellClip(tq), "rotCW").ps[0].TL).toEqual(red);
  });

  test("part stitches follow their cell", () => {
    const pat = [S("a"), S("b")];
    const clip2 = T.extractClip(pat, new Map([[0, { TL: red }]]), [], maskAll(2), 2, 1);
    const f = T.transformClip(clip2, "flipH");
    expect(f.ps[0]).toBeNull();
    expect(quads(f.ps[1])).toEqual(["TR"]);
  });

  test("backstitch ends move with the cells", () => {
    // A 3 × 2 clip with a line from its top-left corner to the vertex at (1, 2).
    const c = Object.assign({}, clip, { bs: [{ x1: 0, y1: 0, x2: 1, y2: 2, id: "310" }] });
    expect(T.transformClip(c, "flipH").bs[0]).toEqual({ x1: 3, y1: 0, x2: 2, y2: 2, id: "310" });
    expect(T.transformClip(c, "flipV").bs[0]).toEqual({ x1: 0, y1: 2, x2: 1, y2: 0, id: "310" });
    expect(T.transformClip(c, "rotCW").bs[0]).toEqual({ x1: 2, y1: 0, x2: 0, y2: 1, id: "310" });
    expect(T.transformClip(c, "rotCCW").bs[0]).toEqual({ x1: 0, y1: 3, x2: 2, y2: 2, id: "310" });
    let four = c; for (let i = 0; i < 4; i++) four = T.transformClip(four, "rotCW");
    expect(four.bs).toEqual(c.bs);
  });
});

describe("placing a clip", () => {
  test("pastes on top, leaving empty clip cells see-through", () => {
    const g = grid(["xxxx", "xxxx"]);
    const clip = T.extractClip(grid(["a.", "bc"]).pat, new Map(), [], maskAll(4), 2, 2);
    const r = T.placeClip({ pat: g.pat, ps: new Map(), bsLines: [] }, clip, 1, 0, 4, 2);
    expect(rowsOf(r.pat, 4)).toEqual(["xaxx", "xbcx"]);
    expect(Array.from(r.mask)).toEqual([0, 1, 1, 0, 0, 1, 1, 0]);
    expect(r.clipped).toBe(false);
  });

  test("clips what falls outside and says so", () => {
    const g = grid(["...", "..."]);
    const clip = T.extractClip(grid(["ab"]).pat, new Map(), [{ x1: 0, y1: 0, x2: 2, y2: 1 }], maskAll(2), 2, 1);
    const r = T.placeClip({ pat: g.pat, ps: new Map(), bsLines: [] }, clip, 2, 1, 3, 2);
    expect(rowsOf(r.pat, 3)).toEqual(["...", "..a"]);
    expect(r.bsLines).toEqual([]);
    expect(r.clipped).toBe(true);
    // A clip of empty cells hanging over the edge loses nothing.
    const blank = T.extractClip(grid([".."]).pat, new Map(), [], maskAll(2), 2, 1);
    expect(T.placeClip({ pat: g.pat, ps: new Map(), bsLines: [] }, blank, 2, 0, 3, 2).clipped).toBe(false);
  });

  test("lifting takes the stitches, part stitches and lines out", () => {
    const g = grid(["ab", "cd"]);
    const ps = new Map([[0, { TL: { id: "a" } }], [3, { BR: { id: "d" } }]]);
    const bs = [{ x1: 0, y1: 0, x2: 1, y2: 1 }, { x1: 1, y1: 1, x2: 2, y2: 2 }];
    const mask = new Uint8Array([1, 0, 0, 0]);
    const l = T.liftSelection(g.pat, ps, bs, mask, 2, 2);
    expect(rowsOf(l.pat, 2)).toEqual([".b", "cd"]);
    expect([...l.ps.keys()]).toEqual([3]);
    expect(l.bsLines).toEqual([{ x1: 1, y1: 1, x2: 2, y2: 2 }]);
  });

  test("a lifted, flipped and replaced selection is one undo entry against the original", () => {
    const g = grid(["ab.", "..."]);
    const before = { pat: g.pat, ps: new Map(), bsLines: [] };
    const mask = maskRect(3, 2, 0, 0, 1, 0);
    const clip = T.transformClip(T.extractClip(g.pat, new Map(), [], mask, 3, 2), "flipH");
    const base = T.liftSelection(g.pat, new Map(), [], mask, 3, 2);
    const after = T.placeClip(base, clip, 0, 0, 3, 2);
    expect(rowsOf(after.pat, 3)).toEqual(["ba.", "..."]);
    const d = T.diffForHistory(before, after);
    expect(d.changes.map(c => c.idx)).toEqual([0, 1]);
    expect(d.changes.map(c => c.old.id)).toEqual(["a", "b"]);
    expect(d.psChanges).toBeUndefined();
    expect(d.bsLines).toBeUndefined();
    // Flipping a symmetric selection back to where it was changes nothing.
    const same = T.placeClip(base, T.transformClip(clip, "flipH"), 0, 0, 3, 2);
    expect(T.diffForHistory(before, same).empty).toBe(true);
  });

  test("the diff records part stitches added and removed, and the old lines", () => {
    const before = { pat: [S("a")], ps: new Map([[0, { TL: { id: "a" } }]]), bsLines: [] };
    const after = { pat: [S("a")], ps: new Map(), bsLines: [{ x1: 0, y1: 0, x2: 1, y2: 1 }] };
    const d = T.diffForHistory(before, after);
    expect(d.psChanges).toEqual([{ idx: 0, old: { TL: { id: "a" } } }]);
    expect(d.bsLines).toEqual([]);
    const d2 = T.diffForHistory(after, before);
    expect(d2.psChanges).toEqual([{ idx: 0, old: null }]);
  });

  test("a turned clip stays centred", () => {
    const clip = { w: 4, h: 2 };
    expect(T.rotatedOrigin(clip, 10, 10)).toEqual({ x: 11, y: 9 });
  });
});
