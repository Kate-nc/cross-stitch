const fs = require('fs');

const files = [
  'creator-app.js',
  'tracker-app.js',
  'colour-utils.js',
  'constants.js',
  'import-formats.js',
  'index.html',
  'stitch.html',
  'manager-app.js',
  'package.json',
  'package-lock.json'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // We want to KEEP the incoming branch (the feature branch we are merging IN) for the feature logic
  // origin/feature/fractional-stitches-10153900763996754148 is our target.
  // We'll replace the conflict blocks with just the incoming changes (the bottom half).

  // Simple regex to grab the block:
  // <<<<<<< HEAD
  // (stuff to discard)
  // =======
  // (stuff to keep)
  // >>>>>>> ...

  const conflictRegex = /<<<<<<< (HEAD|Updated upstream)[\s\S]*?=======\n([\s\S]*?)>>>>>>> [^\n]+/g;

  content = content.replace(conflictRegex, '$2');

  fs.writeFileSync(file, content);
});
