/* Cleanup 23 — mutation check on pdf-key-reader.js.
 *
 *   node reports/cleanup-23/mutation-check.cjs <base-pdf-importer.js>
 *
 * Applies each small mutation to a COPY of pdf-key-reader.js in a scratch directory, then (1) runs the Jest
 * characterisation (tests/import/pdfKeyReader.test.js, with the mutant swapped in for the real file and restored
 * afterwards) and (2) runs the randomised base-versus-head differential with KEY_READER_PATH pointing at the copy.
 * A mutant is "caught" when either run fails. The real file is restored from its saved text even on error.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const target = path.join(ROOT, 'pdf-key-reader.js');
const original = fs.readFileSync(target, 'utf8');
const baseImporter = path.resolve(process.argv[2]);
const iterations = process.argv[3] || '1500';

const mutants = [
  ['swatch reach 80 -> >= 80', 'if (c.x - s.x1 > 80) continue;', 'if (c.x - s.x1 >= 80) continue;'],
  ['same line 7 -> < 7', 'Math.abs(a - cy) <= 7', 'Math.abs(a - cy) < 7'],
  ['swatch tie prefers smaller area', 's.w * s.h > swatch.w * swatch.h', 's.w * s.h < swatch.w * swatch.h'],
  ['wide swatch limit 160 -> 170', 'if (wide && b.w > 160) continue;', 'if (wide && b.w > 170) continue;'],
  ['symbol reach 90 -> 89', 'c.x - t.x <= 90', 'c.x - t.x <= 89'],
  ['U+ placeholder no longer a glyph', "(t.s.length === 1 || /^U\\+[0-9A-F]{4}$/.test(t.s))", "(t.s.length === 1)"],
  ['swatch colour not rounded', 'Array.from(p.fillColor).map(v => Math.round(v))', 'Array.from(p.fillColor)'],
  ['next-entry bound >= prefixX (equivalent: a following prefix is always strictly right of the previous code)', 'o.prefixX > a.c.x', 'o.prefixX >= a.c.x'],
  ['code may be one digit', '\\d{2,4}|B5200', '\\d{1,4}|B5200'],
  ['exclusion box edges exclusive', 'x >= exclude.x0 && x <= exclude.x1 && y >= exclude.y0 && y <= exclude.y1', 'x > exclude.x0 && x < exclude.x1 && y > exclude.y0 && y < exclude.y1'],
  ['sample reach 40 -> 41', 'c.x - s.x1 <= 40', 'c.x - s.x1 <= 41'],
  ['unknown symbol font label', "(a.symbol.font || 'Unknown')", "(a.symbol.font || '')"],
  ['nearest symbol is the left-most', '.sort((a, b) => b.x - a.x)[0]', '.sort((a, b) => a.x - b.x)[0]'],
  ['strands-before-code window', 't.x > a.prefixX - 1', 't.x > a.prefixX - 100'],
  ['thin bar height 4 -> 5', 'b.h <= 4 && b.w >= 8', 'b.h <= 5 && b.w >= 8'],
  ['fallback text height 8 -> 9', 't.height || t.fontSize || 8', 't.height || t.fontSize || 9'],
  ['count regexp drops "pts"', 'sts?|stitches|pts?', 'sts?|stitches'],
  ['picture glyphs ignored', '.concat(pictures.filter(t => t.x < c.x && t.x > prevX && sameLine(t.cy, c.cy)))', ''],
  ['entries reversed', '    return entries;\n  }\n\n  var api', '    return entries.reverse();\n  }\n\n  var api'],
  ['swatch picked among those inside the previous code only', 's.x0 <= prevX', 's.x0 < prevX'],
];

let caught = 0;
const rows = [];
try {
  for (const [name, from, to] of mutants) {
    if (original.split(from).length !== 2) { rows.push(`NOT APPLIED  ${name} (pattern occurs ${original.split(from).length - 1} times)`); continue; }
    const mutant = original.replace(from, to);
    const tmp = path.join(os.tmpdir(), 'cleanup23-mutant-' + process.pid + '.js');
    fs.writeFileSync(tmp, mutant);
    fs.writeFileSync(target, mutant);
    const jest = spawnSync('node', ['--experimental-vm-modules', 'node_modules/jest/bin/jest.js', '--ci', 'tests/import/pdfKeyReader.test.js'], { cwd: ROOT, encoding: 'utf8' });
    fs.writeFileSync(target, original);
    const failedTests = ((jest.stderr + jest.stdout).match(/Tests:\s+(\d+) failed/) || [])[1] || 0;
    const diff = spawnSync('node', [path.join(__dirname, 'differential.cjs'), baseImporter, iterations], { cwd: ROOT, encoding: 'utf8', env: Object.assign({}, process.env, { KEY_READER_PATH: tmp }) });
    const mism = ((diff.stdout.match(/: (\d+) mismatches/) || [])[1]) || '?';
    fs.unlinkSync(tmp);
    const isCaught = jest.status !== 0 || diff.status !== 0;
    if (isCaught) caught++;
    rows.push(`${isCaught ? 'caught' : 'SURVIVED'}  jest ${jest.status === 0 ? 'passed' : failedTests + ' failed'}, differential ${mism} mismatches in ${iterations}  ${name}`);
  }
} finally {
  fs.writeFileSync(target, original);
}
console.log(rows.join('\n'));
console.log(`\n${caught} of ${mutants.length} mutants caught`);
