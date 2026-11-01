/* panProbes.js — counters for the chart's paint paths while panning and
   zooming (reports/track-pan-performance-audit.md).
   ═══════════════════════════════════════════════════════════════════════════
   Counts, not times, like perfProbes.js:

     paints        drawStitch calls: each starts by filling the whole chart
                   rect, a fillRect at 0,0 larger than any tile, so they can
                   be told apart from every other fill. A full tile repaint,
                   a strip after a tile move and a one-stitch repaint are one
                   each.
     chartCopies   the chart canvas drawn onto itself: a tile move that kept
                   its pixels (shiftChartTile)
     overlayCopies the same for the overlay canvases (shiftChartOverlays)
     strokes       ctx.stroke calls: lines, mostly the mixed-stitch objects
     saves         full project saves started (the save badge going to Saving)

   Plus helpers to load a fixture with project fields changed, and to read
   the zoom and the stitch under a point. */
const fs = require('fs');

async function installPanProbes(page) {
  await page.addInitScript(() => {
    const C = window.__pan = { paints: 0, chartCopies: 0, overlayCopies: 0, strokes: 0, saves: 0 };
    const P = CanvasRenderingContext2D.prototype;
    const st = P.stroke;
    P.stroke = function () { C.strokes++; return st.apply(this, arguments); };
    // Full saves of the project: the save badge going to "Saving".
    const watch = () => {
      const b = document.querySelector('.tb-proj-badge-saved');
      if (!b) return setTimeout(watch, 200);
      new MutationObserver(() => { if (/tb-proj-badge-saved--saving/.test(b.className)) { if (!C.__saving) C.saves++; C.__saving = true; } else C.__saving = false; })
        .observe(b, { attributes: true, attributeFilter: ['class'] });
    };
    document.addEventListener('DOMContentLoaded', watch);
    const fr = P.fillRect;
    P.fillRect = function (x, y, w, h) {
      if (x === 0 && y === 0 && w > 1000 && h > 1000) C.paints++;
      return fr.apply(this, arguments);
    };
    const di = P.drawImage;
    P.drawImage = function (src) {
      if (src === this.canvas) {
        if (this.canvas.style.zIndex === '2') C.chartCopies++; else C.overlayCopies++;
      }
      return di.apply(this, arguments);
    };
  });
}

const resetPanProbes = (page) => page.evaluate(() => { const C = window.__pan; C.paints = 0; C.chartCopies = 0; C.overlayCopies = 0; C.strokes = 0; C.saves = 0; });
const readPanProbes = (page) => page.evaluate(() => Object.assign({}, window.__pan));

/** A fixture file's project with `fields` merged in, as setInputFiles input. */
function fixtureWith(file, fields) {
  const project = JSON.parse(fs.readFileSync(file, 'utf8'));
  Object.assign(project, fields);
  return { name: 'pan-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) };
}

/** The zoom the tracker reports, in percent, from its screen-reader summary. */
const zoomPercent = (page) => page.evaluate(() => {
  const m = /(\d+)% zoom/.exec((document.getElementById('tracker-chart-summary') || {}).textContent || '');
  return m ? +m[1] : null;
});

/** The stitch (fractional, in cells) under client point x, y, from the chart
 *  canvas's box on screen and its tile origin. */
const cellAt = (page, x, y) => page.evaluate(([px, py]) => {
  const cv = document.querySelector('.tracker-chart-layer canvas');
  const layer = document.querySelector('.tracker-chart-layer');
  const sW = +/(\d+) columns/.exec(document.getElementById('tracker-chart-summary').textContent)[1];
  const scs = (parseFloat(layer.style.width) - 2) / sW;
  const r = cv.getBoundingClientRect(), k = r.width / parseFloat(cv.style.width);
  return { cx: (px - r.left) / k / scs + parseFloat(cv.style.left) / scs, cy: (py - r.top) / k / scs + parseFloat(cv.style.top) / scs };
}, [x, y]);

/** Scroll the chart by dx, dy per animation frame for `frames` frames, as a
 *  drag or a fling would, inside the page. */
const scrollFrames = (page, dx, dy, frames) => page.evaluate(([dx, dy, n]) => new Promise((done) => {
  const sc = document.querySelector('.tracker-chart-scroll');
  let i = 0;
  (function step() {
    if (i++ >= n) { requestAnimationFrame(() => done([sc.scrollLeft, sc.scrollTop])); return; }
    sc.scrollLeft += dx; sc.scrollTop += dy;
    requestAnimationFrame(step);
  })();
}), [dx, dy, frames]);

module.exports = { installPanProbes, resetPanProbes, readPanProbes, fixtureWith, zoomPercent, cellAt, scrollFrames };
