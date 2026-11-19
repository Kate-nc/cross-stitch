// tests/creatorToolRegistry.test.js — the one list of Edit tools
// (creator/toolRegistry.js, Stage 2 pull request A).
//
// Every tool needs a label, a real window.Icons icon and, where it has a
// shortcut, the same key that creator/useKeyboardShortcuts.js registers.
// The touch rail and the More panel read their buttons from the list.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const reg = require('../creator/toolRegistry.js');

// Icons, built with a minimal createElement.
const React = { createElement: (type, props, ...kids) => ({ type, props, kids }) };
const win = {};
new Function('window', 'React', read('icons.js'))(win, React);

// The registered creator shortcuts: id -> keys (source parse; the hook is
// browser-only). Same entry shape as tests/helpDrawerShortcutsSync.test.js.
function creatorShortcuts() {
  const src = read('creator/useKeyboardShortcuts.js');
  const re = /\{\s*id:\s*"([^"]+)",\s*keys:\s*(\[[^\]]*\]|"[^"]*")/g;
  const out = {};
  let m;
  while ((m = re.exec(src))) {
    const raw = m[2];
    out[m[1]] = raw.charAt(0) === '['
      ? (raw.match(/"((?:[^"\\]|\\.)*)"/g) || []).map(s => JSON.parse(s))
      : [JSON.parse(raw)];
  }
  return out;
}

const SURFACES = ['touchRail', 'more', 'desktopRail'];
const GROUPS = ['draw', 'select', 'shape', 'view', 'adjust', 'cleanup', 'history'];
const KINDS = ['tool', 'toggle', 'action'];

describe('every tool in the registry', () => {
  test('ids are unique', () => {
    const ids = reg.TOOLS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.each(reg.TOOLS.map(t => [t.id, t]))('%s has a label, a short word, a title, a group, a kind and surfaces', (id, t) => {
    expect(typeof t.label).toBe('string');
    expect(t.label.trim().length).toBeGreaterThan(0);
    expect(typeof t.text).toBe('string');
    expect(t.text.trim().length).toBeGreaterThan(0);
    expect(typeof t.title).toBe('string');
    expect(GROUPS).toContain(t.group);
    expect(KINDS).toContain(t.kind);
    expect(Array.isArray(t.surfaces)).toBe(true);
    t.surfaces.forEach(s => expect(SURFACES).toContain(s));
    // A tool with no surface of its own appears through its parent button.
    if (!t.surfaces.length) expect(t.parent).toBeTruthy();
    expect(typeof t.isOn).toBe('function');
    expect(typeof t.activate).toBe('function');
  });

  test.each(reg.TOOLS.map(t => [t.id, t]))('%s uses an Icons icon that draws an svg', (id, t) => {
    expect(typeof win.Icons[t.icon]).toBe('function');
    expect(win.Icons[t.icon]().type).toBe('svg');
  });

  test('on a rail, the visible word is part of the accessible name', () => {
    // Hand reads "Navigate" (its long-standing name) in More and "Hand tool" on the rail.
    reg.TOOLS.filter(t => t.surfaces.indexOf('touchRail') !== -1 || t.surfaces.indexOf('desktopRail') !== -1).forEach(t => {
      const label = t.railLabel || t.label;
      const word = t.railText || t.text;
      expect(label.toLowerCase()).toContain(word.toLowerCase().split(' ')[0]);
    });
  });

  test('a shortcut matches the one creator/useKeyboardShortcuts.js registers', () => {
    const registered = creatorShortcuts();
    const withShortcut = reg.TOOLS.filter(t => t.shortcut);
    expect(withShortcut.length).toBeGreaterThanOrEqual(8);
    withShortcut.forEach(t => {
      expect(registered[t.shortcutId]).toBeDefined();
      expect(registered[t.shortcutId]).toContain(t.shortcut);
    });
    // And a tool without one names no registration.
    reg.TOOLS.filter(t => !t.shortcut).forEach(t => expect(t.shortcutId).toBeFalsy());
  });

  test('a tooltip that names a key names the registered one', () => {
    reg.TOOLS.filter(t => t.shortcut && /\(([^)]+)\)/.test(t.title)).forEach(t => {
      const shown = t.title.match(/\(([^)]+)\)/)[1];
      expect(shown.toLowerCase()).toBe(reg.shortcutLabel(t).toLowerCase());
    });
  });

  test('a shape belongs to the Shapes button and the Shapes button lists it', () => {
    const shapes = reg.get('shapes');
    expect(shapes.children).toEqual(['line', 'rect', 'ellipse']);
    shapes.children.forEach(id => expect(reg.get(id).parent).toBe('shapes'));
  });
});

