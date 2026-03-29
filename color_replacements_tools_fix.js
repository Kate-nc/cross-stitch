const fs = require('fs');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix tool emoji replacement for real, seem like they weren't matched exactly in earlier regex
  content = content.replace(/"✏️ Backstitch"/g, '"Backstitch"');
  content = content.replace(/"🗑️ Erase Line"/g, '"Erase line"');
  content = content.replace(/"🖌️ Paint"/g, '"Paint"');
  content = content.replace(/"🪣 Fill"/g, '"Fill"');

  fs.writeFileSync(filePath, content, 'utf8');
}

processFile('creator-app.js');
processFile('index.html');
