// Writes tests/fixtures/syncMergePrimitives.golden.json from the SyncEngine in the given checkout (default: this one).
// Generated once on the pre-extraction base; the Jest suite then holds every later revision to it.
// Usage: node reports/cleanup-18/capture-golden.cjs [checkoutDir] [outFile]
const path = require('path');
const fs = require('fs');
const root = path.resolve(process.argv[2] || '.');
const out = path.resolve(process.argv[3] || 'tests/fixtures/syncMergePrimitives.golden.json');
const { loadEngine } = require('./load-engine.cjs');
const cases = require(path.resolve(__dirname, '../../tests/support/syncMergePrimitiveCases.js'));
const SE = loadEngine(root);
const results = cases.run(SE);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 2) + '\n');
console.log('cases:', Object.keys(results).length, '->', out);
