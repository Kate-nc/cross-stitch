// Extract P2 items from master TODO into per-area files for subagent dispatch.
const fs = require('fs');
const path = require('path');
const s = fs.readFileSync('reports/00_MASTER_TODO.md', 'utf8');
const lines = s.split(/\r?\n/);
let inP2 = false;
const items = [];
for (const l of lines) {
  if (/^##\s*P2\b/.test(l)) { inP2 = true; continue; }
  if (inP2 && /^##\s/.test(l)) break;
  if (inP2 && /^\s*-\s*\[\s*\]/.test(l)) items.push(l);
}
const groups = { home: [], manager: [], 'shared-shell': [], 'creator-modals': [], 'creator-legend-export': [], 'creator-prepare-materials': [], 'creator-pattern-canvas': [], tracker: [], 'cross-cutting': [] };
for (const it of items) {
  const m = it.match(/specs\/([^.#)]+)/);
  if (m && groups[m[1]] != null) groups[m[1]].push(it);
  else groups['cross-cutting'].push(it);
}
const outDir = 'reports/verification/p2-batches';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const finalGroups = {};
for (const [name, arr] of Object.entries(groups)) {
  if (arr.length === 0) continue;
  if (arr.length > 25) {
    const mid = Math.ceil(arr.length / 2);
    finalGroups[name + '-A'] = arr.slice(0, mid);
    finalGroups[name + '-B'] = arr.slice(mid);
  } else {
    finalGroups[name] = arr;
  }
}
let total = 0;
for (const [name, arr] of Object.entries(finalGroups)) {
  fs.writeFileSync(path.join(outDir, name + '.txt'), arr.join('\n') + '\n', 'utf8');
  console.log(name.padEnd(28), arr.length);
  total += arr.length;
}
console.log('TOTAL', total);
