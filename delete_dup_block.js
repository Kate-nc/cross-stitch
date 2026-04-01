const fs = require('fs');

let code = fs.readFileSync('pdf-importer.js', 'utf8');

// I accidentally duplicated the block when I prepended it.
// Let's remove the second one.

const idx1 = code.indexOf('if (fn === pdfjsLib.OPS.constructPath) {');
const idx2 = code.indexOf('} else if (fn === pdfjsLib.OPS.constructPath) {', idx1);

if (idx2 !== -1) {
    const endIdx = code.indexOf('} else if (fn === pdfjsLib.OPS.stroke', idx2);
    code = code.substring(0, idx2) + code.substring(endIdx);
    fs.writeFileSync('pdf-importer.js', code);
    console.log("Removed duplicate constructPath block");
} else {
    console.log("No duplicate found");
}
