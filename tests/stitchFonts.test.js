// tests/stitchFonts.test.js — the text tool's bitmap fonts (P4-3, audit
// DRAW-04 item 5).

const F = require("../creator/stitchFonts.js");

function rows(text, font, opts) {
  const r = F.renderText(text, font, opts || {});
  const g = Array.from({ length: r.h }, () => Array(r.w).fill("."));
  r.cells.forEach(c => { g[c.y][c.x] = "#"; });
  return g.map(x => x.join(""));
}

describe("glyph data", () => {
  test("every glyph's rows are the same width and fit the font's height", () => {
    Object.values(F.FONTS).forEach(font => {
      Object.entries(font.glyphs).forEach(([ch, g]) => {
        const w = g.rows[0].length;
        g.rows.forEach(r => expect([ch, r.length]).toEqual([ch, w]));
        expect(g.top + g.rows.length).toBeLessThanOrEqual(font.capHeight + font.descent);
        expect(g.rows.join("")).toMatch(/^[#.]+$/);
      });
    });
  });

  test("both fonts cover A–Z, a–z, 0–9 and the punctuation", () => {
    const need = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?'&£-:/()";
    Object.values(F.FONTS).forEach(font => {
      Array.from(need).forEach(ch => expect([font.id, ch, !!font.glyphs[ch]]).toEqual([font.id, ch, true]));
    });
  });

  test("accented letters are built from the plain letter and an accent", () => {
    ["block", "serif"].forEach(id => {
      const r = F.renderText("éÉñçüÅ", id);
      expect(r.missing).toEqual([]);
      // é is e plus an accent above it: more stitches, and taller.
      const e = F.glyphCells(F.FONTS[id], "e"), eAcute = F.glyphCells(F.FONTS[id], "é");
      expect(eAcute.cells.length).toBe(e.cells.length + 2);
      expect(Math.min(...eAcute.cells.map(c => c.y))).toBeLessThan(Math.min(...e.cells.map(c => c.y)));
      // The cedilla goes below.
      const c = F.glyphCells(F.FONTS[id], "c"), cc = F.glyphCells(F.FONTS[id], "ç");
      expect(Math.max(...cc.cells.map(p => p.y))).toBeGreaterThan(Math.max(...c.cells.map(p => p.y)));
    });
  });
});

describe("rendering", () => {
  test('"Ab 1" in Block', () => {
    expect(rows("Ab 1", "block")).toEqual([
      ".###..#..........#.",
      "#...#.#.........##.",
      "#...#.####.......#.",
      "#####.#...#......#.",
      "#...#.#...#......#.",
      "#...#.#...#......#.",
      "#...#.####......###"
    ]);
  });

  test('"Ab 1" in Serif', () => {
    expect(rows("Ab 1", "serif")).toEqual([
      "...#....##............#..",
      "...#.....#...........##..",
      "..#.#....#..........#.#..",
      "..#.#....####.........#..",
      ".#...#...#...#........#..",
      ".#####...#...#........#..",
      ".#...#...#...#........#..",
      "#.....#..#...#........#..",
      "##...##.#.###.......#####"
    ]);
  });

  test("letter spacing widens the gaps between letters only", () => {
    // Block A, b and 1 are 5, 5 and 3 wide; the space is 3.
    expect(F.textWidth("Ab 1", "block", { letterSpacing: 0 })).toBe(16);
    expect(F.textWidth("Ab 1", "block", { letterSpacing: 1 })).toBe(19);
    expect(F.textWidth("Ab 1", "block", { letterSpacing: 3 })).toBe(25);
    expect(F.renderText("Ab 1", "block", { letterSpacing: 3 }).cells.length)
      .toBe(F.renderText("Ab 1", "block", { letterSpacing: 0 }).cells.length);
  });

  test("lines stack with the line spacing, and align", () => {
    expect(rows("I\nII", "block", { align: "centre", lineSpacing: 1 })).toEqual([
      "..###..", "...#...", "...#...", "...#...", "...#...", "...#...", "..###..",
      ".......", ".......", ".......",
      "###.###", ".#...#.", ".#...#.", ".#...#.", ".#...#.", ".#...#.", "###.###"
    ]);
    // Block line height is 7 + 2 for descenders + the spacing.
    expect(F.renderText("I\nI", "block", { lineSpacing: 0 }).h).toBe(16);
    expect(F.renderText("I\nI", "block", { lineSpacing: 3 }).h).toBe(19);
    expect(rows("I\nIII", "block", { align: "right" })[0]).toBe("........###");
    expect(rows("I\nIII", "block", { align: "left" })[0]).toBe("###........");
  });

  test("the result is cropped to rows with stitches", () => {
    expect(F.renderText("ace", "block").h).toBe(5);
    expect(F.renderText("gap", "block").h).toBe(7);
    expect(F.renderText("", "block")).toMatchObject({ h: 0, cells: [] });
    expect(F.renderText("   ", "block").w).toBe(11);
  });

  test("a character the font lacks shows as ? and is reported", () => {
    const r = F.renderText("A@", "block");
    expect(r.missing).toEqual(["@"]);
    expect(r.w).toBe(5 + 1 + 5);
    // ß has no glyph and no single upper-case letter: still a ?, not nothing.
    const ss = F.renderText("ß", "block");
    expect(ss.missing).toEqual(["ß"]);
    expect(ss.cells).toEqual(F.renderText("?", "block").cells);
  });

  test("pasted Windows line ends and tabs aren't treated as characters", () => {
    expect(rows("I\r\nI", "block")).toEqual(rows("I\nI", "block"));
    expect(F.renderText("A\r\nB", "block").missing).toEqual([]);
    expect(rows("I\tI", "block")).toEqual(rows("I I", "block"));
  });

  test("width counts the widest line, for the too-wide warning", () => {
    expect(F.textWidth("Hi\nHello", "block")).toBe(F.textWidth("Hello", "block"));
    expect(F.textWidth("ANNA", "serif")).toBeGreaterThan(F.textWidth("ANNA", "block"));
  });
});

describe("textClip", () => {
  test("puts the thread in every stitch and leaves the gaps see-through", () => {
    const r = F.renderText("IL", "block");
    const clip = F.textClip(r, { id: "310", type: "solid", rgb: [0, 0, 0] });
    expect([clip.w, clip.h]).toEqual([r.w, r.h]);
    expect(Array.from(clip.sel).every(v => v === 1)).toBe(true);
    expect(clip.cells.filter(Boolean).length).toBe(r.cells.length);
    expect(clip.cells.filter(Boolean)[0]).toEqual({ id: "310", type: "solid", rgb: [0, 0, 0] });
  });
});
