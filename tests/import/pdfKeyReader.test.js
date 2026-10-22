/* tests/import/pdfKeyReader.test.js — characterisation of the code-anchored colour key reader in pdf-importer.js
 * (parseKeyEntries) and of the way parseLegend pools its readings across pages.
 *
 * Written against the in-class implementation and kept unchanged when the reader lives in pdf-key-reader.js:
 * everything goes through the importer's own methods, which stay in place. Expected values are what the code
 * returned before the move, awkward ones included (a lone symbol beside no swatch still being picked up, a tied
 * swatch resolved by area, two entries on a line each claiming only the text up to the next entry's prefix,
 * a duplicate entry being kept by the reader and dropped only by parseLegend).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function loadImporterClass() {
  global.pdfjsLib = { OPS: new Proxy({}, { get: () => -1 }), GlobalWorkerOptions: { workerSrc: '' } };
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(ROOT, 'pdf-importer.js'), 'utf8') + '\nthis.PatternKeeperImporter = PatternKeeperImporter;');
  return this.PatternKeeperImporter;
}
const Importer = loadImporterClass();
const imp = new Importer();

const text = (str, x, y, extra) => Object.assign({ str, x, y, width: 6 * str.length, height: 8, fontName: 'f1' }, extra || {});
const rect = (x, y, w, h, fill) => ({
  type: 'rect', lineWidth: 1, fillColor: fill,
  points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }],
});
const stroke = (x0, x1, y, rgb) => ({ type: 'line', stroked: true, strokeColor: rgb, lineWidth: 2, points: [{ x: x0, y }, { x: x1, y }] });
const pic = (key, x0, y0, x1, y1) => ({ pic: key, x0, y0, x1, y1 });
const page = (textItems, vectorPaths, images) => ({ pageIndex: 1, width: 612, height: 792, textItems, vectorPaths: vectorPaths || [], images: images || [], fonts: [] });
const read = (p, exclude) => imp.parseKeyEntries(p, exclude === undefined ? null : exclude);
const codes = (p, exclude) => read(p, exclude).map(e => e.threadCode);

describe('parseKeyEntries: what makes a code, and what is left out', () => {
  it('reads codes in the order the text items arrive, not by position', () => {
    const p = page([text('797', 100, 140), text('310', 100, 100), text('B5200', 100, 120), text('ecru', 100, 160)],
      [rect(80, 131, 9, 9, [1, 1, 1]), rect(80, 91, 9, 9, [2, 2, 2]), rect(80, 111, 9, 9, [3, 3, 3]), rect(80, 151, 9, 9, [4, 4, 4])]);
    expect(codes(p)).toEqual(['797', '310', 'B5200', 'ecru']);
  });

  it('accepts a bare DMC prefix on the code token and strips it', () => {
    const p = page([text('DMC 310', 100, 100), text('DMC3799', 100, 120), text('dmc blanc', 100, 140)],
      [rect(70, 91, 9, 9, [1, 1, 1]), rect(70, 111, 9, 9, [2, 2, 2]), rect(70, 131, 9, 9, [3, 3, 3])]);
    expect(codes(p)).toEqual(['310', '3799', 'blanc']);
  });

  it('refuses single digits, five-digit numbers, and mixed junk as codes', () => {
    const p = page([text('4', 100, 100), text('12345', 100, 120), text('A1B2', 100, 140), text('ABC1', 100, 160)],
      [rect(80, 91, 9, 9, [1, 1, 1]), rect(80, 111, 9, 9, [1, 1, 1]), rect(80, 131, 9, 9, [1, 1, 1]), rect(80, 151, 9, 9, [1, 1, 1])]);
    expect(read(p)).toEqual([]);
  });

  it('trims the text and skips blanks; a missing width counts as zero and a missing height as the font size, then 8', () => {
    const p = page([
      { str: '  310  ', x: 100, y: 100 },
      { str: '   ', x: 90, y: 100 },
      { str: '3799', x: 100, y: 120, fontSize: 20 },
      { x: 100, y: 140 },
    ], [rect(80, 91, 9, 9, [1, 1, 1]), rect(80, 106, 9, 9, [2, 2, 2])]);
    // 310: centre y = 100 - 8/2 = 96 so the swatch (centre 95.5) is on its line;
    // 3799: height 20, centre 110; the swatch centred at 110.5 is on its line.
    const out = read(p);
    expect(out.map(e => [e.threadCode, e.swatchRgb])).toEqual([['310', [1, 1, 1]], ['3799', [2, 2, 2]]]);
  });

  it('is empty for a page with no text, or no text items at all', () => {
    expect(read(page([]))).toEqual([]);
    expect(read({ pageIndex: 1, vectorPaths: [rect(80, 91, 9, 9, [1, 1, 1])] })).toEqual([]);
    expect(read(page([text('   ', 10, 10)]))).toEqual([]);
  });

  it('needs a swatch, a symbol or a backstitch sample beside the code', () => {
    expect(read(page([text('310', 100, 100)]))).toEqual([]);
    expect(codes(page([text('310', 100, 100)], [rect(80, 91, 9, 9, [1, 1, 1])]))).toEqual(['310']);
    expect(codes(page([text('310', 100, 100), text('x', 80, 100)]))).toEqual(['310']);
  });

  it('keeps a repeated code as a second entry: removing duplicates is parseLegend\'s job', () => {
    const p = page([text('310', 100, 100), text('310', 100, 130)], [rect(80, 91, 9, 9, [1, 1, 1]), rect(80, 121, 9, 9, [1, 1, 1])]);
    expect(codes(p)).toEqual(['310', '310']);
  });
});

describe('parseKeyEntries: the excluded region', () => {
  const p = page([text('310', 100, 100), text('3799', 100, 140)], [rect(80, 91, 9, 9, [1, 1, 1]), rect(80, 131, 9, 9, [2, 2, 2])]);

  it('ignores text whose centre line is inside the box, edges included', () => {
    // 310 sits at x 100, centre y 96.
    expect(codes(p, { x0: 100, y0: 96, x1: 100, y1: 96 })).toEqual(['3799']);
    expect(codes(p, { x0: 100.01, y0: 90, x1: 200, y1: 100 })).toEqual(['310', '3799']);
    // a box that holds the swatches (centred near x 84.5) but not the codes leaves codes with nothing beside them
    expect(codes(p, { x0: 0, y0: 0, x1: 99.99, y1: 200 })).toEqual([]);
    expect(codes(p, { x0: 0, y0: 0, x1: 99.99, y1: 90 })).toEqual(['310', '3799']);
  });

  it('judges a swatch by its centre, and a picture by its centre', () => {
    // swatch of 310 centres at (84.5, 95.5); excluding it leaves the code with no swatch and no symbol.
    expect(codes(p, { x0: 84, y0: 95, x1: 85, y1: 96 })).toEqual(['3799']);
    const withPic = page([text('310', 100, 100)], [], [pic('pic:1', 80, 91, 90, 101)]);
    expect(codes(withPic)).toEqual(['310']);
    expect(codes(withPic, { x0: 84, y0: 95, x1: 86, y1: 97 })).toEqual([]);
  });

  it('treats a missing region as no region', () => {
    expect(codes(p, null)).toEqual(['310', '3799']);
    expect(codes(p, undefined)).toEqual(['310', '3799']);
  });
});

describe('parseKeyEntries: choosing the swatch', () => {
  it('takes a square swatch, fill colours rounded and copied', () => {
    const fill = new Float32Array([4.6, 5.4, 6.5]);
    const out = read(page([text('310', 100, 100)], [rect(80, 91, 9, 9, fill)]));
    expect(out[0].swatchRgb).toEqual([5, 5, 7]);
    expect(Array.isArray(out[0].swatchRgb)).toBe(true);
    expect(out[0].swatchRgb).not.toBe(fill);
  });

  it('shares the swatch colour array with no other entry', () => {
    const p = page([text('310', 100, 100), text('3799', 100, 130)], [rect(80, 91, 9, 9, [1, 1, 1]), rect(80, 121, 9, 9, [1, 1, 1])]);
    const [a, b] = read(p);
    expect(a.swatchRgb).toEqual(b.swatchRgb);
    expect(a.swatchRgb).not.toBe(b.swatchRgb);
  });

  it('rejects shapes that cannot be swatches', () => {
    const tooSmall = rect(80, 91, 2.9, 9, [1, 1, 1]);
    const tooTall = rect(80, 80, 9, 31, [1, 1, 1]);
    const tooNarrow = rect(80, 85, 4, 10, [1, 1, 1]); // taller than 2.2 x its width
    const threePoints = { type: 'path', fillColor: [1, 1, 1], points: [{ x: 80, y: 91 }, { x: 89, y: 91 }, { x: 89, y: 100 }] };
    const noFill = { type: 'rect', points: [{ x: 80, y: 91 }, { x: 89, y: 91 }, { x: 89, y: 100 }, { x: 80, y: 100 }] };
    const onePoint = { type: 'path', fillColor: [1, 1, 1], points: [{ x: 80, y: 91 }] };
    for (const bad of [tooSmall, tooTall, tooNarrow, threePoints, noFill, onePoint]) {
      expect(read(page([text('310', 100, 100)], [bad]))).toEqual([]);
    }
  });

  it('accepts a wide cell-fill swatch only when it ends before the code and is not past 160 wide', () => {
    const wide = (w) => rect(10, 91, w, 9, [9, 9, 9]);
    expect(read(page([text('310', 130, 100)], [wide(100)]))[0].swatchRgb).toEqual([9, 9, 9]);
    expect(read(page([text('310', 130, 100)], [wide(161)]))).toEqual([]);
    expect(read(page([text('310', 100, 100)], [wide(100)]))).toEqual([]); // runs across the code: row striping
  });

  it('takes a thin wide filled bar for a backstitch sample, not a swatch', () => {
    const bar = { type: 'rect', fillColor: [20, 30, 40], points: [{ x: 60, y: 96 }, { x: 90, y: 96 }, { x: 90, y: 99 }, { x: 60, y: 99 }] };
    expect(read(page([text('5310', 110, 100)], [bar]))).toEqual([expect.objectContaining({ kind: 'backstitch', lineRgb: [20, 30, 40], swatchRgb: null })]);
  });

  it('takes a bar up to 4 high for a sample, and a taller one that ends before the code for a swatch', () => {
    const bar = (h) => ({ type: 'rect', fillColor: [20, 30, 40], points: [{ x: 60, y: 96 }, { x: 90, y: 96 }, { x: 90, y: 96 + h }, { x: 60, y: 96 + h }] });
    expect(read(page([text('5310', 110, 100)], [bar(4)]))[0]).toEqual(expect.objectContaining({ kind: 'backstitch', lineRgb: [20, 30, 40], swatchRgb: null }));
    expect(read(page([text('5310', 110, 100)], [bar(4.5)]))[0]).toEqual(expect.objectContaining({ kind: 'cross', swatchRgb: [20, 30, 40], lineRgb: null }));
  });

  it('prefers the swatch whose right edge is nearest the code, then the larger one on a tie within half a point', () => {
    const near = rect(88, 91, 9, 9, [1, 1, 1]);   // right edge 97
    const far = rect(60, 91, 9, 9, [2, 2, 2]);    // right edge 69
    expect(read(page([text('310', 100, 100)], [far, near]))[0].swatchRgb).toEqual([1, 1, 1]);
    const small = rect(88.2, 91, 8.8, 8, [3, 3, 3]); // right edge 97.0
    const big = rect(88, 90, 9, 10, [4, 4, 4]);      // right edge 97.0, larger
    expect(read(page([text('310', 100, 100)], [small, big]))[0].swatchRgb).toEqual([4, 4, 4]);
    expect(read(page([text('310', 100, 100)], [big, small]))[0].swatchRgb).toEqual([4, 4, 4]);
  });

  it('limits the reach to 80 points, to the same line, and to swatches left of the code', () => {
    expect(codes(page([text('310', 200, 100)], [rect(100, 91, 9, 9, [1, 1, 1])]))).toEqual([]);          // 91 away
    expect(codes(page([text('310', 189, 100)], [rect(100, 91, 9, 9, [1, 1, 1])]))).toEqual(['310']);     // 80 away
    expect(codes(page([text('310', 100, 100)], [rect(80, 111, 9, 9, [1, 1, 1])]))).toEqual([]);          // another line
    expect(codes(page([text('310', 100, 100)], [rect(102, 91, 9, 9, [1, 1, 1])]))).toEqual([]);          // right of the code
    expect(codes(page([text('310', 100, 100)], [rect(91.5, 91, 9, 9, [1, 1, 1])]))).toEqual(['310']);    // within 1pt overlap
  });

  it('never reaches past the previous code on the same line', () => {
    const p = page([text('310', 40, 100), text('3799', 130, 100)], [rect(20, 91, 9, 9, [1, 1, 1])]);
    // the only swatch is left of 310; 3799 must not borrow it
    expect(read(p).map(e => [e.threadCode, e.swatchRgb])).toEqual([['310', [1, 1, 1]]]);
  });
});

describe('parseKeyEntries: choosing the symbol', () => {
  it('uses a glyph drawn inside the swatch, else the nearest to the left within 90 points', () => {
    const sw = rect(80, 91, 9, 9, [1, 1, 1]);
    const inside = read(page([text('310', 100, 100), text('A', 82, 99), text('Z', 70, 100)], [sw]));
    expect(inside[0].symbol).toBe('A');
    const beside = read(page([text('310', 100, 100), text('Z', 70, 100), text('Q', 50, 100)], [sw]));
    expect(beside[0].symbol).toBe('Z');
    expect(read(page([text('310', 200, 100), text('Z', 100, 100)]))).toEqual([]);                    // 100 away
    expect(read(page([text('310', 190, 100), text('Z', 100, 100)]))[0].symbol).toBe('Z');            // 90 away
  });

  it('reads U+ placeholders as symbols and ignores multi-character text', () => {
    const out = read(page([text('310', 100, 100), text('U+E001', 70, 100), text('ab', 80, 100)]));
    expect(out[0].symbol).toBe('U+E001');
  });

  it('reports the symbol font, "Unknown" when the text has none, and "" for a picture', () => {
    const withFont = read(page([text('310', 100, 100), text('A', 70, 100, { fontName: 'g_d0_f4' })]))[0];
    expect(withFont.symbolFontName).toBe('g_d0_f4');
    const noFont = read(page([text('310', 100, 100), { str: 'A', x: 70, y: 100, height: 8, width: 6 }]))[0];
    expect(noFont.symbolFontName).toBe('Unknown');
    const picture = read(page([text('310', 100, 100)], [], [pic('pic:abc', 70, 92, 80, 102), { x0: 60, y0: 92, x1: 66, y1: 102 }]))[0];
    expect(picture.symbol).toBe('pic:abc');
    expect(picture.symbolFontName).toBe('');
    expect(read(page([text('310', 100, 100), text('A', 90, 100)]))[0].symbolFontName).toBe('f1');
  });

  it('has symbol and font null when there is none', () => {
    const e = read(page([text('310', 100, 100)], [rect(80, 91, 9, 9, [1, 1, 1])]))[0];
    expect([e.symbol, e.symbolFontName]).toEqual([null, null]);
  });

  it('keeps a symbol printed beside the swatch as well as the swatch', () => {
    const e = read(page([text('310', 130, 100), text('K', 60, 100)], [rect(80, 91, 9, 9, [1, 1, 1])]))[0];
    expect([e.symbol, e.swatchRgb]).toEqual(['K', [1, 1, 1]]);
  });

  it('picks the right-most of the glyphs and pictures to the left, pictures counting as glyphs', () => {
    const e = read(page([text('310', 130, 100), text('A', 40, 100)], [], [pic('pic:a', 90, 92, 100, 102), pic('pic:b', 60, 92, 70, 102)]))[0];
    expect(e.symbol).toBe('pic:a');
  });
});

describe('parseKeyEntries: backstitch samples', () => {
  it('reads a stroked sample only when the code has neither swatch nor symbol', () => {
    const line = stroke(70, 100, 96, [10, 20, 30]);
    expect(read(page([text('310', 120, 100)], [line]))).toEqual([expect.objectContaining({ kind: 'backstitch', lineRgb: [10, 20, 30], swatchRgb: null, symbol: null })]);
    const withSwatch = read(page([text('310', 120, 100)], [line, rect(100, 91, 9, 9, [1, 1, 1])]));
    expect(withSwatch[0]).toEqual(expect.objectContaining({ kind: 'cross', lineRgb: null, swatchRgb: [1, 1, 1] }));
  });

  it('limits the sample to 40 points left of the code, past the previous code, on the same line', () => {
    expect(codes(page([text('310', 150, 100)], [stroke(70, 100, 96, [1, 1, 1])]))).toEqual([]);          // 50 away
    expect(codes(page([text('310', 140, 100)], [stroke(70, 100, 96, [1, 1, 1])]))).toEqual(['310']);     // 40 away
    expect(codes(page([text('310', 120, 100)], [stroke(70, 100, 120, [1, 1, 1])]))).toEqual([]);         // other line
    expect(codes(page([text('310', 140.5, 100)], [stroke(70, 100, 96, [1, 1, 1])]))).toEqual([]);       // 40.5 away
  });

  it('rejects strokes that are not a short horizontal sample', () => {
    const tilted = { type: 'line', stroked: true, strokeColor: [1, 1, 1], points: [{ x: 70, y: 90 }, { x: 100, y: 96 }] };
    const tooShort = stroke(70, 77, 96, [1, 1, 1]);
    const tooLong = stroke(10, 100, 96, [1, 1, 1]);
    const threePts = { type: 'line', stroked: true, strokeColor: [1, 1, 1], points: [{ x: 70, y: 96 }, { x: 80, y: 96 }, { x: 90, y: 96 }] };
    for (const bad of [tilted, tooShort, tooLong, threePts]) expect(read(page([text('310', 120, 100)], [bad]))).toEqual([]);
  });
});

describe('parseKeyEntries: name, count and strands', () => {
  const sw = (x, y) => rect(x, y - 9, 9, 9, [1, 1, 1]);

  it('takes the first descriptive text to the right as the name, skipping quantities and codes', () => {
    const p = page([text('310', 100, 100), text('x2', 130, 100), text('(120 ct)', 150, 100), text('Black', 190, 100), text('Other', 230, 100)], [sw(80, 100)]);
    expect(read(p)[0]).toEqual(expect.objectContaining({ colorName: 'Black', stitchCount: 120, strands: null }));
  });

  it('reads counts in "(n ct)", "n sts" and "n stitches" forms with separators removed, first one wins', () => {
    const forms = ['(1,234 ct)', '56 sts.', '78 stitches', '9 pts'];
    const want = [1234, 56, 78, 9];
    forms.forEach((f, i) => {
      expect(read(page([text('310', 100, 100), text(f, 140, 100), text('(5 ct)', 200, 100)], [sw(80, 100)]))[0].stitchCount).toBe(want[i]);
    });
  });

  it('reads strands from "[n]" after the code, or before it when none follows', () => {
    expect(read(page([text('310', 100, 100), text('[3]', 130, 100)], [sw(80, 100)]))[0].strands).toBe(3);
    expect(read(page([text('[2]', 78, 100), text('310', 100, 100)], [sw(60, 100)]))[0].strands).toBe(2);
    expect(read(page([text('[2]', 30, 100), text('310', 100, 100)], [sw(60, 100)]))[0].strands).toBeNull();
  });

  it('keeps text between two entries on a line to the entry on its left', () => {
    const p = page([text('310', 100, 100), text('Black', 130, 100), text('3799', 300, 100), text('Grey', 330, 100)],
      [sw(80, 100), sw(280, 100)]);
    expect(read(p).map(e => [e.threadCode, e.colorName])).toEqual([['310', 'Black'], ['3799', 'Grey']]);
  });

  it('reads table values by the heading column they sit under', () => {
    const p = page([
      text('Number', 100, 30), text('Strands', 180, 30), text('Length', 240, 30), text('Stitches', 320, 30), text('Name', 400, 30),
      text('310', 100, 50), text('2', 182, 50), text('0.2 Skeins', 245, 50), text('947', 322, 50), text('Black', 402, 50),
    ], [sw(80, 50)]);
    expect(read(p)[0]).toEqual(expect.objectContaining({ strands: 2, stitchCount: 947, colorName: 'Black' }));
  });

  it('without headings, a bare number is neither a count, strands nor a name (a 2 to 4 digit one reads as a code)', () => {
    const p = page([text('310', 100, 100), text('2', 182, 100), text('947', 322, 100)], [sw(80, 100)]);
    expect(read(p)[0]).toEqual(expect.objectContaining({ strands: null, stitchCount: null, colorName: null }));
  });
});

describe('parseKeyEntries: ownership and repeatability', () => {
  const make = () => page([text('310', 100, 100), text('Black', 130, 100), text('A', 82, 99), text('3799', 300, 100), text('B', 270, 100)],
    [rect(80, 91, 9, 9, [1, 1, 1]), stroke(250, 290, 96, [9, 9, 9])], [pic('pic:x', 10, 10, 20, 20)]);

  it('does not write to the page, and returns the same answer every time', () => {
    const p = make();
    const before = JSON.stringify(p);
    const first = read(p);
    expect(JSON.stringify(p)).toBe(before);
    expect(JSON.stringify(read(p))).toBe(JSON.stringify(first));
    expect(first).toHaveLength(2);
  });

  it('returns new entry objects and arrays each call, not page objects', () => {
    const p = make();
    const a = read(p), b = read(p);
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
    expect(a[0].swatchRgb).not.toBe(b[0].swatchRgb);
    for (const e of a) for (const v of Object.values(e)) if (v && typeof v === 'object') expect(p.vectorPaths.some(vp => vp.fillColor === v || vp.strokeColor === v)).toBe(false);
  });

  it('gives every entry the same fields in the same order', () => {
    for (const e of read(make())) {
      expect(Object.keys(e)).toEqual(['kind', 'symbol', 'symbolFontName', 'threadCode', 'colorName', 'stitchCount', 'strands', 'swatchRgb', 'lineRgb']);
    }
  });
});

describe('parseLegend: pooling the readings', () => {
  const key = (rows, x0) => {
    const t = [], v = [];
    rows.forEach((r, i) => {
      const y = 100 + i * 14;
      v.push(rect(x0, y - 9, 9, 9, r.rgb));
      t.push(text(r.code, x0 + 20, y));
      t.push(text('(' + r.count + ' ct)', x0 + 50, y));
    });
    return page(t, v);
  };
  const A = key([{ code: '310', count: 10, rgb: [1, 1, 1] }, { code: '3799', count: 20, rgb: [2, 2, 2] }], 60);
  const B = key([{ code: '797', count: 30, rgb: [3, 3, 3] }, { code: '310', count: 10, rgb: [1, 1, 1] }], 60);

  it('lists entries page by page, brand DMC, and drops an identical repeat', () => {
    const legend = imp.parseLegend([A, B], []);
    expect(legend.brand).toBe('DMC');
    expect(legend.entries.map(e => e.threadCode)).toEqual(['310', '3799', '797']);
  });

  it('keeps a repeated code when its swatch differs, drops it when only the case of the code differs', () => {
    const C = key([{ code: '310', count: 10, rgb: [9, 9, 9] }, { code: '797', count: 30, rgb: [3, 3, 3] }], 60);
    expect(imp.parseLegend([A, C], []).entries.map(e => [e.threadCode, e.swatchRgb])).toEqual(
      [['310', [1, 1, 1]], ['3799', [2, 2, 2]], ['310', [9, 9, 9]], ['797', [3, 3, 3]]]);
    const upper = key([{ code: 'E334', count: 1, rgb: [5, 5, 5] }, { code: '797', count: 1, rgb: [3, 3, 3] }], 60);
    const lower = key([{ code: 'e334', count: 1, rgb: [5, 5, 5] }, { code: '797', count: 1, rgb: [3, 3, 3] }], 60);
    expect(imp.parseLegend([upper, lower], []).entries.map(e => e.threadCode)).toEqual(['E334', '797']);
  });

  it('drops a one-entry page as noise once another page has a real key, but keeps it when it is the only key', () => {
    const lone = key([{ code: '797', count: 30, rgb: [3, 3, 3] }], 60);
    expect(imp.parseLegend([A, lone], []).entries.map(e => e.threadCode)).toEqual(['310', '3799']);
    expect(imp.parseLegend([lone], []).entries.map(e => e.threadCode)).toEqual(['797']);
  });

  it('is empty and DMC for no pages', () => {
    expect(imp.parseLegend([], [])).toEqual({ entries: [], brand: 'DMC' });
    expect(imp.parseLegend(undefined, undefined)).toEqual({ entries: [], brand: 'DMC' });
  });

  it('reads a key printed on the chart page with the chart masked out', () => {
    const cell = 10, ox = 200, oy = 200, cols = 4, rows = 4;
    const paths = [];
    for (let c = 0; c <= cols; c++) paths.push({ type: 'line', stroked: true, strokeColor: [0, 0, 0], lineWidth: 0.2, points: [{ x: ox + c * cell, y: oy }, { x: ox + c * cell, y: oy + rows * cell }] });
    for (let r = 0; r <= rows; r++) paths.push({ type: 'line', stroked: true, strokeColor: [0, 0, 0], lineWidth: 0.2, points: [{ x: ox, y: oy + r * cell }, { x: ox + cols * cell, y: oy + r * cell }] });
    const keyRows = key([{ code: '310', count: 10, rgb: [1, 1, 1] }, { code: '3799', count: 20, rgb: [2, 2, 2] }], 60);
    // a ruler-like number with a filled square beside it, inside the grid's margin: it looks like a key line
    const decoy = [text('666', 222, 215)];
    const chartPage = page(keyRows.textItems.concat(decoy), keyRows.vectorPaths.concat(paths, [rect(205, 206, 9, 9, [7, 7, 7])]));
    expect(codes(chartPage)).toContain('666');
    expect(imp.parseLegend([], [chartPage]).entries.map(e => e.threadCode)).toEqual(['310', '3799']);
  });
});
