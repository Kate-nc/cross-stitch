// Extract P4 items from master TODO into per-area files for subagent dispatch.
const fs = require('fs');
const path = require('path');
const s = fs.readFileSync('reports/00_MASTER_TODO.md', 'utf8');
const lines = s.split(/\r?\n/);
let inP4 = false;
const items = [];
for (const l of lines) {
  if (/^##\s*P4\b/.test(l)) { inP4 = true; continue; }
  if (inP4 && /^##\s/.test(l)) break;
  if (inP4 && /^\s*-\s*\[\s*\]/.test(l)) items.push(l);
}
const groups = { home: [], manager: [], 'shared-shell': [], 'creator-modals': [], 'creator-legend-export': [], 'creator-prepare-materials': [], 'creator-pattern-canvas': [], tracker: [], 'cross-cutting': [] };
for (const it of items) {
  const m = it.match(/specs\/([^.#)]+)/);
  if (m && groups[m[1]] != null) groups[m[1]].push(it);
  else groups['cross-cutting'].push(it);
}
const outDir = 'reports/verification/p4-batches';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
for (const [name, arr] of Object.entries(groups)) {
  if (arr.length === 0) continue;
  fs.writeFileSync(path.join(outDir, name + '.txt'), arr.join('\n'), 'utf8');
  console.log(name.padEnd(35), arr.length);
}
console.log('TOTAL', items.length);
