/**
 * Size by finished dimensions, fitted to the picture (P2-6, audit IMG-03).
 */
const calc = require('../pattern-size-calc.js');
const { loadSource } = require('./_helpers/loadSource');

describe('starting size for a new picture', () => {
  test.each([
    [400, 400, 100, 100],
    [24, 24, 24, 24],
    [2400, 300, 100, 13],
    [6000, 4000, 100, 67],
    [300, 2400, 13, 100],
    [5, 5, 10, 10],
    // Under 10 px: scaled up evenly to the 10-stitch minimum, keeping its shape.
    [5, 20, 10, 40],
  ])('%i x %i px starts at %i x %i stitches', (w, h, sw, sh) => {
    expect(calc.initialPatternSize(w, h)).toEqual({ w: sw, h: sh });
  });

  test('handleFile uses it for both upload paths', () => {
    const io = loadSource('creator/useProjectIO.js');
    expect(io).toMatch(/var size = creatorInitialSize\(targetW, targetH\); state\.setSW\(size\.w\); state\.setSH\(size\.h\);/);
    expect(io).toMatch(/var size2 = creatorInitialSize\(i\.width, i\.height\); state\.setSW\(size2\.w\); state\.setSH\(size2\.h\);/);
    expect(io).not.toMatch(/setSW\(80\)/);
    // The Pixel art preset is applied afterwards, so it wins.
    expect(io).toMatch(/state\.setSH\(size2\.h\);[\s\S]{0,200}examinePicture\(i\);/);
  });
});

describe('finished size', () => {
  test('18 cm at 14-count is 99 stitches', () => {
    expect(calc.stitchesForLength(18, 'cm', 14, 1)).toBe(99);
    expect(calc.stitchesForLength(5, 'in', 14, 1)).toBe(70);
    // 28-count evenweave over two stitches like 14-count Aida.
    expect(calc.stitchesForLength(18, 'cm', 28, 2)).toBe(99);
    expect(calc.stitchesForLength(0, 'cm', 14, 1)).toBe(0);
  });

  test('length for stitches is its inverse', () => {
    expect(calc.lengthForStitches(99, 'cm', 14, 1)).toBeCloseTo(17.96, 2);
    expect(calc.lengthForStitches(70, 'in', 14, 1)).toBe(5);
  });

  test('a frame is turned to match the picture and the picture fitted inside', () => {
    // Card 5 x 7 in at 14-count: 70 x 98 stitches at most.
    expect(calc.fitPatternToFrame(5, 7, 'in', 1, 14, 1)).toEqual({ w: 70, h: 70 });
    expect(calc.fitPatternToFrame(5, 7, 'in', 3 / 2, 14, 1)).toEqual({ w: 98, h: 65 });
    expect(calc.fitPatternToFrame(5, 7, 'in', 2 / 3, 14, 1)).toEqual({ w: 65, h: 98 });
    // Bookmark 5 x 18 cm with a tall picture.
    expect(calc.fitPatternToFrame(5, 18, 'cm', 0.25, 14, 1)).toEqual({ w: 24, h: 99 });
    // Whole stitches that fit, rounded down: never larger than the frame.
    const a4 = calc.fitPatternToFrame(21, 29.7, 'cm', 21 / 29.7, 14, 1);
    expect(a4).toEqual({ w: 115, h: 162 });
    expect(calc.lengthForStitches(a4.w, 'cm', 14, 1)).toBeLessThanOrEqual(21);
    expect(calc.lengthForStitches(a4.h, 'cm', 14, 1)).toBeLessThanOrEqual(29.7);
    // Never past 500.
    expect(calc.fitPatternToFrame(100, 100, 'cm', 1, 32, 1).w).toBe(500);
  });
});