describe('surfaces', () => {
  test('the touch rail is Paint, Fill, Erase, then Undo after the colour', () => {
    expect(reg.TOUCH_RAIL).toEqual(['paint', 'fill', 'erase']);
    expect(reg.TOUCH_RAIL_FOOT).toEqual(['undo']);
    reg.list(reg.TOUCH_RAIL.concat(reg.TOUCH_RAIL_FOOT)).forEach(t => expect(t.surfaces).toContain('touchRail'));
  });

  test('the desktop rail order follows the brief', () => {
    expect(reg.DESKTOP_RAIL).toEqual(['paint', 'fill', 'erase', 'pick', 'wand', 'lasso', 'shapes', 'text', 'hand']);
    expect(reg.DESKTOP_RAIL_FOOT).toEqual(['undo', 'redo']);
    reg.list(reg.DESKTOP_RAIL.concat(reg.DESKTOP_RAIL_FOOT)).forEach(t => expect(t.surfaces).toContain('desktopRail'));
  });

  test('More lists today\'s tools in today\'s order, and Navigate only with a mouse', () => {
    expect(reg.moreTools({ coarse: false }).map(t => t.id))
      .toEqual(['hand', 'pick', 'wand', 'lasso', 'move', 'paste', 'line', 'rect', 'ellipse', 'text', 'mirror', 'replace']);
    expect(reg.moreTools({ coarse: true }).map(t => t.id)).not.toContain('hand');
    expect(reg.moreTools({}, reg.MORE_CLEANUP).map(t => t.id)).toEqual(['cleanup', 'denoise']);
  });

  test('with the desktop rail on, More leaves out every tool the rail shows', () => {
    const more = reg.moreTools({ coarse: false, desktopRail: true }).map(t => t.id);
    reg.DESKTOP_RAIL.forEach(id => expect(more).not.toContain(id));
    ['line', 'rect', 'ellipse'].forEach(id => expect(more).not.toContain(id));
    // Mirror is a switch in the options bar instead.
    expect(more).toEqual(['move', 'paste', 'replace']);
  });
});

describe('what a click does', () => {
  function fakeCanvas(over) {
    const calls = [];
    const rec = name => (...a) => calls.push([name].concat(a));
    const cv = Object.assign({
      activeTool: null, brushMode: 'paint', stitchType: 'cross', drawMode: true,
      selectedColorId: null, lassoMode: null, hasSelection: false, mirror: { on: false },
      editHistory: [], redoHistory: [],
      setActiveTool: rec('setActiveTool'), setBsStart: rec('setBsStart'), setDrawMode: rec('setDrawMode'),
      setBrushAndActivate: rec('setBrushAndActivate'), setSelectedColorId: rec('setSelectedColorId'),
      selectStitchType: rec('selectStitchType'), cancelLasso: rec('cancelLasso'), setLassoMode: rec('setLassoMode'),
      setMirror: rec('setMirror'), undoEdit: rec('undoEdit'), redoEdit: rec('redoEdit'),
      enterCleanup: rec('enterCleanup'), exitCleanup: rec('exitCleanup'),
      enterDenoise: rec('enterDenoise'), exitDenoise: rec('exitDenoise'), cancelMove: rec('cancelMove')
    }, over || {});
    const ctx = { setPartialStitchTool: rec('setPartialStitchTool') };
    return { cv, ctx, calls, api: extra => Object.assign({ cv, ctx, coarse: false, palData: [{ id: '310' }] }, extra || {}) };
  }

  test('Paint picks a colour if there is none, then activates the brush', () => {
    const f = fakeCanvas();
    reg.get('paint').activate(f.api());
    expect(f.calls).toEqual([['setSelectedColorId', '310'], ['setBrushAndActivate', 'paint']]);
  });

  test('a second tap on an active brush goes back to Navigate on touch', () => {
    const f = fakeCanvas({ activeTool: 'fill', brushMode: 'fill', selectedColorId: '310' });
    reg.get('fill').activate(f.api({ coarse: true }));
    expect(f.calls).toEqual([['setDrawMode', false]]);
  });

  test('Erase on the touch rail toggles back to Navigate; on a mouse it stays Erase', () => {
    const f = fakeCanvas({ stitchType: 'erase' });
    reg.get('erase').activate(f.api({ surface: 'touchRail' }));
    expect(f.calls).toEqual([['setDrawMode', false]]);
    const g = fakeCanvas({ stitchType: 'erase' });
    reg.get('erase').activate(g.api());
    expect(g.calls).toEqual([['selectStitchType', 'erase']]);
  });

  test('Wand toggles off when it is already on', () => {
    const f = fakeCanvas({ activeTool: 'magicWand' });
    reg.get('wand').activate(f.api());
    expect(f.calls).toEqual([['setActiveTool', null]]);
  });

  test('Shapes picks Line first, and the last shape after that', () => {
    const f = fakeCanvas({ drawMode: false });
    reg.get('shapes').activate(f.api());
    expect(f.calls[0]).toEqual(['setActiveTool', 'line']);
    expect(f.calls).toContainEqual(['setDrawMode', true]);
    const g = fakeCanvas();
    reg.get('shapes').activate(g.api({ lastShape: 'ellipse' }));
    expect(g.calls[0]).toEqual(['setActiveTool', 'ellipse']);
  });

  test('Hand flips Navigate, the same as the H key', () => {
    const f = fakeCanvas({ drawMode: true });
    expect(reg.get('hand').isOn(f.api())).toBe(false);
    reg.get('hand').activate(f.api());
    expect(f.calls).toEqual([['setDrawMode', false]]);
  });

  test('Undo and Redo are disabled with nothing to undo or redo', () => {
    const f = fakeCanvas();
    expect(reg.isDisabled(reg.get('undo'), f.api())).toBe(true);
    expect(reg.isDisabled(reg.get('redo'), f.api())).toBe(true);
    const g = fakeCanvas({ editHistory: [1], redoHistory: [1] });
    expect(reg.isDisabled(reg.get('undo'), g.api())).toBe(false);
    expect(reg.isDisabled(reg.get('redo'), g.api())).toBe(false);
  });

  test('Paste only shows once something is copied', () => {
    const f = fakeCanvas();
    expect(reg.isVisible(reg.get('paste'), f.api())).toBe(false);
    const g = fakeCanvas({ clip: { hasClipboard: true, paste: () => {} } });
    expect(reg.isVisible(reg.get('paste'), g.api())).toBe(true);
  });
});

