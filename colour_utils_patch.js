const fs = require('fs');
let content = fs.readFileSync('colour-utils.js', 'utf8');

// Replace buildPalette definition
const buildPaletteTarget = `function buildPalette(pat, maxC, minSt, orphanThresh) {`;
const buildPaletteReplace = `function buildPalette(pat, maxC, minSt, orphanThresh, symbolMap = {}) {`;

content = content.replace(buildPaletteTarget, buildPaletteReplace);

// Update symbol assignment logic inside buildPalette
const symbolLogicTarget = `      pal.push({
        id: c[0],
        rgb: c[1].rgb,
        name: c[1].name,
        sym: SYMBOLS[i % SYMBOLS.length],
        count: c[1].count
      });`;

const symbolLogicReplace = `      let sym = SYMBOLS[i % SYMBOLS.length];
      if (symbolMap && symbolMap[c[0]]) {
        sym = symbolMap[c[0]];
      } else if (symbolMap) {
        // Find an unused symbol if possible, else fallback
        let used = Object.values(symbolMap);
        let available = SYMBOLS.find(s => !used.includes(s));
        if (available) {
          sym = available;
          symbolMap[c[0]] = sym;
        } else {
          symbolMap[c[0]] = sym;
        }
      }

      pal.push({
        id: c[0],
        rgb: c[1].rgb,
        name: c[1].name,
        sym: sym,
        count: c[1].count
      });`;

content = content.replace(symbolLogicTarget, symbolLogicReplace);

fs.writeFileSync('colour-utils.js', content);
