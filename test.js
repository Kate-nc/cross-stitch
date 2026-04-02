const {readFileSync} = require('fs');
let content = readFileSync('creator-app.js', 'utf-8');
console.log(content.indexOf('half-fwd') > 0);
