// tests/parseBulkThreadList.test.js
// Tests for parseBulkThreadList() extracted from creator/BulkAddModal.js

const fs = require('fs');

// Extract just parseBulkThreadList from BulkAddModal.js.
// The file is an IIFE, so we extract the inner function via regex.
const src = fs.readFileSync('./creator/BulkAddModal.js', 'utf8');

function extractFn(source, name) {
  const start = source.indexOf(`\n  function ${name}(`);
  if (start === -1) throw new Error(`Could not find function ${name} in BulkAddModal.js`);
  let depth = 0, i = start;
  while (i < source.length) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { if (--depth === 0) return source.slice(start, i + 1); }
    i++;
  }
  throw new Error(`Could not extract ${name}`);
}

eval(extractFn(src, 'parseBulkThreadList')); // eslint-disable-line no-eval

// ─── parseBulkThreadList ──────────────────────────────────────────────────────

describe('parseBulkThreadList', () => {
  test('parses comma-separated list', () => {
    const result = parseBulkThreadList('310,321,blanc', 'dmc');
    expect(result).toHaveLength(3);
    expect(result[0].normalised).toBe('310');
    expect(result[1].normalised).toBe('321');
    expect(result[2].normalised).toBe('blanc');
  });

  test('parses newline-separated list', () => {
    const result = parseBulkThreadList('310\n321\nblanc', 'dmc');
    expect(result).toHaveLength(3);
    expect(result.map(r => r.normalised)).toEqual(['310', '321', 'blanc']);
  });

  test('parses space-separated list', () => {
    const result = parseBulkThreadList('310 321 blanc', 'dmc');
    expect(result).toHaveLength(3);
  });

  test('strips DMC prefix — prefix-only tokens are dropped, IDs kept', () => {
    // "DMC 310" splits into ["DMC", "310"]; "DMC" normalises to "" and is filtered out
    const result = parseBulkThreadList('DMC 310, dmc 321, DMC321', 'dmc');
    expect(result.map(r => r.normalised)).toEqual(['310', '321', '321']);
  });

  test('strips Anchor/Anch prefix — prefix-only tokens are dropped', () => {
    // "Anchor 403" splits into ["Anchor", "403"]; "Anchor" normalises to "" and is filtered
    const result = parseBulkThreadList('Anchor 403, Anch 9046, anch.44', 'anchor');
    expect(result.map(r => r.normalised)).toEqual(['403', '9046', '44']);
  });

  test('strips hash prefix', () => {
    const result = parseBulkThreadList('#310, #blanc', 'dmc');
    expect(result.map(r => r.normalised)).toEqual(['310', 'blanc']);
  });

  test('preserves raw token for each entry', () => {
    // "DMC 310" is split into ["DMC", "310"]; "DMC" is dropped, raw for ID is "310"
    const result = parseBulkThreadList('DMC 310', 'dmc');
    expect(result).toHaveLength(1);
    expect(result[0].raw).toBe('310');
    expect(result[0].normalised).toBe('310');
  });

  test('ignores empty tokens from multiple delimiters', () => {
    const result = parseBulkThreadList('310,,, 321\n\nblanc', 'dmc');
    expect(result).toHaveLength(3);
  });

  test('handles empty string', () => {
    expect(parseBulkThreadList('', 'dmc')).toHaveLength(0);
  });

  test('handles whitespace-only string', () => {
    expect(parseBulkThreadList('   \n  ', 'dmc')).toHaveLength(0);
  });

  test('mixed delimiters in realistic paste', () => {
    const input = `310
321, blanc
3865; 402`;
    const result = parseBulkThreadList(input, 'dmc');
    expect(result.map(r => r.normalised)).toEqual(['310', '321', 'blanc', '3865', '402']);
  });
});
