// tests/threadKey.test.js
// Tests for the composite thread-key helpers added to helpers.js:
// threadKey, parseThreadKey, getThreadByKey, classifyMatch

const fs = require('fs');

// Extract the four helper functions from helpers.js using regex+eval.
// helpers.js has no module.exports so we pull out the functions we need.
const helpersSource = fs.readFileSync('./helpers.js', 'utf8');

function extractFn(src, name) {
  // Match "function name(" at top-level (no leading spaces)
  const start = src.indexOf(`\nfunction ${name}(`);
  if (start === -1) throw new Error(`Could not find function ${name} in helpers.js`);
  let depth = 0, i = start;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { if (--depth === 0) return src.slice(start, i + 1); }
    i++;
  }
  throw new Error(`Could not extract function ${name}`);
}

// We need UNIQUE_THRESHOLD_DE for classifyMatch; mock it as a const before eval.
const mockGlobals = `
  var window = {};
  var DMC = [
    { id: '310', name: 'Black', rgb: [0,0,0], lab: [0,0,0] },
    { id: '321', name: 'Christmas Red', rgb: [187,26,42], lab: [36,56,35] },
    { id: 'blanc', name: 'White', rgb: [255,255,255], lab: [100,0,0] }
  ];
  var ANCHOR = [
    { id: '403', name: 'Black', rgb: [0,0,0], lab: [0,0,0] },
    { id: '9046', name: 'Red', rgb: [193,28,44], lab: [36,56,34] }
  ];
  var UNIQUE_THRESHOLD_DE = 5;
`;

const code = mockGlobals
  + extractFn(helpersSource, 'threadKey') + '\n'
  + extractFn(helpersSource, 'parseThreadKey') + '\n'
  + extractFn(helpersSource, 'getThreadByKey') + '\n'
  + extractFn(helpersSource, 'classifyMatch') + '\n';

eval(code); // eslint-disable-line no-eval

// ─── threadKey ────────────────────────────────────────────────────────────────

describe('threadKey', () => {
  test('produces composite key for DMC', () => {
    expect(threadKey('dmc', '310')).toBe('dmc:310');
  });

  test('produces composite key for Anchor', () => {
    expect(threadKey('anchor', '403')).toBe('anchor:403');
  });

  test('handles unusual brand names', () => {
    expect(threadKey('madeira', '1000')).toBe('madeira:1000');
  });
});

// ─── parseThreadKey ───────────────────────────────────────────────────────────

describe('parseThreadKey', () => {
  test('parses dmc composite key', () => {
    expect(parseThreadKey('dmc:310')).toEqual({ brand: 'dmc', id: '310' });
  });

  test('parses anchor composite key', () => {
    expect(parseThreadKey('anchor:403')).toEqual({ brand: 'anchor', id: '403' });
  });

  test('bare key (legacy DMC id) defaults to dmc brand', () => {
    expect(parseThreadKey('310')).toEqual({ brand: 'dmc', id: '310' });
    expect(parseThreadKey('blanc')).toEqual({ brand: 'dmc', id: 'blanc' });
  });

  test('roundtrip: parseThreadKey(threadKey(brand, id)) === {brand, id}', () => {
    expect(parseThreadKey(threadKey('dmc', '321'))).toEqual({ brand: 'dmc', id: '321' });
    expect(parseThreadKey(threadKey('anchor', '9046'))).toEqual({ brand: 'anchor', id: '9046' });
  });

  test('handles non-string gracefully', () => {
    const result = parseThreadKey(null);
    expect(result).toHaveProperty('brand');
    expect(result).toHaveProperty('id');
  });
});

// ─── getThreadByKey ───────────────────────────────────────────────────────────

describe('getThreadByKey', () => {
  test('finds a DMC thread by composite key', () => {
    const t = getThreadByKey('dmc:310');
    expect(t).not.toBeNull();
    expect(t.name).toBe('Black');
  });

  test('finds a DMC thread by bare legacy key', () => {
    const t = getThreadByKey('310');
    expect(t).not.toBeNull();
    expect(t.id).toBe('310');
  });

  test('finds an Anchor thread by composite key', () => {
    const t = getThreadByKey('anchor:403');
    expect(t).not.toBeNull();
    expect(t.name).toBe('Black');
  });

  test('returns null for unknown thread', () => {
    expect(getThreadByKey('dmc:99999')).toBeNull();
    expect(getThreadByKey('anchor:99999')).toBeNull();
  });

  test('DMC and Anchor with same numeric id are found independently', () => {
    // DMC 403 doesn't exist in our mock but the lookup should not confuse brands
    const dmc = getThreadByKey('dmc:310');
    const anc = getThreadByKey('anchor:403');
    expect(dmc.name).toBe('Black');
    expect(anc.name).toBe('Black');
  });
});

// ─── classifyMatch ────────────────────────────────────────────────────────────

describe('classifyMatch', () => {
  test('ΔE = 0 → exact', () => {
    const m = classifyMatch(0, true);
    expect(m.kind).toBe('exact');
  });

  test('ΔE = 2 → exact (≤ 2 threshold)', () => {
    expect(classifyMatch(2, true).kind).toBe('exact');
  });

  test('ΔE = 3 → near (between 2 and UNIQUE_THRESHOLD_DE=5)', () => {
    expect(classifyMatch(3, false).kind).toBe('near');
  });

  test('ΔE = 5 → near (at UNIQUE_THRESHOLD_DE boundary)', () => {
    expect(classifyMatch(5, false).kind).toBe('near');
  });

  test('ΔE = 7 → different (between 5 and 10)', () => {
    expect(classifyMatch(7, false).kind).toBe('different');
  });

  test('ΔE = 15 → distant (> 10)', () => {
    expect(classifyMatch(15, false).kind).toBe('distant');
  });

  test('returns label string', () => {
    const m = classifyMatch(3, false);
    expect(typeof m.label).toBe('string');
    expect(m.label.length).toBeGreaterThan(0);
  });

  test('returns deltaE in the result', () => {
    const m = classifyMatch(4.5, false);
    expect(m.deltaE).toBe(4.5);
  });
});
