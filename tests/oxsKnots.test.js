/**
 * @jest-environment jsdom
 */
// French knots in OXS files (P4-4): read from ornaments, written back.
// Uses the regex+eval extraction pattern from embroidery-image-processing.test.js
// to pull pure functions out of import-formats.js without a module system.

const fs = require('fs');

// ─── Minimal DMC stub ─────────────────────────────────────────────────────
// Just the threads used in the fixtures below.
global.DMC = [
  { id: '310',  name: 'Black',          rgb: [0,   0,   0]   },
  { id: '666',  name: 'Bright Red',     rgb: [204, 0,   0]   },
  { id: '550',  name: 'Violet-VD',      rgb: [68,  0,   87]  },
  { id: '3750', name: 'Antique Blue-VD',rgb: [32,  58,  99]  },
  { id: 'blanc',name: 'White',          rgb: [255, 255, 255] },
];

// ─── Extract functions from import-formats.js ────────────────────────────
const raw = fs.readFileSync('./import-formats.js', 'utf8');

function extractFn(src, name) {
  // Handles `function foo(` and `function foo (` declarations
  let start = src.indexOf('\nfunction ' + name + '(');
  if (start === -1) start = src.indexOf('\nfunction ' + name + ' (');
  if (start === -1) return '';
  let depth = 0, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { if (--depth === 0) return src.slice(start, i + 1); }
    i++;
  }
  return '';
}

// Also extract the module-level lazy-map variables and helpers.
const preamble =
  'var _IMPORT_DMC_BY_ID = null, _IMPORT_DMC_BY_NAME = null;\n' +
  extractFn(raw, '_importDmcById') + '\n' +
  extractFn(raw, '_importDmcByName') + '\n';

// _oxsExtractDimension is called by parseOXS
const helperCode =
  preamble +
  extractFn(raw, '_oxsExtractDimension') + '\n' +
  extractFn(raw, '_oxsParseThreadRef') + '\n' +
  extractFn(raw, '_oxsBrandFromName') + '\n' +
  extractFn(raw, '_oxsBrandLabel') + '\n' +
  extractFn(raw, 'parseOXS') + '\n' +
  extractFn(raw, 'generateOXS') + '\n';

// eslint-disable-next-line no-eval
eval(helperCode);
// eslint-disable-next-line no-eval
eval(extractFn(raw, 'importResultToProject'));

const solid = (id, rgb) => ({ id, type: 'solid', rgb });

describe('French knots in OXS', () => {
  test('knots on a centre and a corner round-trip', () => {
    const pattern = [solid('310', [0, 0, 0]), solid('310', [0, 0, 0]), solid('310', [0, 0, 0]), solid('310', [0, 0, 0])];
    const knots = [{ x: 1, y: 1, id: '666', rgb: [204, 0, 0] }, { x: 2, y: 4, id: '310', rgb: [0, 0, 0] }];
    const { xml, warnings } = generateOXS({ w: 2, h: 2, name: 'K', pattern, bsLines: [], knots });
    expect(warnings).toEqual([]);
    expect(xml).toContain('<ornaments_inc_knots_and_beads>');
    expect(xml).toMatch(/<object x1="0.5" y1="0.5" palindex="\d+" objecttype="knot" \/>/);
    expect(xml).toMatch(/<object x1="1" y1="2" palindex="\d+" objecttype="knot" \/>/);
    const back = parseOXS(xml);
    expect(back.knots).toEqual([
      { x: 1, y: 1, id: '666', rgb: [204, 0, 0] },
      { x: 2, y: 4, id: '310', rgb: [0, 0, 0] },
    ]);
  });

  test('a chart without knots writes no ornaments', () => {
    const { xml } = generateOXS({ w: 1, h: 1, pattern: [solid('310', [0, 0, 0])], bsLines: [] });
    expect(xml).not.toContain('ornaments');
    expect(parseOXS(xml).knots).toEqual([]);
    expect('knots' in importResultToProject(parseOXS(xml)) && importResultToProject(parseOXS(xml)).knots).toBeFalsy();
  });

  test('knots from ornaments snap to corners and centres, beads are reported', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<chart>
  <properties chartwidth="4" chartheight="4" />
  <palette>
    <color index="1" number="DMC 310" name="Black" red="0" green="0" blue="0" />
    <color index="2" number="DMC 666" name="Bright Red" red="204" green="0" blue="0" />
  </palette>
  <fullstitches>
    <stitch x="0" y="0" palindex="1" />
  </fullstitches>
  <ornaments_inc_knots_and_beads>
    <object x1="1.5" y1="2.5" palindex="2" objecttype="knot" />
    <object x1="3" y1="1" palindex="1" objecttype="knot" />
    <object x1="2.4" y1="0.9" palindex="1" objecttype="knot" />
    <object x1="0.5" y1="0.5" palindex="2" objecttype="bead" />
  </ornaments_inc_knots_and_beads>
</chart>`;
    const r = parseOXS(xml);
    expect(r.knots.map(k => [k.x, k.y, k.id])).toEqual([[3, 5, '666'], [6, 2, '310'], [4, 2, '310']]);
    expect(r.warnings.some(w => /1 bead or other ornament was not imported/.test(w))).toBe(true);
    expect(importResultToProject(r).knots).toHaveLength(3);
  });
});

describe('French knots in the bundle OXS', () => {
  test('_serializeOxs writes them as ornaments', () => {
    const ZB = require('../creator/zipBundle.js');
    const xml = ZB._serializeOxs({ width: 2, height: 2, pattern: [solid('310', [0, 0, 0])], bsLines: [],
      knots: [{ x: 3, y: 1, id: '666', rgb: [204, 0, 0] }] });
    expect(xml).toMatch(/<object x1="1.5" y1="0.5" palindex="2" objecttype="knot"\/>/);
  });
});
