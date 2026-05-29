/**
 * @jest-environment jsdom
 */
// OXS round-trip test — generateOXS() → parseOXS() → verify fidelity
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
  extractFn(raw, 'parseOXS') + '\n' +
  extractFn(raw, 'generateOXS') + '\n';

// eslint-disable-next-line no-eval
eval(helperCode);

// ─── Helpers ─────────────────────────────────────────────────────────────
function solidPattern(w, h, threadId, rgb) {
  const cell = { id: threadId, type: 'solid', rgb };
  return new Array(w * h).fill(null).map(() => Object.assign({}, cell));
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('generateOXS + parseOXS round-trip', () => {

  test('simple 3×2 single-colour pattern round-trips correctly', () => {
    const project = {
      w: 3, h: 2,
      name: 'Test',
      pattern: solidPattern(3, 2, '310', [0, 0, 0]),
      bsLines: [],
    };

    const { xml, warnings } = generateOXS(project);
    expect(warnings).toHaveLength(0);

    const result = parseOXS(xml);
    expect(result.width).toBe(3);
    expect(result.height).toBe(2);
    expect(result.pattern).toHaveLength(6);

    // All cells should map to DMC 310.
    result.pattern.forEach(cell => {
      expect(cell.id).toBe('310');
    });
  });

  test('multi-colour pattern: palette indices map back to correct threads', () => {
    // 4×1 row: [310, 666, 310, 666]
    const pattern = [
      { id: '310', type: 'solid', rgb: [0, 0, 0] },
      { id: '666', type: 'solid', rgb: [204, 0, 0] },
      { id: '310', type: 'solid', rgb: [0, 0, 0] },
      { id: '666', type: 'solid', rgb: [204, 0, 0] },
    ];
    const project = { w: 4, h: 1, name: 'Multi', pattern, bsLines: [] };

    const { xml, warnings } = generateOXS(project);
    expect(warnings).toHaveLength(0);

    const result = parseOXS(xml);
    expect(result.width).toBe(4);
    expect(result.height).toBe(1);
    expect(result.pattern[0].id).toBe('310');
    expect(result.pattern[1].id).toBe('666');
    expect(result.pattern[2].id).toBe('310');
    expect(result.pattern[3].id).toBe('666');
  });

  test('skip/empty cells are excluded from XML and round-trip as null/skip', () => {
    const pattern = [
      { id: '__skip__' },
      { id: '310', type: 'solid', rgb: [0, 0, 0] },
      { id: '__empty__' },
      { id: '666', type: 'solid', rgb: [204, 0, 0] },
    ];
    const project = { w: 4, h: 1, name: 'Gaps', pattern, bsLines: [] };

    const { xml } = generateOXS(project);
    // The XML should only have 2 <stitch> elements.
    const stitchMatches = xml.match(/<stitch /g) || [];
    expect(stitchMatches).toHaveLength(2);

    const result = parseOXS(xml);
    // Gaps should be represented as null or __skip__ in parseOXS output.
    const nonNull = result.pattern.filter(c => c && c.id !== '__skip__' && c.id !== '__empty__');
    expect(nonNull).toHaveLength(2);
  });

  test('blend stitch is downgraded to primary thread with a warning', () => {
    const pattern = [
      { id: '310+550', type: 'blend', rgb: [34, 0, 43] },
      { id: '310+550', type: 'blend', rgb: [34, 0, 43] },
    ];
    const project = { w: 2, h: 1, name: 'Blend', pattern, bsLines: [] };

    const { xml, warnings } = generateOXS(project);
    // Should warn exactly once for the blend id.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/310\+550/);
    expect(warnings[0]).toMatch(/exported as primary thread/);

    const result = parseOXS(xml);
    result.pattern.filter(Boolean).forEach(cell => {
      expect(cell.id).toBe('310');
    });
  });

  test('backstitch lines are preserved in XML', () => {
    const pattern = solidPattern(3, 3, '310', [0, 0, 0]);
    const bsLines = [
      { x1: 0, y1: 0, x2: 1, y2: 1 },
      { x1: 1, y1: 1, x2: 2, y2: 2 },
    ];
    const project = { w: 3, h: 3, name: 'BS', pattern, bsLines };

    const { xml, warnings } = generateOXS(project);
    expect(warnings).toHaveLength(0);

    const bsMatches = xml.match(/<backstitch /g) || [];
    expect(bsMatches).toHaveLength(2);
  });

  test('project name is included in XML title element', () => {
    const project = {
      w: 2, h: 2,
      name: 'My Pattern',
      pattern: solidPattern(2, 2, '666', [204, 0, 0]),
      bsLines: [],
    };
    const { xml } = generateOXS(project);
    expect(xml).toContain('<title>My Pattern</title>');
  });

  test('special characters in name are XML-escaped', () => {
    const project = {
      w: 1, h: 1,
      name: '<Test> & "Pattern\'s"',
      pattern: [{ id: '310', type: 'solid', rgb: [0, 0, 0] }],
      bsLines: [],
    };
    const { xml } = generateOXS(project);
    // Should not contain raw unescaped < or & in the title.
    const titleMatch = xml.match(/<title>(.*?)<\/title>/s);
    expect(titleMatch).not.toBeNull();
    expect(titleMatch[1]).not.toContain('<Test>');
    expect(titleMatch[1]).toContain('&lt;Test&gt;');
  });

  test('returns empty palette and no stitches for all-skip pattern', () => {
    const project = {
      w: 2, h: 2,
      name: 'Empty',
      pattern: [
        { id: '__skip__' }, { id: '__skip__' },
        { id: '__empty__' }, { id: '__skip__' },
      ],
      bsLines: [],
    };
    const { xml, warnings } = generateOXS(project);
    expect(warnings).toHaveLength(0);
    const stitchMatches = xml.match(/<stitch /g) || [];
    expect(stitchMatches).toHaveLength(0);
    // Dimensions must still be correct in the XML.
    expect(xml).toContain('chartwidth="2"');
    expect(xml).toContain('chartheight="2"');
    // parseOXS throws for patterns with no stitches (by design — no project to open).
    expect(() => parseOXS(xml)).toThrow();
  });

  test('dimensions are encoded in properties element', () => {
    const project = {
      w: 100, h: 75,
      name: 'Large',
      pattern: new Array(100 * 75).fill({ id: '__skip__' }),
      bsLines: [],
    };
    const { xml } = generateOXS(project);
    expect(xml).toContain('chartwidth="100"');
    expect(xml).toContain('chartheight="75"');
  });
});
