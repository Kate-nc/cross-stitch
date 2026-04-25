/* tests/pdfThemePref.test.js — UX-12 Phase 7 PR #14
 *
 * Verifies the user-facing pieces of the Workshop print theme:
 *   - the new pref's default in user-prefs.js
 *   - the export dialog renders the labelled checkbox
 *   - the label is British English with no emoji.
 */
const fs = require('fs');
const path = require('path');

const PREFS_SRC      = fs.readFileSync(path.join(__dirname, '..', 'user-prefs.js'), 'utf8');
const EXPORT_TAB_SRC = fs.readFileSync(path.join(__dirname, '..', 'creator', 'ExportTab.js'), 'utf8');
const BUNDLE_SRC     = fs.readFileSync(path.join(__dirname, '..', 'creator', 'bundle.js'), 'utf8');

describe('user-prefs.js DEFAULTS', () => {
  test('defines creator.pdfWorkshopTheme: false', () => {
    // Quoted dotted key + literal false value. Slight regex flexibility for
    // surrounding whitespace and a trailing comment.
    expect(/["']creator\.pdfWorkshopTheme["']\s*:\s*false/.test(PREFS_SRC)).toBe(true);
  });
});

describe('ExportTab.js dialog UI', () => {
  test('renders a labelled checkbox for the Workshop print theme', () => {
    expect(/Workshop print theme \(terracotta grid \+ linen background\)/.test(EXPORT_TAB_SRC)).toBe(true);
  });

  test('checkbox is wired to the workshopTheme React state', () => {
    expect(/checked:\s*workshopTheme\[0\]/.test(EXPORT_TAB_SRC)).toBe(true);
    expect(/setWorkshopTheme\(e\.target\.checked\)/.test(EXPORT_TAB_SRC)).toBe(true);
  });

  test('label includes the British-English clarifying note about Pattern Keeper', () => {
    expect(/Pattern Keeper compatibility uses the standard black-grid output/.test(EXPORT_TAB_SRC)).toBe(true);
  });

  test('label string is plain ASCII / British English with no emoji glyphs', () => {
    // Just check the new strings — not the whole file (existing decorative
    // arrows ▲ ▼ predate this PR and are unrelated to PR #14).
    var labelMatch = EXPORT_TAB_SRC.match(/"Workshop print theme[^"]*"/);
    expect(labelMatch).not.toBeNull();
    var noteMatch = EXPORT_TAB_SRC.match(/"Off by default\.[^"]*"/);
    expect(noteMatch).not.toBeNull();
    var emojiRe = /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{2700}-\u{27BF}\u{2600}-\u{26FF}\u2192\u2190\u2713\u2717]/u;
    expect(emojiRe.test(labelMatch[0])).toBe(false);
    expect(emojiRe.test(noteMatch[0])).toBe(false);
  });

  test('options.theme is forwarded to runExport for both single and bundle PDFs', () => {
    var matches = EXPORT_TAB_SRC.match(/theme:\s*workshopTheme\[0\]\s*\?\s*"workshop"\s*:\s*"pk"/g) || [];
    // Once for `var opts =` (single PDF), once for `var pdfOpts =` (bundle).
    expect(matches.length).toBe(2);
  });
});

describe('creator/bundle.js regenerated', () => {
  test('bundle includes the new pref name', () => {
    expect(BUNDLE_SRC.indexOf('creator.pdfWorkshopTheme')).toBeGreaterThan(-1);
  });

  test('bundle includes the new theme option pass-through', () => {
    expect(/theme:\s*workshopTheme\[0\]\s*\?\s*"workshop"\s*:\s*"pk"/.test(BUNDLE_SRC)).toBe(true);
  });

  test('bundle exposes Layout.themeColors helper', () => {
    expect(/themeColors:\s*themeColors/.test(BUNDLE_SRC)).toBe(true);
  });
});
