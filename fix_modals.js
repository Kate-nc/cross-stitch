const fs = require('fs');

let content = fs.readFileSync('modals.js', 'utf8');
console.log(content.substring(content.indexOf('Calculator'), content.indexOf('Calculator') + 100));
