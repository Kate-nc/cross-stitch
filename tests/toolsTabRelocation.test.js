// tests/toolsTabRelocation.test.js
// Edit-mode toolbar consolidation: stitch type, brush size, lasso modes
// and the backstitch continuous toggle moved from the top toolbar into a
// new "Tools" sidebar tab. Adds a `T` shortcut to cycle stitch types.
//
// These are source-level assertions in the same style as
// toolstripCompare.test.js — no DOM render is required.

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

describe('Edit-mode toolbar consolidation — Tools sidebar tab', () => {
  test('Tools tab is present in the edit-mode tab list (Polish A: leads the row, Palette locked to slot 3)', () => {
    expect(SIDEBAR_SRC).toMatch(
      /editTabs\s*=\s*\[[\s\S]*?\["tools","Tools"\][\s\S]*?\["view","View"\][\s\S]*?\["palette","Palette"\][\s\S]*?\["preview","Preview"\][\s\S]*?\["more","More"\]/
    );
  });

  test('Tools tab is rendered when sTab === "tools"', () => {
    expect(SIDEBAR_SRC).toMatch(/sTab === "tools" && toolsContent/);
  });

  test('Tools tab content includes the stitch-type chooser', () => {
    expect(SIDEBAR_SRC).toMatch(/"Stitch type"/);
    // All six options live in the tab.
    expect(SIDEBAR_SRC).toMatch(/\["cross",\s*"Cross"\]/);
    expect(SIDEBAR_SRC).toMatch(/\["quarter",\s*"\\u00BC Stitch"\]/);
    expect(SIDEBAR_SRC).toMatch(/\["half-fwd",\s*"Half \/"\]/);
    expect(SIDEBAR_SRC).toMatch(/\["half-bck",\s*"Half \\\\"\]/);
    expect(SIDEBAR_SRC).toMatch(/\["three-quarter",\s*"\\u00BE Stitch"\]/);
    expect(SIDEBAR_SRC).toMatch(/\["backstitch",\s*"Backstitch"\]/);
  });

  test('Tools tab content includes the brush-size control', () => {
    expect(SIDEBAR_SRC).toMatch(/"Brush size"/);
    expect(SIDEBAR_SRC).toMatch(/cv\.setBrushSize/);
  });

  test('Tools tab content includes the lasso-mode picker', () => {
    expect(SIDEBAR_SRC).toMatch(/"Lasso mode"/);
    expect(SIDEBAR_SRC).toMatch(
      /lassoModes\s*=\s*\[\["freehand","Freehand"\],\["polygon","Polygon"\],\["magnetic","Magnetic"\]\]/
    );
  });

  test('Tools tab content includes the backstitch continuous toggle', () => {
    expect(SIDEBAR_SRC).toMatch(/"Backstitch options"/);
    expect(SIDEBAR_SRC).toMatch(/cv\.setBsContinuous/);
    expect(SIDEBAR_SRC).toMatch(/Continuous mode/);
  });

  test('Top toolbar no longer contains the moved controls', () => {
    // Stitch-type dropdown removed.
    expect(TOOLSTRIP_SRC).not.toMatch(/stitchDrop/);
    expect(TOOLSTRIP_SRC).not.toMatch(/openDrop\s*===\s*"stitch"/);
    // Brush-size 1/2/3 buttons removed.
    expect(TOOLSTRIP_SRC).not.toMatch(/sizeGrp/);
    // Backstitch continuous toggle removed.
    expect(TOOLSTRIP_SRC).not.toMatch(/bsCont\s*=\s*\(cv\.stitchType/);
    // Lasso sub-mode dropdown items removed.
    expect(TOOLSTRIP_SRC).not.toMatch(/openDrop\s*===\s*"select"/);
    // Selected-colour chip removed.
    expect(TOOLSTRIP_SRC).not.toMatch(/var colChip\s*=/);
  });

  test('Top toolbar keeps Paint/Fill/Erase/Pick + Wand/Lasso primary buttons', () => {
    expect(TOOLSTRIP_SRC).toMatch(/"Paint \(P\)"/);
    expect(TOOLSTRIP_SRC).toMatch(/"Fill \(F\)"/);
    expect(TOOLSTRIP_SRC).toMatch(/"Erase \(5\)"/);
    expect(TOOLSTRIP_SRC).toMatch(/"Eyedropper \(I\)"/);
    expect(TOOLSTRIP_SRC).toMatch(/"Magic Wand \(W\)"/);
    expect(TOOLSTRIP_SRC).toMatch(/title:"Lasso \\u2014 mode in Tools tab"/);
  });

  test('T cycles the stitch type forward', () => {
    expect(SHORTCUTS_SRC).toMatch(/id:\s*"creator\.stitch\.cycle"/);
    expect(SHORTCUTS_SRC).toMatch(/keys:\s*"t"/);
    expect(SHORTCUTS_SRC).toMatch(
      /\["cross","quarter","half-fwd","half-bck","three-quarter","backstitch"\]/
    );
    expect(SHORTCUTS_SRC).toMatch(/state\.selectStitchType\(next\)/);
  });

  test('Shift+T cycles the stitch type backward', () => {
    expect(SHORTCUTS_SRC).toMatch(/id:\s*"creator\.stitch\.cycleBack"/);
    expect(SHORTCUTS_SRC).toMatch(/keys:\s*"shift\+t"/);
    expect(SHORTCUTS_SRC).toMatch(/state\.selectStitchType\(prev\)/);
  });
});
