// Extract P? items from master TODO into per-area files (chunked for subagent dispatch).
const fs = require('fs');
const path = require('path');
const s = fs.readFileSync('reports/00_MASTER_TODO.md', 'utf8');
const lines = s.split(/\r?\n/);
let inP = false;
const items = [];
for (const l of lines) {
  if (/^##\s*P\?/.test(l)) { inP = true; continue; }
  if (inP && /^##\s/.test(l)) break;
  if (inP && /^\s*-\s*\[\s*\]/.test(l)) items.push(l);
}
const groups = {};
for (const it of items) {
  const m = it.match(/reports\/(specs|cross-cutting)\/([^.#)]+)/);
  const key = m ? m[2] : 'misc';
  (groups[key] = groups[key] || []).push(it);
}
const outDir = 'reports/verification/pq-batches';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const CHUNK = 14;
let total = 0;
for (const [name, arr] of Object.entries(groups)) {
  if (arr.length === 0) continue;
  if (arr.length <= CHUNK) {
    fs.writeFileSync(path.join(outDir, name + '.txt'), arr.join('\n'), 'utf8');
    console.log(name.padEnd(40), arr.length);
    total += arr.length;
  } else {
    const chunks = Math.ceil(arr.length / CHUNK);
    const size = Math.ceil(arr.length / chunks);
    for (let i = 0; i < chunks; i++) {
      const part = arr.slice(i * size, (i + 1) * size);
      const tag = String.fromCharCode(65 + i);
      const fname = `${name}-${tag}.txt`;
      fs.writeFileSync(path.join(outDir, fname), part.join('\n'), 'utf8');
      console.log(fname.padEnd(40), part.length);
      total += part.length;
    }
  }
}
console.log('TOTAL', total);