describe('size notes', () => {
  test('a very wide picture with a thin short side suggests cropping', () => {
    expect(calc.patternSizeNotes(100, 13, 2400, 300).shortSide).toEqual({ stitches: 13, orientation: 'wide' });
    expect(calc.patternSizeNotes(13, 100, 300, 2400).shortSide).toEqual({ stitches: 13, orientation: 'tall' });
    // A small square pattern isn't "very wide".
    expect(calc.patternSizeNotes(15, 15, 400, 400).shortSide).toBeNull();
    expect(calc.patternSizeNotes(200, 25, 2400, 300).shortSide).toBeNull();
  });

  test('enlarging past the picture\'s pixels says how big each pixel becomes', () => {
    expect(calc.patternSizeNotes(72, 72, 24, 24).enlarged).toEqual({ px: 24, block: 3, axis: 'wide' });
    expect(calc.patternSizeNotes(24, 24, 24, 24).enlarged).toBeNull();
    expect(calc.patternSizeNotes(30, 30, 24, 24).enlarged.block).toBe(1);
  });
});

describe('the Size field', () => {
  const field = loadSource('creator/SizeField.js');
  function load() {
    const win = Object.assign({}, calc);
    // eslint-disable-next-line no-new-func
    new Function('window', 'React', field)(win, {});
    return win;
  }

  test('has the Bookmark, Card, 15 cm hoop and A4 frames, and Picture size', () => {
    const win = load();
    expect(win.SIZE_FIELD_FRAMES.map((f) => f.label)).toEqual(['Bookmark', 'Card', '15 cm hoop', 'A4']);
    expect(field).toMatch(/"Picture size"/);
  });

  test('a 15 cm hoop holds the largest picture that fits its circle', () => {
    const win = load();
    const hoop = win.SIZE_FIELD_FRAMES[2];
    const s = win.sizeFieldFrameSize(hoop, 1, 14);
    // 15 cm / sqrt(2) = 10.6 cm = 58 stitches each way.
    expect(s).toEqual({ w: 58, h: 58 });
    // A 2:1 picture's diagonal stays inside the 15 cm circle.
    const r = win.sizeFieldFrameSize(hoop, 2, 14);
    const diag = Math.hypot(calc.lengthForStitches(r.w, 'cm', 14, 1), calc.lengthForStitches(r.h, 'cm', 14, 1));
    expect(diag).toBeLessThanOrEqual(15);
  });

  test('Picture size is one stitch per pixel, scaled evenly to stay between 10 and 500', () => {
    const win = load();
    expect(win.sizeFieldPictureSize(24, 24)).toEqual({ w: 24, h: 24 });
    expect(win.sizeFieldPictureSize(2400, 300)).toEqual({ w: 500, h: 63 });
    expect(win.sizeFieldPictureSize(5, 20)).toEqual({ w: 10, h: 40 });
    expect(win.sizeFieldPictureSize(0, 0)).toBeNull();
  });

  test('the readout shows stitches and the finished size, and the notes use the brief\'s wording', () => {
    expect(field).toMatch(/sW \+ " (\\u00D7|×) " \+ sH \+ " stitches (\\u00B7|·) " \+ window\.finishedSizeText\(sW, sH, ct\)/);
    expect(field).toMatch(/"This picture is very " \+ notes\.shortSide\.orientation \+ "\. The short side will only be " \+/);
    expect(field).toMatch(/"Your picture is only " \+ e\.px \+ " px " \+ e\.axis/);
  });

  test('it replaces the Size slider, and chgW, chgH and slRsz still exist', () => {
    const sb = loadSource('creator/Sidebar.js');
    expect(sb).toMatch(/h\(window\.CreatorSizeField, \{/);
    expect(sb).not.toMatch(/label:"Size", value:ctx\.sW/);
    const st = loadSource('creator/useCreatorState.js');
    expect(st).toMatch(/function chgW\(v\) \{/);
    expect(st).toMatch(/function chgH\(v\) \{/);
    expect(st).toMatch(/function slRsz\(v\) \{ chgW\(v\); \}/);
    expect(st).toMatch(/Math\.max\(10, Math\.min\(500, parseInt\(v\) \|\| 10\)\)/);
    const order = loadSource('build-creator-bundle.js');
    expect(order.indexOf("'SizeField.js'")).toBeLessThan(order.indexOf("'Sidebar.js'"));
  });
});
