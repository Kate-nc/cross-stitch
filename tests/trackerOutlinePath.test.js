/**
 * outlinePathData — the marching-ants outline for the tracker's "outline"
 * highlight, now an SVG path (F1 of reports/track-view-performance-plan.md).
 *
 * The old canvas loop drew, for every cell of the focus colour, each of its
 * four edges whose neighbour was not the focus colour (or was off the chart).
 * The SVG path must cover exactly those edges — no more, no fewer — while
 * merging collinear ones into single runs.
 */
const { loadSource } = require('./_helpers/loadSource');

const trackerSrc = loadSource('tracker-app.js');
const fnSrc = trackerSrc.match(/function outlinePathData\([^)]*\)\{[\s\S]*?\n\}/);
// eslint-disable-next-line no-new-func
const outlinePathData = new Function('luminance', fnSrc[0] + '\nreturn outlinePathData;')(
  (rgb) => rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114);

const G = 28;

function grid(rows) {
  const sH = rows.length, sW = rows[0].length, pat = [];
  for (const row of rows) for (const ch of row) pat.push(ch === '.' ? { id: '__skip__' } : { id: ch, rgb: ch === 'A' ? [0, 0, 0] : [255, 255, 255] });
  return { pat, sW, sH };
}

/** Unit edges (cell units) the old per-cell canvas loop drew for range r. */
function oldEdges(pat, sW, sH, id, r) {
  const set = new Set();
  const is = (x, y) => x >= 0 && y >= 0 && x < sW && y < sH && pat[y * sW + x].id === id;
  for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
    if (!is(x, y)) continue;
    if (!is(x, y - 1)) set.add(`h${x},${y}`);
    if (!is(x, y + 1)) set.add(`h${x},${y + 1}`);
    if (!is(x - 1, y)) set.add(`v${x},${y}`);
    if (!is(x + 1, y)) set.add(`v${x + 1},${y}`);
  }
  return set;
}

/** Unit edges covered by SVG path data built at cell size cSz. */
function pathEdges(d, cSz) {
  const set = new Set();
  const re = /M(-?[\d.]+) (-?[\d.]+)([HV])(-?[\d.]+)/g;
  let m, segments = 0;
  while ((m = re.exec(d))) {
    segments++;
    const x = (+m[1] - G) / cSz, y = (+m[2] - G) / cSz, end = (+m[4] - G) / cSz;
    if (m[3] === 'H') for (let i = x; i < end; i++) set.add(`h${i},${y}`);
    else for (let i = y; i < end; i++) set.add(`v${x},${i}`);
  }
  return { set, segments };
}

const sorted = (s) => [...s].sort();

describe('outlinePathData', () => {
  test('covers exactly the edges the per-cell canvas loop drew', () => {
    const { pat, sW, sH } = grid([
      'AAB.A',
      'ABBAA',
      'AAA.B',
      'B.AAA',
    ]);
    const r = { x0: 0, y0: 0, x1: sW, y1: sH };
    const { d } = outlinePathData(pat, sW, sH, 'A', r, 10, G);
    expect(sorted(pathEdges(d, 10).set)).toEqual(sorted(oldEdges(pat, sW, sH, 'A', r)));
  });

  test('matches on random patterns and partial tile ranges', () => {
    let s = 3;
    const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let t = 0; t < 60; t++) {
      const sW = 3 + Math.floor(rnd() * 20), sH = 3 + Math.floor(rnd() * 15);
      const rows = [];
      for (let y = 0; y < sH; y++) { let row = ''; for (let x = 0; x < sW; x++) row += 'AB.'[Math.floor(rnd() * 3)]; rows.push(row); }
      const { pat } = grid(rows);
      const x0 = Math.floor(rnd() * sW), y0 = Math.floor(rnd() * sH);
      const r = { x0, y0, x1: x0 + 1 + Math.floor(rnd() * (sW - x0)), y1: y0 + 1 + Math.floor(rnd() * (sH - y0)) };
      // Restrict both to edges touching a cell inside the range: the new
      // builder may also emit a boundary on the range's outer line that
      // belongs to a cell just outside it, which the viewBox clips anyway.
      const inRange = (e) => {
        const [kind, rest] = [e[0], e.slice(1)];
        const [a, b] = rest.split(',').map(Number);
        return kind === 'h' ? a >= r.x0 && a < r.x1 && b >= r.y0 && b <= r.y1 : b >= r.y0 && b < r.y1 && a >= r.x0 && a <= r.x1;
      };
      const want = sorted(oldEdges(pat, sW, sH, 'A', r));
      const got = sorted([...pathEdges(outlinePathData(pat, sW, sH, 'A', r, 7, G).d, 7).set].filter(inRange));
      // Every edge the old loop drew is present...
      expect(want.filter(e => !got.includes(e))).toEqual([]);
      // ...and anything extra is a genuine boundary of the colour.
      const truth = oldEdges(pat, sW, sH, 'A', { x0: 0, y0: 0, x1: sW, y1: sH });
      expect(got.filter(e => !truth.has(e))).toEqual([]);
    }
  });

  test('a straight boundary is one segment, not one per stitch', () => {
    const { pat, sW, sH } = grid(['BBBBBB', 'BAAAAB', 'BBBBBB']);
    const { d } = outlinePathData(pat, sW, sH, 'A', { x0: 0, y0: 0, x1: sW, y1: sH }, 20, G);
    // A 4x1 run: top, bottom, left, right — four segments in all.
    expect(pathEdges(d, 20).segments).toBe(4);
    expect(d).toContain(`M${G + 1 * 20} ${G + 1 * 20}H${G + 5 * 20}`);
  });

  test('average luminance picks the ant colour from the focus cells only', () => {
    const { pat, sW, sH } = grid(['AB', 'BB']);
    const r = { x0: 0, y0: 0, x1: sW, y1: sH };
    expect(outlinePathData(pat, sW, sH, 'A', r, 10, G).avgLum).toBe(0);
    expect(outlinePathData(pat, sW, sH, 'Z', r, 10, G)).toEqual({ d: '', avgLum: 128 });
  });
});
