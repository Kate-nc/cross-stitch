/**
 * @jest-environment jsdom
 *
 * Tests for the OXS export system (creator/exportOxs.js).
 *
 * Strategy:
 *   1. Extract buildOxsXml from the source file via eval.
 *   2. Test the XML structure directly (structure, palette, stitches, backstitches).
 *   3. Round-trip test: export → parse with parseOXS (from import-formats.js) →
 *      verify stitch positions and palette match originals.
 *
 * All source files are evaluated in a single eval() call so that const/let
 * declarations (DMC, rgbToLab, dE, parseOXS) are visible across the combined
 * source code.  window.buildOxsXml is set by exportOxs.js and captured into
 * buildOxsXml for use in the tests.  parseOXS is captured via assignment.
 */

const fs = require('fs');

// ── Load source files ─────────────────────────────────────────────────────────

const dmcSrc         = fs.readFileSync('./dmc-data.js',          'utf8');
const colourUtilsSrc = fs.readFileSync('./colour-utils.js',       'utf8');
const importFmtSrc   = fs.readFileSync('./import-formats.js',     'utf8');
const exportOxsSrc   = fs.readFileSync('./creator/exportOxs.js',  'utf8');

// Evaluate all source code in a single eval() so const/let declarations
// (DMC, rgbToLab, dE, parseOXS) are in the same scope.
// window is provided as a plain object to capture exported globals.
const window = {};
eval([dmcSrc, colourUtilsSrc, importFmtSrc, exportOxsSrc].join('\n'));

// Capture globals exposed by the evals above.
const buildOxsXml = window.buildOxsXml;

// parseOXS is a plain function declared in import-formats.js (not window.*).
// After the combined eval it lives in this test-file scope.
// We access it via a reference bound in the eval scope:
let _parseOXS;
eval('_parseOXS = parseOXS;');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSolidCell(id, name, rgb) {
  return { type: 'solid', id, name, rgb };
}

const SKIP = { type: 'skip', id: '__skip__', rgb: [255, 255, 255] };

// Minimal 3×2 pattern: 5 solid stitches + 1 skip
const PAL_SIMPLE = [
  { type: 'solid', id: '310', name: 'Black',         rgb: [  0,   0,   0], count: 3 },
  { type: 'solid', id: '321', name: 'Christmas Red', rgb: [199,  43,  59], count: 2 }
];

const PAT_SIMPLE = [
  makeSolidCell('310', 'Black',         [0,   0,   0]),
  makeSolidCell('310', 'Black',         [0,   0,   0]),
  makeSolidCell('321', 'Christmas Red', [199, 43,  59]),
  makeSolidCell('321', 'Christmas Red', [199, 43,  59]),
  makeSolidCell('310', 'Black',         [0,   0,   0]),
  SKIP
];
// 3 wide, 2 tall — stitch (2,1) = SKIP

// ── buildOxsXml — structural tests ───────────────────────────────────────────

describe('buildOxsXml — XML structure', () => {
  let xml;
  beforeAll(() => {
    xml = buildOxsXml(PAT_SIMPLE, PAL_SIMPLE, 3, 2, 14, [], 'My Pattern');
  });

  it('starts with an XML declaration', () => {
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  });

  it('contains a <chart> root element', () => {
    expect(xml).toMatch(/<chart>/);
    expect(xml).toMatch(/<\/chart>/);
  });

  it('encodes width and height in <properties>', () => {
    expect(xml).toMatch(/chartwidth="3"/);
    expect(xml).toMatch(/chartheight="2"/);
  });

  it('encodes fabric count in <properties>', () => {
    expect(xml).toMatch(/fabriccount="14"/);
  });

  it('encodes pattern name in <properties>', () => {
    expect(xml).toMatch(/name="My Pattern"/);
  });

  it('contains a <palette> block', () => {
    expect(xml).toMatch(/<palette>/);
    expect(xml).toMatch(/<\/palette>/);
  });

  it('contains a <fullstitches> block', () => {
    expect(xml).toMatch(/<fullstitches>/);
    expect(xml).toMatch(/<\/fullstitches>/);
  });
});

