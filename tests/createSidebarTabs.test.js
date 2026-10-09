// tests/createSidebarTabs.test.js — Pattern Creator toolbar rework (2026-Q2):
// the Create-mode sidebar is now five task-oriented tabs and the duplicate
// "Generate" button has been removed from the top toolbar.

const fs = require('fs');
const path = require('path');

function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

describe('Create-mode sidebar — five task tabs', () => {
  const sidebarSrc = read('creator/Sidebar.js');
  const stateSrc   = read('creator/useCreatorState.js');
  const stripSrc   = read('creator/ToolStrip.js');

  it('declares Image / Dimensions / Palette / (locked Tools+View) / Preview / Project as the unifiedTabs', () => {
    // Polish 13 step 3 — createTabs is now an alias of unifiedTabs (a
    // single 7-tab array used in both appModes).
    const m = sidebarSrc.match(/var unifiedTabs\s*=\s*\[([\s\S]*?)\];/);
    expect(m).toBeTruthy();
    const ids = Array.from(m[1].matchAll(/id:\s*"([^"]+)"/g)).map(x => x[1]);
    expect(ids).toEqual(['image', 'dimensions', 'palette', 'tools', 'view', 'preview', 'project']);
    // Tools/View are locked (disabled) until a pattern exists.
    expect(m[1]).toMatch(/id:\s*"tools"[\s\S]{0,160}disabled:\s*!hasPattern/);
    expect(m[1]).toMatch(/id:\s*"view"[\s\S]{0,160}disabled:\s*!hasPattern/);
    // createTabs is preserved as a back-compat alias of unifiedTabs.
    expect(sidebarSrc).toMatch(/var createTabs\s*=\s*unifiedTabs;/);
  });

  it('no longer ships the legacy single-Settings tab', () => {
    expect(sidebarSrc).not.toMatch(/id:\s*"settings"/);
  });

  it('remaps a stored "settings" sidebarTab to "image" for back-compat', () => {
    expect(stateSrc).toMatch(/v === "settings"[\s\S]{0,40}return "image"/);
    expect(sidebarSrc).toMatch(/rawTab === "settings"[\s\S]{0,80}rawTab = "image"/);
  });

  it('persists the chosen sidebarTab via UserPrefs', () => {
    expect(stateSrc).toMatch(/UserPrefs\.set\("creator\.sidebarTab"/);
  });

  it('puts all conversion sections (background, fabric, palette, dimensions) in the single create-mode panel', () => {
    // Hybrid 1+5+3: create mode renders one scrollable createPanel with all
    // sections stacked vertically (no tabContentMap or separate tab-content vars).
    const cpIdx = sidebarSrc.indexOf('var createPanel');
    expect(cpIdx).toBeGreaterThan(0);
    // bgSection, palSection and dimSection must all appear inside the
    // createPanel definition (within 2000 chars of it). The fabric select
    // lives in dimSection (Output); the separate fabSection was a duplicate
    // (audit B-16).
    const cpBlock = sidebarSrc.slice(cpIdx, cpIdx + 2000);
    expect(cpBlock).toMatch(/bgSection/);
    expect(cpBlock).not.toMatch(/fabSection/);
    expect(cpBlock).toMatch(/palSection/);
    expect(cpBlock).toMatch(/dimSection/);
    // The old separate tab-content vars are gone from create mode.
    expect(sidebarSrc).not.toMatch(/var dimensionsContent\s*=\s*h\(React\.Fragment,[\s\S]*?bgSection/);
  });

  it('uses a single scrollable createPanel (not a tabContentMap) in create mode', () => {
    // Hybrid 1+5+3: create mode renders one scrollable panel with all sections
    // stacked vertically. The old tabContentMap routing is gone.
    expect(sidebarSrc).toMatch(/var createPanel\s*=/);
    expect(sidebarSrc).not.toMatch(/tabContentMap\s*=\s*\{/);
  });

  it('switches the Edit→Create button back to the Image tab (legacy "settings" id removed)', () => {
    expect(sidebarSrc).toMatch(/setSidebarTab\("image"\)/);
    // The legacy literal "settings" tab id must no longer appear as a setSidebarTab argument.
    expect(sidebarSrc).not.toMatch(/setSidebarTab\("settings"\)/);
  });
});

describe('Create-mode top toolbar — duplicate Generate removed', () => {
  const stripSrc = read('creator/ToolStrip.js');

  it('no longer renders a Generate / Regenerate button in the create-mode toolbar', () => {
    // Look at just the create-mode branch (everything before the
    // "Edit Mode: full editing toolbar" divider).
    const splitMarker = '// ─── Edit Mode: full editing toolbar';
    const createSection = stripSrc.split(splitMarker)[0];
    expect(createSection).not.toMatch(/aria-label.*Generate pattern/);
    expect(createSection).not.toMatch(/Regenerate/);
    expect(createSection).not.toMatch(/Generate/); // also rules out the comment
  });

  it('keeps the Overlay quick-toggle in the create-mode toolbar (uses Icons.image, no emoji)', () => {
    const splitMarker = '// ─── Edit Mode: full editing toolbar';
    const createSection = stripSrc.split(splitMarker)[0];
    expect(createSection).toMatch(/Icons\.image\(\)/);
    // The previous \uD83D\uDDBC (🖼) emoji must be gone.
    expect(createSection).not.toMatch(/\uD83D\uDDBC/);
  });
});

describe('Convert panel shows each control once (audit B-16)', () => {
  const sidebarSrc = fs.readFileSync(path.join(__dirname, '..', 'creator/Sidebar.js'), 'utf8');

  it('renders "Skip background" once, in the Background section', () => {
    expect(sidebarSrc.match(/h\("span", null, "Skip background"\)/g) || []).toHaveLength(1);
    const bg = sidebarSrc.indexOf('var bgSection');
    expect(sidebarSrc.indexOf('"Skip background"', bg)).toBeGreaterThan(bg);
  });

  it('renders one fabric select, in the Output section', () => {
    // The count select lives in the Fabric block (creator/FabricBlock.js, P2-2).
    expect(sidebarSrc.match(/FABRIC_COUNTS\.map\(/g) || []).toHaveLength(0);
    // One select, built by fabricSelect() and used in Size & fabric (and in
    // the Canvas tab for a design drawn from scratch, P2-1).
    const dim = sidebarSrc.indexOf('var dimSection');
    expect(sidebarSrc.indexOf('fabricBlock()', dim)).toBeGreaterThan(dim);
    expect(sidebarSrc).not.toMatch(/var fabSection/);
    expect(sidebarSrc).toMatch(/Skein estimates assume 2 strands and 8 m per skein\./);
  });
});
