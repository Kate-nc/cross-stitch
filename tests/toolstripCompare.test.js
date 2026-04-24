// tests/toolstripCompare.test.js
// A7 — Compare button in the Creator Sidebar Preview tab.
// Source-asserts the button's label, tooltip, aria attributes, and that
// it still calls the same setSplitPaneEnabled handler the `\` shortcut wires.
//
// (Originally lived in the top toolbar; moved into the Sidebar Preview tab
//  to declutter the toolbar — see commit removing the Preview dropdown.)

const fs = require('fs');
const path = require('path');

const SIDEBAR_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'creator', 'Sidebar.js'),
  'utf8'
);
const TOOLSTRIP_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'creator', 'ToolStrip.js'),
  'utf8'
);
const SHORTCUTS_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'creator', 'useKeyboardShortcuts.js'),
  'utf8'
);

describe('A7 — Compare button (Sidebar Preview tab)', () => {
  test('Sidebar Preview tab exposes a Compare control', () => {
    expect(SIDEBAR_SRC).toMatch(/Compare side-by-side|Exit compare/);
  });

  test('Compare button no longer lives in the top toolstrip', () => {
    expect(TOOLSTRIP_SRC).not.toMatch(/tb-btn--compare/);
    expect(TOOLSTRIP_SRC).not.toMatch(/setSplitPaneEnabled/);
  });

  test('button tooltip names the keyboard shortcut', () => {
    expect(SIDEBAR_SRC).toMatch(
      /Compare chart vs realistic preview \(\\\\\)/
    );
    expect(SIDEBAR_SRC).toMatch(/Exit compare view \(\\\\\)/);
  });

  test('button has aria-pressed reflecting splitPaneEnabled', () => {
    expect(SIDEBAR_SRC).toMatch(
      /"aria-pressed":\s*app\.splitPaneEnabled \? "true" : "false"/
    );
  });

  test('button toggles app.setSplitPaneEnabled', () => {
    expect(SIDEBAR_SRC).toMatch(/app\.setSplitPaneEnabled\(next\)/);
  });

  test('button persists choice via UserPrefs', () => {
    expect(SIDEBAR_SRC).toMatch(
      /UserPrefs\.set\("splitPaneEnabled",\s*next\)/
    );
  });

  test('backslash keyboard shortcut still toggles split-pane', () => {
    expect(SHORTCUTS_SRC).toMatch(/keys:\s*"\\\\"/);
    expect(SHORTCUTS_SRC).toMatch(/state\.setSplitPaneEnabled\(nextSplit\)/);
  });
});