describe('buildOxsXml — palette entries', () => {
  let xml;
  beforeAll(() => {
    xml = buildOxsXml(PAT_SIMPLE, PAL_SIMPLE, 3, 2, 14, [], 'Test');
  });

  it('creates one palette entry per unique thread', () => {
    const colorMatches = xml.match(/<color /g) || [];
    expect(colorMatches.length).toBe(2);
  });

  it('emits <color> with correct DMC number for thread 310', () => {
    expect(xml).toMatch(/number="310"/);
  });

  it('emits <color> with correct RGB values for Black (310)', () => {
    expect(xml).toMatch(/red="0" green="0" blue="0"/);
  });

  it('emits <color> with correct name for thread 321', () => {
    expect(xml).toMatch(/name="Christmas Red"/);
  });

  it('palette indices are 0-based integers', () => {
    expect(xml).toMatch(/index="0"/);
    expect(xml).toMatch(/index="1"/);
  });
});

describe('buildOxsXml — stitch elements', () => {
  let xml;
  beforeAll(() => {
    xml = buildOxsXml(PAT_SIMPLE, PAL_SIMPLE, 3, 2, 14, [], 'Test');
  });

  it('creates one <stitch> per non-skip cell', () => {
    const stitchMatches = xml.match(/<stitch /g) || [];
    expect(stitchMatches.length).toBe(5);
  });

  it('does not emit a stitch for __skip__ cells', () => {
    // Cell (2,1) = PAT_SIMPLE[5] = SKIP; x=2, y=1
    expect(xml).not.toMatch(/x="2" y="1"/);
  });

  it('emits correct x/y coordinates for first cell (0,0)', () => {
    expect(xml).toMatch(/x="0" y="0"/);
  });

  it('palindex attribute references the correct palette entry', () => {
    // Thread 310 is index 0, thread 321 is index 1
    expect(xml).toMatch(/palindex="0"/);
    expect(xml).toMatch(/palindex="1"/);
  });
});

describe('buildOxsXml — backstitch lines', () => {
  it('omits <backstitches> block when bsLines is empty', () => {
    const xml = buildOxsXml(PAT_SIMPLE, PAL_SIMPLE, 3, 2, 14, [], 'Test');
    expect(xml).not.toMatch(/<backstitches>/);
  });

  it('emits <backstitches> block when bsLines is non-empty', () => {
    const bsLines = [{ x1: 0, y1: 0, x2: 1, y2: 1 }];
    const xml = buildOxsXml(PAT_SIMPLE, PAL_SIMPLE, 3, 2, 14, bsLines, 'Test');
    expect(xml).toMatch(/<backstitches>/);
    expect(xml).toMatch(/<backstitch x1="0" y1="0" x2="1" y2="1" \/>/);
  });

  it('emits multiple <backstitch> elements', () => {
    const bsLines = [
      { x1: 0, y1: 0, x2: 1, y2: 0 },
      { x1: 1, y1: 0, x2: 2, y2: 1 }
    ];
    const xml = buildOxsXml(PAT_SIMPLE, PAL_SIMPLE, 3, 2, 14, bsLines, 'Test');
    const matches = xml.match(/<backstitch /g) || [];
    expect(matches.length).toBe(2);
  });
});

describe('buildOxsXml — XML escaping', () => {
  it('escapes ampersands in names', () => {
    const pal = [{ type: 'solid', id: '310', name: 'Black & White', rgb: [0, 0, 0], count: 1 }];
    const pat = [makeSolidCell('310', 'Black & White', [0, 0, 0])];
    const xml = buildOxsXml(pat, pal, 1, 1, 14, [], 'Test');
    expect(xml).toMatch(/name="Black &amp; White"/);
    expect(xml).not.toMatch(/name="Black & White"/);
  });

  it('escapes < and > in pattern name', () => {
    const xml = buildOxsXml(PAT_SIMPLE, PAL_SIMPLE, 3, 2, 14, [], '<My Pattern>');
    expect(xml).toMatch(/name="&lt;My Pattern&gt;"/);
  });

  it('escapes double quotes in names', () => {
    const pal = [{ type: 'solid', id: '3865', name: 'White "Cream"', rgb: [252, 252, 252], count: 1 }];
    const pat = [makeSolidCell('3865', 'White "Cream"', [252, 252, 252])];
    const xml = buildOxsXml(pat, pal, 1, 1, 14, [], 'Test');
    expect(xml).toMatch(/name="White &quot;Cream&quot;"/);
  });
});

