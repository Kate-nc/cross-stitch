/**
 * @jest-environment jsdom
 */
// Audit B-09: OXS palette matching ignored the brand. "Anchor 400" was
// silently turned into a DMC colour, and an Anchor number that is also a DMC
// id would have matched that unrelated DMC thread by number.

const fs = require('fs');

// Lab is stood in for by RGB, so "nearest" is plain RGB distance here.
global.DMC = [
  { id: '310', name: 'Black', rgb: [0, 0, 0] },
  { id: '400', name: 'Mahogany Dark', rgb: [143, 67, 15] },
  { id: '413', name: 'Pewter Gray Dark', rgb: [86, 86, 86] },
  { id: '414', name: 'Steel Gray Dark', rgb: [140, 140, 140] },
  { id: '666', name: 'Bright Red', rgb: [227, 29, 66] },
  { id: 'BLANC', name: 'White', rgb: [255, 255, 255] },
].map((d) => Object.assign({ lab: d.rgb }, d));
global.rgbToLab = (r, g, b) => [r, g, b];
global.dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const raw = fs.readFileSync('./import-formats.js', 'utf8');
function extractFn(src, name) {
  const start = src.indexOf('\nfunction ' + name + '(');
  if (start === -1) throw new Error('missing ' + name);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  return '';
}
const code =
  'var _IMPORT_DMC_BY_ID = null, _IMPORT_DMC_BY_NAME = null;\n' +
  ['_importDmcById', '_importDmcByName', 'parseHexColor', '_oxsExtractDimension',
    '_oxsParseThreadRef', '_oxsBrandFromName', '_oxsBrandLabel', 'parseOXS']
    .map((n) => extractFn(raw, n)).join('\n') +
  '\nreturn { parseOXS, _oxsParseThreadRef };';
// eslint-disable-next-line no-new-func
const { parseOXS, _oxsParseThreadRef } = new Function(code)();

function oxs(colors) {
  const palette = colors.map((c, i) =>
    '<color index="' + (i + 1) + '" number="' + c.number + '" name="' + (c.name || '') + '" color="' + c.hex + '"/>').join('');
  const stitches = colors.map((c, i) => '<stitch x="' + i + '" y="0" palindex="' + (i + 1) + '"/>').join('');
  return '<?xml version="1.0"?><chart><properties chartwidth="' + colors.length + '" chartheight="1"/>' +
    '<palette><color index="0" number="cloth" name="cloth" color="FFFFFF"/>' + palette + '</palette>' +
    '<fullstitches>' + stitches + '</fullstitches></chart>';
}

afterEach(() => { delete global.getOfficialMatch; });

describe('_oxsParseThreadRef', () => {
  test.each([
    ['DMC 310', { brand: 'dmc', id: '310' }],
    ['Anchor 403', { brand: 'anchor', id: '403' }],
    ['Madeira 2400', { brand: 'madeira', id: '2400' }],
    ['666', { brand: null, id: '666' }],
    ['blanc', { brand: null, id: 'blanc' }],
    ['DMC White', { brand: 'dmc', id: 'White' }],
  ])('%s', (text, expected) => {
    expect(_oxsParseThreadRef(text)).toEqual(expected);
  });

  test('a colour name is not a thread reference', () => {
    expect(_oxsParseThreadRef('Bright Red')).toBeNull();
    expect(_oxsParseThreadRef('cloth')).toBeNull();
  });
});

describe('parseOXS brand-aware palette matching', () => {
  test('"DMC 310" gives DMC 310 with no warning', () => {
    const r = parseOXS(oxs([{ number: 'DMC 310', name: 'Black', hex: '000000' }]));
    expect(r.pattern[0].id).toBe('310');
    expect(r.warnings).toEqual([]);
  });

  test('a bare number is read as DMC', () => {
    const r = parseOXS(oxs([{ number: '666', hex: 'E31D42' }]));
    expect(r.pattern[0].id).toBe('666');
    expect(r.warnings).toEqual([]);
  });

  test('"DMC White" gives DMC BLANC with no warning', () => {
    const r = parseOXS(oxs([{ number: 'DMC White', hex: 'FFFFFF' }]));
    expect(r.pattern[0].id).toBe('BLANC');
    expect(r.warnings).toEqual([]);
  });

  test('"Anchor 400" never matches DMC 400, and is reported', () => {
    const r = parseOXS(oxs([{ number: 'Anchor 400', name: 'Anchor dark grey', hex: '4F5459' }]));
    expect(r.pattern[0].id).not.toBe('400');
    expect(r.pattern[0].id).toBe('413'); // closest colour without the conversion table
    expect(r.warnings.join(' ')).toMatch(/Anchor 400 was matched to DMC 413 \(closest equivalent\)/);
  });

  test('Anchor uses the official conversion when it is loaded', () => {
    global.getOfficialMatch = (from, id, to) =>
      (from === 'anchor' && id === '400' && to === 'dmc' ? { id: '414', confidence: 'official' } : null);
    const r = parseOXS(oxs([{ number: 'Anchor 400', hex: '4F5459' }]));
    expect(r.pattern[0].id).toBe('414');
    expect(r.warnings).toEqual(['Anchor 400 was matched to DMC 414 (official conversion).']);
  });

  test('other brands go to the closest colour, with a warning', () => {
    const r = parseOXS(oxs([{ number: 'Madeira 2400', hex: '000000' }]));
    expect(r.pattern[0].id).toBe('310');
    expect(r.warnings.join(' ')).toMatch(/Madeira 2400 was matched to DMC 310/);
  });

  test('unused palette entries are not reported', () => {
    const r = parseOXS(oxs([{ number: 'DMC 310', hex: '000000' }]));
    // The "cloth" entry is matched by colour but no stitch uses it.
    expect(r.warnings).toEqual([]);
  });
});
