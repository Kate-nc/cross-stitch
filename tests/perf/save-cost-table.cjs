/* save-cost-table.cjs — Markdown tables from tests/perf/save-cost.cjs results.
     node tests/perf/save-cost-table.cjs before.json after.json
   One row per case: the operation's own time (first and steady-state where
   measured), main-thread busy time from the CPU profile, the longest task, and
   what was written (whole-project puts, IndexedDB puts by store). */
const fs = require('fs');
const [beforeFile, afterFile] = process.argv.slice(2);
if (!beforeFile || !afterFile) { console.error('usage: save-cost-table.cjs before.json after.json'); process.exit(1); }
const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8')).cases;
const after = JSON.parse(fs.readFileSync(afterFile, 'utf8')).cases;
const first = (runs) => (runs || []).find((r) => !r.error) || null;
const op = (r) => {
  if (!r) return 'n/a';
  if (r.flushMs != null) return (r.first ? r.first.flushMs + ' / ' : '') + r.flushMs + ' ms' + (r.clean ? ' (nothing to write)' : '');
  if (r.saveMs != null) return (r.first ? r.first.saveMs + ' / ' : '') + r.saveMs + ' ms';
  if (r.commitMs != null) return r.commitMs + ' ms';
  if (r.exportMs != null) return r.exportMs + ' ms';
  return '?';
};
const puts = (r) => {
  if (!r || !r.idb) return '';
  return Object.entries(r.idb).filter(([k]) => k.startsWith('put ')).map(([k, v]) => k.slice(4) + ' ' + v.n).join(', ');
};
const rows = [];
rows.push('| Case | Profile | Operation, before | after | Main thread busy, before | after | Longest task, before | after | Puts after |');
rows.push('|---|---|---:|---:|---:|---:|---:|---:|---|');
for (const id of Object.keys(after)) {
  const a = first(after[id]), b = first(before[id]);
  if (!a && !b) continue;
  const prof = (a || b).profile;
  rows.push(`| ${id} | ${prof} | ${op(b)} | ${op(a)} | ${b ? b.cpu.busyMs + ' ms' : 'n/a'} | ${a ? a.cpu.busyMs + ' ms' : 'n/a'} | ${b ? b.longestTaskMs + ' ms' : 'n/a'} | ${a ? a.longestTaskMs + ' ms' : 'n/a'} | ${puts(a)} |`);
}
console.log(rows.join('\n'));
