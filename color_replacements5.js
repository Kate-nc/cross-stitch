const fs = require('fs');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix Colour palette strip border
  content = content.replace(
    /border:ips\?"2px solid #2563eb":ihs\?"2px solid #ea580c":"0\.5px solid #e4e4e7"/g,
    'border:ips?"2px solid #0d9488":ihs?"2px solid #ea580c":"0.5px solid #e4e4e7"'
  );

  fs.writeFileSync(filePath, content, 'utf8');
}

processFile('creator-app.js');
processFile('index.html');
