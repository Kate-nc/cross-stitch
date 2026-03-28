const fs = require('fs');
let code = fs.readFileSync('colour-utils.js', 'utf8');

// The original line is very long, let's pretty-print it to understand it
const quantizeLine = code.split('\n').find(l => l.startsWith('function quantize('));
console.log(quantizeLine);
