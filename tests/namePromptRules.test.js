// UX-027: "Name this pattern" was offered on Open in Tracker even when the
// pattern already had a name. It now appears only while the name is a default,
// once per project, with wording that fits the action.

const { loadSource } = require('./_helpers/loadSource');

function loadHelpers() {
  const src = loadSource('helpers.js');
  const start = src.indexOf('var UNTITLED_DESIGN_NAME');
  const end = src.indexOf('// IndexedDB utility functions', start);
  // eslint-disable-next-line no-new-func
  return new Function(src.slice(start, end).replace(/if\(typeof window[^\n]*\n/, '') +
    '\nreturn { isDefaultProjectName: isDefaultProjectName, needsNamePrompt: needsNamePrompt };')();
}

const { isDefaultProjectName, needsNamePrompt } = loadHelpers();

describe('isDefaultProjectName', () => {
  test.each([
    '', '   ', null, undefined,
    'Untitled design', 'untitled', 'Untitled pattern',
    '80×80 pattern', '120 x 90 pattern',
    'IMG_2041', 'DSC01234', 'PXL_20261019_101500', 'image (3)', 'Photo 12', 'WhatsApp Image 2026-10-19',
    'Screenshot 2026-10-19 at 10.23.45', 'Screenshot 2026-10-19 at 10.23.45 PM',
  ])('%p is a default', (name) => {
    expect(isDefaultProjectName(name)).toBe(true);
  });

  test.each([
    'Rose Garden', 'dog', 'My first sampler', 'Imagine', 'Pictures at an exhibition',
    'Photograph of Nan', 'Christmas 2026', 'Scanlon family tree',
  ])('%p is a real name', (name) => {
    expect(isDefaultProjectName(name)).toBe(false);
  });
});

describe('needsNamePrompt', () => {
  test('asks for a blank name, once', () => {
    expect(needsNamePrompt('', false, false)).toBe(true);
    expect(needsNamePrompt('', false, true)).toBe(false);
  });

  test('asks while an app-made name is still a default, once', () => {
    expect(needsNamePrompt('IMG_2041', true, false)).toBe(true);
    expect(needsNamePrompt('Untitled design', true, false)).toBe(true);
    expect(needsNamePrompt('IMG_2041', true, true)).toBe(false);
  });

  test('does not ask when the pattern already has a name', () => {
    expect(needsNamePrompt('Rose Garden', true, false)).toBe(false);   // named after its file
    expect(needsNamePrompt('Rose Garden', false, false)).toBe(false);  // typed by the user
  });

  test('never overrides a name the user typed, even one that looks generic', () => {
    expect(needsNamePrompt('Untitled design', false, false)).toBe(false);
  });
});

describe('Creator wiring', () => {
  const main = loadSource('creator-main.js');

  test('the nudge uses the rule instead of the bare auto-name flag', () => {
    expect(main).toMatch(/needsNamePrompt\(state\.projectName, auto, shown\) && state\.pat && state\.pal/);
  });

  test('Open in Tracker has its own wording; PDF and exports keep theirs', () => {
    expect(main).toMatch(/pendingNamedAction==='track'\?\{[\s\S]*?before you start stitching\? It will appear in the Stitch Tracker and in your library\.[\s\S]*?confirmLabel:'Save and open'/);
    expect(main).toMatch(/Give this pattern a name\? It will appear on the PDF and in your library\./);
  });

  test('both entry points to the Tracker go through the nudge', () => {
    expect(main).toMatch(/window\.__navigateToTracker=function\(\)\{if\(_nameNudgeRef\.current\)_nameNudgeRef\.current\('track'\);\}/);
    expect(main).toMatch(/stableHandleOpenInTracker = React\.useCallback\(function\(\)  \{_nameNudgeRef\.current\('track'\);\}/);
  });
});
