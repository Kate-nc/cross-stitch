'use strict';
// Compares two differential.cjs outputs; exits 1 on any difference.
const fs = require('fs');
const [, , aPath, bPath] = process.argv;
const a = JSON.parse(fs.readFileSync(aPath, 'utf8')), b = JSON.parse(fs.readFileSync(bPath, 'utf8'));
const keys = Object.keys(a.results);
let diffs = 0, ops = 0;
if (keys.length !== Object.keys(b.results).length) { console.error('configuration count differs'); process.exit(1); }
for (const k of keys) {
  const x = a.results[k], y = b.results[k];
  ops += x.ops;
  if (!y || x.ops !== y.ops || x.opHash !== y.opHash || x.pixelHash !== y.pixelHash) { diffs++; if (diffs <= 10) console.error('DIFF', k, x, y); }
}
console.log(`${keys.length} configurations, ${ops} canvas operations hashed, ${diffs} differences (${a.renderer} vs ${b.renderer})`);
process.exit(diffs ? 1 : 0);
