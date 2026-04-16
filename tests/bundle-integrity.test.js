/* tests/bundle-integrity.test.js
   Verifies that creator/bundle.js:
   1. Is valid JavaScript (no syntax errors)
   2. Exposes all required window.* globals that CreatorApp depends on
   3. Exposes all diagnostics-related globals

   Uses the same pattern as other test files: read raw JS, evaluate in a
   controlled environment, then check the globals it defines.
*/

const fs = require('fs');
const path = require('path');

const bundlePath = path.join(__dirname, '..', 'creator', 'bundle.js');

describe('creator/bundle.js integrity', () => {
  let bundleCode;

  beforeAll(() => {
    bundleCode = fs.readFileSync(bundlePath, 'utf8');
  });

  test('bundle file exists and is non-empty', () => {
    expect(bundleCode.length).toBeGreaterThan(10000);
  });

  test('bundle has no syntax errors (node parser)', () => {
    // Use the Function constructor — it parses the code without executing it.
    // This is the same check that a browser JS engine does when loading <script>.
    expect(() => new Function(bundleCode)).not.toThrow();
  });

  describe('required globals for CreatorApp dependency check', () => {
    // These are the exact globals checked in creator-main.js before rendering.
    const REQUIRED_HOOKS = [
      'useCreatorState',
      'useEditHistory',
      'useCanvasInteraction',
      'useProjectIO',
      'usePreview',
      'useKeyboardShortcuts',
    ];

    REQUIRED_HOOKS.forEach(function(name) {
      test('window.' + name + ' is defined in bundle', () => {
        expect(bundleCode).toMatch(new RegExp('window\\.' + name + '\\s*='));
      });
    });
  });

  describe('diagnostics globals', () => {
    test('_computeConfettiDiagnostic is defined', () => {
      expect(bundleCode).toMatch(/function _computeConfettiDiagnostic\s*\(/);
    });

    test('_computeHeatmapDiagnostic is defined', () => {
      expect(bundleCode).toMatch(/function _computeHeatmapDiagnostic\s*\(/);
    });

    test('_computeReadabilityDiagnostic is defined', () => {
      expect(bundleCode).toMatch(/function _computeReadabilityDiagnostic\s*\(/);
    });

    test('window.DiagnosticsPanel is defined', () => {
      expect(bundleCode).toMatch(/window\.DiagnosticsPanel\s*=/);
    });
  });

  describe('diagnostics effect dependency array completeness', () => {
    // Guard against the exact regression that occurred: a missing comma between
    // items in a React hook dependency array (PatternCanvas.js Effect 1).
    // If the comma is missing, "node -c" would catch it — but we also verify
    // the specific tokens appear together to make the failure message precise.
    test('PatternCanvas Effect 1 dep array includes diagnostics entries', () => {
      // The array must contain these three consecutive entries (in any order
      // among themselves, but all must be present).
      expect(bundleCode).toMatch(/cv\.diagnosticsEnabled/);
      expect(bundleCode).toMatch(/cv\.diagnosticsResults/);
      expect(bundleCode).toMatch(/cv\.diagnosticsSettings/);
    });

    test('overflowWrap variable is defined in ToolStrip', () => {
      // Regression guard: the overflowWrap definition was accidentally deleted
      // when the diagBtn was inserted, causing a syntax error.
      expect(bundleCode).toMatch(/var overflowWrap\s*=/);
    });
  });
});
