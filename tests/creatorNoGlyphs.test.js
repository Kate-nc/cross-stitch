// House rule (AGENTS.md): no emoji or emoji-like symbols in UI strings; use
// window.Icons instead. Audit B-12 found ↩ ↪ ↺ ▶ and ➘1/➘2 in the Creator.
// This scans string literals and JSX text in the Creator and the import UI.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const files = []
  .concat(fs.readdirSync(path.join(ROOT, 'creator'))
    .filter((f) => f.endsWith('.js') && !/bundle\.js$/.test(f)).map((f) => 'creator/' + f))
  .concat(['creator-main.js'])
  .concat(fs.readdirSync(path.join(ROOT, 'import-engine', 'ui'))
    .filter((f) => f.endsWith('.js')).map((f) => 'import-engine/ui/' + f));

// Arrows, play/disclosure triangles, check and cross marks, warning, info,
// the ring used as an "unowned" mark.
const BANNED = /[←-⇿▲-◄○✓-✘➘⚠ℹ]/;
const BANNED_ESCAPE = /\\u(21[9A-Fa-f][0-9A-Fa-f]|25[Bb][2-9A-Fa-f]|25[Cc][0-4Bb]|271[3-8]|2798|26[Aa]0|2139)/;

// Lines allowed to keep a glyph, with the reason.
const ALLOW = [
  // Key legends inside <kbd> (AGENTS.md exception).
  /<kbd|h\(\s*["']kbd["']/,
  // Plain-text shopping lists copied to the clipboard or shared: no icons
  // possible there.
  /var mark = r\.status === ["']owned["']/,
  /lines\.push\(['"]\\u(25cb|2713) /,
  // Glyph tables for the PDF symbol font (drawn shapes, not UI text).
  /^creator\/symbolFontSpec\.js$/,
];

function codeLines(src) {
  // Drop block comments, then whole-line and trailing // comments.
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return noBlocks.split(/\r?\n/).map((line) => {
    if (/^\s*\/\//.test(line)) return '';
    return line.replace(/\s\/\/\s.*$/, '');
  });
}

describe('no emoji-like glyphs in Creator and import UI strings', () => {
  test.each(files)('%s', (file) => {
    if (ALLOW.some((re) => re.test(file))) return;
    const offenders = [];
    codeLines(fs.readFileSync(path.join(ROOT, file), 'utf8')).forEach((line, i) => {
      if (!BANNED.test(line) && !BANNED_ESCAPE.test(line)) return;
      if (ALLOW.some((re) => re.test(line))) return;
      offenders.push((i + 1) + ': ' + line.trim().slice(0, 120));
    });
    expect(offenders).toEqual([]);
  });
});

describe('Creator copy (audit B-06, B-08)', () => {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

  test('the tour no longer names tabs that Convert does not have', () => {
    const wizard = read('onboarding-wizard.js');
    expect(wizard).not.toMatch(/Dimensions and Palette tabs/);
    expect(wizard).not.toMatch(/Tools and View tabs then unlock/);
  });

  test('the generate toast points at Convert, not a Setup button', () => {
    const st = read('creator/useCreatorState.js');
    expect(st).not.toMatch(/Setup button/);
    expect(st).toMatch(/label: "Back to Convert"/);
  });

  test('the coach marks do not say "on the right" on every device', () => {
    const main = read('creator-main.js');
    expect(main).not.toMatch(/'(Add|Choose) a colour in the Palette tab on the right/);
  });
});
