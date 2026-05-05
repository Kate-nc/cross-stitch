// Helper: strip "× / \u00D7" emoji fallbacks from tracker-app.js
const fs = require('fs');
const p = 'tracker-app.js';
let s = fs.readFileSync(p, 'utf8');
const before = s;
const X = '\u00D7';
// Replace three quoting variants
s = s.split('Icons.x?Icons.x():"' + X + '"').join('Icons.x?Icons.x():null');
s = s.split("Icons.x?Icons.x():'" + X + "'").join('Icons.x?Icons.x():null');
s = s.split('Icons.x?Icons.x():"\\u00D7"').join('Icons.x?Icons.x():null');
fs.writeFileSync(p, s, 'utf8');
console.log('changed:', before !== s, 'remaining:', (s.match(/Icons\.x\?Icons\.x/g) || []).length);
