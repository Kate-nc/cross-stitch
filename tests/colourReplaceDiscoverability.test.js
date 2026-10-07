/* tests/colourReplaceDiscoverability.test.js ──────────────────────────────
   Replace colour tool discoverability: R shortcut, help-drawer entry,
   status-bar hint, empty-cell feedback and hover highlight wiring.
   ─────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');

const read = rel => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// Load useKeyboardShortcuts with a stub useShortcuts that captures entries.
function loadShortcutEntries(state) {
  let captured = null;
  const window = { useShortcuts: entries => { captured = entries; } };
  // eslint-disable-next-line no-new-func
  new Function('window', read('creator/useKeyboardShortcuts.js'))(window);
  window.useKeyboardShortcuts(state, { undoEdit() {}, redoEdit() {} }, { saveProject() {} });
  return captured;
}

function fakeState(over) {
  const s = Object.assign({
    isActive: true, pat: [{ id: '310' }], activeTool: null,
    setActiveTool: jest.fn(v => { s.activeTool = v; }),
    setPartialStitchTool: jest.fn(), setBsStart: jest.fn(), cancelLasso: jest.fn()
  }, over || {});
  return s;
}

describe('Replace colour shortcut', () => {
  test('R toggles the Replace colour tool', () => {
    const state = fakeState();
    const entries = loadShortcutEntries(state);
    const e = entries.find(x => x.id === 'creator.tool.replace');
    expect(e).toBeDefined();
    expect(e.keys).toBe('r');
    expect(e.when()).toBe(true);
    e.run();
    expect(state.setActiveTool).toHaveBeenLastCalledWith('colourReplace');
    expect(state.setPartialStitchTool).toHaveBeenCalledWith(null);
    expect(state.cancelLasso).toHaveBeenCalled();
    e.run();
    expect(state.setActiveTool).toHaveBeenLastCalledWith(null);
  });

  test('R does nothing without a pattern', () => {
    const entries = loadShortcutEntries(fakeState({ pat: null }));
    expect(entries.find(x => x.id === 'creator.tool.replace').when()).toBe(false);
  });

  test('no other creator shortcut uses R', () => {
    const entries = loadShortcutEntries(fakeState());
    const users = entries.filter(x => [].concat(x.keys).indexOf('r') !== -1);
    expect(users.map(x => x.id)).toEqual(['creator.tool.replace']);
  });

  test('help drawer and toolbar tooltip mention the shortcut', () => {
    expect(read('help-drawer.js')).toMatch(/id: "c\.replace", scope: "creator", keys: \["R"\]/);
    expect(read('creator/ToolStrip.js')).toMatch(/title:"Replace colour \(R\)/);
  });
});

describe('Replace colour guidance', () => {
  test('status bar explains the tool while it is active', () => {
    expect(read('creator/PatternTab.js')).toMatch(/cv\.activeTool === "colourReplace"\) \{\s*statusText = "Replace colour/);
  });

  test('clicking an unstitched cell explains what to do instead of doing nothing', () => {
    const src = read('creator/useCanvasInteraction.js');
    const block = src.slice(src.indexOf('if (activeTool === "colourReplace")'));
    expect(block.slice(0, 900)).toMatch(/addToast\("That cell has no stitch/);
  });

  test('hovering a stitch with the tool active isolates its colour', () => {
    const src = read('creator/PatternCanvas.js');
    expect(src).toMatch(/cv\.activeTool === "colourReplace" && hov\.hoverCoords/);
    expect(src).toMatch(/hiId: replaceHoverId, dimHiId: replaceHoverId, dimFraction: 1, highlightMode: "isolate"/);
    // The full render must re-run when the hovered colour changes.
    expect(src).toMatch(/app\.fabricColour, app\.canvasTexture, replaceHoverId\s*\]/);
  });
});

describe('Magic Wand "Replace Colour…" uses the shared modal', () => {
  const src = read('creator/MagicWandPanel.js');

  test('both entry points open the Replace colour modal', () => {
    expect(src).toMatch(/btn\("Replace Colour\\u2026", openReplaceModal/);
    expect(src).toMatch(/if \(item\.key === "replace"\) \{ openReplaceModal\(\); return; \}/);
    expect(src).toMatch(/cv\.setColourReplaceModal\(\{ srcId: top\.id/);
  });

  test('the old in-panel replace UI and its state are gone', () => {
    expect(src).not.toMatch(/replacePanel/);
    for (const f of ['creator/useMagicWand.js', 'creator/useCreatorState.js', 'creator-main.js']) {
      expect(read(f)).not.toMatch(/replaceSource|replaceFuzzy|selectionReplaceColorCount|applyColorReplacement\b/);
    }
  });

  test('applyGlobalColourReplacement accepts similar shades', () => {
    expect(read('creator/useMagicWand.js')).toMatch(/var srcIds = \[srcId\]\.concat\(\(opts && opts\.alsoIds\) \|\| \[\]\);/);
  });
});

describe('toolbar badge', () => {
  test('tool badges (Move / Replace / Cleanup) are checked before brush mode', () => {
    const src = read('creator/ToolStrip.js');
    const block = src.slice(src.indexOf('var badgeLabel'), src.indexOf('badgeLabel = null'));
    const at = s => block.indexOf(s);
    expect(at('cv.activeTool === "colourReplace"')).toBeGreaterThan(-1);
    // brushMode is always "paint" or "fill", so anything after it is unreachable.
    expect(at('cv.activeTool === "colourReplace"')).toBeLessThan(at('cv.brushMode === "paint"'));
    expect(at('cv.activeTool === "move"')).toBeLessThan(at('cv.brushMode === "paint"'));
    expect(at('cv.activeTool === "cleanup"')).toBeLessThan(at('cv.brushMode === "paint"'));
  });
});

describe('review fixes', () => {
  test('status text does not promise Esc exits the tool (Esc clears a selection first)', () => {
    const src = read('creator/PatternTab.js');
    const line = src.split('\n').find(l => l.includes('statusText = "Replace colour'));
    expect(line).toMatch(/Press R to exit\./);
    expect(line).not.toMatch(/Esc/);
  });

  test('a new colour used only by part stitches / backstitch is kept in the scratch palette', () => {
    const src = read('creator/useMagicWand.js');
    expect(src).toMatch(/if \(\(psRes\.psChanges\.length \|\| bsRes\.count\) && !r\.cmap\[dstEntry\.id\]\)/);
    expect(src).toMatch(/state\.setScratchPalette\(function\(prev\)/);
    expect(read('creator/useCreatorState.js')).toMatch(/setScratchPalette: setScratchPalette,\n    editHistory/);
  });

  test('creator-main passes the fabric colour to the modal', () => {
    expect(read('creator-main.js')).toMatch(/fabricColour:state\.fabricColour,/);
  });
});
