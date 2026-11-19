// tests/creatorRailHomes.test.js — Stage 2 C: with the tool rail on
// (creator.desktopRail), the desktop More panel is gone. Every control that
// was in it has a new home, reachable in at most two clicks from Edit. This
// lists where each one went (creator/toolRegistry.js RAIL_HOMES) and checks
// that home exists in the source.

const fs = require('fs');
const path = require('path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const reg = require('../creator/toolRegistry.js');
const strip = read('creator/ToolStrip.js');
const rail = read('creator/DesktopRail.js');
const main = read('creator-main.js');
const sidebar = read('creator/Sidebar.js');
const prefs = read('preferences-modal.js');

const homeOf = name => reg.RAIL_HOMES.find(r => r.control === name);

// Everything the desktop More panel showed: the registry's tools, then the
// panel's own sections in creator/ToolStrip.js.
const MORE_CONTROLS = reg.moreTools({ coarse: false }).map(t => t.id === 'hand' ? 'Navigate' : t.id === 'replace' ? 'Replace' : t.text)
  .concat(reg.moreTools({}, reg.MORE_CLEANUP).map(t => t.text))
  .concat(['Petite and long stitches', 'Pen draws; fingers navigate', 'Magnifier', 'Precision cursor',
    'Resize canvas', 'Re-generate from image', 'Stitch type', 'Brush size', 'Overlay']);

describe('the old More panel', () => {
  test('still has those controls when the rail is off (and on touch screens)', () => {
    for (const s of ['SpecialtyStitchPanel', '"Pen draws; fingers navigate"', '"Magnifier"', '"Precision cursor"',
      '" Resize canvas\\u2026"', '" Re-generate from image\\u2026"', '"Stitch type"', '"Brush size"', '" Overlay"']) {
      expect(strip).toContain(s);
    }
  });

  test('is not passed to the options bar in the rail layout', () => {
    expect(strip).toMatch(/h\(window\.CreatorOptionsBar, \{ modeRow: cleanupRow \|\| denoiseRow \}\)/);
  });
});

describe('where each More control went', () => {
  test('every control has exactly one row, two clicks at most', () => {
    expect(MORE_CONTROLS.length).toBeGreaterThanOrEqual(20);
    MORE_CONTROLS.forEach(name => {
      const rows = reg.RAIL_HOMES.filter(r => r.control === name);
      expect({ name, rows: rows.length }).toEqual({ name, rows: 1 });
      expect(rows[0].clicks).toBeGreaterThanOrEqual(1);
      expect(rows[0].clicks).toBeLessThanOrEqual(2);
    });
    // And nothing listed that wasn't in More.
    reg.RAIL_HOMES.forEach(r => expect(MORE_CONTROLS).toContain(r.control));
  });

  test('rail homes are on the rail', () => {
    reg.RAIL_HOMES.filter(r => /^Rail > /.test(r.home)).forEach(r => {
      const name = r.home.split(' > ')[1].split(',')[0];
      const tool = reg.list(reg.DESKTOP_RAIL).find(t => (t.railText || t.text) === name);
      expect({ control: r.control, onRail: !!tool }).toEqual({ control: r.control, onRail: true });
    });
    expect(reg.get('shapes').children.map(id => reg.get(id).text)).toEqual(['Line', 'Rectangle', 'Ellipse']);
  });

  test('options bar homes exist in creator/DesktopRail.js', () => {
    expect(homeOf('Move').home).toMatch(/Selection > Move selection/);
    expect(rail).toContain('"Move selection"');
    expect(homeOf('Paste').home).toMatch(/Options bar > Paste/);
    expect(rail).toMatch(/btn\("Paste"/);
    expect(rail).toMatch(/btn\("Mirror"/);
    expect(rail).toMatch(/label\("Stitch"\)/);
    expect(rail).toMatch(/label\("Size"\)/);
    expect(rail).toMatch(/btn\("Clean up"/);
    expect(rail).toMatch(/var cleanTools = Reg\.list\(Reg\.MORE_CLEANUP\)/);
  });

  test('Pattern menu homes are in the header Pattern menu', () => {
    for (const id of ['resize', 'regenerate', 'replace', 'specialty']) {
      expect(main).toMatch(new RegExp("\\{ id:'" + id + "', label:"));
    }
    expect(main).toMatch(/pageMenuItems=\{_railPatternMenu\}/);
    expect(read('header.js')).toMatch(/\(pageMenuItems \|\| \[\]\)\.map/);
    // Replace colour and Petite and long stitches open from the options bar.
    expect(rail).toMatch(/id === "specialty"\) setSpecialtyOpen\(true\)/);
    expect(rail).toMatch(/id === "replace"\)/);
  });

  test('the picture overlay is in the View tab', () => {
    expect(homeOf('Overlay').home).toMatch(/View/);
    expect(sidebar).toMatch(/"Show the picture"/);
    expect(sidebar).toMatch(/"aria-label":"Overlay opacity"/);
  });

  test('Pen, Magnifier and Precision cursor are in Preferences, which opens on Pattern Creator', () => {
    expect(prefs).toMatch(/h\(Section, \{ title: "Touch and pen" \}/);
    for (const label of ['Pen draws; fingers navigate', 'Magnifier', 'Precision cursor']) {
      expect(prefs).toContain('label: "' + label + '"');
    }
    for (const key of ['creator.penNavigation', 'creator.magnifier', 'creator.precisionCursor']) {
      expect(prefs).toContain('usePref("' + key + '"');
    }
    expect(prefs).toMatch(/return "creator";\n\s*\}\)\(\);/);
    // The open Creator follows a change made there.
    expect(read('creator/useCreatorState.js')).toMatch(/k === "creator\.penNavigation"/);
  });
});

describe('the side panel in the rail layout', () => {
  test('is Palette, View and Project, with no Back to Convert', () => {
    const m = sidebar.match(/if \(railLayout\) \{\s*editTabs = \[([\s\S]*?)\];/);
    expect(m).toBeTruthy();
    expect(Array.from(m[1].matchAll(/id:"([^"]+)"/g)).map(x => x[1])).toEqual(['palette', 'view', 'project']);
    expect(sidebar).toMatch(/!railLayout && gen\.img && app\.sourceTab !== "canvas"/);
    expect(sidebar).toMatch(/railLayout && sTab === "preview"\) sTab = "view"/);
  });
});

describe('review fixes (PR #428)', () => {
  test('the options bar offers every brush size from 1 to 10, as the Tools tab slider did', () => {
    expect(rail).toMatch(/var BRUSH_SIZES = \[1, 2, 3, 4, 5, 6, 7, 8, 9, 10\];/);
  });

  test('picking the shape that is already on keeps it on', () => {
    expect(rail).toMatch(/segmented\("Shape", SHAPES, raw, function \(v\) \{ if \(v !== raw\) Reg\.get\(v\)\.activate\(api\);/);
  });

  test('Esc goes through the shared stack, so only the topmost overlay closes', () => {
    expect(rail).not.toMatch(/addEventListener\("keydown"/);
    expect(rail).toMatch(/window\.useEscape\(open \? handler : null\)/);
    expect(rail).toMatch(/useEscapeWhile\(specialtyOpen,/);
  });

  test('Fix outline colours and Reduce confetti rows sit outside the scrolling tool area', () => {
    expect(rail).toMatch(/props\.modeRow\s*\?\s*h\("div", \{ className: "creator-optbar__mode" \}, props\.modeRow\)\s*:\s*h\("div", \{ className: "creator-optbar__tool" \}, parts\)/);
  });

  test('Replace colour and Petite and long stitches are offered only with the chart showing', () => {
    expect(main).toMatch(/state\.tab==='pattern' \? \{ id:'replace'/);
    expect(main).toMatch(/state\.tab==='pattern' \? \{ id:'specialty'/);
  });
});
