// tests/toolstripCompare.test.js
// A7 — Compare button in the Creator toolstrip.
// Source-asserts the button's label, tooltip, aria attributes, and that
// it still calls the same setSplitPaneEnabled handler the `\` shortcut wires.

const fs = require('fs');
const path = require('path');

const TOOLSTRIP_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'creator', 'ToolStrip.js'),
  'utf8'
);
const SHORTCUTS_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'creator', 'useKeyboardShortcuts.js'),
  'utf8'
);

describe('A7 — Compare button', () => {
  test('toolstrip exposes a "Compare" label (not "Split")', () => {
    expect(TOOLSTRIP_SRC).toMatch(/" Compare"/);
    // No legacy " Split" label remains on the button itself.
    expect(TOOLSTRIP_SRC).not.toMatch(/svgSplit, !sc\.bs \? " Split"/);
  });

  test('button tooltip names the keyboard shortcut', () => {
    expect(TOOLSTRIP_SRC).toMatch(
      /Compare chart vs realistic preview \(\\\\\)/
    );
    expect(TOOLSTRIP_SRC).toMatch(/Exit compare view \(\\\\\)/);
  });

  test('button has aria-pressed reflecting splitPaneEnabled', () => {
    expect(TOOLSTRIP_SRC).toMatch(
      /"aria-pressed":\s*app\.splitPaneEnabled \? "true" : "false"/
    );
  });

  test('button toggles app.setSplitPaneEnabled', () => {
    expect(TOOLSTRIP_SRC).toMatch(/app\.setSplitPaneEnabled\(next\)/);
  });

  test('button persists choice via UserPrefs', () => {
    expect(TOOLSTRIP_SRC).toMatch(
      /UserPrefs\.set\("splitPaneEnabled",\s*next\)/
    );
  });

  test('backslash keyboard shortcut still toggles split-pane', () => {
    expect(SHORTCUTS_SRC).toMatch(/keys:\s*"\\\\"/);
    expect(SHORTCUTS_SRC).toMatch(/state\.setSplitPaneEnabled\(nextSplit\)/);
  });
});