describe('buildOxsXml — blend entries', () => {
  const PAL_BLEND = [
    {
      type: 'blend',
      id: '310+321',
      threads: [
        { id: '310', name: 'Black',         rgb: [0,   0,   0]  },
        { id: '321', name: 'Christmas Red', rgb: [199, 43,  59] }
      ],
      count: 4
    }
  ];
  const PAT_BLEND = [
    { type: 'blend', id: '310+321', rgb: [99, 22, 30] },
    { type: 'blend', id: '310+321', rgb: [99, 22, 30] }
  ];

  it('creates one palette entry for a blend stitch id', () => {
    const xml = buildOxsXml(PAT_BLEND, PAL_BLEND, 2, 1, 14, [], 'Test');
    const colorMatches = xml.match(/<color /g) || [];
    expect(colorMatches.length).toBe(1);
  });

  it('uses the first thread DMC number for the blend palette entry', () => {
    const xml = buildOxsXml(PAT_BLEND, PAL_BLEND, 2, 1, 14, [], 'Test');
    expect(xml).toMatch(/number="310"/);
  });

  it('averages RGB values for the blend palette entry', () => {
    // Math.round((0+199)/2)=100, Math.round((0+43)/2)=22, Math.round((0+59)/2)=30
    const xml = buildOxsXml(PAT_BLEND, PAL_BLEND, 2, 1, 14, [], 'Test');
    expect(xml).toMatch(/red="100" green="22" blue="30"/);
  });

  it('emits stitches for blend cells', () => {
    const xml = buildOxsXml(PAT_BLEND, PAL_BLEND, 2, 1, 14, [], 'Test');
    const stitchMatches = xml.match(/<stitch /g) || [];
    expect(stitchMatches.length).toBe(2);
  });
});

describe('buildOxsXml — edge cases', () => {
  it('handles empty palette gracefully', () => {
    const xml = buildOxsXml([], [], 0, 0, 14, [], 'Test');
    expect(xml).toMatch(/<palette>/);
    expect(xml).toMatch(/<fullstitches>/);
  });

  it('handles null/undefined bsLines without throwing', () => {
    expect(() => buildOxsXml(PAT_SIMPLE, PAL_SIMPLE, 3, 2, 14, null,      'Test')).not.toThrow();
    expect(() => buildOxsXml(PAT_SIMPLE, PAL_SIMPLE, 3, 2, 14, undefined, 'Test')).not.toThrow();
  });

  it('defaults to fabric count 14 when not provided', () => {
    const xml = buildOxsXml(PAT_SIMPLE, PAL_SIMPLE, 3, 2, undefined, [], 'Test');
    expect(xml).toMatch(/fabriccount="14"/);
  });

  it('handles an all-skip pattern without emitting any <stitch> elements', () => {
    const allSkip = [SKIP, SKIP, SKIP];
    const xml = buildOxsXml(allSkip, [], 3, 1, 14, [], 'Test');
    expect(xml).not.toMatch(/<stitch /);
  });

  it('handles __empty__ cells the same as __skip__', () => {
    const patWithEmpty = [
      { type: 'empty', id: '__empty__', rgb: [255, 255, 255] },
      makeSolidCell('310', 'Black', [0, 0, 0])
    ];
    const pal = [{ type: 'solid', id: '310', name: 'Black', rgb: [0, 0, 0], count: 1 }];
    const xml = buildOxsXml(patWithEmpty, pal, 2, 1, 14, [], 'Test');
    const stitchMatches = xml.match(/<stitch /g) || [];
    expect(stitchMatches.length).toBe(1);
    expect(xml).toMatch(/x="1" y="0"/);
  });
});

