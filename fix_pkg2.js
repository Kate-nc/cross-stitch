const fs = require('fs');
let content = fs.readFileSync('package.json', 'utf8');

const conflictRegex = /<<<<<<< (HEAD|Updated upstream)[\s\S]*?=======\n([\s\S]*?)>>>>>>> [^\n]+/g;
content = content.replace(conflictRegex, '$2');

fs.writeFileSync('package.json', content);
