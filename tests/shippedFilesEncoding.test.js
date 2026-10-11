// Shipped source must be clean UTF-8. A save in a legacy encoding once turned the em dash in
// home.html's <title> into "â€”" (tracking audit BUG-03), the same family of damage that earlier
// corrupted the Preferences panel. Double-encoded UTF-8 always shows as "â€" / "Ã" + a
// continuation character, and a replacement character means bytes were lost.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'tests', 'reports', 'compiled', 'test-results', 'playwright-report', 'coverage', 'docs']);
const EXT = new Set(['.html', '.js', '.css', '.json', '.webmanifest']);
const GENERATED = /bundle|\.min\.|-data\.js$|dmc-data|anchor-data|sample/;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (EXT.has(path.extname(e.name)) && !GENERATED.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT, []);
const MOJIBAKE = /â€|Ã[\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘-„†-•…‰‹›€™]|Â[\u0080-¿]/;

test('there are files to check', () => { expect(files.length).toBeGreaterThan(40); });

test('no shipped HTML, JS, CSS or JSON contains double-encoded UTF-8', () => {
  const bad = [];
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => { if (MOJIBAKE.test(l)) bad.push(path.relative(ROOT, f) + ':' + (i + 1) + ': ' + l.trim().slice(0, 80)); });
  }
  expect(bad).toEqual([]);
});

test('no shipped file contains a replacement character', () => {
  const bad = files.filter(f => fs.readFileSync(f, 'utf8').includes('�')).map(f => path.relative(ROOT, f));
  expect(bad).toEqual([]);
});

test('home.html has the right title', () => {
  expect(fs.readFileSync(path.join(ROOT, 'home.html'), 'utf8')).toMatch(/<title>stitch\. — Home<\/title>/);
});
