'use strict';
// Summarises one or more bench-node.cjs result files (separate fresh processes).
// For every case it prints, per process, the median draw time of each
// revision and the head/base ratio, then the range of those ratios. A ratio
// range that straddles 1.00 across processes is noise, not a change; compare
// an A/A file (base against itself) to see how wide that noise is here.
//
//   node reports/cleanup-15/summarise-bench.cjs bench-ab-1.json bench-ab-2.json ...
const fs = require('fs');
const files = process.argv.slice(2);
if (!files.length) { console.error('usage: summarise-bench.cjs <bench.json>...'); process.exit(2); }
const runs = files.map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
const med = a => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const rows = [];
runs[0].cases.forEach((c, i) => {
  const per = runs.map(r => r.cases[i]);
  const ratios = per.map(p => p.head.medianMs / p.base.medianMs);
  const alloc = per.map(p => p.head.medianAllocKiB - p.base.medianAllocKiB);
  const allocPct = per.map(p => 100 * (p.head.medianAllocKiB - p.base.medianAllocKiB) / p.base.medianAllocKiB);
  rows.push({ case: c.case, pipeline: c.pipeline, ctx: c.ctx,
    baseMs: per.map(p => +p.base.medianMs.toFixed(2)), headMs: per.map(p => +p.head.medianMs.toFixed(2)),
    ratioMin: Math.min(...ratios), ratioMax: Math.max(...ratios), ratioMedian: med(ratios),
    baseAllocKiB: Math.round(med(per.map(p => p.base.medianAllocKiB))), headAllocKiB: Math.round(med(per.map(p => p.head.medianAllocKiB))),
    allocDeltaKiB: Math.round(med(alloc)), allocDeltaPct: +med(allocPct).toFixed(2) });
});
console.log(['case', 'pipe', 'ctx', 'base ms (per process)', 'head ms (per process)', 'head/base min..max (median)', 'alloc KiB base -> head (delta, %)'].join(' | '));
for (const r of rows) console.log([r.case, r.pipeline, r.ctx, r.baseMs.join(' / '), r.headMs.join(' / '),
  `${r.ratioMin.toFixed(3)}..${r.ratioMax.toFixed(3)} (${r.ratioMedian.toFixed(3)})`,
  `${r.baseAllocKiB} -> ${r.headAllocKiB} (${r.allocDeltaKiB}, ${r.allocDeltaPct}%)`].join(' | '));
