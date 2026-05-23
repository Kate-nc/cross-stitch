// B3: E-2 ContextMenu eyedropper auto-switches to Paint;
//     E-7 removeUnusedColours + removeScratchColour drop Materials/legend
//     (threadOwned) entries for the removed colour ids.
// Structural assertions plus behavioural tests of the threadOwned filter
// logic mirrored locally.

const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const ctxMenu = read('creator/ContextMenu.js');
const useCreatorState = read('creator/useCreatorState.js');

describe('E-2: ContextMenu "Pick this colour" auto-switches to Paint', () => {
  test('handler sets selected colour, stitch type, and activates paint', () => {
    expect(ctxMenu).toMatch(/E-2:/);
    const m = ctxMenu.match(
      /Pick this colour[\s\S]{0,400}?cv\.setSelectedColorId\(cellInfo\.id\);[\s\S]{0,200}?cv\.selectStitchType\("cross"\);[\s\S]{0,200}?cv\.setBrushAndActivate\("paint"\)/);
    expect(m).not.toBeNull();
  });
});

describe('E-7: removeUnusedColours drops threadOwned rows', () => {
  test('useCreatorState filters threadOwned by unusedIds', () => {
    expect(useCreatorState).toMatch(/E-7:/);
    // Look in removeUnusedColours scope.
    const fnMatch = useCreatorState.match(
      /function removeUnusedColours\(\) \{[\s\S]{0,3000}?addToast\("Removed/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch[0]).toMatch(/setThreadOwned\(function\(prev\)/);
    expect(fnMatch[0]).toMatch(/unusedIds\.has\(k\)/);
  });
});

describe('E-7: removeScratchColour also drops the threadOwned row', () => {
  test('useCreatorState removes the single id from threadOwned', () => {
    const fnMatch = useCreatorState.match(
      /function removeScratchColour\([\s\S]{0,2500}?\n  \}\n/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch[0]).toMatch(/setThreadOwned\(function\(prev\)/);
    expect(fnMatch[0]).toMatch(/delete n\[id\]/);
  });
});

describe('E-7: threadOwned filter behaviour', () => {
  // Mirror the multi-id filter so we can assert invariants.
  function dropIds(prev, removed) {
    if (!prev) return prev;
    var changed = false;
    var n = {};
    Object.keys(prev).forEach(function (k) {
      if (removed.has(k)) changed = true;
      else n[k] = prev[k];
    });
    return changed ? n : prev;
  }

  test('removed ids are dropped, others survive', () => {
    const prev = { '310': 'owned', '550': 'tobuy', '666': 'owned' };
    const out = dropIds(prev, new Set(['550']));
    expect(out).toEqual({ '310': 'owned', '666': 'owned' });
  });
  test('no-op returns the same reference (cheap render)', () => {
    const prev = { '310': 'owned' };
    expect(dropIds(prev, new Set(['999']))).toBe(prev);
  });
  test('removing all leaves an empty object', () => {
    const prev = { '310': 'owned' };
    expect(dropIds(prev, new Set(['310']))).toEqual({});
  });
  test('null prev passes through', () => {
    expect(dropIds(null, new Set(['310']))).toBeNull();
  });
});
