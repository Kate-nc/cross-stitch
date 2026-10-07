/* tests/colourReplaceThemeTokens.test.js ──────────────────────────────────
   House rule (AGENTS.md): no raw hex in component styles. Theme tokens only,
   so these surfaces follow light / dark mode.
   ─────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');
const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g;

describe('theme tokens instead of raw hex', () => {
  test('Replace colour modal and helpers', () => {
    expect(read('creator/ColourReplaceModal.js').match(HEX)).toBeNull();
    // colourReplace.js only builds hex strings for backstitch line data.
    expect(read('creator/colourReplace.js').match(HEX)).toBeNull();
  });

  test('Magic Wand panel', () => {
    expect(read('creator/MagicWandPanel.js').match(HEX)).toBeNull();
  });

  test('toolbar tool badges', () => {
    const src = read('creator/ToolStrip.js');
    const block = src.slice(src.indexOf('var badgeLabel'), src.indexOf('badgeLabel = null'));
    expect(block.length).toBeGreaterThan(100);
    expect(block.match(HEX)).toBeNull();
    expect(block).toMatch(/badgeLabel = "Replace"; badgeBg = "var\(--accent-soft\)"; badgeColor = "var\(--accent-ink\)"/);
  });
});
