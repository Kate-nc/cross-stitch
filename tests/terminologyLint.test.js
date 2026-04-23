// Ensures the terminology lint script stays clean. Acts as a CI guard so new
// user-facing strings are checked against TERMINOLOGY.md.
const { lintAll } = require('../scripts/lint-terminology.js');

describe('terminology lint', () => {
  test('no forbidden terms in user-facing files', () => {
    const hits = lintAll();
    if (hits.length > 0) {
      // Pretty-print so jest output is actionable.
      const lines = hits.map(h => `${h.file}:${h.line}  '${h.term}' → '${h.suggested}'\n    ${h.snippet}`);
      throw new Error('Terminology lint failed (' + hits.length + ' issue(s)):\n' + lines.join('\n'));
    }
    expect(hits.length).toBe(0);
  });
});
