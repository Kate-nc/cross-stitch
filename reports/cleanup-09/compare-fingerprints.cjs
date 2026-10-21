/* Compares two stats-lifecycle-probe outputs after removing run-specific ids and timestamps.
 * Usage: node reports/cleanup-09/compare-fingerprints.cjs <a.json> <b.json>
 * The Creator route sometimes reads the seeded project record before and sometimes after a migration
 * wrote finishStatus/startedAt; this happens for the same script, so each run is classified ("project-mode")
 * and only runs in the same mode are compared. Exit 1 on difference, 2 when the modes differ. */
const fs = require('fs');
const [a, b] = [process.argv[2], process.argv[3]].map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
const mode = o => JSON.stringify(o.routes.creator[0].hooks.map(h => h.value)).includes('startedAt') ? 'migrated-record' : 'summary-default-record';
console.log('project-mode:', mode(a), '/', mode(b));
if (mode(a) !== mode(b)) { console.log('different project modes: not comparable, use another pair'); process.exit(2); }
const norm = v => typeof v === 'string' ? v.replace(/proj_\d+_[a-z0-9]+/g, 'PROJ').replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'ISO').replace(/\b\d{12,}\b/g, 'TS') : v;
const strip = o => JSON.parse(JSON.stringify(o, (k, v) => k === 'label' || k === 'scriptSha256' ? undefined : norm(v)));
const A = strip(a), B = strip(b);
const diffs = [];
(function walk(x, y, p) {
  if (x && y && typeof x === 'object' && typeof y === 'object') {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], p + '/' + k);
  } else if (x !== y) diffs.push(p + ': ' + JSON.stringify(x) + ' != ' + JSON.stringify(y));
})(A, B, '');
console.log('scripts:', (a.scriptSha256 || '').slice(0, 12), (b.scriptSha256 || '').slice(0, 12), a.scriptSha256 === b.scriptSha256 ? '(SAME script)' : '(different scripts)');
console.log('differences after normalisation:', diffs.length);
diffs.slice(0, 15).forEach(d => console.log('  ' + d.slice(0, 220)));
process.exit(diffs.length ? 1 : 0);