describe('the desktop rail', () => {
  const api = (cv, ctx) => ({ cv: Object.assign({ drawMode: true, activeTool: null, stitchType: 'cross' }, cv), ctx: ctx || {} });

  test('names the rail button the chart state belongs to', () => {
    expect(reg.currentRailTool(api({ drawMode: false, activeTool: 'paint' }))).toBe('hand');
    expect(reg.currentRailTool(api({ activeTool: 'paint' }))).toBe('paint');
    expect(reg.currentRailTool(api({ activeTool: 'backstitch', stitchType: 'backstitch' }))).toBe('paint');
    expect(reg.currentRailTool(api({ activeTool: null, stitchType: 'half-fwd' }, { partialStitchTool: 'half-fwd' }))).toBe('paint');
    expect(reg.currentRailTool(api({ activeTool: 'fill' }))).toBe('fill');
    expect(reg.currentRailTool(api({ activeTool: 'eraseAll', stitchType: 'erase' }))).toBe('erase');
    expect(reg.currentRailTool(api({ activeTool: 'eraseBs' }))).toBe('erase');
    expect(reg.currentRailTool(api({ activeTool: 'eyedropper' }))).toBe('pick');
    expect(reg.currentRailTool(api({ activeTool: 'magicWand' }))).toBe('wand');
    expect(reg.currentRailTool(api({ activeTool: 'lasso' }))).toBe('lasso');
    ['line', 'rect', 'ellipse'].forEach(t => expect(reg.currentRailTool(api({ activeTool: t }))).toBe('shapes'));
    expect(reg.currentRailTool(api({ activeTool: 'text' }))).toBe('text');
    ['move', 'colourReplace', 'cleanup', 'denoise', null].forEach(t => expect(reg.currentRailTool(api({ activeTool: t }))).toBeNull());
  });

  test('clicking the tool that is already on keeps it on', () => {
    const calls = [];
    const cv = { drawMode: true, activeTool: 'magicWand', stitchType: 'cross', setActiveTool: v => calls.push(v) };
    expect(reg.railActivate(reg.get('wand'), { cv, ctx: { setPartialStitchTool() {} } })).toBe(false);
    expect(calls).toEqual([]);
    // In More the same button toggles the wand off.
    reg.get('wand').activate({ cv, ctx: { setPartialStitchTool() {} } });
    expect(calls).toEqual([null]);
  });

  test('Undo and Redo on the rail are actions, so they always run', () => {
    let undone = 0;
    const cv = { drawMode: true, activeTool: 'paint', undoEdit: () => undone++ };
    expect(reg.railActivate(reg.get('undo'), { cv, ctx: {} })).toBe(true);
    expect(undone).toBe(1);
  });
});

describe('wiring', () => {
  test('the bundle loads the registry before the tool strip', () => {
    const build = read('build-creator-bundle.js');
    expect(build.indexOf("'toolRegistry.js'")).toBeGreaterThan(-1);
    expect(build.indexOf("'toolRegistry.js'")).toBeLessThan(build.indexOf("'ToolStrip.js'"));
  });

  test('the touch rail and the More panel read from it', () => {
    const strip = read('creator/ToolStrip.js');
    expect(strip).toMatch(/ToolReg\.list\(ToolReg\.TOUCH_RAIL\)\.map\(railTool\)/);
    expect(strip).toMatch(/ToolReg\.list\(ToolReg\.TOUCH_RAIL_FOOT\)\.map\(railTool\)/);
    expect(strip).toMatch(/ToolReg\.moreTools\(\{ coarse: coarsePointer, desktopRail: railLayout \}\)/);
    expect(strip).toMatch(/ToolReg\.moreTools\(\{ coarse: coarsePointer \}, ToolReg\.MORE_CLEANUP\)/);
  });

  test('no emoji or symbol marks in any tool string', () => {
    const bad = /[←-⇿☀-➿✀-➿\u{1F300}-\u{1FAFF}]/u;
    reg.TOOLS.forEach(t => {
      [t.label, t.text, t.title, t.railLabel || '', t.railText || ''].forEach(s => expect(s).not.toMatch(bad));
    });
  });
});
