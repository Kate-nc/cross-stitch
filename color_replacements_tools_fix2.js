const fs = require('fs');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Using simple string replacement
  content = content.replace('✏️ Backstitch', 'Backstitch');
  content = content.replace('🗑️ Erase Line', 'Erase line');
  content = content.replace('🖌️ Paint', 'Paint');
  content = content.replace('🪣 Fill', 'Fill');

  fs.writeFileSync(filePath, content, 'utf8');
}

processFile('creator-app.js');
processFile('index.html');
