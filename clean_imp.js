const fs = require('fs');
let code = fs.readFileSync('import-formats.js', 'utf8');

// For import-formats we want to KEEP HEAD (the fractional stitches feature logic)
// and DISCARD main (which doesn't have fractional stitches)
const regex = /<<<<<<< HEAD\n([\s\S]*?)=======\n[\s\S]*?>>>>>>> origin\/main/g;
code = code.replace(regex, '$1');

fs.writeFileSync('import-formats.js', code);
