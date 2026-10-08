/* Partial chart repaints draw exactly what a full repaint would.

   The single-cell fast path used to be a hand-copied subset of drawStitch: it
   cleared the cell and redrew only the stitch, so marking a stitch cut a gap
   in the guide crosshair, the centre and 5/10 grid lines, any backstitch and
   park marker through it, and the row-mode tint, until the next full repaint.
   It now runs drawStitch itself, clipped to the cells being repainted.

   The guide and park markers are repainted the same way where they change,
   instead of forcing a full renderStitch on every placement. */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');

function body(startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  const e = src.indexOf(endMarker, s + 1);
  expect(s).toBeGreaterThan(-1);
  expect(e).toBeGreaterThan(s);
  return src.slice(s, e);
}

describe('repaintChartCells', () => {
  const fn = () => body('function repaintChartCells(', '\n}\n');

  test('clips to the cells plus their overhang', () => {
    // Park-marker and cell outlines overhang a cell edge by up to a pixel.
    expect(fn()).toMatch(/const sp=2;\s*ctx\.beginPath\(\);ctx\.rect\(left-sp,top-sp,right-left\+2\*sp,bottom-top\+2\*sp\);ctx\.clip\(\);/);
  });

  test('runs drawStitch one cell wider than the clip, so overlaps paint in full-paint order', () => {
    expect(fn()).toMatch(/const m=scs;\s*drawStitch\(ctx,scs,\{left:left-m,top:top-m,right:right\+m,bottom:bottom\+m,width:right-left\+2\*m,height:bottom-top\+2\*m,overdraw:0\},isDoneAt\);\s*ctx\.restore\(\);/);
  });

  test('anchors the centre-line dashes to the chart origin', () => {
    expect(src).toMatch(/ctx\.setLineDash\(\[6,4\]\);ctx\.lineDashOffset=startY\*cSz;/);
    expect(src).toMatch(/ctx\.lineDashOffset=startX\*cSz;/);
  });

  test('only paints the part on the current tile', () => {
    expect(fn()).toMatch(/const r=tileCellRange\(t,scs\);/);
  });

  test('restores the tile transform, including the render scale', () => {
    expect(fn()).toMatch(/ctx\.setTransform\(s,0,0,s,-t\.x\*s,-t\.y\*s\);/);
  });
});

describe('drawStitch', () => {
  test('takes a done override so a toggle can paint before setDone commits', () => {
    expect(src).toMatch(/function drawStitch\(ctx,cSz,viewportRect,isDoneAt\)\{/);
    expect(src).toMatch(/let isDn=isDoneAt\?isDoneAt\(idx\):\(done&&done\[idx\]\);/);
  });

  test('reads the guide and park markers through refs', () => {
    expect(src).toMatch(/const hlRow=guideRef\.current\.row,hlCol=guideRef\.current\.col;/);
    expect(src).toMatch(/const parkMarkers=parkMarkersRef\.current,parkLayers=parkLayersRef\.current;/);
    expect(src).toMatch(/guideRef\.current=\{row:hlRow,col:hlCol\};/);
  });

  test('culls backstitch lines outside the painted cells', () => {
    expect(src).toMatch(/if\(Math\.max\(ln\.x1,ln\.x2\)<startX\|\|Math\.min\(ln\.x1,ln\.x2\)>endX\|\|Math\.max\(ln\.y1,ln\.y2\)<startY\|\|Math\.min\(ln\.y1,ln\.y2\)>endY\)return;/);
  });
});

describe('incremental guide and park repaints', () => {
  const deps = () => {
    const m = src.match(/\n\},\[pat,cmap,scs,sW,sH,showCtr,bsLines,done,[^\]]*\]\);/);
    expect(m).not.toBeNull();
    return m[0];
  };

  test('renderStitch no longer depends on the guide or park markers', () => {
    const d = deps();
    for (const name of ['hlRow', 'hlCol', 'parkMarkers', 'parkLayers']) {
      expect(d).not.toMatch(new RegExp('[,\\[]' + name + '[,\\]]'));
    }
  });

  test('moving the guide repaints the old and new row and column', () => {
    const b = body('const prevGuidePaintRef=useRef(null);', '},[hlRow,hlCol]);');
    expect(b).toMatch(/const strips=\[prev,\{row:hlRow,col:hlCol\}\];/);
    expect(b).toMatch(/repaintChartCells\(0,g\.row,sW,g\.row\+1\);/);
    expect(b).toMatch(/repaintChartCells\(g\.col,0,g\.col\+1,sH\);/);
  });

  test('a park change repaints only the cells whose markers differ', () => {
    const b = body('const prevParkPaintRef=useRef(null);', '},[parkMarkers,parkLayers]);');
    expect(b).toMatch(/if\(a\.get\(k\)!==b\.get\(k\)\)/);
    expect(b).toMatch(/repaintChartCells\(x,y,x\+1,y\+1\)/);
  });

  test('memoised callers paint through a ref to the current painter', () => {
    expect(src).toMatch(/paintDoneChangesRef\.current=paintDoneChanges;/);
  });
});

describe('paintDoneChanges — toggled stitches', () => {
  const fn = () => body('function paintDoneChanges(', '\n}\n');

  test('repaints with the new done array for every cell, not just the toggled one', () => {
    // Each cell repaint also paints the overhang into its neighbours, so the
    // neighbours must be drawn in their new state too.
    expect(fn()).toMatch(/const isDoneAt=i=>!!nd\[i\];/);
  });

  test('a big batch becomes one tile repaint instead of many clipped ones', () => {
    expect(fn()).toMatch(/if\(on\.length>Math\.max\(64,tileCells\/8\)\)\{repaintChartCells\(r\.x0,r\.y0,r\.x1,r\.y1,isDoneAt\);return;\}/);
  });

  test('every caller hands over its new done array', () => {
    expect(src).not.toMatch(/drawCellDirectly/);
    expect(src).toMatch(/;paintDoneChanges\(changes,nd\);skipNextFullRedrawRef\.current=true;\}/); // markColourDone
    expect((src.match(/  paintDoneChanges\(last,nd\);\n/g) || []).length).toBe(2);            // undo + redo
    expect(src).toMatch(/  paintDoneChangesRef\.current\(changes,nd\);/);                        // drag / range
    expect(src).toMatch(/  paintDoneChangesRef\.current\(\[\{idx:idx\}\],nd\);/);                // single tap
  });
});