// ── Round-trip test: export → parseOXS → compare ─────────────────────────────

describe('OXS round-trip — export then re-import', () => {
  it('round-trips a simple solid-stitch pattern: stitch count matches', () => {
    const xml    = buildOxsXml(PAT_SIMPLE, PAL_SIMPLE, 3, 2, 14, [], 'Test');
    const result = _parseOXS(xml);
    // Original has 5 solid stitches
    expect(result.stitchCount).toBe(5);
  });

  it('round-trips dimensions correctly', () => {
    const xml    = buildOxsXml(PAT_SIMPLE, PAL_SIMPLE, 3, 2, 14, [], 'Test');
    const result = _parseOXS(xml);
    expect(result.width).toBe(3);
    expect(result.height).toBe(2);
  });

  it('round-trips stitch positions: solid cells are non-skip in the re-imported pattern', () => {
    const xml    = buildOxsXml(PAT_SIMPLE, PAL_SIMPLE, 3, 2, 14, [], 'Test');
    const result = _parseOXS(xml);
    // Cells (0,0), (1,0), (2,0), (0,1), (1,1) solid; (2,1) = skip
    expect(result.pattern[0].id).not.toBe('__skip__');
    expect(result.pattern[1].id).not.toBe('__skip__');
    expect(result.pattern[2].id).not.toBe('__skip__');
    expect(result.pattern[3].id).not.toBe('__skip__');
    expect(result.pattern[4].id).not.toBe('__skip__');
    expect(result.pattern[5].id).toBe('__skip__');
  });

  it('round-trips colour identity: Black (310) re-imports as DMC 310', () => {
    const xml    = buildOxsXml(PAT_SIMPLE, PAL_SIMPLE, 3, 2, 14, [], 'Test');
    const result = _parseOXS(xml);
    // Cells 0, 1, 4 are thread 310 (Black)
    expect(result.pattern[0].id).toBe('310');
    expect(result.pattern[1].id).toBe('310');
    expect(result.pattern[4].id).toBe('310');
  });

  it('round-trips colour identity: Christmas Red (321) re-imports as DMC 321', () => {
    const xml    = buildOxsXml(PAT_SIMPLE, PAL_SIMPLE, 3, 2, 14, [], 'Test');
    const result = _parseOXS(xml);
    // Cells 2, 3 are thread 321
    expect(result.pattern[2].id).toBe('321');
    expect(result.pattern[3].id).toBe('321');
  });

  it('round-trips backstitch count: same number of segments survive', () => {
    const bsLines = [
      { x1: 0, y1: 0, x2: 1, y2: 0 },
      { x1: 1, y1: 0, x2: 1, y2: 1 }
    ];
    const xml    = buildOxsXml(PAT_SIMPLE, PAL_SIMPLE, 3, 2, 14, bsLines, 'Test');
    const result = _parseOXS(xml);
    expect(result.bsLines.length).toBe(2);
  });

  it('round-trips a larger 10×10 pattern without loss', () => {
    // Build a 10×10 pattern with two alternating colours
    const pal = [
      { type: 'solid', id: '310', name: 'Black',         rgb: [0,   0,   0],  count: 50 },
      { type: 'solid', id: '321', name: 'Christmas Red', rgb: [199, 43, 59],  count: 50 }
    ];
    const pat = [];
    for (let i = 0; i < 100; i++) {
      const id = i % 2 === 0 ? '310' : '321';
      pat.push({ type: 'solid', id, name: '', rgb: id === '310' ? [0, 0, 0] : [199, 43, 59] });
    }
    const xml    = buildOxsXml(pat, pal, 10, 10, 14, [], 'Big Pattern');
    const result = _parseOXS(xml);
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
    expect(result.stitchCount).toBe(100);
    result.pattern.forEach(function(cell) {
      expect(cell.id).not.toBe('__skip__');
    });
  });
});
