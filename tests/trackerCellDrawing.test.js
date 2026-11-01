/**
 * Per-cell drawing cost in the tracker chart (reports/track-pan-performance-audit.md,
 * "Follow-up: per-cell drawing cost").
 *
 * A full tile used to cost a fillStyle + fillRect + strokeStyle + strokeRect per
 * cell (and a font + fillText from Tier 3). Backgrounds are now one image with
 * a pixel per cell, and outlines are grid lines, one fillRect per run.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
const fnSource = (name) => {
  const start = SRC.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing ' + name);
  let depth = 0;
  for (let i = SRC.indexOf('{', start); i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}' && --depth === 0) return SRC.slice(start, i + 1);
  }
  throw new Error('unbalanced ' + name);
};
const load = (names, extra) => {
  const ctx = {};
  vm.runInNewContext((extra || '') + names.map(fnSource).join('\n') + ';this.out={' + names.join(',') + '};', ctx);
  return ctx.out;
};
const drawStitch = SRC.slice(SRC.indexOf('function drawStitch(ctx,cSz,viewportRect,isDoneAt){'), SRC.indexOf('const renderStitch=useCallback('));

describe('parseChartColour', () => {
  const { parseChartColour } = load(['parseChartColour']);
  test('reads the formats the chart colours come in', () => {
    expect(Array.from(parseChartColour('#fff'))).toEqual([255, 255, 255]);
    expect(Array.from(parseChartColour('#1B1814'))).toEqual([27, 24, 20]);
    expect(Array.from(parseChartColour('rgb(12, 34,56)'))).toEqual([12, 34, 56]);
  });
  test('anything else is null, so the caller falls back to per-cell fills', () => {
    expect(parseChartColour('rgba(0,0,0,0.5)')).toBeNull();
    expect(parseChartColour('red')).toBeNull();
    expect(parseChartColour(undefined)).toBeNull();
  });
});

describe('drawOutlineGrid', () => {
  const lineSrc = SRC.match(/const OUTLINE_LINE=\[[^\]]*\];/)[0];
  const { drawOutlineGrid } = load(['drawOutlineGrid'], lineSrc);
  const mock = () => { const calls = []; const ctx = { fillRect: (...a) => calls.push([ctx.fillStyle, ...a]), fillStyle: null }; return { ctx, calls }; };

  test('a uniform block is one line per grid line, centred on it', () => {
    const { ctx, calls } = mock();
    drawOutlineGrid(ctx, new Uint8Array(6).fill(1), 3, 2, 28, 28, 10);
    // 4 vertical + 3 horizontal lines, each spanning the block
    expect(calls.length).toBe(7);
    expect(calls[0]).toEqual(['rgba(0,0,0,0.117)', 27.5, 28, 1, 20]);
    expect(calls[6]).toEqual(['rgba(0,0,0,0.117)', 28, 47.5, 30, 1]);
  });

  test('a line takes the style of the cell after it, else the one before, and breaks where it changes', () => {
    const { ctx, calls } = mock();
    // one row: normal, dimmed, nothing
    drawOutlineGrid(ctx, Uint8Array.from([1, 2, 0]), 3, 1, 0, 0, 10);
    const vertical = calls.filter(c => c[3] === 1);
    expect(vertical.map(c => [c[0], c[1]])).toEqual([
      ['rgba(0,0,0,0.117)', -0.5], ['rgba(0,0,0,0.045)', 9.5], ['rgba(0,0,0,0.045)', 19.5],
    ]);
    const horizontal = calls.filter(c => c[4] === 1);
    expect(horizontal.map(c => [c[0], c[1], c[3]])).toEqual([
      ['rgba(0,0,0,0.117)', 0, 10], ['rgba(0,0,0,0.045)', 10, 10],
      ['rgba(0,0,0,0.117)', 0, 10], ['rgba(0,0,0,0.045)', 10, 10],
    ]);
  });

  test('the fill colour is only set when the style changes', () => {
    let sets = 0, v = null;
    const ctx = { fillRect() {} };
    Object.defineProperty(ctx, 'fillStyle', { get: () => v, set: (x) => { sets++; v = x; } });
    drawOutlineGrid(ctx, new Uint8Array(100).fill(1), 10, 10, 0, 0, 8);
    expect(sets).toBe(1);
  });
});

describe('drawStitch', () => {
  test('cell backgrounds go into one image with no smoothing, and the loop skips them', () => {
    expect(drawStitch).toMatch(/const imgPath=\(tier===1\|\|layerVis\.full\)&&endX>startX&&endY>startY&&paintCellImage\(\);/);
    expect(drawStitch).toMatch(/ctx\.save\(\);ctx\.imageSmoothingEnabled=false;\n    ctx\.drawImage\(cv,0,0,w,h,gut\+startX\*cSz,gut\+startY\*cSz,w\*cSz,h\*cSz\);/);
    expect(drawStitch).toMatch(/if\(tier===1&&!partialStitches\.has\(idx\)\)\{\n        if\(imgPath\)continue;/);
    // Every background fill in the views the image covers is guarded.
    const fills = drawStitch.match(/ctx\.fillRect\(px,py,cSz,cSz\)/g).length;
    const guarded = drawStitch.match(/if\(!imgCell\)\{ctx\.fillStyle=[^;]+;ctx\.fillRect\(px,py,cSz,cSz\);\}/g).length;
    expect(guarded).toBe(9);
    // The rest: Tier 1 without the image, unstitched cells, and the tint overlay.
    expect(fills - guarded).toBe(4);
  });

  test("the image's isolate colour is the 25% fill over the fabric, worked out", () => {
    expect(drawStitch).toMatch(/return\[0,1,2\]\.map\(i=>Math\.round\(m\.rgb\[i\]\*0\.25\+isolateBase\[i\]\*0\.75\)\);/);
    // Declared before the image is painted (it once was not, and highlight views threw).
    expect(drawStitch.indexOf('let isolateBase=null;')).toBeLessThan(drawStitch.indexOf('const imgPath='));
  });

  test('outlines are grid lines, except in row mode and at Tier 1', () => {
    expect(drawStitch).toMatch(/const outlineGrid=cSz>=4&&tier>=2&&!rowModeActive;/);
    expect(drawStitch).toMatch(/if\(olCodes\)drawOutlineGrid\(ctx,olCodes,olW,olH,gut\+startX\*cSz,gut\+startY\*cSz,cSz\);/);
    // The per-cell strokeRect survives only as addOutline's fallback.
    expect(drawStitch.match(/ctx\.strokeRect\(px,py,cSz,cSz\)/g).length).toBe(1);
    expect(drawStitch).toMatch(/if\(olCodes\)\{olCodes\[\(y-startY\)\*olW\+\(x-startX\)\]=code;return;\}\n    ctx\.strokeStyle=OUTLINE_STYLE\[code\];ctx\.strokeRect\(px,py,cSz,cSz\);/);
  });

  test('every cell symbol is drawn by drawGlyph, which sets its own font', () => {
    expect(drawStitch).not.toMatch(/fillText\(info\.symbol/);
    expect(drawStitch.match(/drawGlyph\(info\.symbol,/g).length).toBe(7);
    // Callers draw inside save/restore, which puts the font back: it must be set every time.
    expect(drawStitch).toMatch(/function drawGlyph\(sym,font,ink,cx,cy\)\{\n    ctx\.fillStyle=ink;ctx\.font=font;ctx\.fillText\(sym,cx,cy\);\n  \}/);
  });
});
