const fs = require('fs');
let code = fs.readFileSync('colour-utils.js', 'utf8');

// For colour-utils we also want to KEEP HEAD (fractional stitches branch)
const regex = /<<<<<<< HEAD\n([\s\S]*?)=======\n[\s\S]*?>>>>>>> origin\/main/g;
code = code.replace(regex, '$1');

fs.writeFileSync('colour-utils.js', code);
