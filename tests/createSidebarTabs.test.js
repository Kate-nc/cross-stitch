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

  it('declares Image / Dimensions / Palette / (locked Tools+View) / Preview / Project as the createTabs', () => {
    const m = sidebarSrc.match(/var createTabs\s*=\s*\[([\s\S]*?)\];/);
    expect(m).toBeTruthy();
    // Polish 13 — tabs are now {id,label,icon,...} objects (was [id,label] tuples).
    // Step 2: Tools and View are visible-but-locked entries in the pre-generate strip.
    const ids = Array.from(m[1].matchAll(/id:\s*"([^"]+)"/g)).map(x => x[1]);
    expect(ids).toEqual(['image', 'dimensions', 'palette', 'tools', 'view', 'preview', 'project']);
    // The two added entries must carry disabled:true so the tab strip
    // renders them as locked pills.
    expect(m[1]).toMatch(/id:\s*"tools"[\s\S]{0,120}disabled:\s*true/);
    expect(m[1]).toMatch(/id:\s*"view"[\s\S]{0,120}disabled:\s*true/);
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

  it('puts the Background section in the Preview tab content, not the Palette tab', () => {
    // Preview content must include bgSection ahead of previewPanel
    expect(sidebarSrc).toMatch(/var previewContent\s*=\s*h\(React\.Fragment[\s\S]*?bgSection[\s\S]*?previewPanel/);
    // Palette tab content must NOT mention bgSection
    const m = sidebarSrc.match(/var paletteContent\s*=\s*h\(React\.Fragment[\s\S]*?\);/);
    expect(m).toBeTruthy();
    expect(m[0]).not.toMatch(/bgSection/);
  });

  it('routes the active tab through a tabContentMap with all five panels', () => {
    expect(sidebarSrc).toMatch(/tabContentMap\s*=\s*\{[\s\S]*?image:[\s\S]*?dimensions:[\s\S]*?palette:[\s\S]*?preview:[\s\S]*?project:/);
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
