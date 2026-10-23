// tests/createSidebarTabs.test.js — Pattern Creator toolbar rework (2026-Q2):
// the Create-mode sidebar is now five task-oriented tabs and the duplicate
// "Generate" button has been removed from the top toolbar.

const fs = require('fs');
const path = require('path');

function read(p) { return fs.readFileSync(path.join(__dirname, '..', p), 'utf8'); }

describe('Convert and Edit each have their own tabs', () => {
  const sidebarSrc = read('creator/Sidebar.js');
  const convertSrc = read('creator/ConvertPanel.js');
  const stateSrc   = read('creator/useCreatorState.js');

  it('Edit has Palette / Tools / View / Preview / Project, with Tools and View locked until a pattern exists', () => {
    const m = sidebarSrc.match(/var editTabs\s*=\s*\[([\s\S]*?)\];/);
    expect(m).toBeTruthy();
    const ids = Array.from(m[1].matchAll(/id:\s*"([^"]+)"/g)).map(x => x[1]);
    expect(ids).toEqual(['palette', 'tools', 'view', 'preview', 'project']);
    expect(m[1]).toMatch(/id:\s*"tools"[\s\S]{0,160}disabled:\s*!hasPattern/);
    expect(m[1]).toMatch(/id:\s*"view"[\s\S]{0,160}disabled:\s*!hasPattern/);
  });

  it('Convert steps are Picture / Size / Threads / Detail / Project, each falling through to the next', () => {
    const m = convertSrc.match(/var CONVERT_TABS = \[([\s\S]*?)\];/);
    const ids = Array.from(m[1].matchAll(/id: "([^"]+)"/g)).map(x => x[1]);
    expect(ids).toEqual(['picture', 'size', 'threads', 'detail', 'project']);
    const next = Array.from(m[1].matchAll(/next: (null|"[^"]+")/g)).map(x => x[1]);
    expect(next).toEqual(['"size"', '"threads"', '"detail"', '"project"', 'null']);
  });

  it('no longer ships the legacy single-Settings tab, nor the old Convert ids in Edit', () => {
    expect(sidebarSrc).not.toMatch(/id:\s*"settings"/);
    expect(sidebarSrc).not.toMatch(/id:\s*"image"/);
    expect(sidebarSrc).not.toMatch(/id:\s*"dimensions"/);
  });

  it('a stored Edit tab Edit no longer has opens Palette', () => {
    expect(stateSrc).toMatch(/var EDIT_SIDEBAR_TABS = \["palette", "tools", "view", "preview", "project"\];/);
    expect(stateSrc).toMatch(/return EDIT_SIDEBAR_TABS\.indexOf\(v\) >= 0 \? v : "palette";/);
  });

  it('persists the chosen Edit tab via UserPrefs; a new picture starts Convert on Picture', () => {
    expect(stateSrc).toMatch(/UserPrefs\.set\("creator\.sidebarTab"/);
    expect(stateSrc).toMatch(/_setConvertTabRaw\("picture"\);/);
  });

  it('Convert is one panel component; the old accordion sections are gone', () => {
    expect(sidebarSrc).not.toMatch(/var createPanel\s*=/);
    expect(sidebarSrc).not.toMatch(/var (dimSection|palSection|tidySection|bgSection|adjSection)\b/);
    expect(sidebarSrc).not.toMatch(/Show all conversion controls/);
    expect(convertSrc).not.toMatch(/h\(Section,/);
  });
});

describe('Convert has no chart tool strip', () => {
  const stripSrc = read('creator/ToolStrip.js');

  it('returns nothing in Convert: it shows the live preview, and the chart tools are Edit\'s', () => {
    const splitMarker = '// ─── Edit Mode: full editing toolbar';
    const createSection = stripSrc.split(splitMarker)[0];
    expect(createSection).toMatch(/if \(app\.appMode === "create"\) return null;/);
    expect(createSection).not.toMatch(/Generate/);
  });
});

describe('Convert panel shows each control once (audit B-16)', () => {
  // Rendered and counted step by step in tests/convertPanel.test.js.
  const convertSrc = fs.readFileSync(path.join(__dirname, '..', 'creator/ConvertPanel.js'), 'utf8');

  it('renders the background switch once, in the Background section', () => {
    expect(convertSrc.match(/label: "Leave background unstitched"/g) || []).toHaveLength(1);
    const bg = convertSrc.indexOf('var background = sec("background"');
    expect(convertSrc.indexOf('"Leave background unstitched"', bg)).toBeGreaterThan(bg);
  });

  it('renders one fabric block, in the Size step', () => {
    expect(convertSrc.match(/FABRIC_COUNTS\.map\(/g) || []).toHaveLength(0);
    expect(convertSrc.match(/window\.CreatorFabricBlock/g) || []).toHaveLength(1);
    expect(convertSrc).toMatch(/else if \(tab === "size"\) content = \[sizeSec, fabricSec\];/);
    expect(convertSrc).toMatch(/Skein estimates assume 2 strands and 8 m per skein\./);
  });
});
